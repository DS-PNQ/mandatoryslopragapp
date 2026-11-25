// LFM3 path of answer() against a mock OpenAI-compatible /chat/completions
// server (the API llama-server and OpenRouter both expose).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Catalog, MessageProcessor} from '@a2ui/web_core';
import {MATH_CATALOG_ID, MATH_COMPONENT_APIS} from '../lib/a2ui/catalog-api';

// A small model's typical output: a template-primed reasoning trace (the
// opening <think> is in the prompt), a code fence, one plain-text line, and
// valid blocks.
const OUTPUT = [
  'The user asks about convergence. Passage 1 says partial sums are (1-r^{N+1})/(1-r).',
  '{"t":"p","md":"draft inside reasoning, must not be shown"}',
  '</think>',
  '```jsonl',
  JSON.stringify({t: 'p', md: 'The sum $\\sum r^n$ converges when $|r|<1$ [1].'}),
  'This holds because r^{N+1} tends to zero.',
  JSON.stringify({t: 'eq', tex: '\\frac{1}{1-r}'}),
  JSON.stringify({t: 'html', md: '<b>x</b>'}),
  JSON.stringify({t: 'followups', items: ['What is the ratio test?']}),
  '```',
].join('\n');

test('LFM3 stream becomes valid A2UI messages', async () => {
  let request: any = null;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    request = {url: req.url, auth: req.headers.authorization, body: JSON.parse(raw)};
    res.writeHead(200, {'content-type': 'text/event-stream'});
    for (const piece of OUTPUT.match(/[\s\S]{1,19}/g)!) {
      res.write(`data: ${JSON.stringify({model: 'LFM3-1.7B', choices: [{index: 0, delta: {content: piece}, finish_reason: null}]})}\n\n`);
    }
    res.write(`data: ${JSON.stringify({choices: [{index: 0, delta: {}, finish_reason: 'stop'}]})}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const {port} = server.address() as AddressInfo;
  process.env.LFM3_BASE_URL = `http://127.0.0.1:${port}/v1`;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const {answer} = await import('../lib/agent/answer');
    const events: any[] = [];
    await answer({question: 'When does the geometric series converge?', surfaceId: 'l1', engine: 'lfm3'}, (e) => events.push(e));

    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.body.model, 'liquid/lfm-3-1.7b');
    assert.equal(request.body.stream, true);
    assert.deepEqual(
      [request.body.temperature, request.body.top_p, request.body.top_k],
      [1.0, 0.95, 20],
      'model card math sampling',
    );
    assert.equal(request.auth, undefined, 'no key sent to a local server');
    assert.equal(request.body.messages[0].role, 'system');

    assert.ok(!events.some((e) => e.type === 'error'), JSON.stringify(events.find((e) => e.type === 'error')));
    const done = events.find((e) => e.type === 'done');
    assert.equal(done.engine, 'lfm3');

    const processor = new MessageProcessor([new Catalog(MATH_CATALOG_ID, '1.0', MATH_COMPONENT_APIS)]);
    processor.processMessages(events.filter((e) => e.type === 'a2ui').map((e) => e.message));
    const surface = processor.model.surfacesMap.get('l1')!;
    const types = ['b1', 'b2', 'b3', 'b4'].map((id) => surface.componentsModel.get(id)?.type);
    assert.deepEqual(types, ['Prose', 'Prose', 'Equation', 'FollowUps'], 'plain line kept, html block dropped');
    assert.equal(surface.componentsModel.get('b5'), undefined);
    assert.match(String(surface.dataModel.get('/status/text')), /^LFM3 1\.7B answered/);
    const prose = JSON.stringify(events);
    assert.ok(!prose.includes('must not be shown'), 'reasoning trace never reaches the page');
    assert.equal((surface.dataModel.get('/trace') as any).model, 'liquid/lfm-3-1.7b');
  } finally {
    server.close();
  }
});

test('ThinkFilter handles explicit tags, primed traces and no trace', async () => {
  const {ThinkFilter} = await import('../lib/agent/lfm3');
  const run = (pieces: string[]) => {
    const reasoning: string[] = [];
    const f = new ThinkFilter((t) => reasoning.push(t));
    const out = pieces.map((p) => f.push(p)).join('') + f.flush();
    return {out, reasoning: reasoning.join('')};
  };
  const explicit = run(['<thi', 'nk>plan</th', 'ink>\n{"t":"p","md":"a"}\n']);
  assert.equal(explicit.out, '{"t":"p","md":"a"}\n');
  assert.ok(explicit.reasoning.includes('plan'));

  const primed = run(['plan step', ' two</think>', '\n\n{"t":"eq","tex":"x"}\n']);
  assert.equal(primed.out, '{"t":"eq","tex":"x"}\n');

  const none = run(['{"t":"p",', '"md":"b"}\n{"t":"p","md":"c"}\n']);
  assert.equal(none.out, '{"t":"p","md":"b"}\n{"t":"p","md":"c"}\n');

  const unclosed = run(['<think>thinking forever\n{"t":"p","md":"d"}\n']);
  assert.equal(unclosed.out, '{"t":"p","md":"d"}');
});
