// Query-time retrieval: LSA fold-in -> IVF probe over e-means cells (dense),
// BM25 over all passages (lexical), and, when an embedding server is
// configured, a neural dense ranking (lib/rag/hybrid.ts), fused with
// reciprocal rank fusion.

import {termCounts} from './text';
import type {Chunk, IndexFile} from './types';

export interface ProbedCell {
  id: number;
  distance: number;
  size: number;
  terms: string[];
}

export interface RetrievedPassage {
  chunk: Chunk;
  fused: number;
  denseScore: number | null;
  denseRank: number | null;
  /** Rank in the neural embedding list, when one was given. */
  neuralRank?: number | null;
  /** Cross-encoder relevance, when the passage was reranked. */
  rerankScore?: number | null;
  bm25Score: number | null;
  bm25Rank: number | null;
  cell: number;
}

export interface RetrievalTrace {
  queryTerms: string[];
  unknownTerms: string[];
  probed: ProbedCell[];
  scanned: number;
  total: number;
  /** Overlap of the IVF dense top-k with an exhaustive dense scan. */
  denseRecall: number | null;
  elapsedMs: number;
}

export interface RetrievalResult {
  passages: RetrievedPassage[];
  trace: RetrievalTrace;
}

const RRF_K = 60;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export class Retriever {
  private readonly termIndex: Map<string, number>;
  private readonly postings: Map<number, [number, number][]>;
  private readonly rank: number;
  private readonly n: number;
  private readonly cellOf: Int32Array;

  constructor(private readonly index: IndexFile) {
    this.termIndex = new Map(index.vocab.map((t, i) => [t, i]));
    this.rank = index.lsa.rank;
    this.n = index.chunks.length;
    this.postings = new Map();
    index.tfidf.forEach((row, doc) => {
      for (const [t, w] of row) {
        const list = this.postings.get(t) ?? [];
        list.push([doc, w]);
        this.postings.set(t, list);
      }
    });
    this.cellOf = new Int32Array(this.n);
    index.ivf.lists.forEach((list, cell) => list.forEach((doc) => (this.cellOf[doc] = cell)));
  }

  get chunks(): Chunk[] {
    return this.index.chunks;
  }

  /** Folds a query into LSA space: e_q = (X q)ᵀ U Σ⁻¹, normalised. */
  embed(query: string): {vector: Float64Array | null; known: [number, number][]; unknown: string[]} {
    const counts = termCounts(query);
    const known: [number, number][] = [];
    const unknown: string[] = [];
    for (const [term, c] of counts) {
      const t = this.termIndex.get(term);
      if (t === undefined) unknown.push(term);
      else known.push([t, c]);
    }
    if (known.length === 0) return {vector: null, known, unknown};

    const weights = known.map(([t, c]) => [t, (1 + Math.log(c)) * this.index.idf[t]] as [number, number]);
    const norm = Math.sqrt(weights.reduce((s, [, w]) => s + w * w, 0));
    const xq = new Float64Array(this.n);
    for (const [t, w] of weights) for (const [doc, v] of this.postings.get(t) ?? []) xq[doc] += (w / norm) * v;

    const {u, sigma} = this.index.lsa;
    const e = new Float64Array(this.rank);
    for (let doc = 0; doc < this.n; doc++) {
      const s = xq[doc];
      if (s === 0) continue;
      for (let r = 0; r < this.rank; r++) e[r] += s * u[doc * this.rank + r];
    }
    let len = 0;
    for (let r = 0; r < this.rank; r++) {
      e[r] /= sigma[r];
      len += e[r] * e[r];
    }
    if (len === 0) return {vector: null, known, unknown};
    len = Math.sqrt(len);
    for (let r = 0; r < this.rank; r++) e[r] /= len;
    return {vector: e, known, unknown};
  }

  private denseScore(e: Float64Array, doc: number): number {
    const {embeddings} = this.index;
    let s = 0;
    for (let r = 0; r < this.rank; r++) s += e[r] * embeddings[doc * this.rank + r];
    return s;
  }

  bm25(known: [number, number][]): Map<number, number> {
    const {df, counts, lengths, avgLength} = this.index;
    const scores = new Map<number, number>();
    for (const [t] of known) {
      const idf = Math.log(1 + (this.n - df[t] + 0.5) / (df[t] + 0.5));
      for (const [doc] of this.postings.get(t) ?? []) {
        const f = counts[doc].find(([term]) => term === t)?.[1] ?? 0;
        const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * lengths[doc]) / avgLength);
        scores.set(doc, (scores.get(doc) ?? 0) + (idf * f * (BM25_K1 + 1)) / denom);
      }
    }
    return scores;
  }

  /**
   * @param neural Optional neural dense ranking (chunk indices, best first),
   *   fused as a third list.
   */
  search(query: string, topK = 6, nprobe = this.index.ivf.nprobe, neural?: {index: number; score: number}[]): RetrievalResult {
    const started = performance.now();
    const {vector, known, unknown} = this.embed(query);
    const {k, centroids, lists, clusters} = this.index.ivf;

    let probed: ProbedCell[] = [];
    let dense: [number, number][] = [];
    let denseRecall: number | null = null;
    let scanned = 0;
    if (vector) {
      const cells = Array.from({length: k}, (_, c) => {
        let d = 0;
        for (let r = 0; r < this.rank; r++) {
          const diff = vector[r] - centroids[c * this.rank + r];
          d += diff * diff;
        }
        return {c, d};
      }).sort((a, b) => a.d - b.d);
      probed = cells.slice(0, nprobe).map(({c, d}) => ({
        id: c,
        distance: d,
        size: lists[c].length,
        terms: clusters[c].terms,
      }));
      for (const cell of probed) {
        for (const doc of lists[cell.id]) dense.push([doc, this.denseScore(vector, doc)]);
      }
      scanned = dense.length;
      dense.sort((a, b) => b[1] - a[1]);

      const exhaustive = Array.from({length: this.n}, (_, doc) => [doc, this.denseScore(vector, doc)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK)
        .map(([doc]) => doc);
      const ivfTop = new Set(dense.slice(0, topK).map(([doc]) => doc));
      denseRecall = exhaustive.filter((doc) => ivfTop.has(doc)).length / exhaustive.length;
    }

    const lexical = [...this.bm25(known).entries()].sort((a, b) => b[1] - a[1]);

    const fused = new Map<number, RetrievedPassage>();
    const entry = (doc: number): RetrievedPassage => {
      let p = fused.get(doc);
      if (!p) {
        p = {
          chunk: this.index.chunks[doc],
          fused: 0,
          denseScore: null,
          denseRank: null,
          bm25Score: null,
          bm25Rank: null,
          cell: this.cellOf[doc],
        };
        fused.set(doc, p);
      }
      return p;
    };
    dense.slice(0, 20).forEach(([doc, score], i) => {
      const p = entry(doc);
      p.denseScore = score;
      p.denseRank = i + 1;
      p.fused += 1 / (RRF_K + i + 1);
    });
    lexical.slice(0, 20).forEach(([doc, score], i) => {
      const p = entry(doc);
      p.bm25Score = score;
      p.bm25Rank = i + 1;
      p.fused += 1 / (RRF_K + i + 1);
    });
    neural?.slice(0, 20).forEach(({index}, i) => {
      const p = entry(index);
      p.neuralRank = i + 1;
      p.fused += 1 / (RRF_K + i + 1);
    });

    const passages = [...fused.values()].sort((a, b) => b.fused - a.fused).slice(0, topK);
    return {
      passages,
      trace: {
        queryTerms: known.map(([t]) => this.index.vocab[t]),
        unknownTerms: unknown,
        probed,
        scanned,
        total: this.n,
        denseRecall,
        elapsedMs: performance.now() - started,
      },
    };
  }
}
