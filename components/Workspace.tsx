'use client';

import {A2uiSurface, type ReactCatalogComponent} from '@a2ui/react';
import {MessageProcessor, type SurfaceModel} from '@a2ui/web_core';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {mathCatalog} from './catalog';
import {AlertCircle, ArrowUp, BookOpen, FileText, Film, ImageIcon, PanelLeft, Paperclip, RotateCcw, Upload, X} from './icons';
import {loadSources, putSource, readPref, removeSource, shrinkImage, writePref, type NotebookSource} from './source-store';
import {SourcesPanel, type PendingUpload} from './SourcesPanel';

interface Entry {
  surfaceId: string;
  question: string;
  state: 'streaming' | 'done' | 'error';
  transcript?: string;
  error?: string;
  animate?: boolean;
}

interface Starter {
  area: string;
  questions: string[];
}

const STARTERS: Starter[] = [
  {area: 'Series', questions: ['Why does the geometric series converge only when |r| < 1?', 'Why does the harmonic series diverge if its terms go to zero?']},
  {area: 'Linear algebra', questions: ['When can a matrix be diagonalized?', 'How do the normal equations give a least-squares fit?']},
  {area: 'Probability', questions: ['Walk me through the false-positive example with Bayes’ theorem.', 'What does the central limit theorem actually claim?']},
  {area: 'Number theory', questions: ['Solve x ≡ 2 (mod 3), x ≡ 3 (mod 5), x ≡ 2 (mod 7).', 'Why are there infinitely many primes?']},
];

const ANIMATED_STARTERS = [
  'Animate how Riemann sums approach the integral',
  'Show how the unit circle traces out sine and cosine',
  'Visualize a 2×2 matrix acting on the plane and its eigenvectors',
];

const ACCEPT = '.pdf,.doc,.docx,.txt,.md,.tex,image/png,image/jpeg,image/webp,image/gif';
const MAX_SOURCES = 12;

type Surface = SurfaceModel<ReactCatalogComponent>;

export interface EngineOption {
  id: 'opus' | 'lfm3' | 'bonsai';
  label: string;
  model: string;
  available: boolean;
  vision: boolean;
}

