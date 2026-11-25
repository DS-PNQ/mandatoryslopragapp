// e-means: mini-batch k-means with EMA centroid updates.
// Implements Algorithm 1 of Bessa et al., "e-means: outperforming k-means
// (in one-tenth the epochs)", arXiv:2611.09501:
//   - EMA count/sum updates (Eq. 2-4), N_j initialised at 1e-10
//   - cosine-annealed step alpha = 1 - gamma (Eq. 5, epsilon = 0.1)
//   - dead-cluster revival every 5 batches by splitting a donor (Appendix H)
//   - last-epoch-mean finalization (Section 3.2)
//   - scaling laws for the peak step alpha_0 and batch size B (Eq. 6-7, Table 2)

import {rng, shuffle, sqDist, type Vec} from './linalg';

export interface EmeansOptions {
  k: number;
  epochs: number;
  batchSize?: number;
  alpha0?: number;
  seed?: number;
  /** Revival threshold tau as a fraction of the mean count. */
  tau?: number;
  /** Cosine floor epsilon. */
  floor?: number;
  finalize?: 'last-epoch-mean' | 'none';
  /** Called after every batch update with the batch index and current step. */
  onBatch?: (info: {t: number; alpha: number; revived: number}) => void;
}

export interface EmeansResult {
  centroids: Vec[];
  assignment: Int32Array;
  batchSize: number;
  alpha0: number;
  updates: number;
  revived: number;
  /** Full-data MSE measured at the end of every epoch (before finalization). */
  epochLoss: number[];
  finalLoss: number;
}

/** BF16 machine epsilon, the perturbation the paper uses when splitting. */
export const SPLIT_DELTA = 2 ** -7;

/** Eq. 7: knee batch size, rounded to a power of two and capped at n. */
export function batchLaw(k: number, n: number, T: number): number {
  const coeff = n > 2_000_000 ? 0.0044 : 0.035;
  const raw = coeff * k ** 0.13 * n ** 0.88 * T ** 0.81;
  const pow2 = 2 ** Math.round(Math.log2(Math.max(raw, 1)));
  return Math.max(1, Math.min(pow2, n));
}

/** Eq. 6: peak step size for the cosine schedule. */
export function stepLaw(k: number, B: number, n: number, T: number): number {
  return Math.min(0.824 * k ** -0.46 * B ** 0.9 * n ** -0.45 * T ** -0.11, 1);
}

/** Eq. 5: cosine-annealed step for update t of M. */
export function cosineStep(t: number, M: number, alpha0: number, floor = 0.1): number {
  return alpha0 * (floor + (1 - floor) * 0.5 * (1 + Math.cos((Math.PI * t) / M)));
}

export function nearest(x: Vec, centroids: Vec[]): {index: number; dist: number} {
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < centroids.length; j++) {
    const d = sqDist(x, centroids[j]);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return {index: best, dist: bestD};
}

export function mse(X: Vec[], centroids: Vec[]): number {
  let s = 0;
  for (const x of X) s += nearest(x, centroids).dist;
  return s / X.length;
}

function pickDistinct(n: number, k: number, rand: () => number): number[] {
  return Array.from(shuffle(n, rand).slice(0, k));
}

