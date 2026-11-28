// Times the retrieval hot paths. Run: npm run bench
// Uses the built library index and a synthetic maximum-size upload (1.48M
// characters, near the app's cap), with the Rust core on and off.

import {performance} from 'node:perf_hooks';
import {nativeCore, resetNativeCore} from '../lib/native/core';
import {getRetriever} from '../lib/rag/load';
import {clearUploadCache, rankUploads} from '../lib/uploads/retrieve';

function time(label: string, runs: number, fn: () => unknown, setup: () => void = () => {}): number {
  setup();
  fn(); // warm up the JIT
  let total = 0;
  for (let i = 0; i < runs; i++) {
    setup();
    const t0 = performance.now();
    fn();
    total += performance.now() - t0;
  }
  const ms = total / runs;
  console.log(`${label.padEnd(52)} ${ms.toFixed(2).padStart(9)} ms`);
  return ms;
}

const retriever = getRetriever();
const corpus = retriever.chunks.map((c) => c.text).join('\n\n');
let book = '';
for (let page = 0; book.length < 1_480_000; page++) book += `${corpus.slice((page * 977) % 5000)}\f`;
const upload = [{id: 'book', name: 'book.pdf', kind: 'pdf' as const, text: book.slice(0, 1_480_000)}];
const question = 'Why does the geometric series converge when |r|<1?';

time('library search (LSA + IVF + BM25 + RRF), 1 query', 3000, () => retriever.search(question, 6));
for (const native of [false, true]) {
  process.env.LEMMA_NATIVE = native ? 'on' : 'off';
  resetNativeCore();
  const label = native ? (nativeCore() ? 'Rust/WASM' : 'Rust (failed to load)') : 'TypeScript';
  time(`upload, first question (${label})`, 5, () => rankUploads(question, upload, 20), clearUploadCache);
  clearUploadCache();
  rankUploads(question, upload, 20);
  time(`upload, later question, cached index (${label})`, 50, () => rankUploads('eigenvalues of a symmetric matrix', upload, 20));
}
clearUploadCache();
