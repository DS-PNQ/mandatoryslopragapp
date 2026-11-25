import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {buildIndex} from '../lib/rag/build';
import {parseNote, toChunks} from '../lib/rag/corpus';

const root = process.cwd();
const notesDir = path.join(root, 'content', 'notes');
const outDir = path.join(root, 'generated');

const files = readdirSync(notesDir)
  .filter((f) => f.endsWith('.md'))
  .sort();
const chunks = files.flatMap((f) => toChunks(parseNote(readFileSync(path.join(notesDir, f), 'utf8'))));

const started = performance.now();
const index = buildIndex(chunks);
const ms = Math.round(performance.now() - started);

mkdirSync(outDir, {recursive: true});
writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));

const t = index.training;
console.log(
  `index: ${files.length} notes, ${t.n} passages, ${index.vocab.length} terms, LSA rank ${t.d}\n` +
    `e-means: k=${t.k} T=${t.epochs} B=${t.batchSize} alpha0=${t.alpha0.toFixed(3)} updates=${t.updates} ` +
    `revived=${t.revived} mse=${t.finalLoss.toFixed(4)} (Lloyd@25 ${t.lloydLoss25.toFixed(4)}) in ${ms} ms`,
);
