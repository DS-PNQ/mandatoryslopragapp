// Uploaded files reach the model: text as numbered passages ahead of the
// library, images as vision blocks. Runs against a local mock of the
// Messages endpoint.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test('uploads are retrieved first and images are sent as vision input', async () => {
  let body: any = null;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    body = JSON.parse(raw);
    res.writeHead(200, {'content-type': 'text/event-stream'});
    res.write(sse('message_start', {type: 'message_start', message: {id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: {input_tokens: 1, output_tokens: 0}}}));
    res.write(sse('content_block_start', {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}));
    const text = [{t: 'p', md: 'Homework 3 asks you to group terms [1].'}, {t: 'followups', items: ['Why does grouping work?']}].map((l) => JSON.stringify(l)).join('\n');
    res.write(sse('content_block_delta', {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text}}));
    res.write(sse('content_block_stop', {type: 'content_block_stop', index: 0}));
    res.write(sse('message_delta', {type: 'message_delta', delta: {stop_reason: 'end_turn', stop_sequence: null}, usage: {output_tokens: 5}}));
    res.write(sse('message_stop', {type: 'message_stop'}));
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LEMMA_MANIM = 'off';
  delete process.env.LFM3_BASE_URL;

  try {
    const {answer} = await import('../lib/agent/answer');
    const events: any[] = [];
    await answer(
      {
        question: 'How do I prove the harmonic series diverges?',
        surfaceId: 'u1',
        engine: 'opus',
        useLibrary: true,
        attachments: [
          {id: 'hw3', name: 'hw3.docx', kind: 'docx', text: 'Homework 3. Prove that the harmonic series diverges by grouping terms.'},
          {id: 'img', name: 'board.png', kind: 'image', text: '', media: {type: 'image/png', data: 'iVBORw0KGgo='}},
        ],
      },
      (e) => events.push(e),
    );

    const content = body.messages.at(-1).content;
    assert.ok(Array.isArray(content), 'multimodal content');
    const image = content.find((b: any) => b.type === 'image');
    assert.equal(image?.source.media_type, 'image/png');
    const prompt = content.at(-1).text as string;
    assert.match(prompt, /<passage n="1" file="hw3.docx" location="Part 1">/);
    assert.match(prompt, /<passage n="2" note=/, 'library passages follow the upload');
    assert.match(prompt, /<visual n="5" file="board.png"\/>/);

    const sources = events.find((e) => e.type === 'a2ui' && e.message.updateDataModel?.path === '/sources')?.message.updateDataModel.value;
    assert.deepEqual(
      sources.map((s: any) => s.origin),
      ['upload', 'library', 'library', 'library', 'upload'],
    );
    assert.equal(events.at(-1).type, 'done');
  } finally {
    server.close();
  }
});

test('with the library off and nothing uploaded, the answer says so', async () => {
  process.env.LEMMA_MANIM = 'off';
  const {answer} = await import('../lib/agent/answer');
  const events: any[] = [];
  await answer({question: 'Anything?', surfaceId: 'u2', useLibrary: false, attachments: []}, (e) => events.push(e));
  const caveat = events.find((e) => e.type === 'a2ui' && JSON.stringify(e.message).includes('No sources are selected'));
  assert.ok(caveat);
});
