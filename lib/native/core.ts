// Loader for the Rust text core (crates/lemmaslop-core), compiled to
// WebAssembly and committed as lib/native/lemmaslop_core.wasm. It holds the
// tokenizer, stemmer and BM25 index used for uploads.
//
// The module has no imports and is instantiated synchronously, once per
// process. If the file is missing, fails to load, or LEMMA_NATIVE=off, every
// caller falls back to the TypeScript implementation, which gives the same
// results (tests/native-core.test.ts checks both against each other).

import {readFileSync} from 'node:fs';
import path from 'node:path';

interface CoreExports {
  memory: WebAssembly.Memory;
  ls_alloc(len: number): number;
  ls_free(ptr: number, len: number): void;
  ls_index_new(text: number, textLen: number, offsets: number, n: number): number;
  ls_index_scores(handle: number, query: number, queryLen: number, out: number): number;
  ls_index_free(handle: number): void;
  ls_term_counts(text: number, len: number): number;
  ls_result_len(): number;
}

let core: CoreExports | null | undefined;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function wasmPath(): string {
  return path.join(process.cwd(), 'lib', 'native', 'lemmaslop_core.wasm');
}

/** The Rust core, or null when it is turned off or cannot load. */
export function nativeCore(): CoreExports | null {
  if (core !== undefined) return core;
  if (/^(off|0|false|no)$/i.test(process.env.LEMMA_NATIVE ?? '')) return (core = null);
  try {
    const bytes = readFileSync(/*turbopackIgnore: true*/ wasmPath());
    core = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as CoreExports;
  } catch (error) {
    console.warn('[lemmaslop] Rust core unavailable, using the TypeScript tokenizer:', error instanceof Error ? error.message : error);
    core = null;
  }
  return core;
}

/** For tests: load again on the next call (after changing LEMMA_NATIVE). */
export function resetNativeCore() {
  core = undefined;
}

/** Copies bytes into wasm memory; the caller frees [ptr, len]. */
function put(c: CoreExports, bytes: Uint8Array): [number, number] {
  const len = Math.max(1, bytes.length);
  const ptr = c.ls_alloc(len);
  new Uint8Array(c.memory.buffer, ptr, bytes.length).set(bytes);
  return [ptr, len];
}

/** Term counts from the Rust tokenizer, in first-occurrence order. */
export function nativeTermCounts(text: string): Map<string, number> | null {
  const c = nativeCore();
  if (!c) return null;
  const bytes = encoder.encode(text);
  const [ptr, len] = put(c, bytes);
  try {
    const out = c.ls_term_counts(ptr, bytes.length);
    const raw = decoder.decode(new Uint8Array(c.memory.buffer, out, c.ls_result_len()));
    const counts = new Map<string, number>();
    for (const line of raw.split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      counts.set(line.slice(0, tab), Number(line.slice(tab + 1)));
    }
    return counts;
  } finally {
    c.ls_free(ptr, len);
  }
}

/** A BM25 index over passages, held inside the Rust core. */
export class NativeBm25 {
  private handle: number;
  readonly size: number;

  private constructor(
    private readonly c: CoreExports,
    handle: number,
    size: number,
  ) {
    this.handle = handle;
    this.size = size;
  }

  /** Null when the core is unavailable. */
  static build(texts: string[]): NativeBm25 | null {
    const c = nativeCore();
    if (!c) return null;
    const parts = texts.map((t) => encoder.encode(t));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const all = new Uint8Array(total);
    const offsets = new Uint32Array(texts.length + 1);
    let at = 0;
    parts.forEach((p, i) => {
      all.set(p, at);
      at += p.length;
      offsets[i + 1] = at;
    });
    const [textPtr, textLen] = put(c, all);
    const [offPtr, offLen] = put(c, new Uint8Array(offsets.buffer));
    try {
      return new NativeBm25(c, c.ls_index_new(textPtr, total, offPtr, texts.length), texts.length);
    } finally {
      c.ls_free(textPtr, textLen);
      c.ls_free(offPtr, offLen);
    }
  }

  scores(query: string): Float64Array {
    const q = encoder.encode(query);
    const [qPtr, qLen] = put(this.c, q);
    const outLen = Math.max(8, this.size * 8);
    const outPtr = this.c.ls_alloc(outLen);
    try {
      const n = this.c.ls_index_scores(this.handle, qPtr, q.length, outPtr);
      if (n !== this.size) throw new Error('native index was freed');
      // Copy out: the view is invalid once wasm memory grows.
      return new Float64Array(this.c.memory.buffer.slice(outPtr, outPtr + this.size * 8));
    } finally {
      this.c.ls_free(qPtr, qLen);
      this.c.ls_free(outPtr, outLen);
    }
  }

  free() {
    if (this.handle) this.c.ls_index_free(this.handle);
    this.handle = 0;
  }
}
