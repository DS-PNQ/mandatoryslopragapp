// Runs the model path of answer() against a local mock of the Messages
// streaming endpoint, then feeds the emitted A2UI messages to a real
// MessageProcessor. No network or API key needed.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type IncomingMessage} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Catalog, MessageProcessor} from '@a2ui/web_core';
import {MATH_CATALOG_ID, MATH_COMPONENT_APIS} from '../lib/a2ui/catalog-api';

const MODEL_LINES = [
  {t: 'p', md: 'For $|r|<1$ the partial sums converge to $\\frac{1}{1-r}$ [1].'},
  {t: 'eq', tex: '\\sum_{n=0}^{\\infty} r^n = \\frac{1}{1-r}'},
  {t: 'steps', items: [{md: 'Multiply $S_N$ by $r$.'}, {md: 'Subtract.', tex: '(1-r)S_N = 1 - r^{N+1}'}]},
  {t: 'followups', items: ['What happens when |r| = 1?']},
]
  .map((l) => JSON.stringify(l))
  .join('\n');

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function readBody(req: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw);
}

test('model stream becomes valid A2UI messages', async () => {
  let seen: any = null;
  const server = createServer(async (req, res) => {
    seen = {url: req.url, headers: req.headers, body: await readBody(req)};
    res.writeHead(200, {'content-type': 'text/event-stream'});
    const id = 'msg_test';
    res.write(sse('message_start', {type: 'message_start', message: {id, type: 'message', role: 'assistant', model: seen.body.model, content: [], stop_reason: null, stop_sequence: null, usage: {input_tokens: 10, output_tokens: 0}}}));
    res.write(sse('content_block_start', {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}));
    // Split mid-line to exercise the incremental parser.
    for (const piece of MODEL_LINES.match(/[\s\S]{1,23}/g)!) {
      res.write(sse('content_block_delta', {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: piece}}));
    }
    res.write(sse('content_block_stop', {type: 'content_block_stop', index: 0}));
    res.write(sse('message_delta', {type: 'message_delta', delta: {stop_reason: 'end_turn', stop_sequence: null}, usage: {output_tokens: 50}}));
    res.write(sse('message_stop', {type: 'message_stop'}));
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const {port} = server.address() as AddressInfo;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  try {
    const {answer} = await import('../lib/agent/answer');
    const events: any[] = [];
    delete process.env.LFM3_BASE_URL;
    await answer({question: 'Why does the geometric series converge?', surfaceId: 's1', engine: 'opus'}, (e) => events.push(e));

    assert.equal(seen.body.model, 'claude-opus-5-5');
    assert.equal(seen.body.fallbacks, 'default');
    assert.match(String(seen.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
    assert.ok(seen.body.messages.at(-1).content.includes('<passage n="1"'), 'passages sent to the model');

    const done = events.find((e) => e.type === 'done');
    assert.equal(done?.mode, 'model');
    assert.ok(!events.some((e) => e.type === 'error'));

    const processor = new MessageProcessor([new Catalog(MATH_CATALOG_ID, '1.0', MATH_COMPONENT_APIS)]);
    processor.processMessages(events.filter((e) => e.type === 'a2ui').map((e) => e.message));
    const surface = processor.model.surfacesMap.get('s1')!;
    const types = ['b1', 'b2', 'b3', 'b4'].map((id) => surface.componentsModel.get(id)?.type);
    assert.deepEqual(types, ['Prose', 'Equation', 'Derivation', 'FollowUps']);
    assert.match(String(surface.dataModel.get('/status/text')), /^Opus 5.5 answered from 6 passages, 1 cited/);
  } finally {
    server.close();
  }
});
