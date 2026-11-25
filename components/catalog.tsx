'use client';

import {createComponentImplementation, useA2uiSurface} from '@a2ui/react';
import {Catalog} from '@a2ui/web_core';
import {useMemo} from 'react';
import {
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
  TraceApi,
  type SourceEntry,
  type TraceEntry,
} from '@/lib/a2ui/catalog-api';
import {renderMathMarkdown, renderTex} from '@/lib/markdown-math';

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

const Page = createComponentImplementation(PageApi, ({props, buildChild}) => (
  <article className="page">
    <div className="page-body">
      {ids(props.body).map((id) => (
        <div key={id} className="page-block">
          {buildChild(id)}
        </div>
      ))}
    </div>
    <aside className="page-margin" aria-label="Sources and retrieval">
      {ids(props.margin).map((id) => (
        <div key={id}>{buildChild(id)}</div>
      ))}
    </aside>
  </article>
));

const Question = createComponentImplementation(QuestionApi, ({props}) => (
  <h2 className="question">{props.text}</h2>
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
    <section className="sources">
      <h3 className="margin-title">Sources</h3>
      <ol className="source-list">
        {items.map((s) => (
          <li key={s.chunkId} id={`${surface?.id ?? 'answer'}-src-${s.n}`} className="source">
            <span className="source-n">{s.n}</span>
            <div className="source-text">
              <p className="source-heading">{s.heading}</p>
              <p className="source-note">
                {s.note},&nbsp;§{s.section}
              </p>
              <details className="source-excerpt">
                <summary>Passage</summary>
                <MathMarkdown source={s.excerpt} />
              </details>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
});

function isTrace(v: unknown): v is TraceEntry {
  return Boolean(v && typeof v === 'object' && 'cells' in v && 'scanned' in v);
}

const Trace = createComponentImplementation(TraceApi, ({props}) => {
  const surface = useA2uiSurface();
  const t = isTrace(props.data) ? props.data : null;
  if (!t) return null;
  const sources = surface?.dataModel.get('/sources');
  const rows = isSourceList(sources) ? sources : [];
  return (
    <section className="trace">
      <h3 className="margin-title">Retrieval</h3>
      <dl className="trace-stats">
        <div>
          <dt>Cells probed</dt>
          <dd className="num">
            {t.cells.length} / {t.k}
          </dd>
        </div>
        <div>
          <dt>Passages scanned</dt>
          <dd className="num">
            {t.scanned} / {t.total}
          </dd>
        </div>
        <div>
          <dt>Dense recall vs. full scan</dt>
          <dd className="num">{t.denseRecall === null ? 'n/a' : t.denseRecall.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Search time</dt>
          <dd className="num">{t.elapsedMs.toFixed(1)} ms</dd>
        </div>
      </dl>
      {t.cells.length > 0 ? (
        <table className="trace-table">
          <caption>e-means cells nearest the query</caption>
          <thead>
            <tr>
              <th scope="col">Cell</th>
              <th scope="col">Topic terms</th>
              <th scope="col" className="num">
                d²
              </th>
            </tr>
          </thead>
          <tbody>
            {t.cells.map((c) => (
              <tr key={c.id}>
                <td className="num">C{c.id}</td>
                <td>{c.terms.slice(0, 3).join(', ')}</td>
                <td className="num">{c.distance.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {rows.length > 0 ? (
        <table className="trace-table">
          <caption>Rank fusion (RRF, k = 60)</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="num">
                Dense
              </th>
              <th scope="col" className="num">
                BM25
              </th>
              <th scope="col" className="num">
                Fused
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.chunkId}>
                <td className="num">{s.n}</td>
                <td className="num">{s.denseRank ?? '–'}</td>
                <td className="num">{s.bm25Rank ?? '–'}</td>
                <td className="num">{s.fused.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {t.unknownTerms.length > 0 ? (
        <p className="trace-note">Not in the library: {t.unknownTerms.join(', ')}</p>
      ) : null}
    </section>
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

const FollowUp = createComponentImplementation(FollowUpApi, ({props}) => (
  <button type="button" className="followup" onClick={() => props.action?.()}>
    {props.label}
  </button>
));

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
  Trace,
  FollowUps,
  FollowUp,
]);
