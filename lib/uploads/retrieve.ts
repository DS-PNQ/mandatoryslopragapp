// Retrieval over the sources a user uploaded in this session. They are not in
// the prebuilt LSA/e-means index, so they are chunked at question time and
// ranked with BM25 using the same tokenizer as the library.

import {z} from 'zod';
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

/**
 * Picks the upload passages for a question. Small uploads are sent whole, in
 * order. Larger ones are ranked with BM25; the opening chunk of each source is
 * kept as well, since titles and abstracts answer "what is this about?".
 */
export function rankUploads(question: string, attachments: Attachment[], k = 6): RankedUploadChunk[] {
  const chunks = attachments.flatMap(chunkAttachment);
  if (chunks.length === 0) return [];
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= WHOLE_LIMIT) return chunks.map((c) => ({...c, score: 0, rank: null}));

  const docs = chunks.map((c) => termCounts(c.text));
  const lengths = docs.map((d) => [...d.values()].reduce((a, b) => a + b, 0));
  const avg = lengths.reduce((a, b) => a + b, 0) / docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...termCounts(question).keys()];
  const N = docs.length;
  const scores = docs.map((d, i) => {
    let s = 0;
    for (const t of q) {
      const tf = d.get(t);
      if (!tf) continue;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      s += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * lengths[i]) / avg));
    }
    return s;
  });

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
