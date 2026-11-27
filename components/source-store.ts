// Keeps uploaded sources in the browser (IndexedDB) so a notebook survives a
// reload. The server never stores them. Every call degrades to a no-op when
// storage is unavailable (private windows, blocked site data).

export type SourceKind = 'pdf' | 'docx' | 'doc' | 'text' | 'image';

export interface NotebookSource {
  id: string;
  name: string;
  kind: SourceKind;
  text: string;
  pages?: number;
  chars: number;
  media?: {type: string; data: string};
  truncated?: boolean;
  /** Set once a scanned PDF has been transcribed to text (media is then dropped). */
  ocr?: {model: string; failed: number[]; total: number};
  enabled: boolean;
  addedAt: number;
}

const DB = 'lemma-notebook';
const STORE = 'sources';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, {keyPath: 'id'});
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? (req.result as T) : null);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadSources(): Promise<NotebookSource[]> {
  const all = await tx<NotebookSource[]>('readonly', (s) => s.getAll() as IDBRequest<NotebookSource[]>);
  return (all ?? []).sort((a, b) => a.addedAt - b.addedAt);
}

export async function putSource(source: NotebookSource): Promise<void> {
  await tx('readwrite', (s) => void s.put(source));
}

export async function removeSource(id: string): Promise<void> {
  await tx('readwrite', (s) => void s.delete(id));
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`lemma:${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`lemma:${key}`, value);
  } catch {
    /* storage unavailable */
  }
}

/** Large photos are scaled down before upload: models read ~1600px fine. */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', {type: 'image/jpeg'});
  } catch {
    return file;
  }
}
