// Ternary Bonsai path of answer(): same OpenAI-compatible protocol as LFM3,
// with its own endpoint, sampling and image input.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4870000000049454e44ae426082', 'hex').toString('base64');

test('Bonsai uses its endpoint, card sampling and sees images', async () => {
  let request: any = null;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    request = JSON.parse(raw);
    res.writeHead(200, {'content-type': 'text/event-stream'});
    const chunks = [
      {choices: [{delta: {reasoning_content: 'Look at the image first.'}}]},
      {choices: [{delta: {content: JSON.stringify({t: 'p', md: 'The plot shows $r^n \\to 0$ [1].'}) + '\n'}}]},
      {choices: [{delta: {}, finish_reason: 'stop'}]},
    ];
    for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const {port} = server.address() as AddressInfo;
  process.env.BONSAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.BONSAI_VISION = '1';
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const {answer, engines} = await import('../lib/agent/answer');
    const bonsai = engines().find((e) => e.id === 'bonsai')!;
    assert.ok(bonsai.available && bonsai.vision);

    const events: any[] = [];
    await answer(
      {
        question: 'What does this plot show?',
        surfaceId: 'bz',
        engine: 'bonsai',
        useLibrary: false,
        attachments: [{id: 'img1', name: 'plot.png', kind: 'image', text: '', media: {type: 'image/png', data: PNG}}],
      },
      (e) => events.push(e),
    );
    assert.ok(!events.some((e) => e.type === 'error'), JSON.stringify(events.find((e) => e.type === 'error')));
    assert.equal(events.find((e) => e.type === 'done').engine, 'bonsai');

    assert.equal(request.model, 'ternary-bonsai-2.5-27b');
    assert.deepEqual([request.temperature, request.top_p, request.top_k, request.min_p], [1.0, 0.95, 20, 0]);
    const user = request.messages.at(-1);
    assert.ok(Array.isArray(user.content), 'image sent as content parts');
    const image = user.content.find((p: any) => p.type === 'image_url');
    assert.equal(image.image_url.url, `data:image/png;base64,${PNG}`);
    assert.ok(!JSON.stringify(events).includes('Look at the image first'), 'reasoning stays out of the answer');
  } finally {
    server.close();
    delete process.env.BONSAI_BASE_URL;
    delete process.env.BONSAI_VISION;
  }
});
