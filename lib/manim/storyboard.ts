// A Manim scene built from the answer itself, with no model in the loop.
//
// It is the last resort when the model's own scene fails to render after the
// repair attempts: a narrated sequence of title, key formulas and steps. Its
// code is generated here from fixed templates, so it renders whenever Manim
// does, and every answer that asked for an animation gets a video.

import type {Block} from '../agent/blocks';
import {speakable} from '../tts/miotts';

export interface Beat {
  /** Display LaTeX, if the beat shows a formula. */
  tex?: string;
  /** One or two lines of caption text. */
  caption: string;
}

export interface Storyboard {
  title: string;
  beats: Beat[];
  /** One spoken line per beat (the scene calls narrate(self, i) for beat i). */
  narration: string[];
}

// TeX commands the runner refuses; a formula that has one is dropped.
const TEX_DENY =
  /\\(input|include|openin|openout|read|write|immediate|catcode|verbatiminput|lstinputlisting|usepackage|RequirePackage|InputIfFileExists|includegraphics|special|csname|jobname|directlua|pdffiledump|pdfximage|filecontents|ShellEscape)\b/;

function plain(md: string): string {
  return md
    .replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ')
    .replace(/\[(\d+)\]/g, '')
    .replace(/[*`#>]/g, '')
    // Underscores as markdown emphasis go; S_N (a subscript) stays.
    .replace(/(^|\s)_+|_+(?=[\s.,;:!?)]|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(text: string, max = 150): string {
  const m = text.match(/^(.{20,}?[.!?])(\s|$)/);
  const s = (m ? m[1] : text).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const GLYPHS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', lambda: 'λ',
  mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Sigma: 'Σ', Delta: 'Δ',
  infty: '∞', sum: 'Σ', prod: 'Π', int: '∫', partial: '∂', nabla: '∇', cdot: '·', times: '×', le: '≤',
  leq: '≤', ge: '≥', geq: '≥', neq: '≠', approx: '≈', to: '→', rightarrow: '→', Rightarrow: '⇒', in: '∈',
  forall: '∀', exists: '∃', pm: '±', ldots: '…', cdots: '⋯', mid: '|',
};
const SUP: Record<string, string> = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ', 'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ'};
const SUB: Record<string, string> = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'};

function script(s: string, map: Record<string, string>, mark: string): string {
  const all = [...s].every((c) => c in map);
  if (all) return [...s].map((c) => map[c]).join('');
  return `${mark}${s.length === 1 ? s : `(${s})`}`;
}

/** Inline LaTeX as Unicode text for the screen: "\frac{1}{1-r}" -> "1/(1-r)". */
export function texToUnicode(tex: string): string {
  let s = tex;
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => {
      const g = (x: string) => (/^\\?\w+$/.test(x.trim()) ? x : `(${x})`);
      return `${g(a)}/${g(b)}`;
    });
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  }
  s = s
    .replace(/\\(?:mathbb|mathbf|mathrm|mathcal|text|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\\(left|right|displaystyle|quad|qquad|[,;!])/g, ' ')
    .replace(/\\([A-Za-z]+)/g, (_, c: string) => GLYPHS[c] ?? c)
    .replace(/\^\{([^{}]*)\}|\^(\w)/g, (_, a?: string, b?: string) => script(a ?? b ?? '', SUP, '^'))
    .replace(/_\{([^{}]*)\}|_(\w)/g, (_, a?: string, b?: string) => script(a ?? b ?? '', SUB, '_'))
    .replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** Caption text for the screen: inline math as Unicode, then wrapped. */
function caption(md: string, max = 120): string {
  const text = plain(md.replace(/\$([^$]+)\$/g, (_, t: string) => texToUnicode(t)));
  return wrap(firstSentence(text.replace(/\s+([.,;:])/g, '$1'), max), 46);
}

/** A sentence for the voice: math read as words. */
function spoken(md: string): string {
  return speakable(
    plain(md)
      .replace(/\|([^|]{1,12})\|/g, ' the absolute value of $1 ')
      .replace(/<=|\\le(q)?\b/g, ' at most ')
      .replace(/>=|\\ge(q)?\b/g, ' at least ')
      .replace(/</g, ' is less than ')
      .replace(/>/g, ' is greater than ')
      .replace(/=/g, ' equals '),
  );
}

function wrap(text: string, width: number): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3).join('\n');
}

function safeTex(tex: string | undefined): string | undefined {
  if (!tex) return undefined;
  const t = tex.trim();
  return t && t.length <= 300 && !TEX_DENY.test(t) ? t : undefined;
}

/** Picks up to five beats from the answer: the claim, formulas, and steps. */
export function storyboardFromBlocks(question: string, blocks: Block[], narration?: string[]): Storyboard {
  const beats: Beat[] = [];
  const firstP = blocks.find((b): b is Extract<Block, {t: 'p'}> => b.t === 'p');
  const eqs = blocks.filter((b): b is Extract<Block, {t: 'eq'}> => b.t === 'eq');
  const steps = blocks.flatMap((b) => (b.t === 'steps' ? b.items : []));
  const stmt = blocks.find((b): b is Extract<Block, {t: 'stmt'}> => b.t === 'stmt');

  const said: string[] = [];
  if (firstP) {
    beats.push({caption: caption(firstP.md), tex: safeTex(eqs[0]?.tex)});
    said.push(firstSentence(spoken(firstP.md), 200));
  }
  if (stmt) {
    beats.push({caption: caption(`${stmt.kind}. ${stmt.md}`)});
    said.push(firstSentence(spoken(`${stmt.kind}. ${stmt.md}`), 200));
  }
  for (const s of steps) {
    if (beats.length >= 5) break;
    beats.push({caption: caption(s.md), tex: safeTex(s.tex)});
    said.push(firstSentence(spoken(s.md), 200));
  }
  for (const e of eqs.slice(firstP ? 1 : 0)) {
    if (beats.length >= 5) break;
    beats.push({caption: '', tex: safeTex(e.tex)});
    said.push('This is the formula to remember.');
  }
  if (beats.length === 0) {
    beats.push({caption: wrap(firstSentence(question), 46)});
    said.push(speakable(question));
  }

  const lines = narration && narration.length >= beats.length ? narration.slice(0, beats.length) : said;
  // "Animate why the series converges" -> "Why the series converges".
  const asked = question
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*(please\s+)?(can you\s+)?(animate|visuali[sz]e|illustrate|show( me)?|draw)\s+/i, '')
    .trim();
  const title = firstSentence(asked.charAt(0).toUpperCase() + asked.slice(1), 60).replace(/[.?!]$/, '');
  return {title, beats, narration: lines.map((s) => s.slice(0, 260))};
}

/** Python string literal (JSON strings are valid Python literals). */
function py(s: string): string {
  return JSON.stringify(s);
}

/** Scene source for a storyboard. Uses only Text and MathTex. */
export function storyboardScene(board: Storyboard): string {
  const beats = board.beats
    .map((b) => `            (${b.tex ? py(b.tex) : 'None'}, ${py(b.caption)}),`)
    .join('\n');
  return `from manim import *


def formula(tex):
    try:
        m = MathTex(tex, font_size=54, color=WHITE)
    except Exception:
        m = Text(tex, font_size=36, color=WHITE)
    if m.width > 12:
        m.scale_to_fit_width(12)
    return m


class AnswerStoryboard(Scene):
    def construct(self):
        self.camera.background_color = "#0b1220"
        title = Text(${py(board.title)}, font_size=40, color="#9fd8ff")
        if title.width > 12.5:
            title.scale_to_fit_width(12.5)
        title.to_edge(UP, buff=0.5)
        rule = Line(LEFT * 6, RIGHT * 6, color="#2b3b55").next_to(title, DOWN, buff=0.25)
        self.play(Write(title), Create(rule), run_time=1.0)
        beats = [
${beats}
        ]
        shown = None
        for i, (tex, words) in enumerate(beats):
            d = narrate(self, i)
            parts = []
            if tex:
                parts.append(formula(tex))
            if words:
                text = Text(words, font_size=32, color="#e6edf7", line_spacing=1.1)
                if text.width > 12.5:
                    text.scale_to_fit_width(12.5)
                parts.append(text)
            group = VGroup(*parts).arrange(DOWN, buff=0.6).move_to(DOWN * 0.4)
            if shown is not None:
                self.play(FadeOut(shown, shift=UP * 0.3), run_time=0.4)
                d = max(0.6, d - 0.4)
            self.play(FadeIn(group, shift=UP * 0.3), run_time=min(1.2, d * 0.4))
            if tex:
                box = SurroundingRectangle(group[0], color="#4cc2ff", buff=0.2, corner_radius=0.1)
                self.play(Create(box), run_time=min(0.8, d * 0.2))
                # Create() adds the box to the scene on its own; move it into the
                # group so the next FadeOut(shown) takes it away too.
                self.remove(box)
                group.add(box)
                self.add(group)
            self.wait(max(0.3, d - min(1.2, d * 0.4) - (min(0.8, d * 0.2) if tex else 0)))
            shown = group
        self.wait(0.6)
`;
}
