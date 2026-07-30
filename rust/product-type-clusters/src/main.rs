//! Step-1 mechanical clustering on product names (offline).
//!
//! Pipeline:
//! 1. tokenize name_norm (drop qty/units)
//! 2. word TF-IDF + blocked DBSCAN (cosine)
//! 3. morph-merge clusters via char n-gram centroids
//! 4. singletons + noise -> brand
//!
//! No external brand→type knowledge.

use regex::Regex;
use rayon::prelude::*;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::cmp::Ordering;
use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

#[derive(Debug, Deserialize)]
struct InputRow {
    id: String,
    product_name: String,
    name_norm: String,
    #[serde(default)]
    brand: Option<String>,
}

#[derive(Clone)]
struct Doc {
    id: String,
    name: String,
    norm: String,
    tokens: Vec<String>,
}

#[derive(Serialize)]
struct ClusterOut {
    id: i32,
    label: String,
    size: usize,
    pct: f64,
    cohesion: f64,
    top_tokens: Vec<String>,
    examples: Vec<String>,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let data_dir = PathBuf::from(
        args.get(1)
            .cloned()
            .unwrap_or_else(|| "data".to_string()),
    );
    let input = data_dir.join("scraped_products.jsonl");
    let out_path = data_dir.join("step1_clusters.json");
    let assign_path = data_dir.join("step1_assignments.jsonl");

    let eps: f32 = args
        .get(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.26);
    let merge_sim: f32 = args
        .get(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.92);
    let min_samples: usize = args
        .get(4)
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);

    eprintln!(
        "input={} eps={} merge_sim={} min_samples={}",
        input.display(),
        eps,
        merge_sim,
        min_samples
    );

    let t0 = Instant::now();
    let docs = load_docs(&input);
    eprintln!("loaded {} docs in {:.1}s", docs.len(), t0.elapsed().as_secs_f64());

    let result = run_pipeline(&docs, eps, min_samples, merge_sim);
    eprintln!(
        "done in {:.1}s | clusters_ge2={} solid={} solid_hom={} brand={:.1}% largest_pre={:.1}%",
        t0.elapsed().as_secs_f64(),
        result.summary["clusters_total_ge2"],
        result.summary["solid_ge25"],
        result.summary["solid_homogeneous_coh025"],
        result.summary["brand_pct"].as_f64().unwrap_or(0.0),
        result.summary["pre_split_largest_pct"].as_f64().unwrap_or(0.0)
    );

    fs::create_dir_all(&data_dir).ok();
    let f = File::create(&out_path).expect("create out");
    serde_json::to_writer_pretty(BufWriter::new(f), &result.report).expect("write report");
    eprintln!("wrote {}", out_path.display());

    let af = File::create(&assign_path).expect("create assignments");
    let mut aw = BufWriter::new(af);
    for (i, lab) in result.labels.iter().enumerate() {
        let cluster = if *lab < 0 {
            json!("brand")
        } else {
            result
                .label_by_id
                .get(lab)
                .cloned()
                .map(|s| json!(s))
                .unwrap_or_else(|| json!(lab))
        };
        let row = json!({
            "id": docs[i].id,
            "product_name": docs[i].name,
            "cluster_id": lab,
            "cluster": cluster,
        });
        writeln!(aw, "{}", row).ok();
    }
    eprintln!("wrote {}", assign_path.display());
}

struct PipelineResult {
    labels: Vec<i32>,
    report: serde_json::Value,
    summary: serde_json::Map<String, serde_json::Value>,
    label_by_id: FxHashMap<i32, String>,
}

