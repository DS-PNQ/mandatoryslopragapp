// Scanned-PDF transcription: pages are rendered to images and sent to an
// OpenAI-compatible vision endpoint, and the text replaces the page images.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

/** A PDF whose pages are only JPEG images (no text layer), like a scan. */
async function scannedPdf(pages: number): Promise<Uint8Array> {
  const {createCanvas} = await import('@napi-rs/canvas');
  const objects: Buffer[] = [];
  const add = (body: Buffer | string) => objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1')) && objects.length;
  const kids: number[] = [];
  const pagesId = 1;
  add(''); // placeholder for the Pages tree, filled in below
  for (let i = 0; i < pages; i++) {
    const canvas = createCanvas(300, 400);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = '#000';
    ctx.font = '28px sans-serif';
    ctx.fillText(`Theorem ${i + 1}`, 20, 60);
    const jpeg = canvas.toBuffer('image/jpeg');
    const img = add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 300 /Height 400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'),
      jpeg,
      Buffer.from('\nendstream', 'latin1'),
    ]));
    const draw = 'q 300 0 0 400 0 0 cm /Im0 Do Q';
    const content = add(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 300 400] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[0] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`, 'latin1');
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let at = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(at);
    const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(obj);
    at += obj.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${at}\n%%EOF\n`, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

test('a scanned PDF is flagged at upload and transcribed page by page', async () => {
  const pdf = await scannedPdf(3);
  const {parseUpload} = await import('../lib/uploads/parse');
  const parsed = await parseUpload('scan.pdf', pdf);
  assert.equal(parsed.text, '');
  assert.equal(parsed.media?.type, 'application/pdf');

  const seen: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    seen.push(body);
    const page = Number(/Page (\d+) of/.exec(body.messages[1].content[1].text)![1]);
    if (page === 2) {
      res.writeHead(500).end('boom');
      return;
    }
    const content = `<think>reading</think>\`\`\`markdown\n## Theorem ${page}\nIf $|r|<1$ then $$\\sum r^n = \\frac{1}{1-r}$$\n\`\`\``;
    res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({choices: [{message: {content}}]}));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const {port} = server.address() as AddressInfo;
  try {
    const {transcribePdf} = await import('../lib/uploads/transcribe');
    const events: any[] = [];
    for await (const e of transcribePdf(pdf, {baseUrl: `http://127.0.0.1:${port}/v1`, model: 'vision', label: 'Mock'})) events.push(e);

    assert.deepEqual(events.map((e) => e.type), ['start', 'page', 'page', 'page', 'done']);
    const done = events.at(-1);
    assert.deepEqual(done.failed, [2], 'one failed page does not stop the rest');
    const pages = done.text.split('\f');
    assert.equal(pages.length, 3);
    assert.equal(pages[0], '## Theorem 1\nIf $|r|<1$ then $$\\sum r^n = \\frac{1}{1-r}$$', 'reasoning and fences removed');
    assert.match(pages[1], /Page 2 could not be read/);

    const image = seen[0].messages[1].content[0].image_url.url as string;
    assert.match(image, /^data:image\/jpeg;base64,/);
    const jpeg = Buffer.from(image.split(',')[1], 'base64');
    assert.ok(jpeg.length > 1000 && jpeg[0] === 0xff && jpeg[1] === 0xd8, 'page rendered to a real JPEG');
    assert.deepEqual(seen[0].chat_template_kwargs, {enable_thinking: false});

    // The transcribed text is chunked per page like any text PDF.
    const {chunkAttachment} = await import('../lib/uploads/retrieve');
    const chunks = chunkAttachment({id: 's', name: 'scan.pdf', kind: 'pdf', text: done.text, pages: 3});
    assert.deepEqual(chunks.map((c: any) => c.heading).slice(0, 3), ['Page 1', 'Page 2', 'Page 3']);
  } finally {
    server.close();
  }
});

test('the transcriber defaults to Bonsai only when it can see', async () => {
  const {ocrConfig} = await import('../lib/uploads/transcribe');
  delete process.env.LEMMA_OCR_BASE_URL;
  process.env.BONSAI_BASE_URL = 'http://127.0.0.1:1/v1';
  delete process.env.BONSAI_VISION;
  assert.equal(ocrConfig(), null);
  process.env.BONSAI_VISION = '1';
  assert.equal(ocrConfig()?.label, 'Bonsai 27B');
  process.env.LEMMA_OCR_BASE_URL = 'http://127.0.0.1:2/v1/';
  process.env.LEMMA_OCR_MODEL = 'allenai/olmOCR-2-7B';
  assert.deepEqual(ocrConfig(), {baseUrl: 'http://127.0.0.1:2/v1', apiKey: undefined, model: 'allenai/olmOCR-2-7B', label: 'allenai/olmOCR-2-7B'});
  for (const k of ['LEMMA_OCR_BASE_URL', 'LEMMA_OCR_MODEL', 'BONSAI_BASE_URL', 'BONSAI_VISION']) delete process.env[k];
});
