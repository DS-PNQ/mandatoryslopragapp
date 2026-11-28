//! LemmaSlop's text core, compiled to WebAssembly (`wasm32-unknown-unknown`)
//! and loaded by `lib/native/core.ts`.
//!
//! The ABI is plain C over linear memory, so building needs only `cargo` (no
//! wasm-bindgen) and the module has no imports:
//!
//! - `ls_alloc(len) -> ptr` / `ls_free(ptr, len)`: buffers the host fills.
//! - `ls_index_new(text, text_len, offsets, n) -> handle`: `text` is the UTF-8
//!   of all passages back to back, `offsets` holds n + 1 byte offsets.
//! - `ls_index_scores(handle, query, query_len, out)`: writes n f64 scores.
//! - `ls_index_free(handle)`.
//! - `ls_term_counts(text, len) -> ptr`, `ls_result_len() -> len`: the term
//!   counts as "term\tcount\n" lines, for the equivalence tests.

pub mod bm25;
pub mod text;

use std::cell::RefCell;

thread_local! {
    static INDEXES: RefCell<Vec<Option<bm25::Index>>> = const { RefCell::new(Vec::new()) };
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

unsafe fn str_from<'a>(ptr: *const u8, len: usize) -> &'a str {
    if len == 0 {
        return "";
    }
    // The host writes valid UTF-8 (TextEncoder); fall back to lossy handling
    // rather than undefined behaviour if it ever does not.
    let bytes = std::slice::from_raw_parts(ptr, len);
    std::str::from_utf8(bytes).unwrap_or("")
}

#[no_mangle]
pub extern "C" fn ls_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` must come from `ls_alloc(len)` and not be freed twice.
#[no_mangle]
pub unsafe extern "C" fn ls_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

/// # Safety
/// `text` holds `text_len` bytes; `offsets` holds `n + 1` ascending u32 offsets into it.
#[no_mangle]
pub unsafe extern "C" fn ls_index_new(text: *const u8, text_len: usize, offsets: *const u32, n: usize) -> u32 {
    let all = str_from(text, text_len);
    let offs = std::slice::from_raw_parts(offsets, n + 1);
    let docs = (0..n).map(|i| all.get(offs[i] as usize..offs[i + 1] as usize).unwrap_or(""));
    let index = bm25::Index::new(docs);
    INDEXES.with(|cell| {
        let mut list = cell.borrow_mut();
        if let Some(slot) = list.iter().position(Option::is_none) {
            list[slot] = Some(index);
            slot as u32 + 1
        } else {
            list.push(Some(index));
            list.len() as u32
        }
    })
}

/// # Safety
/// `out` must have room for as many f64 as the index has passages.
#[no_mangle]
pub unsafe extern "C" fn ls_index_scores(handle: u32, query: *const u8, query_len: usize, out: *mut f64) -> i32 {
    let q = str_from(query, query_len);
    INDEXES.with(|cell| {
        let list = cell.borrow();
        let Some(Some(index)) = list.get((handle as usize).wrapping_sub(1)) else { return -1 };
        let scores = index.scores(q);
        std::ptr::copy_nonoverlapping(scores.as_ptr(), out, scores.len());
        scores.len() as i32
    })
}

#[no_mangle]
pub extern "C" fn ls_index_free(handle: u32) {
    INDEXES.with(|cell| {
        if let Some(slot) = cell.borrow_mut().get_mut((handle as usize).wrapping_sub(1)) {
            *slot = None;
        }
    });
}

/// # Safety
/// `text` holds `len` bytes of UTF-8.
#[no_mangle]
pub unsafe extern "C" fn ls_term_counts(text: *const u8, len: usize) -> *const u8 {
    let mut out = String::new();
    for (term, count) in text::term_counts(str_from(text, len)) {
        out.push_str(&String::from_utf8_lossy(&term));
        out.push('\t');
        out.push_str(&count.to_string());
        out.push('\n');
    }
    RESULT.with(|r| {
        let mut r = r.borrow_mut();
        *r = out.into_bytes();
        r.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn ls_result_len() -> usize {
    RESULT.with(|r| r.borrow().len())
}
