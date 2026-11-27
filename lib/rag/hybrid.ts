// Hybrid retrieval with optional neural stages (see lib/rag/neural.ts):
//
//   library:  LSA + e-means IVF (dense) + BM25 (lexical) + neural embeddings,
//             fused with RRF into 20 candidates, then reranked by the
//             cross-encoder down to k.
//   uploads:  BM25 + neural embeddings fused with RRF, then reranked.
//
// With no embedding or rerank server configured this is exactly the old
// pipeline, so the app still runs anywhere (Vercel, a laptop, the tests).

import {rankUploads, chunkAttachment, sendsWhole, type Attachment, type RankedUploadChunk} from '../uploads/retrieve';
import {getRetriever} from './load';
import {denseRanking, embedConfig, embedPassages, embedQuery, passageForEmbedding, rerankConfig, rerankOrder} from './neural';
import type {RetrievalResult} from './retrieve';

const CANDIDATES = 20;
const RRF_K = 60;

export interface NeuralTrace {
  /** Model name of the embedder, when its ranking was fused in. */
  embedder: string | null;
  /** Model name of the reranker, when it reordered the candidates. */
  reranker: string | null;
}

let libraryVectors: Promise<Float32Array[] | null> | null = null;

/** Embeds the library once per process (110 passages, a second or two on a GPU). */
function libraryEmbeddings(signal?: AbortSignal): Promise<Float32Array[] | null> {
  if (!embedConfig()) return Promise.resolve(null);
  libraryVectors ??= embedPassages(
    getRetriever().chunks.map((c) => passageForEmbedding(`${c.noteTitle} § ${c.heading}`, c.text)),
    signal,
  ).then((v) => {
    if (!v) libraryVectors = null; // try again on a later question
    return v;
  });
  return libraryVectors;
}

export async function searchLibrary(
  query: string,
  k: number,
  signal?: AbortSignal,
): Promise<RetrievalResult & {neural: NeuralTrace}> {
  const retriever = getRetriever();
  const neural: NeuralTrace = {embedder: null, reranker: null};
  let ranking: {index: number; score: number}[] | undefined;
  if (embedConfig()) {
    const [q, vectors] = await Promise.all([embedQuery(query, signal), libraryEmbeddings(signal)]);
    if (q && vectors) {
      ranking = denseRanking(q, vectors, CANDIDATES);
      neural.embedder = embedConfig()!.model;
    }
  }
  const wide = retriever.search(query, rerankConfig() ? CANDIDATES : k, undefined, ranking);
  if (wide.passages.length > 1 && rerankConfig()) {
    const reranked = await rerankOrder(
      query,
      wide.passages,
      (p) => `${p.chunk.noteTitle}, ${p.chunk.heading}\n${p.chunk.text}`,
      signal,
    );
    if (reranked) {
      neural.reranker = rerankConfig()!.model;
      return {
        passages: reranked.slice(0, k).map(({item, score}) => ({...item, rerankScore: score})),
        trace: wide.trace,
        neural,
      };
    }
  }
  return {passages: wide.passages.slice(0, k), trace: wide.trace, neural};
}

/**
 * Ranks upload passages. Small selections are still sent whole; larger ones
 * fuse BM25 with neural embeddings and are reranked when servers are set.
 */
export async function searchUploads(
  question: string,
  attachments: Attachment[],
  k: number,
  signal?: AbortSignal,
): Promise<{chunks: RankedUploadChunk[]; neural: NeuralTrace}> {
  const neural: NeuralTrace = {embedder: null, reranker: null};
  const lexical = rankUploads(question, attachments, CANDIDATES);
  // Sent whole (small) or no neural stage configured: nothing to add.
  if (lexical.length === 0 || sendsWhole(attachments) || (!embedConfig() && !rerankConfig())) {
    return {chunks: rankUploads(question, attachments, k), neural};
  }

  let candidates = lexical;
  if (embedConfig()) {
    const chunks = attachments.flatMap(chunkAttachment);
    const [q, vectors] = await Promise.all([
      embedQuery(question, signal),
      embedPassages(chunks.map((c) => passageForEmbedding(`${c.sourceName}, ${c.heading}`, c.text)), signal),
    ]);
    if (q && vectors) {
      neural.embedder = embedConfig()!.model;
      const fused = new Map<number, number>();
      const keyOf = (c: {sourceId: string; heading: string}) => `${c.sourceId}\0${c.heading}`;
      const indexOf = new Map(chunks.map((c, i) => [keyOf(c), i]));
      lexical
        .filter((c) => c.rank !== null)
        .forEach((c, r) => {
          const i = indexOf.get(keyOf(c));
          if (i !== undefined) fused.set(i, (fused.get(i) ?? 0) + 1 / (RRF_K + r + 1));
        });
      denseRanking(q, vectors, CANDIDATES).forEach(({index}, r) => fused.set(index, (fused.get(index) ?? 0) + 1 / (RRF_K + r + 1)));
      candidates = [...fused.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, CANDIDATES)
        .map(([i, score], r) => ({...chunks[i], score, rank: r + 1}));
    }
  }

  let picked = candidates.slice(0, k);
  if (rerankConfig() && candidates.length > 1) {
    const reranked = await rerankOrder(question, candidates, (c) => `${c.sourceName}, ${c.heading}\n${c.text}`, signal);
    if (reranked) {
      neural.reranker = rerankConfig()!.model;
      picked = reranked.slice(0, k).map(({item}, r) => ({...item, rank: r + 1}));
    }
  }
  // Keep the opening chunk of each source, as the lexical ranking does.
  const seen = new Set(picked.map((c) => `${c.sourceId}\0${c.heading}`));
  for (const c of lexical) {
    if (c.rank === null && !seen.has(`${c.sourceId}\0${c.heading}`) && picked.length < k + 2) picked.push(c);
  }
  return {chunks: picked, neural};
}
