//! Match trigram locale (stile pg_trgm) tra scraped_product di shop diversi.
//!
//! Output: solo cluster (1 vs many).
//! Slug: {canonical}
//! other.kind = "cluster", other.products = […un prodotto per shop…]
//!
//! Soglia default 0.70. Shop dedupe: max 1 prodotto per ecommerce nel cluster.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Deserialize)]
struct Product {
    id: String,
    product_name: String,
    #[serde(default)]
    brand: Option<String>,
    ecommerce_id: String,
    #[serde(default)]
    final_price: Option<f64>,
    #[serde(default)]
    pub_slug: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    is_escluded: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ShopRow {
    id: String,
    name: String,
}

#[derive(Debug, Serialize)]
struct CombinationOut {
    slug: String,
    other: CombinationOther,
    /// Id prodotti collegati (ordine = other.products).
    product_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct CombinationOther {
    kind: &'static str,
    score: f64,
    title: String,
    canonical_name: String,
    products: Vec<ProductMeta>,
}

#[derive(Debug, Clone, Serialize)]
struct ProductMeta {
    id: String,
    product_name: String,
    brand: Option<String>,
    ecommerce_id: String,
    ecommerce_name: String,
    final_price: Option<f64>,
    pub_slug: Option<String>,
}

struct IndexedProduct {
    id: String,
    product_name: String,
    brand: Option<String>,
    ecommerce_id: String,
    ecommerce_name: String,
    final_price: Option<f64>,
    pub_slug: Option<String>,
    norm: String,
    trigrams: HashSet<u32>,
}

#[derive(Clone, Copy)]
struct Edge {
    i: usize,
    j: usize,
    score: f64,
}

struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<u8>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        let mut x = x;
        while self.parent[x] != x {
            self.parent[x] = self.parent[self.parent[x]];
            x = self.parent[x];
        }
        x
    }

    fn union(&mut self, a: usize, b: usize) {
        let mut ra = self.find(a);
        let mut rb = self.find(b);
        if ra == rb {
            return;
        }
        if self.rank[ra] < self.rank[rb] {
            std::mem::swap(&mut ra, &mut rb);
        }
        self.parent[rb] = ra;
        if self.rank[ra] == self.rank[rb] {
            self.rank[ra] += 1;
        }
    }
}

fn pack_trigram(chars: &[char; 3]) -> u32 {
    let enc = |c: char| -> u32 {
        let c = c as u32;
        if c > 0xFFFF {
            0xFFFD
        } else {
            c
        }
    };
    (enc(chars[0]) << 21) | (enc(chars[1]) << 10) | (enc(chars[2]) & 0x3FF)
}

fn extract_trigrams(s: &str) -> HashSet<u32> {
    let padded: String = format!("  {} ", s);
    let chars: Vec<char> = padded.chars().collect();
    let mut set = HashSet::with_capacity(chars.len().saturating_sub(2).max(1));
    if chars.len() < 3 {
        return set;
    }
    for w in chars.windows(3) {
        set.insert(pack_trigram(&[w[0], w[1], w[2]]));
    }
    set
}

fn trigram_similarity(a: &HashSet<u32>, b: &HashSet<u32>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let (small, large) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    let inter = small.iter().filter(|t| large.contains(t)).count();
    2.0 * inter as f64 / (a.len() + b.len()) as f64
}

