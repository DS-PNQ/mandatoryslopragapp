// Translates retrieval results and answer blocks into A2UI v1.0 messages for
// one answer surface. Components are upserted by id, so the root Page is
// re-sent with a longer child list each time a block arrives.

import {MATH_CATALOG_ID, type SourceEntry, type TraceEntry} from '../a2ui/catalog-api';
import type {Block} from './blocks';

export type A2uiMessage = {version: '1.0'} & Record<string, unknown>;
type Component = {id: string; component: string} & Record<string, unknown>;

export class SurfaceWriter {
  private readonly body: string[] = [];
  private readonly margin: string[] = [];
  private equationCount = 0;
  private blockCount = 0;

  constructor(
    readonly surfaceId: string,
    private readonly emit: (message: A2uiMessage) => void,
  ) {}

  private send(key: string, payload: Record<string, unknown>) {
    this.emit({version: '1.0', [key]: {surfaceId: this.surfaceId, ...payload}});
  }

  private components(components: Component[]) {
    const root: Component = {id: 'root', component: 'Page', body: [...this.body], margin: [...this.margin]};
    this.send('updateComponents', {components: [...components, root]});
  }

  private data(path: string, value: unknown) {
    this.send('updateDataModel', {path, value});
  }

  begin(question: string) {
    this.send('createSurface', {catalogId: MATH_CATALOG_ID});
    this.data('/', {question, status: {text: 'Searching the library', busy: true}, sources: [], trace: null});
    this.body.push('question', 'status');
    this.components([
      {id: 'question', component: 'Question', text: {'@path': '/question'}},
      {id: 'status', component: 'Status', text: {'@path': '/status/text'}, busy: {'@path': '/status/busy'}},
    ]);
  }

  status(text: string, busy = true) {
    this.data('/status', {text, busy});
  }

  sources(sources: SourceEntry[], trace: TraceEntry) {
    this.data('/sources', sources);
    this.data('/trace', trace);
    this.margin.push('sources', 'trace');
    this.components([
      {id: 'sources', component: 'Sources', items: {'@path': '/sources'}},
      {id: 'trace', component: 'Trace', data: {'@path': '/trace'}},
    ]);
  }

  block(block: Block) {
    const id = `b${++this.blockCount}`;
    const added: Component[] = [];
    switch (block.t) {
      case 'p':
        added.push({id, component: 'Prose', markdown: block.md});
        break;
      case 'eq':
        added.push({id, component: 'Equation', tex: block.tex, number: String(++this.equationCount)});
        break;
      case 'caveat':
        added.push({id, component: 'Caveat', markdown: block.md});
        break;
      case 'stmt':
        added.push({
          id,
          component: 'Statement',
          kind: block.kind,
          markdown: block.md,
          ...(block.title ? {title: block.title} : {}),
          ...(block.cite !== undefined ? {cite: String(block.cite)} : {}),
        });
        break;
      case 'steps': {
        const stepIds = block.items.map((_, i) => `${id}s${i + 1}`);
        block.items.forEach((s, i) =>
          added.push({id: stepIds[i], component: 'Step', markdown: s.md, ...(s.tex ? {tex: s.tex} : {})}),
        );
        added.push({id, component: 'Derivation', steps: stepIds, ...(block.title ? {title: block.title} : {})});
        break;
      }
      case 'followups': {
        const itemIds = block.items.map((_, i) => `${id}f${i + 1}`);
        block.items.forEach((q, i) =>
          added.push({
            id: itemIds[i],
            component: 'FollowUp',
            label: q,
            action: {event: {name: 'ask', context: {question: q}}},
          }),
        );
        added.push({id, component: 'FollowUps', items: itemIds});
        break;
      }
    }
    // Keep the status line directly under the question; content goes after it.
    this.body.push(id);
    this.components(added);
  }

  finish(text: string) {
    this.status(text, false);
  }
}
