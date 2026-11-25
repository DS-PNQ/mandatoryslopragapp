// Builds the retrieval index from parsed notes: TF-IDF -> LSA embeddings ->
// e-means IVF partition, plus the training curves shown on the Index page.

import {emeans, lloyd, mse} from './emeans';
import {normalize, symmetricEigen, type Vec} from './linalg';
import {tokenize} from './text';
import type {Chunk, ClusterInfo, CurvePoint, IndexFile} from './types';

export interface BuildOptions {
  rank?: number;
  epochs?: number;
  seed?: number;
  curveSeeds?: number;
  curveEpochs?: number[];
  lloydIterations?: number;
}

export function chunkDocumentText(c: Chunk): string {
  // Headings carry the topic, so they count twice.
  return `${c.heading}. ${c.heading}. ${c.noteTitle}. ${c.text}`;
}

/** The e-means paper's IVF setting (Appendix L): k = 4√n rounded to a power of two. */
export function clusterCountRule(n: number): number {
  return Math.max(2, 2 ** Math.round(Math.log2(4 * Math.sqrt(n))));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(epochs: number, xs: number[]): CurvePoint {
  return {epochs, mse: median(xs), min: Math.min(...xs), max: Math.max(...xs)};
}

export function buildIndex(chunks: Chunk[], opts: BuildOptions = {}): IndexFile {
  const n = chunks.length;
  const seed = opts.seed ?? 7;

  // --- Vocabulary and counts -------------------------------------------------
  const surfaceVotes = new Map<string, Map<string, number>>();
  const proseVotes = new Map<string, number>();
  const perDoc = chunks.map((c) => {
    const counts = new Map<string, number>();
    for (const t of tokenize(chunkDocumentText(c))) {
      counts.set(t.stem, (counts.get(t.stem) ?? 0) + 1);
      const votes = surfaceVotes.get(t.stem) ?? new Map<string, number>();
      votes.set(t.surface, (votes.get(t.surface) ?? 0) + 1);
      surfaceVotes.set(t.stem, votes);
      if (!t.command && t.surface.length > 2) proseVotes.set(t.stem, (proseVotes.get(t.stem) ?? 0) + 1);
    }
    return counts;
  });
  const vocab = [...surfaceVotes.keys()].sort();
  const termIndex = new Map(vocab.map((t, i) => [t, i]));
  const df = new Array<number>(vocab.length).fill(0);
  for (const counts of perDoc) for (const t of counts.keys()) df[termIndex.get(t)!] += 1;
  const idf = df.map((f) => Math.log((n + 1) / (f + 1)) + 1);
  const surface = vocab.map((t) => [...surfaceVotes.get(t)!.entries()].sort((a, b) => b[1] - a[1])[0][0]);

  const counts: [number, number][][] = perDoc.map((m) =>
    [...m.entries()].map(([t, c]) => [termIndex.get(t)!, c] as [number, number]).sort((a, b) => a[0] - b[0]),
  );
  const lengths = counts.map((row) => row.reduce((s, [, c]) => s + c, 0));
  const avgLength = lengths.reduce((a, b) => a + b, 0) / n;

  const tfidf: [number, number][][] = counts.map((row) => {
    const w = row.map(([t, c]) => [t, (1 + Math.log(c)) * idf[t]] as [number, number]);
    const norm = Math.sqrt(w.reduce((s, [, v]) => s + v * v, 0));
    return w.map(([t, v]) => [t, v / norm] as [number, number]);
  });

  // --- LSA via the n×n Gram matrix (n is small, so this is exact) -----------
  const dense = tfidf.map((row) => new Map(row));
  const gram = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      const [small, large] = tfidf[i].length < tfidf[j].length ? [tfidf[i], dense[j]] : [tfidf[j], dense[i]];
      for (const [t, v] of small) s += v * (large.get(t) ?? 0);
      gram[i * n + j] = s;
      gram[j * n + i] = s;
    }
  }
  const {values, vectors} = symmetricEigen(gram, n);
  let rank = Math.min(opts.rank ?? 64, n - 1);
  while (rank > 1 && values[rank - 1] <= 1e-9) rank -= 1;
  const sigma = Array.from(values.slice(0, rank), (v) => Math.sqrt(v));
  const u: number[] = [];
  const X: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(rank);
    for (let r = 0; r < rank; r++) {
      u.push(vectors[i * n + r]);
      row[r] = vectors[i * n + r] * sigma[r];
    }
    X.push(normalize(row));
  }

  // --- e-means partition ----------------------------------------------------
  const k = clusterCountRule(n);
  const epochs = opts.epochs ?? 12;
  const model = emeans(X, {k, epochs, seed});

  const curveSeeds = opts.curveSeeds ?? 9;
  const curveEpochs = opts.curveEpochs ?? [1, 2, 3, 4, 6, 8, 12];
  const emeansCurve = curveEpochs.map((T) =>
    summarize(
      T,
      Array.from({length: curveSeeds}, (_, s) => emeans(X, {k, epochs: T, seed: 101 + s}).finalLoss),
    ),
  );
  const lloydIterations = opts.lloydIterations ?? 25;
  const lloydRuns = Array.from({length: curveSeeds}, (_, s) => lloyd(X, k, lloydIterations, 101 + s).loss);
  const lloydCurve = Array.from({length: lloydIterations}, (_, it) =>
    summarize(
      it + 1,
      lloydRuns.map((r) => r[it]),
    ),
  );

  const lists: number[][] = Array.from({length: k}, () => []);
  for (let i = 0; i < n; i++) lists[model.assignment[i]].push(i);

  const clusters: ClusterInfo[] = lists.map((members, id) => {
    const weight = new Map<number, number>();
    for (const i of members) for (const [t, v] of tfidf[i]) weight.set(t, (weight.get(t) ?? 0) + v);
    const terms = [...weight.entries()]
      .filter(([t]) => (proseVotes.get(vocab[t]) ?? 0) >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => surface[t]);
    const noteFreq = new Map<string, number>();
    for (const i of members) noteFreq.set(chunks[i].noteTitle, (noteFreq.get(chunks[i].noteTitle) ?? 0) + 1);
    const notes = [...noteFreq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return {id, size: members.length, terms, notes};
  });

  const round = (x: number, p = 6) => Math.round(x * 10 ** p) / 10 ** p;

  return {
    builtAt: new Date().toISOString(),
    chunks,
    vocab,
    idf: idf.map((v) => round(v)),
    df,
    counts,
    tfidf: tfidf.map((row) => row.map(([t, v]) => [t, round(v)] as [number, number])),
    avgLength,
    lengths,
    lsa: {rank, sigma: sigma.map((v) => round(v, 8)), u: u.map((v) => round(v, 8))},
    embeddings: X.flatMap((x) => Array.from(x, (v) => round(v))),
    ivf: {
      k,
      nprobe: Math.max(1, Math.round(k / 4)),
      centroids: model.centroids.flatMap((c) => Array.from(c, (v) => round(v))),
      lists,
      clusters,
    },
    training: {
      n,
      d: rank,
      k,
      epochs,
      batchSize: model.batchSize,
      alpha0: model.alpha0,
      updates: model.updates,
      revived: model.revived,
      seed,
      finalLoss: model.finalLoss,
      lloydLoss25: mse(X, lloyd(X, k, lloydIterations, seed).centroids),
      emeansCurve,
      lloydCurve,
      seeds: curveSeeds,
    },
  };
}
