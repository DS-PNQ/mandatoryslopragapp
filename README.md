# Lemma

Lemma is a math notebook. Add your own sources (lecture PDFs, Word documents, text files, photos of a whiteboard or a problem sheet), keep the built-in library of study notes switched on or off, and ask questions in plain words or LaTeX. Answers are typeset like a page from a handbook: numbered display equations, ordered derivation steps, theorem statements, and a citation on every claim that points back to the passage, page or image it came from. Ask it to animate an idea and the model writes a [Manim](https://www.manim.community/) scene that the server renders to a short video, narrated by [MioTTS-0.6B](https://huggingface.co/Aratako/MioTTS-0.6B).

It combines two things:

- **A2UI** ([a2ui-project/a2ui](https://github.com/a2ui-project/a2ui)). The answer agent does not return text. It streams A2UI v1.0 messages (`createSurface`, `updateComponents`, `updateDataModel`) that describe the answer with a custom math component catalog, and the page renders them with `@a2ui/react`. Follow-up questions are A2UI actions.
- **e-means** ([arXiv:2611.09501](https://arxiv.org/abs/2611.09501), Bessa et al.), mini-batch k-means with exponential-moving-average centroids. It partitions the passage embeddings into the cells of an inverted-file (IVF) index, the use case the paper measures in its Appendix L.

## Your own sources

The left panel works like a notebook's source list. **Add sources** (or drag files onto the page, or paste an image into the question box) accepts:

| File | How it is read |
|---|---|
| PDF | Text extracted page by page with `unpdf`; citations name the page. A PDF with no text layer (a scan) is sent to the model as page images instead. |
| Word (`.docx`, `.doc`) | Text extracted with `mammoth` (`.docx`) or `word-extractor` (`.doc`). |
| Text (`.txt`, `.md`, `.tex`) | Used as is. |
| Image (PNG, JPEG, WebP, GIF) | Sent to the model as an image. Photos over 1.5 MB are scaled to 1800 px in the browser first. |

Files are 15 MB at most and a notebook holds 12. The server only parses an upload and returns its text; it stores nothing. The browser keeps the sources in IndexedDB, so they survive a reload, and sends the selected ones with each question. Each source has a switch, and so does the notes library.

At question time the uploads are split into passages of about 1,100 characters. If everything selected fits in about 14,000 characters it is all sent; otherwise BM25 picks the best six passages plus the opening of each file. Upload passages are numbered first, then up to three library passages (six when nothing is uploaded), then images. Images and scans need a vision model (Opus); LFM3 reads text only, and the composer says so when an image is selected.

## Animations with Manim

When a question asks to animate, visualize or illustrate something, when the composer's **Animate** switch is on, or when you click **Animate this with Manim** under an answer, the model adds one `anim` block with a Manim Community scene. The server renders it with `scripts/manim_runner.py` while the rest of the answer streams, and the answer shows a video with the scene code under it. If the render fails, the error goes back to the model once for a fix, and the fixed scene is rendered again.

Rendering is on when the server can import Manim: set `MANIM_PYTHON` to a Python that has it (default `python3`), or `LEMMA_MANIM=off` to turn it off. Without Manim (on Vercel, for example) the answer shows the scene code and the command to render it locally. With no LaTeX install the model is told to label with `Text` instead of `MathTex`.

```bash
pip install manim
```

Manim also needs Cairo and Pango (`apt install libcairo2-dev libpango1.0-dev ffmpeg` on Debian or Ubuntu, `brew install cairo pango ffmpeg` on macOS). `MANIM_QUALITY` picks `l` (480p, default), `m` or `h`.

The scene code is written by a model that may have read your uploads, so it is treated as untrusted:

- Before anything runs, the runner parses the code and refuses imports other than `manim`, `numpy`, `math` and a few maths modules; names and attributes that reach files, processes, the interpreter or Manim's config (`open`, `os`, `config`, `SVGMobject`, `Code`, `np.load`, …); any name or attribute starting with `_`; and TeX commands that read or write files.
- The code runs with a reduced set of builtins and an import hook, under CPU, memory and file-size limits, with a clean environment that holds no API keys, in a scratch directory, with a 120-second wall clock limit. TeX runs in paranoid mode without shell escape. Where unprivileged user namespaces work (most Linux hosts), the render has no network access at all.
- Videos are kept for 12 hours under the system temp directory (`LEMMA_ANIM_DIR` to change it) and served by `/api/animations/<id>`.

This is defence in depth, not a security boundary as strong as a container. On a shared server, run the app itself in a container or VM.

### Narration with MioTTS-0.6B

Each `anim` block also carries a `narration` list: a few plain-English sentences, one per step. The scene calls `narrate(self, i)` where sentence `i` should be heard; it starts the voice at that point in the video and returns the sentence's length in seconds, so the animation under it can take exactly that long. The runner lets the last sentence finish before the video ends, writes WebVTT captions from the real start times, and the page shows the captions track and a transcript.

The voice is [MioTTS-0.6B](https://huggingface.co/Aratako/MioTTS-0.6B) (Apache 2.0, English and Japanese, built on Qwen3-0.6B with the MioCodec-25Hz-24kHz codec), served by the official [MioTTS-Inference](https://github.com/Aratako/MioTTS-Inference) API. The app is a client of that API. Without it, videos are rendered silently with captions and estimated timing.

```bash
llama-server -hf Aratako/MioTTS-GGUF -hff MioTTS-0.6B-Q8_0.gguf --alias MioTTS -c 8192 --cont-batching --port 8000
```

```bash
git clone https://github.com/Aratako/MioTTS-Inference.git && cd MioTTS-Inference && uv sync
```

```bash
uv run python scripts/generate_preset.py --audio your-voice.wav --preset-id en_female --model-id Aratako/MioCodec-25Hz-24kHz --output-dir presets-24k
```

```bash
uv run python run_server.py --llm-base-url http://127.0.0.1:8000/v1 --llm-model MioTTS --codec-model Aratako/MioCodec-25Hz-24kHz --presets-dir presets-24k --port 8001
```

Then set `MIOTTS_URL=http://127.0.0.1:8001` (and `MIOTTS_PRESET` if the preset has another id). The 0.6B model card names the 24 kHz codec, while the inference server defaults to its 44.1 kHz codec and ships presets encoded for that one, which is why the commands above build a preset with the 24 kHz codec. `MIOTTS_REFERENCE` can point at a short clip to clone instead of a preset. The Colab notebook does all of this on the GPU (section 6c). Note that the server's bundled presets and the model card's sample voices were generated with T5Gemma-TTS and gemini-2.5-pro-tts, which the inference repo says rules out commercial use of audio made with them; use a reference clip you have rights to for anything commercial.

## How a question is answered

1. **Embed.** The question is tokenized (LaTeX commands kept as words, so `\nabla` matches "nabla") and folded into the LSA space built from the notes: TF-IDF, then a truncated SVD to 64 dimensions.
2. **Probe.** The nearest 8 of 32 e-means cells are scanned and the passages in them ranked by cosine similarity. The page reports how many passages were scanned and the recall against an exhaustive scan.
3. **Fuse.** BM25 ranks all passages lexically. Reciprocal rank fusion (k = 60) combines the two lists, and the top 6 passages go to the model.
4. **Write.** The model writes JSON Lines in a small block vocabulary (paragraph, equation, steps, statement, caveat, animation, follow-ups). The server validates each line and translates it into A2UI components, so the model can never place a component outside the catalog or inject HTML.
5. **Render.** The browser's A2UI `MessageProcessor` applies the messages as they arrive. Markdown is escaped before parsing, links are dropped, and KaTeX runs with `trust: false`.

## The e-means implementation

`lib/rag/emeans.ts` follows Algorithm 1 of the paper:

- EMA count and sum per cluster (Eq. 2–4), with `N_j` initialised at 1e-10 so the random initial centroids carry almost no weight
- cosine-annealed step α(t) from α₀ down to 0.1·α₀ (Eq. 5)
- dead-cluster revival every 5 batches: clusters under τ = 0.1 of the mean count take half of a donor drawn in proportion to its count, split by a ±δ perturbation with δ = 2⁻⁷ (Appendix H)
- last-epoch-mean finalization (Section 3.2)
- the paper's scaling laws for the peak step α₀ (Eq. 6) and batch size B (Eq. 7)
- k = 4√n rounded to a power of two, as in the paper's IVF experiments

The Library page (`/library`) shows the result against Lloyd's algorithm, as medians over 9 seeds. On this corpus e-means beats Lloyd's 25-iteration loss with a 12-epoch budget, not the 1.4–2.6 epochs the paper reports. That is expected: the paper's laws are fitted on millions of vectors, and here there are 110 vectors, about 3.4 per cell.

## Models

The composer lets you choose the model for each question. Configure at least one; with none, the app runs in retrieval-only mode and quotes the best passages.

| Model | Configure |
|---|---|
| Opus 5.5 (Anthropic API) | `ANTHROPIC_API_KEY` |
| LFM3 1.7B (Liquid AI, open weights), local | `LFM3_BASE_URL` pointing at llama.cpp or Ollama |
| LFM3 1.7B, hosted on OpenRouter | `OPENROUTER_API_KEY` (model `liquid/lfm-3-1.7b`) |
| Ternary Bonsai 2.5 27B (PrismML, Apache 2.0), local | `BONSAI_BASE_URL` pointing at llama.cpp; `BONSAI_VISION=1` if the server loaded the mmproj |

Opus requests stream with adaptive thinking at `high` effort and use the server-side refusal fallback. LFM3 requests use the model card's math sampling (temperature 1.0, top_p 0.95, top_k 20). LFM3 reasons by default, so its `<think>` trace is filtered out of the answer and shown as a progress line instead.

## Run it locally

Requires Node 20 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Then fill in at least one model in `.env.local`. To run LFM3 on your machine with llama.cpp (b11960 or newer):

```bash
llama-server -hf LiquidAI/LFM3-1.7B-GGUF:Q4_K_M --jinja --port 8080
```

and set `LFM3_BASE_URL=http://127.0.0.1:8080/v1`. With Ollama 0.40.12 or newer, run `ollama run lfm3` and set `LFM3_BASE_URL=http://127.0.0.1:11434/v1` and `LFM3_MODEL=lfm3`.

To add Ternary Bonsai 2.5 27B (a 7.7 GB ternary-weight reasoning model with vision), use llama.cpp b11556 or newer. Older builds load the `Q2_0` file without an error and produce garbage.

```bash
llama-server -hf prism-ml/Ternary-Bonsai-2.5-27B-GGUF:Q2_0 --jinja -ngl 99 -fa on -c 40960 -np 1 --min-p 0 --port 8095
```

Then set `BONSAI_BASE_URL=http://127.0.0.1:8095/v1`. The Colab notebook starts it for you on GPUs with 20 GB or more.

Start the app:

```bash
npm run dev
```

It opens on http://localhost:3000. `npm run dev` and `npm run build` rebuild the index from `content/notes/` first, which takes about a second.

## Run it on Kaggle (2× T4, LFM3 local)

`kaggle/lemma-lfm3-t4x2.ipynb` runs the whole app inside a Kaggle notebook, with no API key. It builds llama.cpp with CUDA for the T4, serves LFM3 1.7B from both GPUs (Q8_0 by default), builds and starts the app against it, and opens a Cloudflare quick tunnel so you can use the web UI from your browser. It also has an `ask()` helper that queries the app from inside the notebook.

1. On Kaggle, go to **Create → Notebook → File → Import Notebook** and upload the `.ipynb`.
2. Under **Settings**, set **Accelerator** to **GPU T4 x2** and turn **Internet** on.
3. Click **Run All** in an interactive session and wait for the `trycloudflare.com` link in section 9.

The first run takes about 10–15 minutes, mostly compiling llama.cpp. The compiled binary is saved to `/kaggle/working/bin/llama-server`. Publish it as a dataset and attach that dataset, and later runs skip the build. Optional Kaggle secrets: `GITHUB_TOKEN` (private repository), `HF_TOKEN`, and `ANTHROPIC_API_KEY` (also enables Opus).

## Run it on Google Colab (one GPU, LFM3 local)

`colab/lemma-lfm3-colab.ipynb` does the same on a Colab GPU runtime: the free T4, or an L4 or A100. It installs a prebuilt CUDA llama.cpp and serves LFM3 1.7B on it. LFM3 is the app's only model in this notebook: hosted-model keys are removed from the app's environment, so every answer is generated on the runtime's GPU. You open the app through Colab's private port proxy, or through an optional public Cloudflare tunnel link.

1. In Colab, go to **File → Open notebook → GitHub**, paste `https://github.com/DS-PNQ/mandatoryslopragapp`, and pick `colab/lemma-lfm3-colab.ipynb`. You can also use **File → Upload notebook**.
2. Go to **Runtime → Change runtime type** and pick **T4 GPU** (or another GPU).
3. Choose **Runtime → Run all**. Section 9 prints the links.

Section 6b installs Manim (about 2 minutes) so animation answers render on the runtime, and section 6c serves MioTTS-0.6B on the GPU for the narration (3 to 5 minutes the first time). Set `INSTALL_MANIM = False` or `INSTALL_TTS = False` in the settings cell to skip either.

Nothing is compiled by default. llama.cpp comes from conda-forge's CUDA 12 build, which has native code for the T4, L4, A100 and H100 and takes about 2 minutes to install, while the app's `npm ci` and `next build` run in the background. The official llama.cpp Linux binaries are not used because they need glibc 2.38 and Colab runs Ubuntu 22.04. If the prebuilt install fails, or with `LLAMA_INSTALL = "source"`, the notebook compiles llama.cpp for the GPU instead (about 20–25 minutes on the free tier's 2 CPUs) and, with `CACHE_TO_DRIVE = True`, saves it to `MyDrive/lemma-cache` so later sessions reuse it. An optional `HF_TOKEN` Colab secret speeds up the model download.

## Tests

```bash
npm test
```

The tests run the Opus and LFM3 paths against local mock servers (no keys or network), and check that every message the agent emits passes the A2UI `MessageProcessor`'s validation for the catalog. They also cover the reasoning-trace filter, the markdown sanitizer, PDF/Word/image parsing, upload retrieval, the Manim scene validator (which needs only `python3`), and the MioTTS client against a mock of its API. The render test runs when `MANIM_PYTHON` points at a Python with Manim installed.

## Deploy on Vercel

The repository deploys as a standard Next.js project; `vercel.json` sets the build command. In the Vercel project settings, add `ANTHROPIC_API_KEY` and/or `OPENROUTER_API_KEY` as environment variables. A local `LFM3_BASE_URL` will not be reachable from Vercel, so use OpenRouter for LFM3 there.

Vercel functions accept request bodies up to 4.5 MB, so uploads are limited to about that size there, and Manim is not available, so animation answers show their scene code instead of a video.

## Adding notes

Each file in `content/notes/` is one note with frontmatter (`id`, `title`, `area`). Every `## ` section becomes one retrievable passage. Write math in `$…$` and `$$…$$`.

## Design

The interface was redesigned with the [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill, installed for this project only in `.claude/skills/ui-ux-pro-max/` (Claude Code picks it up when working in this repository). Its design system for Lemma is in `design-system/lemma/`: `MASTER.md` and `tokens.css` as generated (Swiss-minimal layout, Inter), and `pages/notebook.md` for the page-level choices: a liquid theme (glass on the top bar, sources panel and pills, drifting liquid shapes behind the page, a droplet mark), Instrument Serif for names and titles, and the palette, cloud gray and ocean teal in light mode, black and arctic blue in dark mode. Light and dark themes follow the system setting, and the sun/moon button in the top bar overrides it.

## Layout

```
content/notes/              the library (21 notes, 110 passages)
lib/rag/                    tokenizer, LSA, e-means, IVF + BM25 retrieval
lib/uploads/                file parsing (PDF, Word, text, images) and upload retrieval
lib/manim/render.ts         Manim render service (sandbox, queue, cleanup)
lib/tts/miotts.ts           MioTTS-0.6B narration client
scripts/manim_runner.py     validates and renders one scene
lib/a2ui/catalog-api.ts     the math component catalog (Zod schemas)
lib/agent/                  answer pipeline, model clients, A2UI surface writer
components/catalog.tsx      React implementations of the catalog
components/Workspace.tsx    notebook workspace (sources, streaming, composer)
components/SourcesPanel.tsx the sources list
app/api/                    ask, upload, and animation video routes
app/library/                index report and e-means training curves
scripts/build-index.ts      builds generated/index.json
design-system/lemma/        UI UX Pro Max design system and page overrides
.claude/skills/ui-ux-pro-max/  the design skill, project-scoped
```
