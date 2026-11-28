//! Tokenizer and stemmer, an exact port of `lib/rag/text.ts`.
//!
//! The TypeScript version is the specification: `tests/native-core.test.ts`
//! checks that both produce the same term counts, in the same order, on the
//! whole notes library and on edge cases (Unicode, LaTeX, compounds).
//!
//! The TypeScript pipeline is a series of whole-string passes (NFKD, regex
//! replacements, split, filter). Here it is one streaming pass over the text:
//! each character is normalized on its own (NFKD only for non-ASCII), words are
//! built in a reused buffer, stopwords are a hash-set lookup, and terms are
//! interned as byte strings. The results are the same; the work is not.

use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hasher};
use std::sync::OnceLock;

/// FxHash: a fast non-cryptographic hasher, fine for short trusted keys.
#[derive(Default, Clone, Copy)]
pub struct Fx(u64);

impl Hasher for Fx {
    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 = (self.0.rotate_left(5) ^ b as u64).wrapping_mul(0x517c_c1b7_2722_0a95);
        }
    }
    #[inline]
    fn write_u8(&mut self, b: u8) {
        self.0 = (self.0.rotate_left(5) ^ b as u64).wrapping_mul(0x517c_c1b7_2722_0a95);
    }
    #[inline]
    fn write_usize(&mut self, n: usize) {
        self.0 = (self.0.rotate_left(5) ^ n as u64).wrapping_mul(0x517c_c1b7_2722_0a95);
    }
    #[inline]
    fn finish(&self) -> u64 {
        self.0
    }
}

pub type FxBuild = BuildHasherDefault<Fx>;
pub type FxMap<K, V> = HashMap<K, V, FxBuild>;

const STOPWORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "because", "been", "but", "by", "can", "do", "does", "for",
    "from", "has", "have", "how", "if", "in", "into", "is", "it", "its", "let", "more", "most", "no", "not",
    "of", "on", "once", "only", "or", "other", "our", "out", "over", "same", "so", "some", "such", "than",
    "that", "the", "their", "them", "then", "there", "these", "they", "this", "those", "through", "to",
    "too", "under", "until", "up", "very", "was", "we", "were", "what", "when", "where", "which", "while",
    "who", "why", "will", "with", "you", "your", "i", "me", "my", "also", "any", "all", "each", "every",
    "both", "just", "should", "would", "could", "may", "might", "must", "shall", "about", "above", "after",
    "again", "against", "before", "below", "between", "during", "further", "here", "own", "off", "whose",
    "whom", "gives", "give", "given", "get", "got", "use", "used", "using", "via", "per", "one", "two",
    "three", "e", "g", "eg", "ie", "mathrm", "text", "frac", "left", "right", "quad", "qquad", "cdots",
    "ldots", "dots", "displaystyle", "tfrac", "le", "ge",
];

const SUFFIXES: &[&[u8]] = &[
    b"izations", b"ization", b"izable", b"ational", b"ations", b"ation", b"ically", b"ators", b"ities",
    b"ously", b"ments", b"ator", b"ible", b"able", b"ical", b"ence", b"ance", b"ment", b"ness", b"ally",
    b"ity", b"ous", b"ive", b"ize", b"ate", b"ant", b"ent", b"ism", b"ist", b"al", b"ic", b"iz",
];

fn stopwords() -> &'static HashSet<&'static [u8], FxBuild> {
    static SET: OnceLock<HashSet<&'static [u8], FxBuild>> = OnceLock::new();
    SET.get_or_init(|| STOPWORDS.iter().map(|w| w.as_bytes()).collect())
}

/// Light suffix stemmer; same rules and order as `stem()` in text.ts.
/// Words reaching it are ASCII, so byte lengths equal JS string lengths.
pub fn stem_bytes(word: &[u8], w: &mut Vec<u8>) {
    w.clear();
    w.extend_from_slice(word);
    if w.len() > 4 && w.ends_with(b"ies") {
        w.truncate(w.len() - 3);
        w.push(b'y');
    } else if w.ends_with(b"sses") {
        w.truncate(w.len() - 2);
    } else if w.len() > 3
        && w.ends_with(b"s")
        && !(w.ends_with(b"ss") || w.ends_with(b"us") || w.ends_with(b"is") || w.ends_with(b"ys"))
    {
        w.truncate(w.len() - 1);
    }
    if w.len() > 5 && w.ends_with(b"ing") {
        w.truncate(w.len() - 3);
    } else if w.len() > 4 && w.ends_with(b"ed") && !w.ends_with(b"eed") {
        w.truncate(w.len() - 2);
    }
    if w.len() > 5 && w.ends_with(b"ly") {
        w.truncate(w.len() - 2);
    }
    for suffix in SUFFIXES {
        if w.ends_with(suffix) && w.len() - suffix.len() >= 4 {
            w.truncate(w.len() - suffix.len());
            break;
        }
    }
    if w.len() > 4 && w.ends_with(b"e") {
        w.truncate(w.len() - 1);
    }
}

pub fn stem(word: &str) -> String {
    let mut out = Vec::new();
    stem_bytes(word.as_bytes(), &mut out);
    String::from_utf8(out).unwrap_or_default()
}

