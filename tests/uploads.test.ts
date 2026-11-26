import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync, strToU8} from './zip-helper';
import {parseUpload, sniff, UploadError} from '../lib/uploads/parse';
import {AttachmentListSchema, chunkAttachment, rankUploads, type Attachment} from '../lib/uploads/retrieve';

function minimalPdf(lines: string[]): Uint8Array {
  const text = lines.map((l, i) => `${i ? '0 -20 Td ' : ''}(${l}) Tj`).join(' ');
  const stream = `BT /F1 14 Tf 72 720 Td ${text} ET`;
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
`;
  return new TextEncoder().encode(body);
}

function minimalDocx(paragraphs: string[]): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('')}</w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(xml),
  });
}

const PNG_1x1 = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
);

test('file kinds are detected from their bytes, not their names', () => {
  assert.equal(sniff(minimalPdf(['x']), 'notes.docx')?.kind, 'pdf');
  assert.deepEqual(sniff(PNG_1x1, 'photo.pdf'), {kind: 'image', imageType: 'image/png'});
  assert.equal(sniff(new TextEncoder().encode('MZ\u0090binary'), 'tool.exe'), null);
  assert.equal(sniff(new Uint8Array([0x68, 0x00, 0x69]), 'notes.txt'), null, 'NUL bytes are not text');
});

test('PDF text is extracted per page', async () => {
  const s = await parseUpload('lecture.pdf', minimalPdf(['Lecture 7: geometric series converge when |r| < 1.']));
  assert.equal(s.kind, 'pdf');
  assert.equal(s.pages, 1);
  assert.match(s.text, /geometric series converge/);
  assert.equal(s.media, undefined);
});

test('Word documents and plain text become text sources', async () => {
  const d = await parseUpload('hw.docx', minimalDocx(['Homework 3.', 'Prove the harmonic series diverges.']));
  assert.equal(d.kind, 'docx');
  assert.match(d.text, /harmonic series diverges/);
  const t = await parseUpload('notes.md', new TextEncoder().encode('# Limits\r\n\r\nEvery convergent sequence is bounded.'));
  assert.equal(t.kind, 'text');
  assert.equal(t.text, '# Limits\n\nEvery convergent sequence is bounded.');
});

test('images are kept as base64 for vision models', async () => {
  const s = await parseUpload('board.png', PNG_1x1);
  assert.equal(s.kind, 'image');
  assert.equal(s.media?.type, 'image/png');
  assert.equal(Buffer.from(s.media!.data, 'base64').length, PNG_1x1.length);
});

test('unsupported and empty files are refused with a readable reason', async () => {
  await assert.rejects(parseUpload('a.exe', new TextEncoder().encode('MZ')), UploadError);
  await assert.rejects(parseUpload('empty.pdf', new Uint8Array()), /empty/);
});

const doc = (id: string, text: string, kind: Attachment['kind'] = 'text'): Attachment => ({id, name: `${id}.txt`, kind, text});

test('small uploads are sent whole; large ones are ranked with BM25', () => {
  const small = rankUploads('anything', [doc('a', 'Short note one.\n\nShort note two.')]);
  assert.equal(small.length, 1);

  const filler = Array.from({length: 40}, (_, i) => `Paragraph ${i} talks about topology, open sets and compactness in metric spaces.`);
  filler[25] = 'The Cauchy–Schwarz inequality bounds an inner product by the product of norms.';
  const big = doc('b', Array(8).fill(filler.join('\n\n')).join('\n\n'));
  const ranked = rankUploads('state the Cauchy-Schwarz inequality', [big]);
  assert.ok(ranked.length <= 8);
  assert.match(ranked[0].text, /Cauchy–Schwarz/);
  assert.ok(ranked.some((c) => c.section === 1), 'opening chunk kept');
});

test('PDF chunks carry their page number', () => {
  const chunks = chunkAttachment({id: 'p', name: 'p.pdf', kind: 'pdf', text: 'Page one text.\fPage two text.'});
  assert.deepEqual(
    chunks.map((c) => c.heading),
    ['Page 1', 'Page 2'],
  );
});

test('attachment payloads are validated', () => {
  assert.ok(AttachmentListSchema.safeParse([doc('ok', 'text')]).success);
  assert.ok(!AttachmentListSchema.safeParse([{...doc('x', 't'), id: '../etc'}]).success);
  assert.ok(!AttachmentListSchema.safeParse([{...doc('x', ''), kind: 'image', media: {type: 'image/svg+xml', data: 'AAAA'}}]).success);
  assert.ok(!AttachmentListSchema.safeParse(Array.from({length: 13}, (_, i) => doc(`d${i}`, 'x'))).success);
});