export function Workspace({
  engines,
  library,
  animation,
  active = true,
}: {
  engines: EngineOption[];
  library: {notes: number; passages: number};
  animation: {available: boolean};
  /** False while another tab is shown; the notebook stays mounted. */
  active?: boolean;
}) {
  const configured = engines.filter((e) => e.available);
  const [engine, setEngine] = useState<EngineOption['id'] | null>(configured[0]?.id ?? null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [surfaces, setSurfaces] = useState<Map<string, Surface>>(new Map());
  const [sources, setSources] = useState<NotebookSource[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [useLibrary, setUseLibraryState] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Refs let the stable `ask` callback read the latest state.
  const state = useRef({engine, entries, sources, useLibrary, animate});
  state.current = {engine, entries, sources, useLibrary, animate};
  const askRef = useRef<(q: string, opts?: {animate?: boolean}) => void>(() => {});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const [processor] = useState(
    () =>
      new MessageProcessor<ReactCatalogComponent>([mathCatalog], (action) => {
        const q = action.context?.question;
        if (action.name === 'ask' && typeof q === 'string') askRef.current(q);
      }),
  );

  useEffect(() => {
    const sync = () => setSurfaces(new Map(processor.model.surfacesMap));
    const a = processor.onSurfaceCreated(sync);
    const b = processor.onSurfaceDeleted(sync);
    return () => {
      a.unsubscribe();
      b.unsubscribe();
    };
  }, [processor]);

  useEffect(() => {
    void loadSources().then((list) => list.length && setSources(list));
    if (readPref('library') === 'off') setUseLibraryState(false);
  }, []);

  useEffect(() => {
    if (!active) setPanelOpen(false);
  }, [active]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setPanelOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const setUseLibrary = (v: boolean) => {
    setUseLibraryState(v);
    writePref('library', v ? 'on' : 'off');
  };

  const addFiles = useCallback(async (files: File[]) => {
    const room = MAX_SOURCES - state.current.sources.length;
    const list = files.slice(0, Math.max(0, room));
    const skipped = files.length - list.length;
    if (skipped > 0) {
      setPending((p) => [
        ...p,
        {key: `limit-${Date.now()}`, name: `${skipped} ${skipped === 1 ? 'file' : 'files'} not added`, state: 'error', error: `A notebook holds up to ${MAX_SOURCES} files. Remove one to add more.`},
      ]);
    }
    await Promise.all(
      list.map(async (original, i) => {
        const key = `up-${Date.now()}-${i}`;
        setPending((p) => [...p, {key, name: original.name, state: 'uploading'}]);
        try {
          const file = await shrinkImage(original);
          const form = new FormData();
          form.append('file', file, file.name);
          const res = await fetch('/api/upload', {method: 'POST', body: form});
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.id) throw new Error(json?.error ?? `The upload failed (${res.status}).`);
          const source: NotebookSource = {...json, enabled: true, addedAt: Date.now()};
          await putSource(source);
          setSources((s) => [...s, source]);
          setPending((p) => p.filter((x) => x.key !== key));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The upload failed.';
          setPending((p) => p.map((x) => (x.key === key ? {...x, state: 'error', error: message} : x)));
        }
      }),
    );
  }, []);

  const toggleSource = (id: string, enabled: boolean) => {
    setSources((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const next = {...s, enabled};
        void putSource(next);
        return next;
      }),
    );
  };

  const deleteSource = (id: string) => {
    setSources((list) => list.filter((s) => s.id !== id));
    void removeSource(id);
  };

  const patch = useCallback((surfaceId: string, update: Partial<Entry>) => {
    setEntries((list) => list.map((e) => (e.surfaceId === surfaceId ? {...e, ...update} : e)));
  }, []);

  const ask = useCallback(
    async (raw: string, opts: {animate?: boolean} = {}) => {
      const question = raw.trim();
      if (!question) return;
      const now = state.current;
      if (now.entries.some((e) => e.state === 'streaming')) return;
      const surfaceId = `answer-${Date.now().toString(36)}`;
      const history = now.entries
        .filter((e) => e.state === 'done' && e.transcript)
        .slice(-3)
        .map((e) => ({question: e.question, answer: e.transcript!}));
      const attachments = now.sources
        .filter((s) => s.enabled)
        .map(({id, name, kind, text, pages, media}) => ({id, name, kind, text, ...(pages ? {pages} : {}), ...(media ? {media} : {})}));
      const wantAnimation = opts.animate ?? now.animate;
      setEntries((list) => [...list, {surfaceId, question, state: 'streaming', animate: wantAnimation}]);
      setDraft('');
      setAnimate(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'}));

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            question,
            surfaceId,
            history,
            engine: now.engine,
            attachments,
            useLibrary: now.useLibrary,
            animate: wantAnimation,
          }),
        });
        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `The server answered ${res.status}.`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const {value, done} = await reader.read();
          if (done) break;
          buffer += value;
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === 'a2ui') processor.processMessages([event.message]);
            else if (event.type === 'done') patch(surfaceId, {state: 'done', transcript: event.transcript});
            else if (event.type === 'error') patch(surfaceId, {state: 'error', error: event.message});
          }
        }
        setEntries((list) =>
          list.map((e) => (e.surfaceId === surfaceId && e.state === 'streaming' ? {...e, state: 'done'} : e)),
        );
      } catch (error) {
        patch(surfaceId, {
          state: 'error',
          error: error instanceof Error ? error.message : 'The request failed before an answer arrived.',
        });
      }
    },
    [processor, patch],
  );
  askRef.current = ask;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void addFiles([...e.dataTransfer.files]);
  };

  // A citation points into the folded source list: unfold it before the jump.
  const openCitation = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a.cite');
    const id = link?.getAttribute('href')?.slice(1);
    const target = id ? document.getElementById(id) : null;
    target?.closest('details')?.setAttribute('open', '');
  };

  const pickFiles = () => fileRef.current?.click();
  const busy = entries.some((e) => e.state === 'streaming');
  const enabledSources = sources.filter((s) => s.enabled);
  const activeEngine = engines.find((e) => e.id === engine);
  const blindToImages = activeEngine && !activeEngine.vision && enabledSources.some((s) => s.media);
  const nothingSelected = !useLibrary && enabledSources.length === 0;
  const chips = [
    ...(useLibrary ? [{id: 'library', name: 'Math notes library', kind: 'library' as const}] : []),
    ...enabledSources.map((s) => ({id: s.id, name: s.name, kind: s.kind})),
  ];

  return (
    <div
      className="workspace"
      data-dragging={dragging || undefined}
      onDragEnter={onDragEnter}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles([...e.target.files]);
          e.target.value = '';
        }}
      />

      <SourcesPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        library={library}
        useLibrary={useLibrary}
        setUseLibrary={setUseLibrary}
        sources={sources}
        pending={pending}
        onToggle={toggleSource}
        onRemove={deleteSource}
        onDismissPending={(key) => setPending((p) => p.filter((x) => x.key !== key))}
        onPick={pickFiles}
        entries={entries}
        noModel={configured.length === 0}
      />

      <main className="thread" id={active ? 'main' : undefined} onClick={openCitation}>
        <div className="thread-bar only-mobile">
          <button type="button" className="chip-button" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen}>
            <PanelLeft size={16} /> Sources <span className="count">{chips.length}</span>
          </button>
        </div>

        {entries.length === 0 ? (
          <section className="empty" aria-labelledby="empty-title">
            <h1 id="empty-title" className="empty-title">
              Ask your notes, papers and photos of problems.
            </h1>
            <p className="empty-lede">
              Cited, typeset answers from your files and {library.passages} passages of math notes
              {animation.available ? ', with narrated Manim animations' : ''}.
            </p>
            <div className="empty-actions">
              <button type="button" className="btn btn-outline" onClick={pickFiles}>
                <Upload size={18} /> Upload files
              </button>
            </div>

            <div className="starter-grid">
              {STARTERS.map((s) => (
                <div key={s.area} className="starter-card">
                  <p className="starter-area">{s.area}</p>
                  {s.questions.map((q) => (
                    <button key={q} type="button" className="starter" onClick={() => void ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="starter-card starter-animate">
              <p className="starter-area">
                <Film size={16} /> Animated with Manim
              </p>
              <div className="starter-row">
                {ANIMATED_STARTERS.map((q) => (
                  <button key={q} type="button" className="starter" onClick={() => void ask(q, {animate: true})}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          entries.map((e) => {
            const surface = surfaces.get(e.surfaceId);
            return (
              <section key={e.surfaceId} id={e.surfaceId} className="answer" aria-busy={e.state === 'streaming'}>
                {surface ? (
                  <A2uiSurface surface={surface} />
                ) : (
                  <div className="ask">
                    <h2 className="question">{e.question}</h2>
                  </div>
                )}
                {e.state === 'error' ? (
                  <p className="answer-error" role="alert">
                    <AlertCircle size={18} />
                    <span>{e.error}</span>
                    <button type="button" className="text-button" onClick={() => void ask(e.question, {animate: e.animate})}>
                      <RotateCcw size={16} /> Ask again
                    </button>
                  </p>
                ) : null}
              </section>
            );
          })
        )}
        <div ref={endRef} />

        <div className="composer-dock">
          <form className="composer" onSubmit={onSubmit}>
            {chips.length > 0 ? (
              <ul className="chips" aria-label="Sources used for the next question">
                {chips.slice(0, 4).map((c) => (
                  <li key={c.id} className="chip">
                    {c.kind === 'library' ? <BookOpen size={14} /> : c.kind === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
                    <span className="chip-name">{c.name}</span>
                    <button
                      type="button"
                      className="chip-x"
                      aria-label={`Stop using ${c.name}`}
                      onClick={() => (c.id === 'library' ? setUseLibrary(false) : toggleSource(c.id, false))}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
                {chips.length > 4 ? (
                  <li>
                    <button type="button" className="chip chip-more" onClick={() => setPanelOpen(true)}>
                      +{chips.length - 4} more
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
            <label htmlFor="question" className="visually-hidden">
              Your question
            </label>
            <textarea
              id="question"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={2}
              maxLength={2000}
              placeholder="Ask a question"
            />
            <div className="composer-bar">
              <div className="composer-tools">
                <button type="button" className="icon-button" onClick={pickFiles} aria-label="Add files">
                  <Paperclip />
                </button>
                <button
                  type="button"
                  className="toggle"
                  aria-pressed={animate}
                  onClick={() => setAnimate((v) => !v)}
                  title="Ask for a Manim animation with the answer"
                  aria-label="Animate the answer with Manim"
                >
                  <Film size={16} />
                  <span>Animate</span>
                </button>
                {configured.length > 0 ? (
                  <fieldset className="segmented">
                    <legend className="visually-hidden">Answer with</legend>
                    {engines.map((e) => (
                      <label key={e.id} data-disabled={!e.available || undefined} title={e.available ? e.model : `${e.label} is not configured`}>
                        <input
                          type="radio"
                          name="engine"
                          value={e.id}
                          checked={engine === e.id}
                          disabled={!e.available}
                          onChange={() => setEngine(e.id)}
                        />
                        <span>{e.label}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </div>
              <button type="submit" className="send" disabled={busy || !draft.trim()} aria-label={busy ? 'Answering' : 'Ask'}>
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          {nothingSelected || blindToImages ? (
            <p className="composer-note" role="status">
              {nothingSelected
                ? 'No sources selected. Turn on the library or a file to ask.'
                : `${activeEngine!.label} reads text only. Switch to Opus to ask about images and scanned PDFs.`}
            </p>
          ) : null}
        </div>
      </main>

      <div className="drop-overlay" aria-hidden="true">
        <div className="drop-card">
          <Upload size={28} />
          <p>Drop files to add them as sources</p>
        </div>
      </div>
    </div>
  );
}
