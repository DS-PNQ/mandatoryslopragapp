// Neural retrieval stages against mock llama-server endpoints: embeddings are
// fused into the library and upload rankings, the reranker reorders the
// candidates, and a dead endpoint falls back to LSA + BM25 without failing.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';

const TOPICS = ['eigen', 'series', 'integral', 'probability', 'matrix', 'fourier', 'derivative', 'cluster'];

function embed(text: string): number[] {
  const t = text.toLowerCase();
  return TOPICS.map((w) => (t.includes(w) ? 1 : 0)).map((v, i) => v + (i === 0 ? 0.01 : 0));
}

async function serve(handler: (path: string, body: any) => unknown): Promise<{server: Server; url: string; seen: any[]}> {
  const seen: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    seen.push({path: req.url, body});
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify(handler(req.url ?? '', body)));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, seen};
}

test('embeddings and reranker shape library and upload retrieval', async () => {
  const emb = await serve((_p, body) => ({data: body.input.map((s: string, index: number) => ({index, embedding: embed(s)}))}));
  // The reranker prefers passages that mention eigenvalues, most mentions first.
  const rr = await serve((_p, body) => ({
    results: body.documents.map((d: string, index: number) => ({index, relevance_score: (d.match(/eigenvalue/gi) ?? []).length})),
  }));
  process.env.LEMMA_EMBED_URL = emb.url;
  process.env.LEMMA_RERANK_URL = rr.url;
  try {
    const {searchLibrary, searchUploads} = await import('../lib/rag/hybrid');
    const {resetNeuralState} = await import('../lib/rag/neural');
    resetNeuralState();

    const lib = await searchLibrary('How do I find the eigenvalues of a matrix?', 4);
    assert.equal(lib.neural.embedder, 'qwen3-embedding-0.6b');
    assert.equal(lib.neural.reranker, 'qwen3-reranker-0.6b');
    assert.equal(lib.passages.length, 4);
    assert.match(lib.passages[0].chunk.text, /eigenvalue/i);
    assert.ok(lib.passages.every((p, i, a) => i === 0 || (a[i - 1].rerankScore ?? 0) >= (p.rerankScore ?? 0)));
    // Queries carry the instruction; passages carry their context header.
    const inputs = emb.seen.flatMap((s) => s.body.input as string[]);
    assert.ok(inputs.some((s) => s.startsWith('Instruct: ') && s.includes('Query: ')));
    assert.ok(inputs.some((s) => /§/.test(s.split('\n')[0])));
    // The reranker saw 20 fused candidates, with its instruction.
    assert.equal(rr.seen[0].body.documents.length, 20);
    assert.match(rr.seen[0].body.query, /<Instruct>/);

    // Library vectors are embedded once per process.
    const before = emb.seen.length;
    await searchLibrary('Fourier series convergence', 3);
    assert.equal(emb.seen.length, before + 1, 'only the query is embedded the second time');

    const filler = Array.from({length: 120}, (_, i) => `Paragraph ${i} about probability and random variables, with nothing on spectra.`).join('\n\n');
    const text = `${filler}\n\nThe eigenvalue equation and every eigenvalue of a symmetric matrix are real; each eigenvalue has an eigenvector.\n\n${filler}`;
    const up = await searchUploads('Which eigenvalue facts hold for symmetric matrices?', [{id: 'a1', name: 'notes.txt', kind: 'text', text}], 3);
    assert.equal(up.neural.reranker, 'qwen3-reranker-0.6b');
    assert.match(up.chunks[0].text, /eigenvalue/);
  } finally {
    emb.server.close();
    rr.server.close();
  }
});

test('a dead embedding or rerank endpoint falls back to LSA and BM25', async () => {
  process.env.LEMMA_EMBED_URL = 'http://127.0.0.1:9/v1';
  process.env.LEMMA_RERANK_URL = 'http://127.0.0.1:9/v1';
  try {
    const {searchLibrary} = await import('../lib/rag/hybrid');
    const {resetNeuralState} = await import('../lib/rag/neural');
    resetNeuralState();
    const r = await searchLibrary('ratio test for series', 6);
    assert.equal(r.neural.embedder, null);
    assert.equal(r.neural.reranker, null);
    assert.equal(r.passages.length, 6);
  } finally {
    delete process.env.LEMMA_EMBED_URL;
    delete process.env.LEMMA_RERANK_URL;
  }
});