fn normalize_name(name: &str) -> String {
    let lower: String = name.nfkd().flat_map(|c| c.to_lowercase()).collect();
    lower
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn slugify(text: &str) -> String {
    let n = normalize_name(text);
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let s = re.replace_all(&n, "-");
    let s = s.trim_matches('-').to_string();
    if s.is_empty() {
        "prodotto".to_string()
    } else {
        s.chars().take(100).collect()
    }
}

fn display_name(name: &str) -> String {
    let t = name.trim();
    if t.is_empty() {
        return "Prodotto".to_string();
    }
    let letters: Vec<char> = t.chars().filter(|c| c.is_alphabetic()).collect();
    let all_upper = !letters.is_empty() && letters.iter().all(|c| c.is_uppercase());
    if all_upper {
        let lower = t.to_lowercase();
        let mut chars = lower.chars();
        match chars.next() {
            Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
            None => t.to_string(),
        }
    } else {
        t.to_string()
    }
}

fn pick_canonical(products: &[&IndexedProduct]) -> String {
    let mut best: Option<&IndexedProduct> = None;
    for p in products {
        best = Some(match best {
            None => p,
            Some(cur) => {
                let da = display_name(&p.product_name);
                let db = display_name(&cur.product_name);
                if da.chars().count() > db.chars().count() {
                    p
                } else if db.chars().count() > da.chars().count() {
                    cur
                } else if p.norm <= cur.norm {
                    p
                } else {
                    cur
                }
            }
        });
    }
    display_name(&best.map(|p| p.product_name.as_str()).unwrap_or("Prodotto"))
}

fn meta_of(p: &IndexedProduct) -> ProductMeta {
    ProductMeta {
        id: p.id.clone(),
        product_name: p.product_name.clone(),
        brand: p.brand.clone(),
        ecommerce_id: p.ecommerce_id.clone(),
        ecommerce_name: p.ecommerce_name.clone(),
        final_price: p.final_price,
        pub_slug: p.pub_slug.clone(),
    }
}

fn make_cluster_slug_title(members: &[&IndexedProduct], score: f64) -> (String, String, String) {
    let canonical = pick_canonical(members);
    let slug = slugify(&canonical);
    let n = members.len();
    let title = if n <= 2 {
        let shops: Vec<&str> = members.iter().map(|p| p.ecommerce_name.as_str()).collect();
        format!("{} — {} vs {}", canonical, shops[0], shops.get(1).copied().unwrap_or("shop"))
    } else {
        format!("{} — confronto prezzi su {} shop", canonical, n)
    };
    let _ = score;
    (slug, title, canonical)
}

fn load_shops(path: &Path) -> HashMap<String, String> {
    let raw = fs::read_to_string(path).unwrap_or_else(|e| panic!("open {}: {e}", path.display()));
    let rows: Vec<ShopRow> =
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse shops: {e}"));
    rows.into_iter().map(|r| (r.id, r.name)).collect()
}

fn load_products(path: &Path) -> Vec<Product> {
    let file = File::open(path).unwrap_or_else(|e| panic!("open {}: {e}", path.display()));
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for (i, line) in reader.lines().enumerate() {
        let line = line.unwrap_or_else(|e| panic!("read line {}: {e}", i + 1));
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let p: Product = serde_json::from_str(line)
            .unwrap_or_else(|e| panic!("parse line {}: {e}\n{line}", i + 1));
        if p.product_name.trim().is_empty() || p.ecommerce_id.trim().is_empty() {
            continue;
        }
        out.push(p);
    }
    out
}

fn build_index(products: Vec<Product>, shops: &HashMap<String, String>) -> Vec<IndexedProduct> {
    products
        .into_iter()
        .map(|p| {
            let norm = normalize_name(&p.product_name);
            let trigrams = extract_trigrams(&norm);
            let ecommerce_name = shops
                .get(&p.ecommerce_id)
                .cloned()
                .unwrap_or_else(|| "Shop".to_string());
            IndexedProduct {
                id: p.id,
                product_name: p.product_name,
                brand: p.brand,
                ecommerce_id: p.ecommerce_id,
                ecommerce_name,
                final_price: p.final_price,
                pub_slug: p.pub_slug,
                norm,
                trigrams,
            }
        })
        .filter(|p| !p.norm.is_empty() && !p.trigrams.is_empty())
        .collect()
}

fn find_edges(products: &[IndexedProduct], threshold: f64) -> Vec<Edge> {
    eprintln!("Building inverted index…");
    let mut inverted: HashMap<u32, Vec<usize>> = HashMap::new();
    for (i, p) in products.iter().enumerate() {
        for &t in &p.trigrams {
            inverted.entry(t).or_default().push(i);
        }
    }

    let max_df = (products.len() as f64 * 0.15).ceil() as usize;
    let max_df = max_df.max(500);
    inverted.retain(|_, ids| ids.len() <= max_df);

    eprintln!(
        "Inverted trigrams usable: {} (max_df={})",
        inverted.len(),
        max_df
    );

    let candidates_checked = AtomicUsize::new(0);
    let start = Instant::now();

    use rayon::prelude::*;

    let edges: Vec<Edge> = (0..products.len())
        .into_par_iter()
        .flat_map_iter(|i| {
            let a = &products[i];
            let mut cand_counts: HashMap<usize, usize> = HashMap::new();
            for &t in &a.trigrams {
                if let Some(ids) = inverted.get(&t) {
                    for &j in ids {
                        if j <= i {
                            continue;
                        }
                        if products[j].ecommerce_id == a.ecommerce_id {
                            continue;
                        }
                        *cand_counts.entry(j).or_insert(0) += 1;
                    }
                }
            }

            let min_shared = ((a.trigrams.len() as f64) * threshold * 0.5)
                .ceil()
                .max(3.0) as usize;

            let mut local = Vec::new();
            for (j, shared) in cand_counts {
                if shared < min_shared {
                    continue;
                }
                candidates_checked.fetch_add(1, Ordering::Relaxed);
                let b = &products[j];
                let score = trigram_similarity(&a.trigrams, &b.trigrams);
                if score + f64::EPSILON < threshold {
                    continue;
                }
                let score_r = (score * 10_000.0).round() / 10_000.0;
                local.push(Edge {
                    i,
                    j,
                    score: score_r,
                });
            }
            local
        })
        .collect();

    eprintln!(
        "Done in {:.1}s | candidates≈{} | edges≥{threshold}={}",
        start.elapsed().as_secs_f64(),
        candidates_checked.load(Ordering::Relaxed),
        edges.len()
    );
    edges
}

fn edge_key(a: usize, b: usize) -> (usize, usize) {
    if a < b {
        (a, b)
    } else {
        (b, a)
    }
}

fn avg_edge_score(idx: usize, others: &[usize], edge_score: &HashMap<(usize, usize), f64>) -> f64 {
    let mut sum = 0.0;
    let mut n = 0usize;
    for &o in others {
        if o == idx {
            continue;
        }
        if let Some(&s) = edge_score.get(&edge_key(idx, o)) {
            sum += s;
            n += 1;
        }
    }
    if n == 0 {
        0.0
    } else {
        sum / n as f64
    }
}

fn build_combinations(products: &[IndexedProduct], edges: &[Edge]) -> Vec<CombinationOut> {
    let mut uf = UnionFind::new(products.len());
    let mut edge_score: HashMap<(usize, usize), f64> = HashMap::with_capacity(edges.len());
    for e in edges {
        uf.union(e.i, e.j);
        edge_score.insert(edge_key(e.i, e.j), e.score);
    }

    let mut components: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut touched = HashSet::new();
    for e in edges {
        touched.insert(e.i);
        touched.insert(e.j);
    }
    for idx in touched {
        let root = uf.find(idx);
        components.entry(root).or_default().push(idx);
    }

    let mut out = Vec::new();
    let mut used_slugs: HashSet<String> = HashSet::new();

    let mut roots: Vec<usize> = components.keys().copied().collect();
    roots.sort_unstable();

    for root in roots {
        let members = components.get(&root).cloned().unwrap_or_default();
        if members.len() < 2 {
            continue;
        }

        // Group by shop → keep best avg edge score within component.
        let mut by_shop: HashMap<&str, Vec<usize>> = HashMap::new();
        for &idx in &members {
            by_shop
                .entry(products[idx].ecommerce_id.as_str())
                .or_default()
                .push(idx);
        }

        let mut selected: Vec<usize> = Vec::new();
        for (_shop, idxs) in by_shop {
            if idxs.len() == 1 {
                selected.push(idxs[0]);
                continue;
            }
            let best = idxs
                .iter()
                .copied()
                .max_by(|a, b| {
                    let sa = avg_edge_score(*a, &members, &edge_score);
                    let sb = avg_edge_score(*b, &members, &edge_score);
                    sa.partial_cmp(&sb)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| products[*a].id.cmp(&products[*b].id))
                })
                .unwrap();
            selected.push(best);
        }

        if selected.len() < 2 {
            continue;
        }

        // Stable order: shop name, then id.
        selected.sort_by(|&a, &b| {
            normalize_name(&products[a].ecommerce_name)
                .cmp(&normalize_name(&products[b].ecommerce_name))
                .then_with(|| products[a].ecommerce_id.cmp(&products[b].ecommerce_id))
                .then_with(|| products[a].id.cmp(&products[b].id))
        });

        let selected_set: HashSet<usize> = selected.iter().copied().collect();
        let mut internal_scores: Vec<f64> = Vec::new();
        for e in edges {
            if selected_set.contains(&e.i) && selected_set.contains(&e.j) {
                internal_scores.push(e.score);
            }
        }
        if internal_scores.is_empty() {
            continue;
        }
        let cluster_score = internal_scores.iter().copied().fold(0.0_f64, f64::max);
        let cluster_score = (cluster_score * 10_000.0).round() / 10_000.0;

        let member_refs: Vec<&IndexedProduct> = selected.iter().map(|&i| &products[i]).collect();
        let (mut cluster_slug, cluster_title, canonical) =
            make_cluster_slug_title(&member_refs, cluster_score);

        if used_slugs.contains(&cluster_slug) {
            let short: String = selected
                .iter()
                .map(|&i| products[i].id.chars().take(4).collect::<String>())
                .collect::<Vec<_>>()
                .join("");
            cluster_slug = format!("{cluster_slug}-{short}");
        }
        used_slugs.insert(cluster_slug.clone());

        let cluster_products: Vec<ProductMeta> = member_refs.iter().map(|p| meta_of(p)).collect();
        let cluster_ids: Vec<String> = selected.iter().map(|&i| products[i].id.clone()).collect();

        out.push(CombinationOut {
            slug: cluster_slug,
            other: CombinationOther {
                kind: "cluster",
                score: cluster_score,
                title: cluster_title,
                canonical_name: canonical,
                products: cluster_products,
            },
            product_ids: cluster_ids,
        });
    }

    out.sort_by(|a, b| {
        b.other
            .score
            .partial_cmp(&a.other.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.slug.cmp(&b.slug))
    });

    out
}

