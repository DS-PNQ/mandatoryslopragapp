//! BM25 over upload passages, matching `rankUploads()` in lib/uploads/retrieve.ts.
//!
//! The TypeScript code tokenizes every passage on every question. This index
//! tokenizes once and keeps an inverted index, so a question costs only its
//! own tokenization plus one pass over the postings of its terms.

use crate::text::{for_each_raw, keeps, stem_bytes, term_counts, FxMap};

const K1: f64 = 1.2;
const B: f64 = 0.75;

pub struct Index {
    vocab: FxMap<Vec<u8>, u32>,
    /// term id -> (doc, tf), docs ascending.
    postings: Vec<Vec<(u32, u32)>>,
    lengths: Vec<f64>,
    avg: f64,
}

/// Builds the vocabulary and per-document counts.
struct Builder {
    vocab: FxMap<Vec<u8>, u32>,
    postings: Vec<Vec<(u32, u32)>>,
    /// Per-document counts, dense by term id, reset through `touched`.
    counts: Vec<u32>,
    touched: Vec<u32>,
}

impl Builder {
    fn id(&mut self, term: &[u8]) -> u32 {
        if let Some(&id) = self.vocab.get(term) {
            return id;
        }
        let id = self.postings.len() as u32;
        self.vocab.insert(term.to_vec(), id);
        self.postings.push(Vec::new());
        self.counts.push(0);
        id
    }

    fn count(&mut self, id: u32) {
        let c = &mut self.counts[id as usize];
        if *c == 0 {
            self.touched.push(id);
        }
        *c += 1;
    }

    fn end_doc(&mut self, d: u32) {
        for &id in &self.touched {
            self.postings[id as usize].push((d, self.counts[id as usize]));
            self.counts[id as usize] = 0;
        }
        self.touched.clear();
    }
}

impl Index {
    pub fn new<'a>(docs: impl IntoIterator<Item = &'a str>) -> Index {
        let mut b = Builder { vocab: FxMap::default(), postings: Vec::new(), counts: Vec::new(), touched: Vec::new() };
        // Raw word -> term id (None: filtered out). Each distinct word is
        // checked and stemmed once per index, not at every occurrence.
        let mut seen: FxMap<Vec<u8>, Option<u32>> = FxMap::default();
        let mut stemmed: Vec<u8> = Vec::with_capacity(32);
        let mut compounds: Vec<Vec<u8>> = Vec::new();
        let mut lengths = Vec::new();
        for (d, text) in docs.into_iter().enumerate() {
            let mut len = 0u64;
            compounds.clear();
            for_each_raw(
                text,
                |w| {
                    let id = match seen.get(w) {
                        Some(&cached) => cached,
                        None => {
                            let id = if keeps(w) {
                                stem_bytes(w, &mut stemmed);
                                Some(b.id(&stemmed))
                            } else {
                                None
                            };
                            seen.insert(w.to_vec(), id);
                            id
                        }
                    };
                    if let Some(id) = id {
                        len += 1;
                        b.count(id);
                    }
                },
                |c| compounds.push(c.to_vec()),
            );
            for c in &compounds {
                len += 1;
                let id = b.id(c);
                b.count(id);
            }
            b.end_doc(d as u32);
            lengths.push(len as f64);
        }
        let avg = if lengths.is_empty() { 0.0 } else { lengths.iter().sum::<f64>() / lengths.len() as f64 };
        Index { vocab: b.vocab, postings: b.postings, lengths, avg }
    }

    pub fn len(&self) -> usize {
        self.lengths.len()
    }

    pub fn is_empty(&self) -> bool {
        self.lengths.is_empty()
    }

    /// One score per passage. Query terms are visited in first-occurrence
    /// order and each passage's score is summed in that order, as in the
    /// TypeScript loop, so the floating-point results agree.
    pub fn scores(&self, query: &str) -> Vec<f64> {
        let n = self.lengths.len() as f64;
        let mut out = vec![0.0f64; self.lengths.len()];
        for (term, _) in term_counts(query) {
            let Some(&id) = self.vocab.get(&term) else { continue };
            let list = &self.postings[id as usize];
            let df = list.len() as f64;
            let idf = (1.0 + (n - df + 0.5) / (df + 0.5)).ln();
            for &(d, tf) in list {
                let tf = tf as f64;
                let len = self.lengths[d as usize];
                // Same literals as the TypeScript (2.2 = k1 + 1, 0.25 = 1 - b), so
                // the arithmetic is identical operation for operation.
                out[d as usize] += (idf * tf * 2.2) / (tf + K1 * (0.25 + (B * len) / self.avg));
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_the_matching_passage_first() {
        let idx = Index::new(["The ratio test compares consecutive terms.", "Eigenvalues of symmetric matrices are real.", "Probability of an event."]);
        let s = idx.scores("Are the eigenvalues of a symmetric matrix real?");
        assert!(s[1] > s[0] && s[1] > s[2]);
        assert_eq!(idx.scores("nothing matches here")[0], 0.0);
    }
}
