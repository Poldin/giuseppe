//! Match trigram locale (stile pg_trgm) tra scraped_product di shop diversi.
//! Output: coppie con similarity >= soglia.
//! Slug: {canonical}-{shopA}-vs-{shopB}
//! other.title pronto per SEO + score + meta prodotti.

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
    product_a_id: String,
    product_b_id: String,
}

#[derive(Debug, Serialize)]
struct CombinationOther {
    score: f64,
    title: String,
    canonical_name: String,
    product_a: ProductMeta,
    product_b: ProductMeta,
}

#[derive(Debug, Serialize)]
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
        // lascia spazio per -shopA-vs-shopB (~40 char)
        s.chars().take(100).collect()
    }
}

fn display_name(name: &str) -> String {
    let t = name.trim();
    if t.is_empty() {
        return "Prodotto".to_string();
    }
    // Title-ish: se tutto maiuscolo, normalizza a sentence case leggibile
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

fn pick_canonical(a: &IndexedProduct, b: &IndexedProduct) -> String {
    let da = display_name(&a.product_name);
    let db = display_name(&b.product_name);
    if da.chars().count() > db.chars().count() {
        da
    } else if db.chars().count() > da.chars().count() {
        db
    } else if a.norm <= b.norm {
        da
    } else {
        db
    }
}

fn names_effectively_same(a: &IndexedProduct, b: &IndexedProduct, score: f64) -> bool {
    a.norm == b.norm || score >= 0.90
}

fn make_slug_and_title(left: &IndexedProduct, right: &IndexedProduct, score: f64) -> (String, String, String) {
    let canonical = pick_canonical(left, right);
    let shop_l = left.ecommerce_name.as_str();
    let shop_r = right.ecommerce_name.as_str();

    let slug = format!(
        "{}-{}-vs-{}",
        slugify(&canonical),
        slugify(shop_l),
        slugify(shop_r)
    );

    let title = if names_effectively_same(left, right, score) {
        format!("{} — {} vs {}", canonical, shop_l, shop_r)
    } else {
        format!(
            "{} vs {} — {} vs {}",
            display_name(&left.product_name),
            display_name(&right.product_name),
            shop_l,
            shop_r
        )
    };

    (slug, title, canonical)
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

fn order_pair<'a>(
    a: &'a IndexedProduct,
    b: &'a IndexedProduct,
) -> (&'a IndexedProduct, &'a IndexedProduct) {
    let ka = (
        normalize_name(&a.ecommerce_name),
        a.ecommerce_id.as_str(),
        a.id.as_str(),
    );
    let kb = (
        normalize_name(&b.ecommerce_name),
        b.ecommerce_id.as_str(),
        b.id.as_str(),
    );
    if ka <= kb {
        (a, b)
    } else {
        (b, a)
    }
}

fn find_pairs(products: &[IndexedProduct], threshold: f64) -> Vec<CombinationOut> {
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

    let pairs: Vec<CombinationOut> = (0..products.len())
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

                let (left, right) = order_pair(a, b);
                let score_r = (score * 10_000.0).round() / 10_000.0;
                let (slug, title, canonical) = make_slug_and_title(left, right, score_r);

                local.push(CombinationOut {
                    slug,
                    other: CombinationOther {
                        score: score_r,
                        title,
                        canonical_name: canonical,
                        product_a: meta_of(left),
                        product_b: meta_of(right),
                    },
                    product_a_id: left.id.clone(),
                    product_b_id: right.id.clone(),
                });
            }
            local
        })
        .collect();

    eprintln!(
        "Done in {:.1}s | candidates≈{} | pairs≥{threshold}={}",
        start.elapsed().as_secs_f64(),
        candidates_checked.load(Ordering::Relaxed),
        pairs.len()
    );
    pairs
}

fn dedupe_slugs(mut pairs: Vec<CombinationOut>) -> Vec<CombinationOut> {
    pairs.sort_by(|a, b| {
        b.other
            .score
            .partial_cmp(&a.other.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.slug.cmp(&b.slug))
    });

    let mut used_slugs = HashSet::new();
    let mut out = Vec::with_capacity(pairs.len());
    for mut p in pairs {
        let base = p.slug.clone();
        if used_slugs.contains(&base) {
            let short_a: String = p.other.product_a.id.chars().take(8).collect();
            let short_b: String = p.other.product_b.id.chars().take(8).collect();
            p.slug = format!("{base}-{short_a}-{short_b}");
        }
        used_slugs.insert(p.slug.clone());
        out.push(p);
    }
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

    let pairs = find_pairs(&indexed, threshold);
    let pairs = dedupe_slugs(pairs);
    eprintln!("Writing {} combinations…", pairs.len());
    write_jsonl(output, &pairs);

    if let Some(sample) = pairs.first() {
        eprintln!(
            "Sample: slug={}\ntitle={}\nscore={}",
            sample.slug, sample.other.title, sample.other.score
        );
    }
}