/// Streams the normalized characters of `text`: ASCII as is, anything else
/// through its NFKD decomposition with combining diacritics (U+0300..U+036F)
/// dropped, as `words()` does with `normalize('NFKD').replace(...)`.
#[inline]
fn for_each_normalized(text: &str, mut f: impl FnMut(char)) {
    let b = text.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] < 0x80 {
            f(b[i] as char);
            i += 1;
            continue;
        }
        let c = text[i..].chars().next().unwrap_or(' ');
        i += c.len_utf8();
        unicode_normalization::char::decompose_compatible(c, |d| {
            if !('\u{300}'..='\u{36f}').contains(&d) {
                f(d);
            }
        });
    }
}

/// Calls `f` with each raw lowercase word: maximal ASCII letter/digit runs,
/// with a break after each LaTeX command name (`\alpha2` gives "alpha", "2").
pub fn for_each_word(text: &str, mut f: impl FnMut(&[u8])) {
    let mut word: Vec<u8> = Vec::with_capacity(32);
    let mut after_backslash = false;
    let mut in_command = false;
    for_each_normalized(text, |c| {
        let letter = c.is_ascii_alphabetic();
        if in_command {
            if letter {
                word.push(c.to_ascii_lowercase() as u8);
                return;
            }
            // " $1 ": the command name stands alone.
            in_command = false;
            f(&word);
            word.clear();
        }
        if after_backslash {
            after_backslash = false;
            if letter {
                in_command = true;
                word.push(c.to_ascii_lowercase() as u8);
                return;
            }
        }
        if c == '\\' {
            after_backslash = true;
        }
        if c.is_ascii_alphanumeric() {
            word.push(c.to_ascii_lowercase() as u8);
        } else if !word.is_empty() {
            f(&word);
            word.clear();
        }
    });
    if !word.is_empty() {
        f(&word);
    }
}

pub fn words(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for_each_word(text, |w| out.push(String::from_utf8_lossy(w).into_owned()));
    out
}

fn is_word_byte(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

/// `\b([a-zA-Z])-([a-zA-Z]{3,})\b` over the original text, joined and lowercased.
fn for_each_compound(text: &str, mut f: impl FnMut(&[u8])) {
    let b = text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(32);
    let mut i = 0;
    while i + 2 < b.len() {
        if b[i + 1] == b'-' && b[i].is_ascii_alphabetic() && (i == 0 || !is_word_byte(b[i - 1])) {
            let mut j = i + 2;
            while j < b.len() && b[j].is_ascii_alphabetic() {
                j += 1;
            }
            if j - (i + 2) >= 3 && (j == b.len() || !is_word_byte(b[j])) {
                buf.clear();
                buf.push(b[i].to_ascii_lowercase());
                buf.extend(b[i + 2..j].iter().map(u8::to_ascii_lowercase));
                f(&buf);
                i = j;
                continue;
            }
        }
        i += 1;
    }
}

/// Whether a raw word becomes a term: two or more characters, not a
/// stopword, not all digits.
#[inline]
pub fn keeps(w: &[u8]) -> bool {
    w.len() >= 2 && !stopwords().contains(w) && !w.iter().all(u8::is_ascii_digit)
}

/// Calls `on_word` with each raw word (to be filtered with `keeps` and
/// stemmed), then `on_compound` with each joined compound, in token order.
pub fn for_each_raw(text: &str, on_word: impl FnMut(&[u8]), on_compound: impl FnMut(&[u8])) {
    for_each_word(text, on_word);
    for_each_compound(text, on_compound);
}

/// Calls `f` with each term (stem) in token order: words first, then compounds.
pub fn for_each_token(text: &str, mut f: impl FnMut(&[u8])) {
    let mut stemmed: Vec<u8> = Vec::with_capacity(32);
    for_each_word(text, |w| {
        if keeps(w) {
            stem_bytes(w, &mut stemmed);
            f(&stemmed);
        }
    });
    for_each_compound(text, |c| f(c));
}

pub fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for_each_token(text, |t| out.push(String::from_utf8_lossy(t).into_owned()));
    out
}

/// Term counts in first-occurrence order, like the Map that `termCounts()` builds.
pub fn term_counts(text: &str) -> Vec<(Vec<u8>, u32)> {
    let mut order: Vec<(Vec<u8>, u32)> = Vec::new();
    let mut index: FxMap<Vec<u8>, usize> = FxMap::default();
    for_each_token(text, |t| match index.get(t) {
        Some(&i) => order[i].1 += 1,
        None => {
            index.insert(t.to_vec(), order.len());
            order.push((t.to_vec(), 1));
        }
    });
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems_like_the_typescript_version() {
        for (w, s) in [
            ("integration", "integr"),
            ("integrals", "integr"),
            ("series", "sery"),
            ("classes", "class"),
            ("converges", "converg"),
            ("matrices", "matric"),
            ("eigenvalues", "eigenvalu"),
            ("computing", "comput"),
            ("defined", "defin"),
        ] {
            assert_eq!(stem(w), s, "{w}");
        }
    }

    #[test]
    fn keeps_latex_commands_and_compounds() {
        let counts = term_counts("The k-means step uses \\nabla f and \\alpha2; p-value é");
        let terms: Vec<String> = counts.iter().map(|(t, _)| String::from_utf8_lossy(t).into_owned()).collect();
        for t in ["nabla", "alpha", "kmeans", "pvalue"] {
            assert!(terms.iter().any(|x| x == t), "{t} in {terms:?}");
        }
        assert_eq!(words("\\\\alpha2 x\\beta"), ["alpha", "2", "x", "beta"]);
        assert_eq!(words("ﬁnite Café"), ["finite", "cafe"]);
    }
}
