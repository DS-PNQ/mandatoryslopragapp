// Markdown + KaTeX renderer for model-written text. Model output is untrusted:
// raw HTML is escaped before markdown parsing, links render as plain text,
// and KaTeX runs with trust disabled.

import katex from 'katex';
import {Marked} from 'marked';

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    link({text}) {
      return text;
    },
    image({text}) {
      return text;
    },
  },
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
    maxExpand: 500,
  });
}

export interface RenderOptions {
  /** Builds the href for citation [n]; omit to render citations as plain markers. */
  citeHref?: (n: number) => string;
  inline?: boolean;
}

export function renderMathMarkdown(source: string, options: RenderOptions = {}): string {
  const slots: string[] = [];
  const hold = (html: string) => `\uE000${slots.push(html) - 1}\uE001`;

  let text = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => hold(renderTex(tex.trim(), true)))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => hold(renderTex(tex.trim(), true)))
    .replace(/(^|[^\\$])\$((?:\\.|[^$\\\n])+?)\$/g, (_, pre: string, tex: string) => pre + hold(renderTex(tex, false)))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => hold(renderTex(tex, false)))
    .replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (_, nums: string) =>
      hold(
        nums
          .split(',')
          .map((raw) => {
            const n = Number(raw.trim());
            return options.citeHref
              ? `<a class="cite" href="${options.citeHref(n)}" aria-label="Source ${n}">${n}</a>`
              : `<span class="cite">${n}</span>`;
          })
          .join(''),
      ),
    );

  text = escapeHtml(text);
  const html = (options.inline ? marked.parseInline(text) : marked.parse(text)) as string;
  return html.replace(/\uE000(\d+)\uE001/g, (_, i: string) => slots[Number(i)]);
}
