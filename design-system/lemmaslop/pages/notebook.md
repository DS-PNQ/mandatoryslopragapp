# Notebook page overrides

These rules override `../MASTER.md` for the notebook (`/`) and the library (`/library`). Everything not listed here follows MASTER.

Generated with UI UX Pro Max (`.claude/skills/ui-ux-pro-max`):

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "AI research assistant document workspace productivity" \
  --design-system -p "Lemma" --density 6 --motion 3 --variance 3 --persist --tokens css --output-dir .
```

The first query tried ("AI research notebook education math study tool") returned Claymorphism with Baloo 2 / Comic Neue, a children's-education direction. The audience is university students, so it was rejected and the query rewritten, as the skill's "Re-run with different keywords" rule suggests.

## Layout

- NotebookLM-style workspace: a 312px **Sources** panel (uploads + the notes library, each with an on/off switch) and the session's questions on the left; the conversation on the right; the composer docked at the bottom.
- Below 900px the panel becomes an off-canvas drawer opened from a "Sources" button (Escape and the scrim close it).
- The conversation is a chat: one 860px column, the user's question as a teal bubble on the right, LemmaSlop's reply on the left under the melting-QED avatar, on an opaque answer sheet (see "Answer contrast" below).
- A reply's sources fold into one pill under it ("6 sources · note names"); clicking a citation opens it and jumps to the passage. Retrieval statistics are not shown in the chat (the Library page explains retrieval).
- The notebook is mounted in the root layout, so opening the Library tab and coming back keeps the session, including an answer still streaming. A page reload still starts a new session.

## Liquid theme

From the skill's "Liquid Glass" style (`"liquid glass fluid" --domain style`): translucent, blurred material used sparingly on navigation and controls (top bar, sources panel, pills, starter cards), while answers and the question box stay solid so content reads clearly. Three slowly drifting, blurred liquid shapes sit behind the page in the theme colors. The mark is a droplet holding the end-of-proof square, the send button is a glossy drop, and an animation that is rendering shows a flowing fill. Under `prefers-reduced-transparency` the glass turns solid and the shapes are hidden; under `prefers-reduced-motion` nothing drifts or flows.

## Answer contrast (LemmaSlop update)

Replies used to sit straight on the page, so the drifting liquid shapes showed through behind the serif text and it read gray-on-gray. Following the skill's contrast rules (`"text contrast glass background readability" --domain ux`: darker text on light backgrounds, no gray-on-gray, 4.5:1 minimum; the Glassmorphism row's "Text contrast 4.5:1 checked" requirement), each reply now sits on an opaque sheet with a teal-tinted edge and a soft shadow, and the ink is near-black:

| | Light | Dark |
|---|---|---|
| Answer sheet | `#FFFFFF` | `#11161D` |
| Answer ink | `#0D1117` (18.9:1) | `#F2F5F9` (16.6:1) |
| Bold and KaTeX | `#000000` | `#FFFFFF` |

Body weight is 430 (Newsreader's variable axis) with line height 1.66. Equations and caveats inside the sheet use tints of the sheet instead of their own glass.

## Logo

The droplet mark was redesigned for the LemmaSlop name with the [logo-design skill](https://github.com/kaankiziltug/logo-design-skill) (installed for this project in `.claude/skills/logo-design/`). Concepts, test sheet and the chosen mark are in `design-system/lemmaslop/logo/`; see the README there.

## Typography

- Names and titles (wordmark, page titles, questions, animation titles): **Instrument Serif** (OFL), a condensed editorial serif chosen as a distinctive display face in the spirit of Hyperliquid's refined serif titles. Hyperliquid's own font could not be checked from the build environment, and its brand typeface is not assumed to be free to use.
- UI: **Inter** (MASTER).
- Answer prose: **Newsreader** (serif) at 18px. Long-form mathematical reading is the core task and the serif sets KaTeX output better than Inter. From the typography search, the "Academic/Research" pairing (Crimson Pro / Atkinson) was the closest match; Newsreader was already bundled and serves the same role.
- Code and numbers: JetBrains Mono.

## Palette (overrides MASTER colors, as the project owner asked)

MASTER's teal-on-mint with an orange CTA was replaced by two two-color themes: **cloud gray + ocean teal** for light and **dark black + arctic blue** for dark. The palette search (`--domain color`) had no ready-made match for these pairs, so the values below were set by hand and checked against WCAG.

| Role | Light | Dark |
|---|---|---|
| Background | `#ECEFF3` cloud gray | `#07090C` black |
| Card | `#FFFFFF` | `#0F1217` |
| Primary / CTA | `#0E7C86` ocean teal, white text 4.95:1 | `#8BD3F7` arctic blue, dark text 11.5:1 |
| Primary as text | `#0B6670` (6.7:1 on white) | `#A9DEFA` (10.5:1 on its wash) |
| Secondary marker (animations, uploads) | `#155E75` deep ocean | `#C7EBFF` ice |
| Headings | `#0B3D47` (10.3:1) | `#DFF1FF` |
| Body text | `#1F2933` (12.8:1) | `#E3E8EF` (16.2:1) |
| Muted text | `#4A5563` (6.6:1) | `#9AA6B5` (7.6:1) |
| Switch off-track (non-text, needs 3:1) | `#7E8B98` (3.5:1) | `#606C7C` (3.5:1) |

## Components

- **Composer:** source chips (click × to stop using a source for the next question), textarea (Enter to ask, Shift+Enter for a new line, paste an image to add it), paperclip, **Animate** toggle (`aria-pressed`), model segmented control, round send button in the primary color.
- **Animation (Manim):** 16:9 card with a "Manim" badge. States: rendering (striped placeholder, spinner, live status text), ready (video with controls, poster = last frame, never autoplays, download link), failed / unavailable (reason plus the scene code to run locally). Scene code sits in a collapsible block with a copy button.
- **Follow-ups:** pill buttons; "Animate this with Manim" is styled in the accent color.
- Icons: Lucide-style SVG strokes at 1.75 width (`components/icons.tsx`). No emoji.

## Motion

Subtle (dial 3/10): 160–220ms color and position transitions, a 4px settle-in for new answer blocks, a pulsing dot while busy. All of it is disabled under `prefers-reduced-motion`.