fn load_docs(path: &Path) -> Vec<Doc> {
    let f = File::open(path).unwrap_or_else(|e| panic!("open {}: {e}", path.display()));
    let reader = BufReader::new(f);
    let token_re = Regex::new(r"[a-z0-9]+").unwrap();
    let qty_re =
        Regex::new(r"(?i)\b\d+(?:[.,]\d+)?\s*(?:pz|ml|gr|g|mm|cm|kg|lt|l|unita|pezzi)\b").unwrap();
    let noise_re = Regex::new(r"^(?:\d+|x\d+|\d+x\d+|iso|fg|hp|ra|ca|eu|tcr|nfc|slb)$").unwrap();
    let stop: FxHashSet<&str> = [
        "con", "per", "dal", "dei", "della", "delle", "degli", "una", "uno", "the", "and", "di",
        "da", "in", "su", "del", "la", "il", "lo", "le", "un", "a", "e", "o", "x", "mm", "ml", "gr",
        "pz", "conf", "pack", "size", "plus", "set", "kit", "tipo", "fig", "modello", "colore",
        "col", "unita", "pezzi", "superiore", "inferiore", "media", "fine", "extra", "maxi", "mini",
        "blu", "rosso", "verde", "nero", "bianco", "giallo", "rosa", "trasparente",
    ]
    .into_iter()
    .collect();

    let mut docs = Vec::new();
    for line in reader.lines() {
        let line = line.expect("read line");
        if line.trim().is_empty() {
            continue;
        }
        let row: InputRow = serde_json::from_str(&line).expect("parse jsonl");
        let lower = row.name_norm.to_lowercase();
        let cleaned = qty_re.replace_all(&lower, " ");
        let mut tokens = Vec::new();
        for m in token_re.find_iter(&cleaned) {
            let t = m.as_str();
            if t.len() < 3 || stop.contains(t) || noise_re.is_match(t) {
                continue;
            }
            tokens.push(t.to_string());
        }
        docs.push(Doc {
            id: row.id,
            name: row.product_name,
            norm: row.name_norm,
            tokens,
        });
    }
    docs
}

