// MioTTS client against a local mock of the MioTTS-Inference API.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

function wav(seconds: number, rate = 24000): Buffer {
  const n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf;
}

test('WAV duration, spoken text and estimates', async () => {
  const {wavSeconds, speakable, estimateSeconds} = await import('../lib/tts/miotts');
  assert.equal(wavSeconds(wav(1.5)), 1.5);
  assert.equal(wavSeconds(Buffer.from('not a wav file at all, definitely not one')), null);
  assert.equal(speakable('It tends to $\\infty$, not to **zero**'), 'It tends to infinity, not to zero');
  assert.ok(estimateSeconds('one two three four five six seven eight nine ten') > 3);
});

test('lines are voiced through /v1/tts, and a failed line falls back to silence', async () => {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    if (req.url === '/health') return void res.end('{"status":"ok"}');
    const body = JSON.parse(raw);
    requests.push(body);
    if (body.text.includes('fail')) {
      res.writeHead(500);
      return void res.end('boom');
    }
    res.writeHead(200, {'content-type': 'audio/wav'});
    res.end(wav(2));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.MIOTTS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  process.env.MIOTTS_PRESET = 'en_male';
  try {
    const {synthesize, ttsAvailable} = await import('../lib/tts/miotts');
    assert.equal(await ttsAvailable(), true);
    const {lines, voiced} = await synthesize(['First the $x$ axis.', 'This line will fail.']);
    assert.equal(voiced, 1);
    assert.equal(lines[0].duration, 2);
    assert.ok(lines[0].wav);
    assert.equal(lines[1].wav, null);
    assert.ok(lines[1].duration > 1, 'estimated duration');
    assert.deepEqual(requests[0], {text: 'First the x axis.', reference: {type: 'preset', preset_id: 'en_male'}, output: {format: 'wav'}});
  } finally {
    server.close();
  }
});
