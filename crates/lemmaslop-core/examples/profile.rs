//! cargo run --release --example profile -- <file>: times tokenizing and indexing a text file split on form feeds.
use std::time::Instant;
fn main() {
    let path = std::env::args().nth(1).expect("file");
    let text = std::fs::read_to_string(path).unwrap();
    let pages: Vec<&str> = text.split('\u{c}').collect();
    for _ in 0..2 {
        let t = Instant::now();
        let n: usize = pages.iter().map(|p| lemmaslop_core::text::tokens(p).len()).sum();
        println!("tokens: {n} in {:?}", t.elapsed());
        let t = Instant::now();
        let idx = lemmaslop_core::bm25::Index::new(pages.iter().copied());
        println!("index of {} pages in {:?}", idx.len(), t.elapsed());
        let t = Instant::now();
        let s = idx.scores("Why does the geometric series converge when |r|<1?");
        println!("score in {:?} ({})", t.elapsed(), s.len());
    }
}