fn run_pipeline(docs: &[Doc], eps: f32, min_samples: usize, merge_sim: f32) -> PipelineResult {
    let n = docs.len();
    let word_docs: Vec<Vec<String>> = docs.iter().map(|d| d.tokens.clone()).collect();

    eprintln!("building word TF-IDF...");
    let (xw, vocab, df) = build_tfidf(&word_docs, 900, 3);
    eprintln!("  vocab={}", vocab.len());

    eprintln!("DBSCAN blocked cosine (anti-hairball)...");
    let t_db = Instant::now();
    let mut labels = dbscan_blocked(&xw, &word_docs, &df, n, eps, min_samples);
    let n_noise = labels.iter().filter(|&&l| l < 0).count();
    let n_pre = labels
        .iter()
        .copied()
        .filter(|&l| l >= 0)
        .collect::<FxHashSet<_>>()
        .len();
    let largest_pre = {
        let mut c: FxHashMap<i32, usize> = FxHashMap::default();
        for &l in &labels {
            if l >= 0 {
                *c.entry(l).or_default() += 1;
            }
        }
        c.values().copied().max().unwrap_or(0)
    };
    eprintln!(
        "  pre-split clusters={} noise={} largest={} ({:.1}%) in {:.1}s",
        n_pre,
        n_noise,
        largest_pre,
        100.0 * largest_pre as f64 / n as f64,
        t_db.elapsed().as_secs_f64()
    );

    eprintln!("splitting oversized / low-cohesion clusters...");
    let max_cluster = ((n as f32) * 0.015).max(250.0) as usize; // 1.5%
    let min_cohesion = 0.18f64;
    labels = split_weak_clusters(&labels, &xw, &word_docs, max_cluster, min_cohesion);
    let n_after_split = labels
        .iter()
        .copied()
        .filter(|&l| l >= 0)
        .collect::<FxHashSet<_>>()
        .len();
    eprintln!("  clusters_after_split={n_after_split} max_size={max_cluster} min_coh={min_cohesion}");

    eprintln!("char n-gram TF-IDF for morph merge...");
    let char_docs: Vec<Vec<String>> = docs
        .par_iter()
        .map(|d| char_ngrams(&d.norm, 3, 5))
        .collect();
    let (xc, _, _) = build_tfidf(&char_docs, 1200, 5);

    eprintln!("morph merge sim>={merge_sim}...");
    let (merged, n_merges) = morph_merge(&labels, &xc, merge_sim, n);
    labels = merged;
    let n_mid = labels
        .iter()
        .copied()
        .filter(|&l| l >= 0)
        .collect::<FxHashSet<_>>()
        .len();
    eprintln!("  merges={n_merges} clusters_after={n_mid}");

    // singletons -> brand
    let mut counts: FxHashMap<i32, usize> = FxHashMap::default();
    for &l in &labels {
        if l >= 0 {
            *counts.entry(l).or_default() += 1;
        }
    }
    for lab in labels.iter_mut() {
        if *lab >= 0 && counts.get(lab).copied().unwrap_or(0) == 1 {
            *lab = -1;
        }
    }

    // dissolve mechanically incoherent clusters -> brand
    eprintln!("dissolving low-cohesion clusters -> brand...");
    let dissolved = dissolve_incoherent(&mut labels, &word_docs, 0.12, 8);
    eprintln!("  dissolved_members={dissolved}");

    // rebuild counts
    counts.clear();
    for &l in &labels {
        if l >= 0 {
            *counts.entry(l).or_default() += 1;
        }
    }

    let mut cluster_ids: Vec<i32> = counts.keys().copied().collect();
    cluster_ids.sort_by_key(|c| std::cmp::Reverse(counts[c]));

    let mut clusters = Vec::new();
    let mut label_by_id: FxHashMap<i32, String> = FxHashMap::default();
    for &cid in &cluster_ids {
        let members: Vec<usize> = labels
            .iter()
            .enumerate()
            .filter(|(_, l)| **l == cid)
            .map(|(i, _)| i)
            .collect();
        if members.len() < 2 {
            continue;
        }
        let label = mechanical_label(&members, &word_docs, &df);
        label_by_id.insert(cid, label.clone());
        let mut tok_c: FxHashMap<String, usize> = FxHashMap::default();
        for &i in &members {
            let mut seen = FxHashSet::default();
            for t in &word_docs[i] {
                if seen.insert(t.clone()) {
                    *tok_c.entry(t.clone()).or_default() += 1;
                }
            }
        }
        let mut top: Vec<(String, usize)> = tok_c.into_iter().collect();
        top.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let top_tokens: Vec<String> = top.into_iter().take(8).map(|(t, _)| t).collect();
        let cohesion = cluster_cohesion(&members, &word_docs);
        let examples: Vec<String> = members
            .iter()
            .take(5)
            .map(|&i| truncate(&docs[i].name, 90))
            .collect();
        clusters.push(ClusterOut {
            id: cid,
            label,
            size: members.len(),
            pct: 100.0 * members.len() as f64 / n as f64,
            cohesion,
            top_tokens,
            examples,
        });
    }

    let brand_count = labels.iter().filter(|&&l| l < 0).count();
    let solid: Vec<&ClusterOut> = clusters.iter().filter(|c| c.size >= 25).collect();
    let medium: Vec<&ClusterOut> = clusters
        .iter()
        .filter(|c| (8..25).contains(&c.size))
        .collect();
    let small_n = clusters.iter().filter(|c| (2..8).contains(&c.size)).count();
    let solid_hom = solid.iter().filter(|c| c.cohesion >= 0.25).count();
    let medium_hom = medium.iter().filter(|c| c.cohesion >= 0.25).count();
    let largest_final = clusters.first().map(|c| c.size).unwrap_or(0);

    // probe stems
    let probes = [
        "mascher", "camice", "fresa", "frese", "bracket", "denti", "gutta", "guant", "corone",
        "siring",
    ];
    let mut probe_stats = serde_json::Map::new();
    for stem in probes {
        let idxs: Vec<usize> = docs
            .iter()
            .enumerate()
            .filter(|(_, d)| d.norm.contains(stem))
            .map(|(i, _)| i)
            .collect();
        if idxs.len() < 3 {
            continue;
        }
        let mut lab_c: FxHashMap<i32, usize> = FxHashMap::default();
        let mut brand_n = 0usize;
        for &i in &idxs {
            let l = labels[i];
            if l < 0 {
                brand_n += 1;
            } else {
                *lab_c.entry(l).or_default() += 1;
            }
        }
        let (top_lab, top_n) = lab_c
            .into_iter()
            .max_by_key(|(_, c)| *c)
            .unwrap_or((-1, 0));
        let top_label = label_by_id.get(&top_lab).cloned();
        probe_stats.insert(
            stem.to_string(),
            json!({
                "n": idxs.len(),
                "in_brand_pct": round1(100.0 * brand_n as f64 / idxs.len() as f64),
                "top_cluster_label": top_label,
                "top_cluster_pct": round1(100.0 * top_n as f64 / idxs.len() as f64),
            }),
        );
    }

    let brand_examples: Vec<String> = labels
        .iter()
        .enumerate()
        .filter(|(_, l)| **l < 0)
        .take(25)
        .map(|(i, _)| truncate(&docs[i].name, 90))
        .collect();

    let mut summary = serde_json::Map::new();
    summary.insert("clusters_total_ge2".into(), json!(clusters.len()));
    summary.insert("solid_ge25".into(), json!(solid.len()));
    summary.insert("solid_homogeneous_coh025".into(), json!(solid_hom));
    summary.insert("medium_8_24".into(), json!(medium.len()));
    summary.insert("medium_homogeneous_coh025".into(), json!(medium_hom));
    summary.insert("small_2_7".into(), json!(small_n));
    summary.insert("brand_count".into(), json!(brand_count));
    summary.insert(
        "brand_pct".into(),
        json!(round1(100.0 * brand_count as f64 / n as f64)),
    );
    summary.insert(
        "typed_coverage_pct".into(),
        json!(round1(100.0 * (n - brand_count) as f64 / n as f64)),
    );
    summary.insert("morph_merges".into(), json!(n_merges));
    summary.insert("pre_split_clusters".into(), json!(n_pre));
    summary.insert("pre_split_noise".into(), json!(n_noise));
    summary.insert("pre_split_largest".into(), json!(largest_pre));
    summary.insert(
        "pre_split_largest_pct".into(),
        json!(round1(100.0 * largest_pre as f64 / n as f64)),
    );
    summary.insert("final_largest".into(), json!(largest_final));
    summary.insert(
        "final_largest_pct".into(),
        json!(round1(100.0 * largest_final as f64 / n as f64)),
    );
    summary.insert("dissolved_to_brand".into(), json!(dissolved));

    let report = json!({
        "sample_size": n,
        "universe": "full scraped_product (non-excluded, local dump)",
        "params": {
            "eps": eps,
            "min_samples": min_samples,
            "merge_sim": merge_sim,
            "blocking": true,
            "anti_hairball": {
                "max_df_ratio": 0.045,
                "edge_requires_2_shared_or_strong_sim": true,
                "split_max_size_pct": 0.015,
                "split_min_cohesion": 0.18,
                "dissolve_cohesion_lt": 0.12
            }
        },
        "summary": summary,
        "solid_clusters": solid,
        "solid_homogeneous": solid.iter().filter(|c| c.cohesion >= 0.25).collect::<Vec<_>>(),
        "medium_clusters": medium.iter().take(40).collect::<Vec<_>>(),
        "medium_homogeneous": medium.iter().filter(|c| c.cohesion >= 0.25).take(40).collect::<Vec<_>>(),
        "small_clusters_sample": clusters.iter().filter(|c| (2..8).contains(&c.size)).take(30).collect::<Vec<_>>(),
        "all_clusters_count": clusters.len(),
        "brand": {
            "count": brand_count,
            "pct": round1(100.0 * brand_count as f64 / n as f64),
            "examples": brand_examples,
        },
        "probe_stem_stats": probe_stats,
    });

    PipelineResult {
        labels,
        report,
        summary,
        label_by_id,
    }
}

