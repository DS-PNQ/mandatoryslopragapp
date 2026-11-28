// Optional neural retrieval: a dense embedding model and a cross-encoder
// reranker, both served by llama-server's OpenAI-compatible API.
//
//   embeddings: llama-server -hf ggml-org/embeddinggemma-2-GGUF:Q8_0 --embedding --pooling mean -ub 8192
//               -> LEMMA_EMBED_URL=http://127.0.0.1:8097/v1, LEMMA_EMBED_MODEL=embeddinggemma-2
//           or: llama-server -hf Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0 --embedding --pooling last -ub 8192
//               -> LEMMA_EMBED_URL=http://127.0.0.1:8097/v1 (LEMMA_EMBED_MODEL defaults to qwen3-embedding-0.6b)
//   reranker:   llama-server -hf ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF --reranking -ub 8192
//               -> LEMMA_RERANK_URL=http://127.0.0.1:8098/v1
//
// Either one is optional. Without them retrieval stays LSA + e-means + BM25,
// which needs no server. Every call has a timeout and a failure turns the
// stage off for a minute, so a dead endpoint never blocks an answer.
//
// Choices, from the retrieval literature this follows:
// - Both supported embedders are asymmetric and want their own prompts
//   (LEMMA_EMBED_PROMPTS, else inferred from the model name):
//     qwen3: "Instruct: <task>\nQuery: <q>" for queries, passages bare (the
//            model card reports 1-5% lower retrieval without the instruction);
//     gemma: "task: question answering | query: <q>" for queries and
//            "title: <title> | text: <passage>" for passages (EmbeddingGemma 2).
// - LEMMA_EMBED_DIM truncates vectors (Matryoshka) and renormalizes them; both
//   models are trained for it (EmbeddingGemma 2: 768/512/256/128).
// - Passages are embedded with a context header (note and section, or file and
//   page), the cheap form of "contextual retrieval": a chunk that says "the
//   series converges" is embedded knowing which series.
// - LaTeX is verbalised for the embedder ("\sum" -> "sum"), since embedding
//   natural-language statements of theorems beats embedding raw LaTeX
//   (arXiv:2602.05216). The text the answer model reads is unchanged.
// - Hybrid retrieval (lexical + dense, fused with RRF) followed by a
//   cross-encoder rerank of the fused candidates is the strongest simple
//   pipeline in recent benchmarks (e.g. arXiv:2604.01733).

import {createHash} from 'node:crypto';

const QUERY_INSTRUCTION =
  'Given a mathematics question, retrieve passages from study notes and documents that answer it';
const RERANK_INSTRUCTION = 'Judge whether the passage helps answer the mathematics question';

const EMBED_TIMEOUT_MS = Number(process.env.LEMMA_EMBED_TIMEOUT_MS) || 20_000;
const RERANK_TIMEOUT_MS = Number(process.env.LEMMA_RERANK_TIMEOUT_MS) || 15_000;
const BATCH = 32;
const COOLDOWN_MS = 60_000;

