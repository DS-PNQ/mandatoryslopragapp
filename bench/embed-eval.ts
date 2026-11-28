// Retrieval evaluation over the notes library: 52 student-style questions,
// paraphrased away from the section titles, each with its correct passage(s)
// (bench/retrieval-eval.json). Runs the app's own searchLibrary() under each
// configuration, so prompt formats and fusion are exactly what the app does.
//
//   EVAL_GEMMA_URL=http://127.0.0.1:8201/v1 EVAL_QWEN_URL=http://127.0.0.1:8202/v1 \
//   EVAL_RERANK_URL=http://127.0.0.1:8203/v1 npx tsx bench/embed-eval.ts
//
// Any URL left out skips the configurations that need it.

import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {resetLibraryEmbeddings, searchLibrary, warmLibraryEmbeddings} from '../lib/rag/hybrid';
import {denseRanking, embedPassages, embedQuery, passageForEmbedding, resetNeuralState} from '../lib/rag/neural';
import {getRetriever} from '../lib/rag/load';

interface Item {
  q: string;
  gold: string[];
}

const items: Item[] = JSON.parse(readFileSync(new URL('./retrieval-eval.json', import.meta.url), 'utf8'));
const chunks = getRetriever().chunks;

interface Config {
  name: string;
  env: Record<string, string>;
  /** Score the embedder alone (dense cosine ranking), without fusion. */
  denseOnly?: boolean;
}

const G = process.env.EVAL_GEMMA_URL;
const Qw = process.env.EVAL_QWEN_URL;
const R = process.env.EVAL_RERANK_URL;
const gemma = (extra: Record<string, string> = {}) => ({LEMMA_EMBED_URL: G!, LEMMA_EMBED_MODEL: 'embeddinggemma-2', ...extra});
const qwen = {LEMMA_EMBED_URL: Qw!, LEMMA_EMBED_MODEL: 'qwen3-embedding-0.6b'};

const configs: Config[] = [
  {name: 'baseline: LSA + e-means + BM25', env: {}},
  ...(Qw ? [{name: 'Qwen3-Embedding-0.6B alone', env: qwen, denseOnly: true}] : []),
  ...(G ? [{name: 'EmbeddingGemma 2 alone (QA task)', env: gemma(), denseOnly: true}] : []),
  ...(G ? [{name: 'EmbeddingGemma 2 alone (search task)', env: gemma({LEMMA_EMBED_GEMMA_TASK: 'search result'}), denseOnly: true}] : []),
  ...(G ? [{name: 'EmbeddingGemma 2 alone, 256-d (QA)', env: gemma({LEMMA_EMBED_DIM: '256'}), denseOnly: true}] : []),
  ...(Qw ? [{name: 'hybrid + Qwen3-Embedding', env: qwen}] : []),
  ...(G ? [{name: 'hybrid + EmbeddingGemma 2 (QA)', env: gemma()}] : []),
  ...(G ? [{name: 'hybrid + EmbeddingGemma 2 (search)', env: gemma({LEMMA_EMBED_GEMMA_TASK: 'search result'})}] : []),
  ...(G ? [{name: 'hybrid + EmbeddingGemma 2, 256-d', env: gemma({LEMMA_EMBED_DIM: '256'})}] : []),
  ...(R ? [{name: 'baseline + reranker', env: {LEMMA_RERANK_URL: R}}] : []),
  ...(R && Qw ? [{name: 'hybrid + Qwen3-Embedding + reranker', env: {...qwen, LEMMA_RERANK_URL: R}}] : []),
  ...(R && G ? [{name: 'hybrid + EmbeddingGemma 2 + reranker', env: {...gemma(), LEMMA_RERANK_URL: R}}] : []),
];

const KEYS = ['LEMMA_EMBED_URL', 'LEMMA_EMBED_MODEL', 'LEMMA_EMBED_DIM', 'LEMMA_EMBED_GEMMA_TASK', 'LEMMA_RERANK_URL'];

async function rankedIds(cfg: Config, q: string): Promise<string[]> {
  if (cfg.denseOnly) {
    const [qv, vectors] = await Promise.all([
      embedQuery(q),
      embedPassages(chunks.map((c) => passageForEmbedding(`${c.noteTitle} § ${c.heading}`, c.text))),
    ]);
    if (!qv || !vectors) throw new Error('embedding failed');
    return denseRanking(qv, vectors, 20).map(({index}) => chunks[index].id);
  }
  const r = await searchLibrary(q, 20);
  if (cfg.env.LEMMA_EMBED_URL && !r.neural.embedder) throw new Error('embedder was not used');
  if (cfg.env.LEMMA_RERANK_URL && !r.neural.reranker) throw new Error('reranker was not used');
  return r.passages.map((p) => p.chunk.id);
}

const rows: string[] = [];
for (const cfg of configs) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, cfg.env);
  resetNeuralState();
  resetLibraryEmbeddings();
  let indexMs = 0;
  if (cfg.env.LEMMA_EMBED_URL && !cfg.denseOnly) {
    const t = performance.now();
    await warmLibraryEmbeddings();
    indexMs = performance.now() - t;
  }
  let r1 = 0;
  let r6 = 0;
  let r20 = 0;
  let mrr = 0;
  const t0 = performance.now();
  for (const it of items) {
    const ids = await rankedIds(cfg, it.q);
    const rank = ids.findIndex((id) => it.gold.includes(id));
    if (rank === 0) r1++;
    if (rank >= 0 && rank < 6) r6++;
    if (rank >= 0) r20++;
    if (rank >= 0 && rank < 10) mrr += 1 / (rank + 1);
  }
  const perQuery = (performance.now() - t0) / items.length;
  const n = items.length;
  const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`.padStart(6);
  rows.push(
    `| ${cfg.name.padEnd(40)} | ${pct(r1)} | ${pct(r6)} | ${pct(r20)} | ${(mrr / n).toFixed(3)} | ${perQuery.toFixed(0).padStart(5)} ms | ${indexMs ? `${(indexMs / 1000).toFixed(1)} s` : '-'} |`,
  );
  console.log(rows.at(-1));
}

console.log(`\n${items.length} questions, CPU (llama.cpp, 4 threads), Q8_0 models.\n`);
console.log('| Configuration | Hit@1 | Recall@6 | Recall@20 | MRR@10 | Per question | Embed library |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
