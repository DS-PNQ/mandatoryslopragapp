// The Rust text core (crates/lemmaslop-core, loaded from lib/native/*.wasm)
// must agree with the TypeScript tokenizer and BM25 exactly: same terms, same
// counts, same order, same scores and the same rankings.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeCore, nativeTermCounts, NativeBm25, resetNativeCore} from '../lib/native/core';
import {getRetriever} from '../lib/rag/load';
import {termCounts} from '../lib/rag/text';
import {clearUploadCache, rankUploads, TsBm25} from '../lib/uploads/retrieve';

const EDGE_CASES = [
  'Café naïve résumé, Ångström and Schrödinger',
  'ﬁnite ﬁelds and ﬂows (ligatures)',
  'x² + y₁ = ½, ＡＢＣ full-width, αβγ Greek, 😀 emoji',
  '\\alpha2\\beta_{n} \\\\nabla f, \\frac{1}{2}, \\mathbb{R}^n, \\sum_{k=1}^{\\infty}',
  'k-means and p-value; e-means2, self-adjoint, well-known 1-form, A-matrix, x-axis_ y-axis',
  'Integrations integrating integrals integrable; classes series matrices; studies agreed fleeing',
  '',
  '   \n\t  ',
  '12 345 6789 a1 b22 c333',
];

const hasCore = nativeCore() !== null;

test('the Rust core loads', () => {
  assert.ok(hasCore, 'lib/native/lemmaslop_core.wasm is missing or failed to load; run npm run build:native');
});

test('Rust and TypeScript tokenizers give identical term counts', {skip: !hasCore}, () => {
  const texts = [...getRetriever().chunks.map((c) => c.text), ...EDGE_CASES];
  for (const text of texts) {
    assert.deepEqual([...nativeTermCounts(text)!.entries()], [...termCounts(text).entries()], text.slice(0, 80));
  }
});

test('Rust and TypeScript BM25 give the same scores', {skip: !hasCore}, () => {
  const texts = getRetriever().chunks.map((c) => c.text);
  const native = NativeBm25.build(texts)!;
  const ts = new TsBm25(texts);
  try {
    for (const q of ['geometric series ratio |r|<1', 'eigenvalues of symmetric matrices', '\\nabla f gradient descent', 'k-means e-means clustering', 'nothing at all zzz']) {
      const a = Array.from(native.scores(q));
      const b = ts.scores(q);
      a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= 1e-12 * Math.max(1, Math.abs(b[i])), `${q}: ${x} vs ${b[i]}`));
    }
  } finally {
    native.free();
  }
});

test('rankUploads gives the same passages with and without the Rust core', {skip: !hasCore}, () => {
  const corpus = getRetriever().chunks.map((c) => c.text).join('\n\n');
  const text = Array.from({length: 12}, (_, i) => corpus.slice(i * 1500)).join('\f');
  const attachments = [{id: 'u1', name: 'book.pdf', kind: 'pdf' as const, text}];
  const q = 'How does the ratio test decide convergence?';
  clearUploadCache();
  const withCore = rankUploads(q, attachments, 6);
  process.env.LEMMA_NATIVE = 'off';
  resetNativeCore();
  clearUploadCache();
  try {
    const without = rankUploads(q, attachments, 6);
    assert.deepEqual(
      withCore.map((c) => [c.heading, c.rank]),
      without.map((c) => [c.heading, c.rank]),
    );
  } finally {
    delete process.env.LEMMA_NATIVE;
    resetNativeCore();
    clearUploadCache();
  }
});

test('LEMMA_NATIVE=off falls back to TypeScript', () => {
  process.env.LEMMA_NATIVE = 'off';
  resetNativeCore();
  try {
    assert.equal(nativeCore(), null);
    assert.equal(NativeBm25.build(['a']), null);
  } finally {
    delete process.env.LEMMA_NATIVE;
    resetNativeCore();
  }
});