test('LaTeX is verbalised for the embedder', async () => {
  const {verbalizeTex} = await import('../lib/rag/neural');
  assert.equal(verbalizeTex('$\\sum_{n} x^2 \\leq \\int f$'), 'sum _ n x squared less or equal integral f');
});

test('with an embedder the dense order decides; LEMMA_FUSION_WEIGHTS restores equal fusion', async () => {
  const {getRetriever} = await import('../lib/rag/load');
  const target = getRetriever().chunks.findIndex((c) => c.id === 'groups#cyclic-groups');
  // An embedder that ranks "Cyclic groups" first for every query.
  const emb = await serve((_p, body) => ({
    data: body.input.map((s: string, index: number) => ({index, embedding: s.includes('Cyclic groups') || s.startsWith('Instruct') ? [1, 0] : [0, 1]})),
  }));
  process.env.LEMMA_EMBED_URL = emb.url;
  try {
    const {searchLibrary, resetLibraryEmbeddings} = await import('../lib/rag/hybrid');
    const {resetNeuralState} = await import('../lib/rag/neural');
    resetNeuralState();
    resetLibraryEmbeddings();
    const q = 'ratio test for series convergence';
    const dense = await searchLibrary(q, 6);
    assert.equal(dense.passages[0].chunk.id, getRetriever().chunks[target].id, 'dense first place is kept');
    // Lexical-only matches come after the 20 dense candidates (backfill).
    const wide = await searchLibrary(q, 40);
    const firstSeries = wide.passages.findIndex((p) => p.chunk.id.startsWith('series#'));
    assert.ok(firstSeries >= 20, `series passages follow the dense list (found at ${firstSeries})`);
    process.env.LEMMA_FUSION_WEIGHTS = '1,1,1';
    const equal = await searchLibrary(q, 6);
    assert.notEqual(equal.passages[0].chunk.id, 'groups#cyclic-groups', 'equal weights let BM25 and LSA outvote it');
  } finally {
    delete process.env.LEMMA_EMBED_URL;
    delete process.env.LEMMA_FUSION_WEIGHTS;
    emb.server.close();
  }
});

test('EmbeddingGemma 2 prompts and Matryoshka truncation', async () => {
  const {passageForEmbedding, queryForEmbedding, embedFamily, embedQuery, resetNeuralState} = await import('../lib/rag/neural');
  const emb = await serve((_p, body) => ({data: body.input.map((_s: string, index: number) => ({index, embedding: [3, 4, 12, 84]}))}));
  process.env.LEMMA_EMBED_URL = emb.url;
  process.env.LEMMA_EMBED_MODEL = 'embeddinggemma-2';
  try {
    assert.equal(embedFamily(), 'gemma');
    assert.equal(queryForEmbedding('What is \\nabla f?'), 'task: search result | query: What is nabla gradient f?');
    assert.equal(passageForEmbedding('Series § Ratio test', 'If L < 1'), 'title: Series § Ratio test | text: If L < 1');
    process.env.LEMMA_EMBED_DIM = '64';
    resetNeuralState();
    assert.equal((await embedQuery('x'))!.length, 4, 'shorter than the vector: left whole');
    process.env.LEMMA_EMBED_DIM = '32';
    process.env.LEMMA_EMBED_MODEL = 'qwen3-embedding-0.6b';
    assert.equal(embedFamily(), 'qwen3');
    assert.match(queryForEmbedding('x'), /^Instruct: .*\nQuery: x$/);
  } finally {
    for (const k of ['LEMMA_EMBED_URL', 'LEMMA_EMBED_MODEL', 'LEMMA_EMBED_DIM']) delete process.env[k];
    emb.server.close();
  }
});