fn write_jsonl(path: &Path, pairs: &[CombinationOut]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let file = File::create(path).unwrap_or_else(|e| panic!("create {}: {e}", path.display()));
    let mut w = BufWriter::new(file);
    for p in pairs {
        serde_json::to_writer(&mut w, p).unwrap();
        w.write_all(b"\n").unwrap();
    }
    w.flush().unwrap();
}

fn default_shops_path(products_path: &Path) -> PathBuf {
    products_path
        .parent()
        .unwrap_or(Path::new("data"))
        .join("ecommerce_brands.json")
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let input = args
        .get(1)
        .map(Path::new)
        .unwrap_or(Path::new("data/scraped_products.jsonl"));
    let output = args
        .get(2)
        .map(Path::new)
        .unwrap_or(Path::new("data/combinations.jsonl"));
    let threshold: f64 = args
        .get(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.70);
    let shops_path = args
        .get(4)
        .map(PathBuf::from)
        .unwrap_or_else(|| default_shops_path(input));

    eprintln!("Input:  {}", input.display());
    eprintln!("Shops:  {}", shops_path.display());
    eprintln!("Output: {}", output.display());
    eprintln!("Threshold: {threshold}");

    let shops = load_shops(&shops_path);
    eprintln!("Loaded {} shops", shops.len());

    let products = load_products(input);
    eprintln!("Loaded {} products", products.len());

    let indexed = build_index(products, &shops);
    eprintln!("Indexed {} products with trigrams", indexed.len());

    let by_shop: HashMap<&str, usize> = {
        let mut m = HashMap::new();
        for p in &indexed {
            *m.entry(p.ecommerce_name.as_str()).or_insert(0) += 1;
        }
        m
    };
    eprintln!("Shops: {by_shop:?}");

    let edges = find_edges(&indexed, threshold);
    let combos = build_combinations(&indexed, &edges);

    eprintln!("Writing {} cluster combinations…", combos.len());
    write_jsonl(output, &combos);

    if let Some(sample) = combos.first() {
        eprintln!(
            "Sample cluster: slug={}\ntitle={}\nproducts={}\nscore={}",
            sample.slug,
            sample.other.title,
            sample.other.products.len(),
            sample.other.score
        );
    }
}