fn build_tfidf(
    docs: &[Vec<String>],
    max_features: usize,
    min_df: usize,
) -> (Vec<Vec<(u32, f32)>>, Vec<String>, FxHashMap<String, usize>) {
    let mut df: FxHashMap<String, usize> = FxHashMap::default();
    for toks in docs {
        let mut seen = FxHashSet::default();
        for t in toks {
            if seen.insert(t.clone()) {
                *df.entry(t.clone()).or_default() += 1;
            }
        }
    }
    let mut items: Vec<(String, usize)> = df
        .iter()
        .filter(|(_, &c)| c >= min_df)
        .map(|(t, &c)| (t.clone(), c))
        .collect();
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    items.truncate(max_features);
    let vocab: Vec<String> = items.into_iter().map(|(t, _)| t).collect();
    let idx: FxHashMap<String, u32> = vocab
        .iter()
        .enumerate()
        .map(|(i, t)| (t.clone(), i as u32))
        .collect();
    let n = docs.len() as f32;
    let idf: Vec<f32> = vocab
        .iter()
        .map(|t| ((1.0 + n) / (1.0 + *df.get(t).unwrap_or(&0) as f32)).ln() + 1.0)
        .collect();

    let X: Vec<Vec<(u32, f32)>> = docs
        .par_iter()
        .map(|toks| {
            let mut tf: FxHashMap<u32, f32> = FxHashMap::default();
            for t in toks {
                if let Some(&j) = idx.get(t) {
                    *tf.entry(j).or_default() += 1.0;
                }
            }
            let mut vec: Vec<(u32, f32)> = tf
                .into_iter()
                .map(|(j, c)| (j, c * idf[j as usize]))
                .collect();
            let norm = vec.iter().map(|(_, v)| v * v).sum::<f32>().sqrt();
            if norm > 0.0 {
                for (_, v) in vec.iter_mut() {
                    *v /= norm;
                }
            }
            vec.sort_by_key(|(j, _)| *j);
            vec
        })
        .collect();
    (X, vocab, df)
}

