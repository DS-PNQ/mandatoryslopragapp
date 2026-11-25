import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Catalog, MessageProcessor} from '@a2ui/web_core';
import {MATH_CATALOG_ID, MATH_COMPONENT_APIS} from '../lib/a2ui/catalog-api';
import {SurfaceWriter, type A2uiMessage} from '../lib/agent/surface-writer';
import {BlockStreamParser} from '../lib/agent/blocks';

function run(messages: A2uiMessage[]) {
  const errors: unknown[] = [];
  const actions: unknown[] = [];
  const catalog = new Catalog(MATH_CATALOG_ID, '1.0', MATH_COMPONENT_APIS);
  const processor = new MessageProcessor([catalog], (a) => void actions.push(a), {
    errorHandler: (e: unknown) => void errors.push(e),
  } as never);
  processor.processMessages(messages as never);
  return {processor, errors, actions};
}

test('writer output is accepted by the A2UI v1.0 message processor', () => {
  const messages: A2uiMessage[] = [];
  const w = new SurfaceWriter('answer-1', (m) => messages.push(m));
  w.begin('Why does the geometric series converge?');
  w.sources(
    [{n: 1, chunkId: 'series#geometric-series', note: 'Series', area: 'Real analysis', section: 1, heading: 'Geometric series', excerpt: '…', fused: 0.03, denseRank: 1, bm25Rank: 1, cell: 4}],
    {cells: [{id: 4, distance: 0.4, size: 6, terms: ['series']}], k: 8, scanned: 24, total: 110, denseRecall: 1, elapsedMs: 1.2, queryTerms: ['sery'], unknownTerms: [], model: 'test'},
  );
  const parser = new BlockStreamParser();
  const jsonl = [
    {t: 'p', md: 'The partial sums telescope [1].'},
    {t: 'eq', tex: '\\sum_{n=0}^\\infty r^n = \\frac{1}{1-r}'},
    {t: 'steps', title: 'Derivation', items: [{md: 'Write $S_N$.'}, {md: 'Subtract $rS_N$.', tex: 'S_N(1-r) = 1 - r^{N+1}'}]},
    {t: 'stmt', kind: 'Theorem', title: 'Ratio test', md: 'If $L<1$ the series converges.', cite: 1},
    {t: 'caveat', md: 'The library does not prove the Basel sum.'},
    {t: 'followups', items: ['What is the ratio test?', 'Why does the harmonic series diverge?']},
  ].map((b) => JSON.stringify(b)).join('\n');
  for (const piece of jsonl.match(/.{1,17}/gs)!) for (const b of parser.push(piece)) w.block(b);
  for (const b of parser.flush()) w.block(b);
  w.finish('Answered from 1 passage');

  const {processor, errors} = run(messages);
  assert.deepEqual(errors, []);
  const surface = processor.model.surfacesMap.get('answer-1');
  assert.ok(surface, 'surface created');
  const root = surface!.componentsModel.get('root');
  assert.ok(root, 'root exists');
  assert.equal(surface!.componentsModel.get('b3')?.type, 'Derivation');
});

test('parser rejects lines outside the block vocabulary', () => {
  const rejected: string[] = [];
  const p = new BlockStreamParser((line) => rejected.push(line));
  const out = p.push('{"t":"p","md":"ok"}\n{"t":"html","md":"<script>"}\nnot json\n');
  assert.equal(out.length, 1);
  assert.equal(rejected.length, 2);
});
