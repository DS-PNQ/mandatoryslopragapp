// The scene validator runs before Manim is imported, so these tests need only
// python3. The full render test runs when MANIM_PYTHON points at a Python
// with Manim installed.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {extractCode} from '../lib/manim/render';

const PY = process.env.MANIM_PYTHON || 'python3';
const hasPython = spawnSync(PY, ['--version']).status === 0;

function runner(code: string): {ok: boolean; error?: string; stage?: string} {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lemma-test-'));
  const file = path.join(dir, 'scene.py');
  writeFileSync(file, code);
  const r = spawnSync(PY, ['-I', 'scripts/manim_runner.py', file, dir, 'l'], {encoding: 'utf8', timeout: 120_000});
  const last = r.stdout.trim().split('\n').at(-1) ?? '{}';
  return JSON.parse(last);
}

const head = 'from manim import *\n\nclass S(Scene):\n    def construct(self):\n';

const ESCAPES: [string, RegExp][] = [
  ['import os\n' + head + '        pass\n', /Importing os/],
  ['import manim.utils.file_ops\n' + head + '        pass\n', /not allowed/],
  [head + '        open("/etc/passwd")\n', /name open/],
  [head + '        self.__class__.__bases__\n', /attribute \.__(class|bases)__/],
  [head + '        g = (x for x in [1])\n        g.gi_frame.f_back\n', /attribute \.(gi_frame|f_back)/],
  [head + '        np.load("/etc/passwd")\n', /attribute \.load/],
  [head + '        self.add(Code("/etc/passwd"))\n', /name Code/],
  [head + '        self.add(MathTex(r"\\input{/etc/passwd}"))\n', /TeX command \\input/],
  [head + '        config.media_dir = "/"\n', /(name|attribute \.)config|media_dir/],
  [head + '        getattr(self, "render")\n', /name getattr/],
  ['from manim import *\nclass NotAScene:\n    pass\n', /No Scene subclass/],
];

for (const [code, reason] of ESCAPES) {
  test(`validator refuses: ${code.split('\n').find((l) => /\S/.test(l) && !l.startsWith('from manim') && !l.startsWith('class') && !l.includes('def construct'))?.trim()}`, {skip: !hasPython}, () => {
    const r = runner(code);
    assert.equal(r.ok, false);
    assert.equal(r.stage, 'validate');
    assert.match(r.error ?? '', reason);
  });
}

test('extractCode reads fenced and bare replies', () => {
  assert.equal(extractCode('Here:\n```python\nclass A(Scene):\n    pass\n```\nDone'), 'class A(Scene):\n    pass');
  assert.equal(extractCode('class B(Scene): pass'), 'class B(Scene): pass');
  assert.equal(extractCode('Sorry, I cannot.'), null);
});

const hasManim = hasPython && spawnSync(PY, ['-c', 'import manim'], {timeout: 60_000}).status === 0;

test('a valid scene renders to MP4', {skip: !hasManim && 'Manim is not installed (set MANIM_PYTHON)'}, () => {
  const r = runner(head + '        c = Circle(color=TEAL)\n        self.play(Create(c), run_time=0.5)\n        self.wait(0.2)\n') as {ok: boolean; file?: string};
  assert.equal(r.ok, true);
  assert.match(r.file ?? '', /video\.mp4$/);
});

test('narrate() adds the voice, extends the video and writes captions', {skip: !hasManim && 'Manim is not installed (set MANIM_PYTHON)'}, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lemma-voice-'));
  const rate = 24000;
  const n = rate * 2;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  writeFileSync(path.join(dir, 'voice-0.wav'), buf);
  writeFileSync(path.join(dir, 'narration.json'), JSON.stringify([{text: 'A circle appears.', duration: 2, file: path.join(dir, 'voice-0.wav')}]));
  const file = path.join(dir, 'scene.py');
  writeFileSync(file, head + '        narrate(self, 0)\n        self.play(Create(Circle()), run_time=0.5)\n');
  const r = spawnSync(PY, ['-I', 'scripts/manim_runner.py', file, dir, 'l'], {encoding: 'utf8', timeout: 120_000});
  const out = JSON.parse(r.stdout.trim().split('\n').at(-1)!);
  assert.equal(out.ok, true);
  assert.equal(out.captions, true);
  const vtt = readFileSync(path.join(dir, 'captions.vtt'), 'utf8');
  assert.match(vtt, /00:00:00\.000 --> 00:00:02\.000\nA circle appears\./);
});