fn cosine_sparse(a: &[(u32, f32)], b: &[(u32, f32)]) -> f32 {
    let mut i = 0;
    let mut j = 0;
    let mut dot = 0.0f32;
    while i < a.len() && j < b.len() {
        if a[i].0 == b[j].0 {
            dot += a[i].1 * b[j].1;
            i += 1;
            j += 1;
        } else if a[i].0 < b[j].0 {
            i += 1;
        } else {
            j += 1;
        }
    }
    dot
}

fn dbscan_blocked(
    X: &[Vec<(u32, f32)>],
    word_docs: &[Vec<String>],
    df: &FxHashMap<String, usize>,
    n: usize,
    eps: f32,
    min_samples: usize,
) -> Vec<i32> {
    // Tighter blocking: fewer bridge tokens (anti-hairball).
    let max_df = ((n as f32) * 0.045) as usize;
    let min_df_block = 5usize;
    let cand_cap = 1800usize;
    let strong_sim = (1.0 - eps) + 0.10; // need 2 shared tokens OR very high sim

    let mut blockable: FxHashSet<String> = FxHashSet::default();
    let mut inv: FxHashMap<String, Vec<u32>> = FxHashMap::default();
    for (i, toks) in word_docs.iter().enumerate() {
        let mut seen = FxHashSet::default();
        for t in toks {
            if !seen.insert(t) {
                continue;
            }
            let c = df.get(t).copied().unwrap_or(0);
            if c >= min_df_block && c <= max_df {
                blockable.insert(t.clone());
                inv.entry(t.clone()).or_default().push(i as u32);
            }
        }
    }

    let thresh = 1.0 - eps;
    let X = Arc::new(X.to_vec());
    let inv = Arc::new(inv);
    let blockable = Arc::new(blockable);
    let word_docs_arc = Arc::new(word_docs.to_vec());

    let neighbors: Vec<Vec<u32>> = (0..n)
        .into_par_iter()
        .map(|i| {
            let mut cand = FxHashSet::default();
            cand.insert(i as u32);
            for t in &word_docs_arc[i] {
                if let Some(ids) = inv.get(t) {
                    for &j in ids {
                        cand.insert(j);
                        if cand.len() >= cand_cap {
                            break;
                        }
                    }
                }
                if cand.len() >= cand_cap {
                    break;
                }
            }
            let xi = &X[i];
            let ai: FxHashSet<&str> = word_docs_arc[i]
                .iter()
                .filter(|t| blockable.contains(t.as_str()))
                .map(|t| t.as_str())
                .collect();
            let mut nbrs = Vec::new();
            for j in cand {
                let ju = j as usize;
                if ju == i {
                    nbrs.push(j);
                    continue;
                }
                let sim = cosine_sparse(xi, &X[ju]);
                if sim < thresh {
                    continue;
                }
                let shared = word_docs_arc[ju]
                    .iter()
                    .filter(|t| ai.contains(t.as_str()))
                    .count();
                // Break weak bridges: need 2 shared block-tokens, or one + strong sim.
                if shared >= 2 || (shared >= 1 && sim >= strong_sim) {
                    nbrs.push(j);
                }
            }
            nbrs
        })
        .collect();

    let mut labels = vec![-1i32; n];
    let mut visited = vec![false; n];
    let mut cid = 0i32;
    for i in 0..n {
        if visited[i] {
            continue;
        }
        visited[i] = true;
        if neighbors[i].len() < min_samples {
            labels[i] = -1;
            continue;
        }
        labels[i] = cid;
        let mut seed_set: FxHashSet<u32> = FxHashSet::default();
        let mut seeds: Vec<u32> = Vec::new();
        for &j in &neighbors[i] {
            if j as usize != i && seed_set.insert(j) {
                seeds.push(j);
            }
        }
        let mut si = 0;
        while si < seeds.len() {
            let j = seeds[si] as usize;
            si += 1;
            if !visited[j] {
                visited[j] = true;
                if neighbors[j].len() >= min_samples {
                    for &nb in &neighbors[j] {
                        if seed_set.insert(nb) {
                            seeds.push(nb);
                        }
                    }
                }
            }
            if labels[j] < 0 {
                labels[j] = cid;
            }
        }
        cid += 1;
    }
    labels
}

