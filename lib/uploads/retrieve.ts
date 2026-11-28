// Retrieval over the sources a user uploaded in this session. They are not in
// the prebuilt LSA/e-means index, so they are chunked and ranked with BM25
// using the same tokenizer as the library.
//
// Tokenizing a large upload is the expensive part (about 130 ms for the 1.5M
// character cap in TypeScript), so each selection of files is chunked and
// indexed once and cached by content hash; later questions only score. The
// index is built by the Rust core (lib/native/core.ts) when it loads, else by
// the TypeScript code below, with the same results.

import {createHash} from 'node:crypto';
import {z} from 'zod';
import {NativeBm25} from '../native/core';
import {termCounts} from '../rag/text';
import {IMAGE_TYPES, MAX_SOURCE_CHARS, type SourceKind} from './parse';

const MAX_TOTAL_CHARS = 1_500_000;
const MAX_MEDIA_BASE64 = 11_200_000; // ~8 MB decoded
const MAX_TOTAL_MEDIA_BASE64 = 16_000_000;

export const AttachmentSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    name: z.string().min(1).max(160),
    kind: z.enum(['pdf', 'docx', 'doc', 'text', 'image']),
    text: z.string().max(MAX_SOURCE_CHARS).default(''),
    pages: z.number().int().min(0).max(5000).optional(),
    media: z
      .object({
        type: z.enum([...IMAGE_TYPES, 'application/pdf']),
        data: z.string().max(MAX_MEDIA_BASE64).regex(/^[A-Za-z0-9+/]+={0,2}$/),
      })
      .optional(),
  })
  .strict();

export type Attachment = z.infer<typeof AttachmentSchema>;

export const AttachmentListSchema = z
  .array(AttachmentSchema)
  .max(12)
  .refine((list) => list.reduce((n, a) => n + a.text.length, 0) <= MAX_TOTAL_CHARS, 'Uploaded text is too long in total.')
  .refine(
    (list) => list.reduce((n, a) => n + (a.media?.data.length ?? 0), 0) <= MAX_TOTAL_MEDIA_BASE64,
    'Uploaded images and scans are too large in total.',
  );

export interface UploadChunk {
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  /** 1-based page for PDFs, else 1-based part number. */
  section: number;
  heading: string;
  text: string;
}

export interface RankedUploadChunk extends UploadChunk {
  score: number;
  rank: number | null;
}

const TARGET = 1100;

function splitLong(paragraph: string): string[] {
  if (paragraph.length <= TARGET * 1.5) return [paragraph];
  const out: string[] = [];
  let rest = paragraph;
  while (rest.length > TARGET * 1.5) {
    const cut = rest.lastIndexOf('. ', TARGET);
    const at = cut > TARGET / 2 ? cut + 1 : TARGET;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function pack(paragraphs: string[]): string[] {
  const out: string[] = [];
  let cur = '';
  for (const p of paragraphs.flatMap(splitLong)) {
    if (cur && cur.length + p.length + 2 > TARGET) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

export function chunkAttachment(a: Attachment): UploadChunk[] {
  if (!a.text.trim()) return [];
  const base = {sourceId: a.id, sourceName: a.name, kind: a.kind};
  if (a.kind === 'pdf') {
    return a.text.split('\f').flatMap((page, i) =>
      pack(page.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)).map((text, j, all) => ({
        ...base,
        section: i + 1,
        heading: all.length > 1 ? `Page ${i + 1} (${j + 1}/${all.length})` : `Page ${i + 1}`,
        text,
      })),
    );
  }
  return pack(a.text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)).map((text, i) => ({
    ...base,
    section: i + 1,
    heading: `Part ${i + 1}`,
    text,
  }));
}

/** Small enough to give the model every chunk instead of a ranked subset. */
const WHOLE_LIMIT = 14_000;

interface Bm25 {
  scores(query: string): ArrayLike<number>;
  free?(): void;
}

/** BM25 in TypeScript, the reference the Rust index matches. */
export class TsBm25 implements Bm25 {
  private readonly docs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly avg: number;
  private readonly df = new Map<string, number>();

  constructor(texts: string[]) {
    this.docs = texts.map((t) => termCounts(t));
    this.lengths = this.docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
    this.avg = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, this.docs.length);
    for (const d of this.docs) for (const t of d.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  scores(question: string): number[] {
    const q = [...termCounts(question).keys()];
    const N = this.docs.length;
    return this.docs.map((d, i) => {
      let s = 0;
      for (const t of q) {
        const tf = d.get(t);
        if (!tf) continue;
        const df = this.df.get(t)!;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * this.lengths[i]) / this.avg));
      }
      return s;
    });
  }
}

