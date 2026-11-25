import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderMathMarkdown} from '../lib/markdown-math';

test('escapes HTML, drops links, renders math and citations', () => {
  const html = renderMathMarkdown(
    'If $|r|<1$ the series **converges** [1, 2]. <script>alert(1)</script> [docs](javascript:alert(1))\n\n$$\\sum r^n = \\frac{1}{1-r}$$',
    {citeHref: (n) => `#src-${n}`},
  );
  assert.ok(!html.includes('<script>'), 'no raw script tag');
  assert.ok(html.includes('&lt;script&gt;'), 'script escaped');
  assert.ok(!html.includes('javascript:'), 'no javascript: href');
  assert.ok(html.includes('<strong>converges</strong>'), 'markdown bold');
  assert.ok(html.includes('href="#src-1"') && html.includes('href="#src-2"'), 'citations linked');
  assert.ok(html.includes('katex-display'), 'display math');
  assert.equal((html.match(/class="katex"/g) ?? []).length, 2, 'inline + display katex');
});

test('dollar amounts without a closing dollar stay text', () => {
  const html = renderMathMarkdown('It costs $5 today.');
  assert.ok(html.includes('$5'));
});