fn split_weak_clusters(
    labels: &[i32],
    xw: &[Vec<(u32, f32)>],
    word_docs: &[Vec<String>],
    max_size: usize,
    min_cohesion: f64,
) -> Vec<i32> {
    let mut out = labels.to_vec();
    let mut next_id = labels.iter().copied().filter(|&l| l >= 0).max().unwrap_or(-1) + 1;
    let mut guard = 0usize;

    loop {
        guard += 1;
        if guard > 5000 {
            eprintln!("  split guard hit");
            break;
        }
        let mut counts: FxHashMap<i32, Vec<usize>> = FxHashMap::default();
        for (i, &l) in out.iter().enumerate() {
            if l >= 0 {
                counts.entry(l).or_default().push(i);
            }
        }

        // Prefer largest weak cluster: size>max OR (size>=40 and cohesion<min)
        let mut weak: Vec<(i32, Vec<usize>, f64)> = Vec::new();
        for (cid, members) in counts {
            if members.len() < 8 {
                continue;
            }
            let coh = cluster_cohesion(&members, word_docs);
            let too_big = members.len() > max_size;
            let too_loose = members.len() >= 40 && coh < min_cohesion;
            if too_big || too_loose {
                weak.push((cid, members, coh));
            }
        }
        if weak.is_empty() {
            break;
        }
        weak.sort_by(|a, b| b.1.len().cmp(&a.1.len()));
        let (_cid, members, _coh) = weak.into_iter().next().unwrap();

        let sub_labels = kmeans2_sparse(xw, &members, 18);
        let mut left = Vec::new();
        let mut right = Vec::new();
        for (local_i, &m) in members.iter().enumerate() {
            if sub_labels[local_i] == 0 {
                left.push(m);
            } else {
                right.push(m);
            }
        }
        if left.len() < 2 || right.len() < 2 {
            let mid = members.len() / 2;
            for &m in &members[mid..] {
                out[m] = next_id;
            }
            next_id += 1;
            continue;
        }
        // Reject useless split if sizes extremely unbalanced (<5%)
        let smaller = left.len().min(right.len());
        if (smaller as f64) / (members.len() as f64) < 0.05 {
            let mid = members.len() / 2;
            for &m in &members[mid..] {
                out[m] = next_id;
            }
            next_id += 1;
            continue;
        }
        for &m in &right {
            out[m] = next_id;
        }
        next_id += 1;
    }
    out
}

fn dissolve_incoherent(
    labels: &mut [i32],
    word_docs: &[Vec<String>],
    min_cohesion: f64,
    min_size: usize,
) -> usize {
    let mut members_of: FxHashMap<i32, Vec<usize>> = FxHashMap::default();
    for (i, &l) in labels.iter().enumerate() {
        if l >= 0 {
            members_of.entry(l).or_default().push(i);
        }
    }
    let mut dissolved = 0usize;
    for (_cid, members) in members_of {
        if members.len() < min_size {
            continue;
        }
        let coh = cluster_cohesion(&members, word_docs);
        if coh < min_cohesion {
            for i in members {
                labels[i] = -1;
                dissolved += 1;
            }
        }
    }
    dissolved
}

fn densify_mean(xw: &[Vec<(u32, f32)>], members: &[usize], dim_hint: usize) -> Vec<f32> {
    let mut acc = vec![0.0f32; dim_hint];
    for &i in members {
        for &(j, v) in &xw[i] {
            let j = j as usize;
            if j >= acc.len() {
                acc.resize(j + 1, 0.0);
            }
            acc[j] += v;
        }
    }
    let inv = 1.0 / members.len() as f32;
    for v in acc.iter_mut() {
        *v *= inv;
    }
    let norm = acc.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm > 0.0 {
        for v in acc.iter_mut() {
            *v /= norm;
        }
    }
    acc
}