/** Builds the BM25 index for passages: Rust when available, else TypeScript. */
export function buildBm25(texts: string[]): Bm25 {
  return NativeBm25.build(texts) ?? new TsBm25(texts);
}

export interface UploadSelection {
  chunks: UploadChunk[];
  /** Characters across all chunks. */
  total: number;
  /** Built on first use, only when the selection is too large to send whole. */
  bm25(): Bm25;
  /** Frees the native index when the selection leaves the cache. */
  dispose(): void;
}

const selections = new Map<string, UploadSelection>();
const MAX_SELECTIONS = 8;

function selectionKey(attachments: Attachment[]): string {
  const h = createHash('sha1');
  for (const a of attachments) h.update(a.id).update('\0').update(a.kind).update('\0').update(a.text).update('\u0001');
  return h.digest('hex');
}

/** Chunks of the selected files, and their BM25 index, cached per selection. */
export function uploadSelection(attachments: Attachment[]): UploadSelection {
  const key = selectionKey(attachments);
  const hit = selections.get(key);
  if (hit) {
    selections.delete(key);
    selections.set(key, hit); // most recently used last
    return hit;
  }
  const chunks = attachments.flatMap(chunkAttachment);
  let index: Bm25 | null = null;
  const selection: UploadSelection = {
    chunks,
    total: chunks.reduce((n, c) => n + c.text.length, 0),
    bm25: () => (index ??= buildBm25(chunks.map((c) => c.text))),
    dispose: () => index?.free?.(),
  };
  selections.set(key, selection);
  while (selections.size > MAX_SELECTIONS) {
    const [oldKey, old] = selections.entries().next().value!;
    selections.delete(oldKey);
    old.dispose();
  }
  return selection;
}

/** For tests and benchmarks: drop cached selections. */
export function clearUploadCache() {
  for (const s of selections.values()) s.dispose();
  selections.clear();
}

/** True when the selection is small enough to be sent whole, unranked. */
export function sendsWhole(attachments: Attachment[]): boolean {
  return uploadSelection(attachments).total <= WHOLE_LIMIT;
}

/**
 * Picks the upload passages for a question. Small uploads are sent whole, in
 * order. Larger ones are ranked with BM25; the opening chunk of each source is
 * kept as well, since titles and abstracts answer "what is this about?".
 */
export function rankUploads(question: string, attachments: Attachment[], k = 6): RankedUploadChunk[] {
  const {chunks, total, bm25} = uploadSelection(attachments);
  if (chunks.length === 0) return [];
  if (total <= WHOLE_LIMIT) return chunks.map((c) => ({...c, score: 0, rank: null}));
  const scores = Array.from(bm25().scores(question));

  const order = scores
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0]);
  const picked = new Map<number, number | null>();
  order.slice(0, k).forEach(([, i], r) => picked.set(i, r + 1));
  // Opening chunk of each source.
  const firsts = new Map<string, number>();
  chunks.forEach((c, i) => (firsts.has(c.sourceId) ? null : firsts.set(c.sourceId, i)));
  for (const i of firsts.values()) if (!picked.has(i) && picked.size < k + 2) picked.set(i, null);
  // Nothing matched: fall back to the start of each source.
  if (order.length === 0) {
    for (let i = 0; i < chunks.length && picked.size < k; i++) if (!picked.has(i)) picked.set(i, null);
  }
  return [...picked.entries()]
    .sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity) || a[0] - b[0])
    .map(([i, rank]) => ({...chunks[i], score: scores[i], rank}));
}
