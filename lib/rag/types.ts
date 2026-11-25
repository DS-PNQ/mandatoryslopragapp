export interface Chunk {
  /** Stable id: `${noteId}#${slug}` */
  id: string;
  noteId: string;
  noteTitle: string;
  area: string;
  heading: string;
  /** Section number inside its note, 1-based (e.g. §3). */
  section: number;
  text: string;
}

export interface ClusterInfo {
  id: number;
  size: number;
  /** Most characteristic surface terms of the cell, for display. */
  terms: string[];
  /** Notes that contribute passages to the cell, most frequent first. */
  notes: string[];
}

export interface CurvePoint {
  epochs: number;
  /** Median MSE over seeds. */
  mse: number;
  min: number;
  max: number;
}

export interface IndexFile {
  builtAt: string;
  chunks: Chunk[];
  vocab: string[];
  idf: number[];
  /** BM25 document frequencies, aligned with vocab. */
  df: number[];
  /** Per chunk: sparse term counts [termIndex, count][]. */
  counts: [number, number][][];
  /** Per chunk: sparse L2-normalised TF-IDF [termIndex, weight][]. */
  tfidf: [number, number][][];
  avgLength: number;
  lengths: number[];
  lsa: {
    rank: number;
    sigma: number[];
    /** n × rank, row-major. */
    u: number[];
  };
  /** n × rank unit vectors, row-major (rows of U·Σ, normalised). */
  embeddings: number[];
  ivf: {
    k: number;
    nprobe: number;
    centroids: number[];
    lists: number[][];
    clusters: ClusterInfo[];
  };
  training: {
    n: number;
    d: number;
    k: number;
    epochs: number;
    batchSize: number;
    alpha0: number;
    updates: number;
    revived: number;
    seed: number;
    finalLoss: number;
    lloydLoss25: number;
    emeansCurve: CurvePoint[];
    lloydCurve: CurvePoint[];
    seeds: number;
  };
}