fn cosine_dense_sparse(dense: &[f32], sparse: &[(u32, f32)]) -> f32 {
    let mut dot = 0.0f32;
    for &(j, v) in sparse {
        let j = j as usize;
        if j < dense.len() {
            dot += dense[j] * v;
        }
    }
    dot
}

fn kmeans2_sparse(xw: &[Vec<(u32, f32)>], members: &[usize], iters: usize) -> Vec<u8> {
    let dim = xw
        .iter()
        .flat_map(|v| v.iter().map(|(j, _)| *j as usize + 1))
        .max()
        .unwrap_or(1);
    let mut labels = vec![0u8; members.len()];
    // init: two random-ish seeds
    let a = 0;
    let b = members.len() / 2;
    let mut c0 = densify_mean(xw, &[members[a]], dim);
    let mut c1 = densify_mean(xw, &[members[b]], dim);

    for _ in 0..iters {
        for (li, &mi) in members.iter().enumerate() {
            let s0 = cosine_dense_sparse(&c0, &xw[mi]);
            let s1 = cosine_dense_sparse(&c1, &xw[mi]);
            labels[li] = if s1 > s0 { 1 } else { 0 };
        }
        let left: Vec<usize> = members
            .iter()
            .enumerate()
            .filter(|(i, _)| labels[*i] == 0)
            .map(|(_, &m)| m)
            .collect();
        let right: Vec<usize> = members
            .iter()
            .enumerate()
            .filter(|(i, _)| labels[*i] == 1)
            .map(|(_, &m)| m)
            .collect();
        if left.is_empty() || right.is_empty() {
            break;
        }
        c0 = densify_mean(xw, &left, dim);
        c1 = densify_mean(xw, &right, dim);
    }
    labels
}

fn morph_merge(
    labels: &[i32],
    xc: &[Vec<(u32, f32)>],
    merge_sim: f32,
    n_docs: usize,
) -> (Vec<i32>, usize) {
    let ids: Vec<i32> = labels
        .iter()
        .copied()
        .filter(|&l| l >= 0)
        .collect::<FxHashSet<_>>()
        .into_iter()
        .collect();
    if ids.is_empty() {
        return (labels.to_vec(), 0);
    }

    let mut members: FxHashMap<i32, Vec<usize>> = FxHashMap::default();
    for (i, &l) in labels.iter().enumerate() {
        if l >= 0 {
            members.entry(l).or_default().push(i);
        }
    }

    // Only small/medium clusters may merge — avoids hairballs via generic dental n-grams.
    let max_merge_size = ((n_docs as f32) * 0.01).max(80.0) as usize; // 1% or >=80

    let mut cents: FxHashMap<i32, Vec<(u32, f32)>> = FxHashMap::default();
    for &c in &ids {
        let ms = &members[&c];
        if ms.len() > max_merge_size {
            continue; // large clusters stay sealed
        }
        let mut acc: FxHashMap<u32, f32> = FxHashMap::default();
        for &i in ms {
            for &(j, v) in &xc[i] {
                *acc.entry(j).or_default() += v;
            }
        }
        let inv_n = 1.0 / ms.len() as f32;
        let mut vec: Vec<(u32, f32)> = acc
            .into_iter()
            .map(|(j, v)| (j, v * inv_n))
            .collect();
        let norm = vec.iter().map(|(_, v)| v * v).sum::<f32>().sqrt();
        if norm > 0.0 {
            for (_, v) in vec.iter_mut() {
                *v /= norm;
            }
        }
        vec.sort_by_key(|(j, _)| *j);
        cents.insert(c, vec);
    }

    let mut parent: FxHashMap<i32, i32> = ids.iter().map(|&c| (c, c)).collect();
    let mut comp_size: FxHashMap<i32, usize> = ids
        .iter()
        .map(|&c| (c, members.get(&c).map(|m| m.len()).unwrap_or(0)))
        .collect();
    fn find(parent: &mut FxHashMap<i32, i32>, x: i32) -> i32 {
        let mut x = x;
        while parent[&x] != x {
            let p = parent[&x];
            let pp = parent[&p];
            parent.insert(x, pp);
            x = p;
        }
        x
    }

    let mut merges = 0usize;
    // Prefer merging most-similar pairs first (greedy), respecting component size cap.
    let mut pair_sims: Vec<(f32, i32, i32)> = Vec::new();
    let mut mergeable: Vec<i32> = cents.keys().copied().collect();
    mergeable.sort();
    for i in 0..mergeable.len() {
        for j in (i + 1)..mergeable.len() {
            let a = mergeable[i];
            let b = mergeable[j];
            let sim = cosine_sparse(&cents[&a], &cents[&b]);
            if sim >= merge_sim {
                pair_sims.push((sim, a, b));
            }
        }
    }
    pair_sims.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal));

    for &(_sim, a, b) in &pair_sims {
        let ra = find(&mut parent, a);
        let rb = find(&mut parent, b);
        if ra == rb {
            continue;
        }
        let sa = *comp_size.get(&ra).unwrap_or(&0);
        let sb = *comp_size.get(&rb).unwrap_or(&0);
        if sa + sb > max_merge_size {
            continue;
        }
        parent.insert(rb, ra);
        comp_size.insert(ra, sa + sb);
        merges += 1;
    }

    let mut remap: FxHashMap<i32, i32> = FxHashMap::default();
    let mut next = 0i32;
    let mut out = labels.to_vec();
    for (i, &l) in labels.iter().enumerate() {
        if l < 0 {
            continue;
        }
        let root = find(&mut parent, l);
        let id = *remap.entry(root).or_insert_with(|| {
            let id = next;
            next += 1;
            id
        });
        out[i] = id;
    }
    (out, merges)
}

