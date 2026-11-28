// The animation pipeline end to end against a mock Bonsai server: the answer
// is written first, then a separate scene call (reasoning off), then repairs,
// then the storyboard fallback. With Manim installed (MANIM_PYTHON) the test
// checks that a model whose scenes never render still yields a video.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Catalog, MessageProcessor} from '@a2ui/web_core';
import {MATH_CATALOG_ID, MATH_COMPONENT_APIS} from '../lib/a2ui/catalog-api';

const PY = process.env.MANIM_PYTHON || 'python3';
const hasManim = spawnSync(PY, ['-c', 'import manim'], {timeout: 60_000}).status === 0;

const ANSWER = [
  {t: 'p', md: 'For $|r|<1$ the partial sums approach $\\frac{1}{1-r}$ [1].'},
  {t: 'eq', tex: '\\sum_{n=0}^{\\infty} r^n = \\frac{1}{1-r}'},
  {t: 'steps', items: [{md: 'Write $S_N$.'}, {md: 'Subtract $rS_N$.', tex: '(1-r)S_N = 1-r^{N+1}'}, {md: 'Let $N\\to\\infty$.'}]},
  {t: 'followups', items: ['What if r = 1?']},
]
  .map((l) => JSON.stringify(l))
  .join('\n');

// A scene that always fails at render time (the attribute does not exist).
const BROKEN = 'from manim import *\n\nclass Broken(Scene):\n    def construct(self):\n        d = narrate(self, 0)\n        self.play(Circle().no_such_method(), run_time=d)\n';
const SCENE_REPLY = `TITLE: Partial sums climbing to a limit\nNARRATION:\n1. The partial sums grow.\n2. They approach one over one minus r.\nCODE:\n\`\`\`python\n${BROKEN}\`\`\``;

test('a requested animation is written separately, repaired, and falls back to a storyboard', {timeout: 600_000}, async () => {
  const calls: {kind: string; body: any}[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const system: string = body.messages[0].content;
    const kind = system.startsWith('You write one Manim') ? 'scene' : system.startsWith('You fix Manim') ? 'repair' : 'answer';
    calls.push({kind, body});
    const text = kind === 'answer' ? ANSWER : kind === 'scene' ? SCENE_REPLY : '```python\n' + BROKEN.replace('Broken', `Broken${calls.length}`) + '```';
    res.writeHead(200, {'content-type': 'text/event-stream'});
    for (const piece of text.match(/[\s\S]{1,40}/g)!) res.write(`data: ${JSON.stringify({choices: [{delta: {content: piece}}]})}\n\n`);
    res.write(`data: ${JSON.stringify({choices: [{delta: {}, finish_reason: 'stop'}]})}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const {port} = server.address() as AddressInfo;
  process.env.BONSAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MIOTTS_URL;

  try {
    const {answer} = await import('../lib/agent/answer');
    const events: any[] = [];
    await answer({question: 'Animate why the geometric series converges', surfaceId: 'an', engine: 'bonsai'}, (e) => events.push(e));
    assert.ok(!events.some((e) => e.type === 'error'), JSON.stringify(events.find((e) => e.type === 'error')));

    // The answer prompt asks for an animatable answer and no code.
    const answerCall = calls.find((c) => c.kind === 'answer')!;
    assert.match(answerCall.body.messages[0].content, /do not write any code/);
    // The scene call turns reasoning off and runs cooler.
    const sceneCall = calls.find((c) => c.kind === 'scene')!;
    assert.deepEqual(sceneCall.body.chat_template_kwargs, {enable_thinking: false});
    assert.equal(sceneCall.body.temperature, 0.6);
    assert.match(sceneCall.body.messages[1].content, /partial sums approach/);

    const processor = new MessageProcessor([new Catalog(MATH_CATALOG_ID, '1.0', MATH_COMPONENT_APIS)]);
    processor.processMessages(events.filter((e) => e.type === 'a2ui').map((e) => e.message));
    const surface = processor.model.surfacesMap.get('an')!;
    const body = surface.componentsModel.get('root')?.properties.body as string[];
    const types = body.map((id) => surface.componentsModel.get(id)?.type);
    // Video above the follow-ups.
    assert.ok(types.indexOf('Animation') >= 0 && types.indexOf('Animation') < types.indexOf('FollowUps'), types.join(','));
    const animId = body[types.indexOf('Animation')];
    if (!hasManim) assert.equal(surface.componentsModel.get(animId)?.properties.title, 'Partial sums climbing to a limit');
    const entry = surface.dataModel.get(`/anims/${animId}`) as any;

    if (hasManim) {
      assert.equal(calls.filter((c) => c.kind === 'repair').length, 2, 'two repair attempts');
      assert.equal(entry.status, 'ready', entry.message);
      assert.equal(entry.fallback, true);
      assert.match(entry.code, /class AnswerStoryboard/);
      // The card is renamed after the storyboard, not the failed scene.
      assert.equal(surface.componentsModel.get(animId)?.properties.title, 'Why the geometric series converges');
      // The model gave two lines for its own scene; the storyboard speaks one per beat.
      assert.ok(entry.narration.length >= 3, JSON.stringify(entry.narration));
    } else {
      // No renderer: the model's scene is shown for the user to run.
      assert.equal(entry.status, 'unavailable');
      assert.match(entry.code, /class Broken/);
    }
  } finally {
    server.close();
    delete process.env.BONSAI_BASE_URL;
  }
});
