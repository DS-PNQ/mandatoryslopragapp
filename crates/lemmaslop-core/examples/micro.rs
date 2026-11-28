use std::time::Instant;
fn main() {
    let text = std::fs::read_to_string(std::env::args().nth(1).unwrap()).unwrap();
    for _ in 0..3 {
        let t = Instant::now();
        let mut n = 0usize;
        lemmaslop_core::text::for_each_word(&text, |w| n += w.len());
        let a = t.elapsed();
        let t = Instant::now();
        let mut m = 0usize;
        for c in text.chars() {
            if c.is_ascii_alphanumeric() {
                m += 1
            }
        }
        println!(
            "for_each_word {a:?} ({n}) | bare chars loop {:?} ({m}) | ascii share {:.4}",
            t.elapsed(),
            text.bytes().filter(|b| *b < 128).count() as f64 / text.len() as f64
        );
    }
}