export function emeans(X: Vec[], opts: EmeansOptions): EmeansResult {
  const n = X.length;
  const d = X[0].length;
  const {k, epochs: T} = opts;
  if (k > n) throw new Error(`k=${k} exceeds n=${n}`);
  const rand = rng(opts.seed ?? 1);
  const tau = opts.tau ?? 0.1;
  const floor = opts.floor ?? 0.1;
  const B = opts.batchSize ?? batchLaw(k, n, T);
  const alpha0 = opts.alpha0 ?? stepLaw(k, B, n, T);
  const batchesPerEpoch = Math.floor(n / B);
  const M = T * batchesPerEpoch;

  // Algorithm 1, lines 2-3: random initial centroids, tiny initial weight.
  const N = new Float64Array(k);
  const S: Vec[] = [];
  for (const [j, i] of pickDistinct(n, k, rand).entries()) {
    N[j] = 1e-10;
    S.push(Float64Array.from(X[i], (v) => v * N[j]));
  }
  const centroid = (j: number): Vec => Float64Array.from(S[j], (v) => v / N[j]);

  const assignment = new Int32Array(n).fill(-1);
  const epochLoss: number[] = [];
  let t = 0;
  let revivedTotal = 0;

  const nj = new Float64Array(k);
  const sj: Vec[] = Array.from({length: k}, () => new Float64Array(d));

  for (let epoch = 0; epoch < T; epoch++) {
    const order = shuffle(n, rand);
    const lastEpoch = epoch === T - 1;
    for (let b = 0; b < batchesPerEpoch; b++) {
      const alpha = cosineStep(t, M, alpha0, floor);
      const gamma = 1 - alpha;
      t += 1;

      const C = Array.from({length: k}, (_, j) => centroid(j));
      nj.fill(0);
      for (const s of sj) s.fill(0);
      for (let r = b * B; r < (b + 1) * B; r++) {
        const i = order[r];
        const a = nearest(X[i], C).index;
        if (lastEpoch) assignment[i] = a;
        nj[a] += 1;
        const x = X[i];
        const acc = sj[a];
        for (let q = 0; q < d; q++) acc[q] += x[q];
      }
      // Eq. 2
      for (let j = 0; j < k; j++) {
        N[j] = gamma * N[j] + alpha * nj[j];
        const Sj = S[j];
        const s = sj[j];
        for (let q = 0; q < d; q++) Sj[q] = gamma * Sj[q] + alpha * s[q];
      }

      let revived = 0;
      if (t % 5 === 0) revived = reviveDeadClusters(S, N, tau, rand);
      revivedTotal += revived;
      opts.onBatch?.({t, alpha, revived});
    }
    epochLoss.push(mse(X, Array.from({length: k}, (_, j) => centroid(j))));
  }

  let centroids = Array.from({length: k}, (_, j) => centroid(j));
  // Points dropped from the last partial batch still need an assignment.
  for (let i = 0; i < n; i++) if (assignment[i] < 0) assignment[i] = nearest(X[i], centroids).index;

  if ((opts.finalize ?? 'last-epoch-mean') === 'last-epoch-mean') {
    const sums = Array.from({length: k}, () => new Float64Array(d));
    const counts = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      const a = assignment[i];
      counts[a] += 1;
      for (let q = 0; q < d; q++) sums[a][q] += X[i][q];
    }
    centroids = centroids.map((c, j) => (counts[j] > 0 ? sums[j].map((v) => v / counts[j]) : c));
  }

  // Final assignment against the finalized centroids (used to build IVF lists).
  for (let i = 0; i < n; i++) assignment[i] = nearest(X[i], centroids).index;

  return {
    centroids,
    assignment,
    batchSize: B,
    alpha0,
    updates: M,
    revived: revivedTotal,
    epochLoss,
    finalLoss: mse(X, centroids),
  };
}

/**
 * Appendix H: clusters whose count fell below tau x mean count take half of a
 * donor drawn without replacement with probability proportional to its count.
 * Returns the number of clusters revived.
 */
export function reviveDeadClusters(S: Vec[], N: Float64Array, tau: number, rand: () => number): number {
  const k = N.length;
  let total = 0;
  for (let j = 0; j < k; j++) total += N[j];
  const threshold = (tau * total) / k;
  const dead: number[] = [];
  for (let j = 0; j < k; j++) if (N[j] < threshold) dead.push(j);
  if (dead.length === 0) return 0;

  const deadSet = new Set(dead);
  const used = new Set<number>();
  let revived = 0;
  for (const j of dead) {
    let pool = 0;
    for (let c = 0; c < k; c++) if (!deadSet.has(c) && !used.has(c)) pool += N[c];
    if (pool <= 0) break;
    let r = rand() * pool;
    let donor = -1;
    for (let c = 0; c < k; c++) {
      if (deadSet.has(c) || used.has(c)) continue;
      donor = c;
      r -= N[c];
      if (r <= 0) break;
    }
    if (donor < 0) break;
    used.add(donor);

    const d = S[donor].length;
    const base = Float64Array.from(S[donor], (v) => v / N[donor]);
    const half = N[donor] / 2;
    const child = new Float64Array(d);
    const parent = new Float64Array(d);
    for (let q = 0; q < d; q++) {
      const sign = q % 2 === 0 ? 1 : -1;
      child[q] = base[q] * (1 + sign * SPLIT_DELTA);
      parent[q] = base[q] * (1 - sign * SPLIT_DELTA);
    }
    N[j] = half;
    N[donor] = half;
    S[j] = child.map((v) => v * half);
    S[donor] = parent.map((v) => v * half);
    revived += 1;
  }
  return revived;
}

/** Baseline: Lloyd's algorithm from random data points; returns MSE per iteration. */
export function lloyd(X: Vec[], k: number, iterations: number, seed = 1): {centroids: Vec[]; loss: number[]} {
  const n = X.length;
  const d = X[0].length;
  const rand = rng(seed);
  let centroids = pickDistinct(n, k, rand).map((i) => Float64Array.from(X[i]));
  const loss: number[] = [];
  for (let it = 0; it < iterations; it++) {
    const sums = Array.from({length: k}, () => new Float64Array(d));
    const counts = new Float64Array(k);
    for (const x of X) {
      const a = nearest(x, centroids).index;
      counts[a] += 1;
      for (let q = 0; q < d; q++) sums[a][q] += x[q];
    }
    centroids = centroids.map((c, j) => (counts[j] > 0 ? sums[j].map((v) => v / counts[j]) : c));
    loss.push(mse(X, centroids));
  }
  return {centroids, loss};
}
