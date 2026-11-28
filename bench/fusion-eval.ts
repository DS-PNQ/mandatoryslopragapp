// Sweeps the reciprocal-rank-fusion weights (LSA, BM25, neural) on the
// evaluation set, for each embedder. The neural ranking for each question is
// computed once, so the sweep itself is instant.
//
//   EVAL_GEMMA_URL=http://127.0.0.1:8201/v1 EVAL_QWEN_URL=http://127.0.0.1:8202/v1 npx tsx bench/fusion-eval.ts

import {readFileSync} from 'node:fs';
import {getRetriever} from '../lib/rag/load';
import {denseRanking, embedPassages, embedQuery, passageForEmbedding, resetNeuralState} from '../lib/rag/neural';
import type {FusionWeights} from '../lib/rag/retrieve';

// EVAL_SET=terms runs the 12 exact-term questions (names, acronyms) instead.
const file = process.env.EVAL_SET === 'terms' ? './retrieval-eval-terms.json' : './retrieval-eval.json';
const items: {q: string; gold: string[]}[] = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const retriever = getRetriever();
const chunks = retriever.chunks;

const embedders = [
  ...(process.env.EVAL_QWEN_URL ? [{name: 'Qwen3-Embedding-0.6B', env: {LEMMA_EMBED_URL: process.env.EVAL_QWEN_URL, LEMMA_EMBED_MODEL: 'qwen3-embedding-0.6b'}}] : []),
  ...(process.env.EVAL_GEMMA_URL
    ? [{name: 'EmbeddingGemma 2 (search task)', env: {LEMMA_EMBED_URL: process.env.EVAL_GEMMA_URL, LEMMA_EMBED_MODEL: 'embeddinggemma-2', LEMMA_EMBED_GEMMA_TASK: 'search result'}}]
    : []),
];

const grid: FusionWeights[] = [];
for (const neural of [1, 2, 3, 4, 6, 10]) for (const lsa of [0, 0.25, 0.5, 1]) for (const bm25 of [0, 0.1, 0.25, 0.5, 1]) grid.push({lsa, bm25, neural});

function score(rankings: string[][]) {
  let h1 = 0, r6 = 0, mrr = 0;
  rankings.forEach((ids, i) => {
    const rank = ids.findIndex((id) => items[i].gold.includes(id));
    if (rank === 0) h1++;
    if (rank >= 0 && rank < 6) r6++;
    if (rank >= 0 && rank < 10) mrr += 1 / (rank + 1);
  });
  return {h1: h1 / items.length, r6: r6 / items.length, mrr: mrr / items.length};
}

for (const e of embedders) {
  for (const k of ['LEMMA_EMBED_URL', 'LEMMA_EMBED_MODEL', 'LEMMA_EMBED_GEMMA_TASK']) delete process.env[k];
  Object.assign(process.env, e.env);
  resetNeuralState();
  const vectors = await embedPassages(chunks.map((c) => passageForEmbedding(`${c.noteTitle} § ${c.heading}`, c.text)));
  if (!vectors) throw new Error(`${e.name}: embedding failed`);
  const neural: {index: number; score: number}[][] = [];
  for (const it of items) neural.push(denseRanking((await embedQuery(it.q))!, vectors, 20));
  const rows = grid.map((w) => ({
    w,
    ...score(items.map((it, i) => retriever.search(it.q, 20, undefined, neural[i], w).passages.map((p) => p.chunk.id))),
  }));
  rows.sort((a, b) => b.mrr - a.mrr || b.h1 - a.h1);
  const dense = score(neural.map((r) => r.map(({index}) => chunks[index].id)));
  console.log(`\n${e.name}: dense alone hit@1 ${(dense.h1 * 100).toFixed(1)}% recall@6 ${(dense.r6 * 100).toFixed(1)}% MRR ${dense.mrr.toFixed(3)}`);
  console.log('lsa  bm25 neural | hit@1  recall@6  MRR@10');
  for (const r of rows.slice(0, 8)) {
    console.log(`${String(r.w.lsa).padEnd(4)} ${String(r.w.bm25).padEnd(4)} ${String(r.w.neural).padEnd(6)} | ${(r.h1 * 100).toFixed(1).padStart(5)}%  ${(r.r6 * 100).toFixed(1).padStart(5)}%    ${r.mrr.toFixed(3)}`);
  }
  const eq = rows.find((r) => r.w.lsa === 1 && r.w.bm25 === 1 && r.w.neural === 1)!;
  console.log(`equal weights (1,1,1): hit@1 ${(eq.h1 * 100).toFixed(1)}% recall@6 ${(eq.r6 * 100).toFixed(1)}% MRR ${eq.mrr.toFixed(3)}`);
  for (const pick of [{lsa: 0, bm25: 0, neural: 1}, {lsa: 0, bm25: 0.25, neural: 4}, {lsa: 0, bm25: 0.1, neural: 4}, {lsa: 0.25, bm25: 0.25, neural: 4}, {lsa: 0, bm25: 0.5, neural: 3}]) {
    const r = rows.find((x) => x.w.lsa === pick.lsa && x.w.bm25 === pick.bm25 && x.w.neural === pick.neural);
    if (r) console.log(`(${pick.lsa},${pick.bm25},${pick.neural}): hit@1 ${(r.h1 * 100).toFixed(1)}% recall@6 ${(r.r6 * 100).toFixed(1)}% MRR ${r.mrr.toFixed(3)}`);
  }
}
