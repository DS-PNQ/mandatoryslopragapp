'use client';

import {A2uiSurface, type ReactCatalogComponent} from '@a2ui/react';
import {MessageProcessor, type SurfaceModel} from '@a2ui/web_core';
import {useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent} from 'react';
import {mathCatalog} from './catalog';

interface Entry {
  surfaceId: string;
  question: string;
  state: 'streaming' | 'done' | 'error';
  transcript?: string;
  error?: string;
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
  {area: 'Clustering', questions: ['How does e-means revive dead clusters?', 'Why does k-means quality affect IVF recall?']},
];

type Surface = SurfaceModel<ReactCatalogComponent>;

export interface EngineOption {
  id: 'opus' | 'lfm3';
  label: string;
  model: string;
  available: boolean;
}

export function Workspace({engines}: {engines: EngineOption[]}) {
  const configured = engines.filter((e) => e.available);
  const [engine, setEngine] = useState<EngineOption['id'] | null>(configured[0]?.id ?? null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [surfaces, setSurfaces] = useState<Map<string, Surface>>(new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const askRef = useRef<(q: string) => void>(() => {});
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const patch = useCallback((surfaceId: string, update: Partial<Entry>) => {
    setEntries((list) => list.map((e) => (e.surfaceId === surfaceId ? {...e, ...update} : e)));
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question) return;
      if (entriesRef.current.some((e) => e.state === 'streaming')) return;
      const surfaceId = `answer-${Date.now().toString(36)}`;
      const history = entriesRef.current
        .filter((e) => e.state === 'done' && e.transcript)
        .slice(-3)
        .map((e) => ({question: e.question, answer: e.transcript!}));
      setEntries((list) => [...list, {surfaceId, question, state: 'streaming'}]);
      setDraft('');
      requestAnimationFrame(() => endRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'}));

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({question, surfaceId, history, engine: engineRef.current}),
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

  const busy = entries.some((e) => e.state === 'streaming');

  return (
    <div className="workspace">
      <nav className="rail" aria-label="Questions in this session">
        <p className="rail-title">This session</p>
        {entries.length === 0 ? (
          <p className="rail-empty">Questions you ask appear here.</p>
        ) : (
          <ol className="rail-list">
            {entries.map((e, i) => (
              <li key={e.surfaceId} data-state={e.state}>
                <a href={`#${e.surfaceId}`}>
                  <span className="rail-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rail-q">{e.question}</span>
                </a>
              </li>
            ))}
          </ol>
        )}
        {configured.length === 0 ? (
          <p className="rail-mode">
            Retrieval only. Add <code>ANTHROPIC_API_KEY</code>, or point <code>LFM3_BASE_URL</code> at a local LFM3
            server, in <code>.env.local</code> for written answers.
          </p>
        ) : null}
      </nav>

      <main className="thread" id="main">
        {entries.length === 0 ? (
          <section className="empty">
            <h1 className="empty-title">Ask the library a question in plain words or LaTeX.</h1>
            <p className="empty-lede">
              Answers are typeset from 110 passages of study notes, with every claim tied to the passage it came
              from.
            </p>
            <dl className="starters">
              {STARTERS.map((s) => (
                <div key={s.area} className="starter-row">
                  <dt>{s.area}</dt>
                  <dd>
                    {s.questions.map((q) => (
                      <button key={q} type="button" className="starter" onClick={() => void ask(q)}>
                        {q}
                      </button>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          entries.map((e) => {
            const surface = surfaces.get(e.surfaceId);
            return (
              <section key={e.surfaceId} id={e.surfaceId} className="answer" aria-busy={e.state === 'streaming'}>
                {surface ? <A2uiSurface surface={surface} /> : <h2 className="question">{e.question}</h2>}
                {e.state === 'error' ? (
                  <p className="answer-error" role="alert">
                    {e.error}{' '}
                    <button type="button" className="link-button" onClick={() => void ask(e.question)}>
                      Ask again
                    </button>
                  </p>
                ) : null}
              </section>
            );
          })
        )}
        <div ref={endRef} />

        <form className="composer" onSubmit={onSubmit}>
          <label htmlFor="question" className="visually-hidden">
            Your question
          </label>
          <textarea
            id="question"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={600}
            placeholder="e.g. Why is a convergent sequence bounded?"
          />
          <div className="composer-bar">
            {configured.length > 0 ? (
              <fieldset className="engine-picker">
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
            ) : (
              <span className="composer-hint">Enter to ask, Shift+Enter for a new line</span>
            )}
            <button type="submit" className="ask-button" disabled={busy || !draft.trim()}>
              {busy ? 'Answering…' : 'Ask'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
