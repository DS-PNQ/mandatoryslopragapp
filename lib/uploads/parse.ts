// Turns an uploaded file into a notebook source. PDFs, Word files and plain
// text become text (kept per page for PDFs so citations can name the page).
// Images, and PDFs with no text layer (scans), are kept as base64 so a vision
// model can read them directly.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Upper bound on extracted text per source, in characters. */
export const MAX_SOURCE_CHARS = 400_000;
/** Scanned PDFs larger than this cannot be passed to the model as a document. */
export const MAX_INLINE_PDF_BYTES = 8 * 1024 * 1024;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export type SourceKind = 'pdf' | 'docx' | 'doc' | 'text' | 'image';

export interface ParsedSource {
  name: string;
  kind: SourceKind;
  /** Extracted text. PDF pages are separated by form feeds (\f). */
  text: string;
  pages?: number;
  chars: number;
  /** Raw file for vision input: images, and PDFs without a text layer. */
  media?: {type: ImageType | 'application/pdf'; data: string};
  /** Set when the text was cut at MAX_SOURCE_CHARS. */
  truncated?: boolean;
}

export class UploadError extends Error {}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Detects the kind from the file's leading bytes; the name only breaks ties. */
export function sniff(bytes: Uint8Array, name: string): {kind: SourceKind; imageType?: ImageType} | null {
  const lower = name.toLowerCase();
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return {kind: 'pdf'};
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return {kind: 'image', imageType: 'image/png'};
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return {kind: 'image', imageType: 'image/jpeg'};
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return {kind: 'image', imageType: 'image/gif'};
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return {kind: 'image', imageType: 'image/webp'};
  // DOCX is a zip; legacy DOC is an OLE compound file.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && lower.endsWith('.docx')) return {kind: 'docx'};
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && lower.endsWith('.doc')) return {kind: 'doc'};
  if (/\.(txt|md|markdown|tex)$/.test(lower) && looksLikeText(bytes)) return {kind: 'text'};
  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cap(text: string): {text: string; truncated: boolean} {
  return text.length > MAX_SOURCE_CHARS
    ? {text: text.slice(0, MAX_SOURCE_CHARS), truncated: true}
    : {text, truncated: false};
}

export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[\u0000-\u001f<>"]/g, '').slice(0, 120) || 'file';
}

export async function parseUpload(rawName: string, bytes: Uint8Array): Promise<ParsedSource> {
  const name = cleanName(rawName);
  if (bytes.byteLength === 0) throw new UploadError(`${name} is empty.`);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UploadError(`${name} is larger than 15 MB.`);
  const kind = sniff(bytes, name);
  if (!kind) throw new UploadError(`${name} is not a PDF, Word document, text file or image.`);

  switch (kind.kind) {
    case 'image':
      return {name, kind: 'image', text: '', chars: 0, media: {type: kind.imageType!, data: toBase64(bytes)}};

    case 'pdf': {
      const {extractText, getDocumentProxy} = await import('unpdf');
      let pages: string[];
      try {
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        ({text: pages} = await extractText(pdf, {mergePages: false}));
      } catch {
        throw new UploadError(`${name} could not be read as a PDF. It may be encrypted or damaged.`);
      }
      const joined = pages.map(tidy).join('\f');
      const {text, truncated} = cap(joined);
      // Fewer than ~10 visible characters per page means there is no real text layer.
      const scanned = text.replace(/\s+/g, '').length < 10 * Math.max(1, pages.length);
      if (scanned && bytes.byteLength > MAX_INLINE_PDF_BYTES) {
        throw new UploadError(`${name} has no text layer and is too large (over 8 MB) to send as page images.`);
      }
      return {
        name,
        kind: 'pdf',
        text: scanned ? '' : text,
        pages: pages.length,
        chars: scanned ? 0 : text.length,
        ...(scanned ? {media: {type: 'application/pdf' as const, data: toBase64(bytes)}} : {}),
        ...(truncated ? {truncated} : {}),
      };
    }

    case 'docx': {
      const mammoth = await import('mammoth');
      let raw: string;
      try {
        ({value: raw} = await mammoth.extractRawText({buffer: Buffer.from(bytes)}));
      } catch {
        throw new UploadError(`${name} could not be read as a Word document.`);
      }
      const {text, truncated} = cap(tidy(raw));
      if (!text) throw new UploadError(`${name} has no text.`);
      return {name, kind: 'docx', text, chars: text.length, ...(truncated ? {truncated} : {})};
    }

    case 'doc': {
      const {default: WordExtractor} = await import('word-extractor');
      let raw: string;
      try {
        const doc = await new WordExtractor().extract(Buffer.from(bytes));
        raw = doc.getBody();
      } catch {
        throw new UploadError(`${name} could not be read as a Word 97–2003 document.`);
      }
      const {text, truncated} = cap(tidy(raw));
      if (!text) throw new UploadError(`${name} has no text.`);
      return {name, kind: 'doc', text, chars: text.length, ...(truncated ? {truncated} : {})};
    }

    case 'text': {
      const {text, truncated} = cap(tidy(new TextDecoder('utf-8', {fatal: false}).decode(bytes)));
      if (!text) throw new UploadError(`${name} has no text.`);
      return {name, kind: 'text', text, chars: text.length, ...(truncated ? {truncated} : {})};
    }
  }
}
