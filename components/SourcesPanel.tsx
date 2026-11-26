'use client';

import type {NotebookSource} from './source-store';
import {AlertCircle, BookOpen, FileText, ImageIcon, MessageSquare, Plus, Spinner, Upload, X} from './icons';

export interface PendingUpload {
  key: string;
  name: string;
  state: 'uploading' | 'error';
  error?: string;
}

export interface SessionEntry {
  surfaceId: string;
  question: string;
  state: 'streaming' | 'done' | 'error';
}

const KIND_LABEL: Record<NotebookSource['kind'], string> = {
  pdf: 'PDF',
  docx: 'Word',
  doc: 'Word 97–2003',
  text: 'Text',
  image: 'Image',
};

function describe(s: NotebookSource): string {
  if (s.kind === 'image') return 'Image';
  if (s.kind === 'pdf' && s.media) return `Scanned PDF${s.pages ? ` · ${s.pages} pages` : ''} · read as images`;
  const parts = [KIND_LABEL[s.kind]];
  if (s.pages) parts.push(`${s.pages} ${s.pages === 1 ? 'page' : 'pages'}`);
  parts.push(s.chars >= 1000 ? `${Math.round(s.chars / 1000)}k characters` : `${s.chars} characters`);
  if (s.truncated) parts.push('first 400k used');
  return parts.join(' · ');
}

function Switch({checked, onChange, label}: {checked: boolean; onChange: (v: boolean) => void; label: string}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="visually-hidden">{label}</span>
    </label>
  );
}

export function SourcesPanel({
  open,
  onClose,
  library,
  useLibrary,
  setUseLibrary,
  sources,
  pending,
  onToggle,
  onRemove,
  onDismissPending,
  onPick,
  entries,
  noModel,
}: {
  open: boolean;
  onClose: () => void;
  library: {notes: number; passages: number};
  useLibrary: boolean;
  setUseLibrary: (v: boolean) => void;
  sources: NotebookSource[];
  pending: PendingUpload[];
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onDismissPending: (key: string) => void;
  onPick: () => void;
  entries: SessionEntry[];
  noModel: boolean;
}) {
  const active = (useLibrary ? 1 : 0) + sources.filter((s) => s.enabled).length;
  return (
    <>
      <div className="scrim" data-open={open || undefined} onClick={onClose} aria-hidden="true" />
      <aside className="nb-panel" data-open={open || undefined} aria-label="Sources and session">
        <div className="nb-head">
          <h2 className="panel-title">
            Sources <span className="count">{active} active</span>
          </h2>
          <button type="button" className="icon-button only-mobile" onClick={onClose} aria-label="Close sources">
            <X />
          </button>
        </div>

        <button type="button" className="dropzone" onClick={onPick}>
          <span className="dropzone-icon" aria-hidden="true">
            <Upload size={20} />
          </span>
          <span className="dropzone-text">
            <strong>Add sources</strong>
            <span>Drop or browse PDF, Word, text or images, up to 15 MB each</span>
          </span>
        </button>

        <ul className="nb-items">
          <li className="nb-item" data-enabled={useLibrary || undefined}>
            <span className="nb-icon lib" aria-hidden="true">
              <BookOpen />
            </span>
            <span className="nb-main">
              <span className="nb-name">Math notes library</span>
              <span className="nb-meta">
                {library.notes} notes · {library.passages} passages
              </span>
            </span>
            <Switch checked={useLibrary} onChange={setUseLibrary} label="Use the math notes library" />
          </li>

          {sources.map((s) => (
            <li key={s.id} className="nb-item" data-enabled={s.enabled || undefined}>
              <span className={`nb-icon ${s.kind === 'image' ? 'image' : 'file'}`} aria-hidden="true">
                {s.kind === 'image' ? <ImageIcon /> : <FileText />}
              </span>
              <span className="nb-main">
                <span className="nb-name" title={s.name}>
                  {s.name}
                </span>
                <span className="nb-meta">{describe(s)}</span>
              </span>
              <Switch checked={s.enabled} onChange={(v) => onToggle(s.id, v)} label={`Use ${s.name}`} />
              <button type="button" className="icon-button subtle" onClick={() => onRemove(s.id)} aria-label={`Remove ${s.name}`}>
                <X size={16} />
              </button>
            </li>
          ))}

          {pending.map((p) => (
            <li key={p.key} className="nb-item" data-state={p.state}>
              <span className="nb-icon file" aria-hidden="true">
                {p.state === 'uploading' ? <Spinner className="spin" /> : <AlertCircle />}
              </span>
              <span className="nb-main">
                <span className="nb-name" title={p.name}>
                  {p.name}
                </span>
                <span className="nb-meta" role={p.state === 'error' ? 'alert' : 'status'}>
                  {p.state === 'uploading' ? 'Reading the file…' : p.error}
                </span>
              </span>
              {p.state === 'error' ? (
                <button type="button" className="icon-button subtle" onClick={() => onDismissPending(p.key)} aria-label={`Dismiss ${p.name}`}>
                  <X size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {sources.length === 0 && pending.length === 0 ? (
          <button type="button" className="text-button nb-cta" onClick={onPick}>
            <Plus size={16} /> Upload a lecture PDF, a paper, or a photo of a problem
          </button>
        ) : null}

        <nav className="session" aria-label="Questions in this session">
          <h2 className="panel-title">
            <MessageSquare size={16} /> This session
          </h2>
          {entries.length === 0 ? (
            <p className="session-empty">Questions you ask appear here.</p>
          ) : (
            <ol className="session-list">
              {entries.map((e, i) => (
                <li key={e.surfaceId} data-state={e.state}>
                  <a href={`#${e.surfaceId}`} onClick={onClose}>
                    <span className="session-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="session-q">{e.question}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </nav>

        {noModel ? (
          <p className="panel-note">
            Retrieval only. Add <code>ANTHROPIC_API_KEY</code>, or point <code>LFM3_BASE_URL</code> at an LFM3 server, in{' '}
            <code>.env.local</code> for written answers.
          </p>
        ) : null}
      </aside>
    </>
  );
}
