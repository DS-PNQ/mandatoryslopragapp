'use client';

import {createComponentImplementation, useA2uiSurface} from '@a2ui/react';
import {Catalog} from '@a2ui/web_core';
import {useMemo, useState} from 'react';
import {
  AnimationApi,
  CaveatApi,
  DerivationApi,
  EquationApi,
  FollowUpApi,
  FollowUpsApi,
  MATH_CATALOG_ID,
  PageApi,
  ProseApi,
  QuestionApi,
  SourcesApi,
  StatementApi,
  StatusApi,
  StepApi,
  type AnimationEntry,
  type SourceEntry,
} from '@/lib/a2ui/catalog-api';
import {renderMathMarkdown, renderTex} from '@/lib/markdown-math';
import {AlertCircle, BookOpen, Check, Code, Copy, Download, FileText, Film, ImageIcon, Mark, Spinner, Volume} from './icons';

function ids(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

function useCiteHref(): (n: number) => string {
  const surface = useA2uiSurface();
  const sid = surface?.id ?? 'answer';
  return (n: number) => `#${sid}-src-${n}`;
}

function MathMarkdown({source, inline, className}: {source: string; inline?: boolean; className?: string}) {
  const citeHref = useCiteHref();
  const html = useMemo(() => renderMathMarkdown(source, {citeHref, inline}), [source, inline, citeHref]);
  const Tag = inline ? 'span' : 'div';
  return <Tag className={className} dangerouslySetInnerHTML={{__html: html}} />;
}

// One chat turn: the question as the user's message, then Lemma's reply with
// its sources folded underneath.
const Page = createComponentImplementation(PageApi, ({props, buildChild}) => {
  // The writer always puts the question first; the runtime renames child ids,
  // so it is picked by position.
  const [question, ...reply] = ids(props.body);
  return (
    <article className="turn">
      {question ? buildChild(question) : null}
      <div className="reply">
        <span className="reply-avatar" aria-hidden="true">
          <Mark size={22} />
        </span>
        <div className="reply-body">
          {reply.map((id) => (
            <div key={id} className="page-block">
              {buildChild(id)}
            </div>
          ))}
          {ids(props.margin).map((id) => (
            <div key={id}>{buildChild(id)}</div>
          ))}
        </div>
      </div>
    </article>
  );
});

const Question = createComponentImplementation(QuestionApi, ({props}) => (
  <div className="ask">
    <h2 className="question">{props.text}</h2>
  </div>
));

const Status = createComponentImplementation(StatusApi, ({props}) => (
  <p className="status" data-busy={props.busy ? 'true' : 'false'} role="status" aria-live="polite">
    <span className="status-mark" aria-hidden="true" />
    {props.text}
  </p>
));

const Prose = createComponentImplementation(ProseApi, ({props}) => (
  <MathMarkdown className="prose" source={props.markdown ?? ''} />
));

const Equation = createComponentImplementation(EquationApi, ({props}) => {
  const html = useMemo(() => renderTex(props.tex ?? '', true), [props.tex]);
  return (
    <figure className="equation">
      <div className="equation-tex" dangerouslySetInnerHTML={{__html: html}} />
      {props.number ? <figcaption className="equation-number">({props.number})</figcaption> : null}
    </figure>
  );
});

const Derivation = createComponentImplementation(DerivationApi, ({props, buildChild}) => (
  <section className="derivation" aria-label={props.title ?? 'Derivation'}>
    {props.title ? <h3 className="derivation-title">{props.title}</h3> : null}
    <ol className="steps">
      {ids(props.steps).map((id) => (
        <li key={id}>{buildChild(id)}</li>
      ))}
    </ol>
  </section>
));

const Step = createComponentImplementation(StepApi, ({props}) => {
  const tex = useMemo(() => (props.tex ? renderTex(props.tex, true) : ''), [props.tex]);
  return (
    <div className="step">
      <MathMarkdown source={props.markdown ?? ''} />
      {tex ? <div className="step-tex" dangerouslySetInnerHTML={{__html: tex}} /> : null}
    </div>
  );
});

const Statement = createComponentImplementation(StatementApi, ({props}) => {
  const citeHref = useCiteHref();
  const cite = props.cite ? Number(props.cite) : null;
  return (
    <section className="statement" data-kind={props.kind}>
      <p className="statement-head">
        <span className="statement-kind">{props.kind}</span>
        {props.title ? <span className="statement-title"> ({props.title})</span> : null}
        {cite ? (
          <a className="cite" href={citeHref(cite)} aria-label={`Source ${cite}`}>
            {cite}
          </a>
        ) : null}
        <span className="statement-dot">.</span>
      </p>
      <MathMarkdown className="statement-body" source={props.markdown ?? ''} />
    </section>
  );
});

const Caveat = createComponentImplementation(CaveatApi, ({props}) => (
  <aside className="caveat">
    <MathMarkdown source={props.markdown ?? ''} />
  </aside>
));

function isSourceList(v: unknown): v is SourceEntry[] {
  return Array.isArray(v) && v.every((s) => s && typeof s === 'object' && 'chunkId' in s);
}

const Sources = createComponentImplementation(SourcesApi, ({props}) => {
  const surface = useA2uiSurface();
  const items = isSourceList(props.items) ? props.items : [];
  if (items.length === 0) return null;
  return (
    <details className="sources">
      <summary className="sources-summary">
        <BookOpen size={15} />
        <span>
          {items.length} {items.length === 1 ? 'source' : 'sources'}
        </span>
        <span className="sources-peek" aria-hidden="true">
          {[...new Set(items.map((s) => s.note))].slice(0, 3).join(' · ')}
        </span>
      </summary>
      <ol className="source-list">
        {items.map((s) => {
          const upload = s.origin === 'upload';
          const visual = upload && s.chunkId.endsWith(':visual');
          return (
            <li key={s.chunkId} id={`${surface?.id ?? 'answer'}-src-${s.n}`} className="source" data-origin={s.origin ?? 'library'}>
              <span className="source-n">{s.n}</span>
              <div className="source-text">
                <p className="source-heading">{upload ? s.note : s.heading}</p>
                <p className="source-note">
                  {upload ? (s.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />) : <BookOpen size={13} />}
                  <span>{upload ? s.heading : `${s.note}, §${s.section}`}</span>
                </p>
                {visual ? null : (
                  <details className="source-excerpt">
                    <summary>Passage</summary>
                    <MathMarkdown source={s.excerpt} />
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
});

const FollowUps = createComponentImplementation(FollowUpsApi, ({props, buildChild}) => (
  <nav className="followups" aria-label="Follow-up questions">
    <h3 className="followups-title">Ask next</h3>
    <ul>
      {ids(props.items).map((id) => (
        <li key={id}>{buildChild(id)}</li>
      ))}
    </ul>
  </nav>
));

const FollowUp = createComponentImplementation(FollowUpApi, ({props}) => {
  const animate = props.label === 'Animate this with Manim';
  return (
    <button type="button" className="followup" data-kind={animate ? 'animate' : undefined} onClick={() => props.action?.()}>
      {animate ? <Film size={16} /> : null}
      {props.label}
    </button>
  );
});

function isAnimation(v: unknown): v is AnimationEntry {
  return Boolean(v && typeof v === 'object' && 'status' in v && 'code' in v);
}

function sceneName(code: string): string {
  return /class\s+(\w+)\s*\(/.exec(code)?.[1] ?? 'Scene';
}

function SceneCode({code, open}: {code: string; open?: boolean}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <details className="scene-code" open={open}>
      <summary>
        <Code size={16} /> Manim scene code
      </summary>
      <div className="scene-code-body">
        <button type="button" className="icon-button subtle copy" onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </details>
  );
}

const Animation = createComponentImplementation(AnimationApi, ({props}) => {
  const a = isAnimation(props.data) ? props.data : null;
  if (!a) return null;
  const title = props.title || 'Animation';
  return (
    <figure className="animation" data-status={a.status}>
      <figcaption className="animation-head">
        <span className="animation-badge">
          <Film size={14} /> Manim
        </span>
        <span className="animation-title">{title}</span>
      </figcaption>
      {a.status === 'ready' && a.src ? (
        <>
          <video className="animation-video" src={a.src} poster={a.poster} controls playsInline preload="metadata" aria-label={title}>
            {a.captions ? <track kind="captions" src={a.captions} srcLang="en" label="Narration" default={!a.voiced} /> : null}
          </video>
          <div className="animation-actions">
            <a className="text-button" href={a.src} download={`${sceneName(a.code)}.mp4`}>
              <Download size={16} /> Download MP4
            </a>
            {a.narration?.length ? (
              <span className="animation-meta">{a.voiced ? 'Narrated by MioTTS-0.6B' : 'Captions only, no voice server'}</span>
            ) : null}
          </div>
          {a.narration?.length ? (
            <details className="scene-code transcript">
              <summary>
                <Volume size={16} /> Narration
              </summary>
              <ol className="transcript-list">
                {a.narration.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      ) : a.status === 'rendering' ? (
        <div className="animation-stage" role="status" aria-live="polite">
          <Spinner size={24} className="spin" />
          <p>{a.note ?? 'Rendering with Manim'}</p>
        </div>
      ) : (
        <div className="animation-stage animation-problem" role={a.status === 'failed' ? 'alert' : undefined}>
          <AlertCircle size={22} />
          <p>{a.status === 'failed' ? `The scene did not render: ${a.message ?? 'unknown error'}` : a.message}</p>
          {a.status === 'unavailable' ? (
            <p className="animation-sub">
              Render it locally with <code>manim -pql scene.py {sceneName(a.code)}</code>
            </p>
          ) : null}
        </div>
      )}
      <SceneCode code={a.code} open={a.status === 'unavailable'} />
    </figure>
  );
});

export const mathCatalog = new Catalog(MATH_CATALOG_ID, '1.0', [
  Page,
  Question,
  Status,
  Prose,
  Equation,
  Derivation,
  Step,
  Statement,
  Caveat,
  Sources,
  FollowUps,
  FollowUp,
  Animation,
]);