fn mechanical_label(
    members: &[usize],
    word_docs: &[Vec<String>],
    df: &FxHashMap<String, usize>,
) -> String {
    let mut tok_c: FxHashMap<String, usize> = FxHashMap::default();
    for &i in members {
        let mut seen = FxHashSet::default();
        for t in &word_docs[i] {
            if seen.insert(t.clone()) {
                *tok_c.entry(t.clone()).or_default() += 1;
            }
        }
    }
    if tok_c.is_empty() {
        return "cluster".into();
    }
    let n = members.len() as f64;
    let mut scored: Vec<(f64, String)> = Vec::new();
    for (t, c) in &tok_c {
        let frac = *c as f64 / n;
        if frac < 0.35 {
            continue;
        }
        let dfc = df.get(t).copied().unwrap_or(1) as f64;
        let score = frac * (1.0 / (2.0 + dfc).ln());
        scored.push((score, t.clone()));
    }
    if let Some((_, t)) = scored.into_iter().max_by(|a, b| a.0.partial_cmp(&b.0).unwrap()) {
        return t;
    }
    tok_c
        .into_iter()
        .max_by_key(|(_, c)| *c)
        .map(|(t, _)| t)
        .unwrap_or_else(|| "cluster".into())
}

fn cluster_cohesion(members: &[usize], word_docs: &[Vec<String>]) -> f64 {
    let sample: Vec<FxHashSet<&str>> = members
        .iter()
        .take(40)
        .map(|&i| word_docs[i].iter().map(|s| s.as_str()).collect())
        .collect();
    if sample.len() < 2 {
        return 1.0;
    }
    let mut js = Vec::new();
    for a in 0..sample.len() {
        let end = (a + 8).min(sample.len());
        for b in (a + 1)..end {
            let inter = sample[a].intersection(&sample[b]).count();
            let uni = sample[a].union(&sample[b]).count().max(1);
            js.push(inter as f64 / uni as f64);
        }
    }
    if js.is_empty() {
        0.0
    } else {
        js.iter().sum::<f64>() / js.len() as f64
    }
}

fn char_ngrams(norm: &str, n_min: usize, n_max: usize) -> Vec<String> {
    let s: String = norm
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect();
    let s = format!(" {s} ");
    let bytes = s.as_bytes();
    let mut grams = Vec::new();
    for n in n_min..=n_max {
        if bytes.len() < n {
            continue;
        }
        for i in 0..=(bytes.len() - n) {
            let g = &bytes[i..i + n];
            if g.iter().all(|&b| b == b' ' || (b as char).is_ascii_digit()) {
                continue;
            }
            grams.push(format!("c{n}:{}", String::from_utf8_lossy(g)));
        }
    }
    grams
}

fn truncate(s: &str, max: usize) -> String {
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i >= max {
            break;
        }
        out.push(ch);
    }
    out
}

fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}