interface Endpoint {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

function endpoint(urlVar: string, modelVar: string, fallbackModel: string): Endpoint | null {
  const baseUrl = process.env[urlVar]?.trim().replace(/\/+$/, '');
  if (!baseUrl) return null;
  return {baseUrl, model: process.env[modelVar]?.trim() || fallbackModel, apiKey: process.env.LEMMA_RETRIEVAL_API_KEY || undefined};
}

export type EmbedFamily = 'qwen3' | 'gemma' | 'plain';

/** Prompt format for the configured embedder. */
export function embedFamily(): EmbedFamily {
  const set = process.env.LEMMA_EMBED_PROMPTS?.trim().toLowerCase();
  if (set === 'qwen3' || set === 'gemma' || set === 'plain') return set;
  const model = embedConfig()?.model ?? '';
  return /gemma/i.test(model) ? 'gemma' : /qwen/i.test(model) ? 'qwen3' : 'plain';
}

/** Matryoshka truncation length, or 0 for the model's full vector. */
function embedDim(): number {
  const n = Number(process.env.LEMMA_EMBED_DIM);
  return Number.isInteger(n) && n >= 32 ? n : 0;
}

/** EmbeddingGemma 2 query task; "question answering" fits questions best (bench/embed-eval.ts). */
function gemmaTask(): string {
  return process.env.LEMMA_EMBED_GEMMA_TASK?.trim() || 'question answering';
}

export function embedConfig(): Endpoint | null {
  return endpoint('LEMMA_EMBED_URL', 'LEMMA_EMBED_MODEL', 'qwen3-embedding-0.6b');
}

export function rerankConfig(): Endpoint | null {
  return endpoint('LEMMA_RERANK_URL', 'LEMMA_RERANK_MODEL', 'qwen3-reranker-0.6b');
}

const downUntil = {embed: 0, rerank: 0};

function isDown(stage: keyof typeof downUntil): boolean {
  return Date.now() < downUntil[stage];
}

function markDown(stage: keyof typeof downUntil, error: unknown) {
  downUntil[stage] = Date.now() + COOLDOWN_MS;
  console.warn(`[lemmaslop] ${stage} endpoint failed, skipping it for a minute:`, error instanceof Error ? error.message : error);
}

async function post(ep: Endpoint, path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<any> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${ep.baseUrl}${path}`, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {'content-type': 'application/json', ...(ep.apiKey ? {authorization: `Bearer ${ep.apiKey}`} : {})},
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.json();
}

const TEX_WORDS: Record<string, string> = {
  frac: 'fraction', dfrac: 'fraction', sqrt: 'square root', sum: 'sum', prod: 'product', int: 'integral',
  oint: 'contour integral', iint: 'double integral', lim: 'limit', infty: 'infinity', partial: 'partial',
  nabla: 'nabla gradient', cdot: 'times', times: 'times', le: 'less or equal', leq: 'less or equal',
  ge: 'greater or equal', geq: 'greater or equal', neq: 'not equal', approx: 'approximately', to: 'to',
  rightarrow: 'implies', Rightarrow: 'implies', iff: 'if and only if', in: 'in', subset: 'subset',
  subseteq: 'subset', cup: 'union', cap: 'intersection', forall: 'for all', exists: 'there exists',
  det: 'determinant', mathbb: '', mathbf: '', mathrm: '', operatorname: '', text: '', left: '', right: '',
  binom: 'binomial', log: 'log', ln: 'natural log', exp: 'exponential', sin: 'sine', cos: 'cosine',
  tan: 'tangent', vec: 'vector', hat: 'hat', bar: 'bar', dot: 'derivative', mid: 'given', pm: 'plus or minus',
  langle: 'inner product', rangle: '', top: 'transpose', perp: 'perpendicular', sim: 'distributed as',
  mathcal: '', boldsymbol: '', quad: '', qquad: '',
};

/** Rewrites LaTeX commands as words for the embedder ("\sum_{n}" -> "sum n"). */
export function verbalizeTex(text: string): string {
  return text
    .replace(/\\([A-Za-z]+)/g, (_, cmd: string) => ` ${TEX_WORDS[cmd] ?? cmd} `)
    .replace(/\^\{?-1\}?/g, ' inverse ')
    .replace(/\^\{?2\}?/g, ' squared ')
    .replace(/\^/g, ' to the power ')
    .replace(/[{}$\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text a passage is embedded as: its context, then its words. */
export function passageForEmbedding(context: string, text: string): string {
  const body = verbalizeTex(text);
  const out = embedFamily() === 'gemma' ? `title: ${context.replace(/\|/g, '/')} | text: ${body}` : `${context}\n${body}`;
  return out.slice(0, 6000);
}

export function queryForEmbedding(question: string): string {
  const q = verbalizeTex(question);
  switch (embedFamily()) {
    case 'gemma':
      return `task: ${gemmaTask()} | query: ${q}`;
    case 'qwen3':
      return `Instruct: ${QUERY_INSTRUCTION}\nQuery: ${q}`;
    default:
      return q;
  }
}

function normalise(v: number[]): Float32Array {
  const dim = embedDim();
  const out = Float32Array.from(dim && dim < v.length ? v.slice(0, dim) : v);
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

// Passage vectors by content hash, so uploads are embedded once per server.
const cache = new Map<string, Float32Array>();
const CACHE_MAX = 20_000;

function key(model: string, text: string): string {
  return createHash('sha1').update(model).update('\0').update(String(embedDim())).update('\0').update(text).digest('hex');
}

async function embedRaw(ep: Endpoint, inputs: string[], signal?: AbortSignal): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const json = await post(ep, '/embeddings', {model: ep.model, input: inputs.slice(i, i + BATCH)}, EMBED_TIMEOUT_MS, signal);
    const data: {index: number; embedding: number[]}[] = json?.data ?? [];
    if (data.length !== Math.min(BATCH, inputs.length - i)) throw new Error('embeddings response has the wrong length');
    data.sort((a, b) => a.index - b.index).forEach((d) => out.push(normalise(d.embedding)));
  }
  return out;
}

/** Embeds passages (cached). Null when no embedder is configured or it failed. */
export async function embedPassages(texts: string[], signal?: AbortSignal): Promise<Float32Array[] | null> {
  const ep = embedConfig();
  if (!ep || isDown('embed') || texts.length === 0) return null;
  const keys = texts.map((t) => key(ep.model, t));
  const missing = [...new Set(keys.map((k, i) => (cache.has(k) ? -1 : i)).filter((i) => i >= 0))];
  try {
    const vectors = await embedRaw(ep, missing.map((i) => texts[i]), signal);
    missing.forEach((i, j) => cache.set(keys[i], vectors[j]));
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return keys.map((k) => cache.get(k)!);
  } catch (error) {
    if (!signal?.aborted) markDown('embed', error);
    return null;
  }
}

export async function embedQuery(question: string, signal?: AbortSignal): Promise<Float32Array | null> {
  const ep = embedConfig();
  if (!ep || isDown('embed')) return null;
  try {
    return (await embedRaw(ep, [queryForEmbedding(question)], signal))[0];
  } catch (error) {
    if (!signal?.aborted) markDown('embed', error);
    return null;
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Indices of `vectors` ordered by similarity to `query`, best first. */
export function denseRanking(query: Float32Array, vectors: Float32Array[], limit = 20): {index: number; score: number}[] {
  return vectors
    .map((v, index) => ({index, score: cosine(query, v)}))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Scores (query, passage) pairs with the cross-encoder. Returns relevance
 * scores aligned with `documents`, or null when no reranker is configured or
 * it failed.
 */
export async function rerank(question: string, documents: string[], signal?: AbortSignal): Promise<number[] | null> {
  const ep = rerankConfig();
  if (!ep || isDown('rerank') || documents.length === 0) return null;
  try {
    const json = await post(
      ep,
      '/rerank',
      {
        model: ep.model,
        query: `<Instruct>: ${RERANK_INSTRUCTION}\n<Query>: ${question}`,
        documents: documents.map((d) => d.slice(0, 4000)),
        top_n: documents.length,
      },
      RERANK_TIMEOUT_MS,
      signal,
    );
    const results: {index: number; relevance_score: number}[] = json?.results ?? [];
    if (results.length === 0) throw new Error('rerank response has no results');
    const scores = new Array<number>(documents.length).fill(-Infinity);
    for (const r of results) if (r.index >= 0 && r.index < documents.length) scores[r.index] = Number(r.relevance_score);
    return scores;
  } catch (error) {
    if (!signal?.aborted) markDown('rerank', error);
    return null;
  }
}

/** Reorders candidates by reranker score; returns null if reranking was skipped. */
export async function rerankOrder<T>(
  question: string,
  candidates: T[],
  text: (c: T) => string,
  signal?: AbortSignal,
): Promise<{item: T; score: number}[] | null> {
  const scores = await rerank(question, candidates.map(text), signal);
  if (!scores) return null;
  return candidates.map((item, i) => ({item, score: scores[i]})).sort((a, b) => b.score - a.score);
}

/** For tests: forget cached vectors and endpoint failures. */
export function resetNeuralState() {
  cache.clear();
  downUntil.embed = 0;
  downUntil.rerank = 0;
}
