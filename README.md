# LemmaSlop

<img src="design-system/lemmaslop/logo/a-melting-qed-v3.svg" alt="LemmaSlop mark" width="96">

LemmaSlop (formerly Lemma) is a math notebook. Add your own sources (lecture PDFs, Word documents, text files, photos of a whiteboard or a problem sheet), keep the built-in library of study notes switched on or off, and ask questions in plain words or LaTeX. Answers are typeset like a page from a handbook: numbered display equations, ordered derivation steps, theorem statements, and a citation on every claim that points back to the passage, page or image it came from. Ask it to animate an idea and the model writes a [Manim](https://www.manim.community/) scene that the server renders to a short video, narrated by [MioTTS-0.6B](https://huggingface.co/Aratako/MioTTS-0.6B); if the scene cannot be made to render, a storyboard of the answer is rendered instead, so an animation request always ends in a video.

It combines two things:

- **A2UI** ([a2ui-project/a2ui](https://github.com/a2ui-project/a2ui)). The answer agent does not return text. It streams A2UI v1.0 messages (`createSurface`, `updateComponents`, `updateDataModel`) that describe the answer with a custom math component catalog, and the page renders them with `@a2ui/react`. Follow-up questions are A2UI actions.
- **e-means** ([arXiv:2611.09501](https://arxiv.org/abs/2611.09501), Bessa et al.), mini-batch k-means with exponential-moving-average centroids. It partitions the passage embeddings into the cells of an inverted-file (IVF) index, the use case the paper measures in its Appendix L.

## Your own sources

The left panel works like a notebook's source list. **Add sources** (or drag files onto the page, or paste an image into the question box) accepts:

| File | How it is read |
|---|---|
| PDF | Text extracted page by page with `unpdf`; citations name the page. A PDF with no text layer (a scan) is transcribed once at upload: each page is rendered to an image and a vision model writes it out as Markdown with LaTeX (see below). Without a transcription model, the scan is sent to Opus as page images. |
| Word (`.docx`, `.doc`) | Text extracted with `mammoth` (`.docx`) or `word-extractor` (`.doc`). |
| Text (`.txt`, `.md`, `.tex`) | Used as is. |
| Image (PNG, JPEG, WebP, GIF) | Sent to the model as an image. Photos over 1.5 MB are scaled to 1800 px in the browser first. |

Files are 15 MB at most and a notebook holds 12. The server only parses an upload and returns its text; it stores nothing. The browser keeps the sources in IndexedDB, so they survive a reload, and sends the selected ones with each question. Each source has a switch, and so does the notes library.

At question time the uploads are split into passages of about 1,100 characters. If everything selected fits in about 14,000 characters it is all sent; otherwise BM25 picks the best six passages plus the opening of each file. Each selection of files is chunked and indexed once and cached by content hash, so later questions about the same files only score (see "Rust text core" below). Upload passages are numbered first, then up to three library passages (six when nothing is uploaded), then images. Images need a vision model (Opus, or Bonsai with its vision projector); LFM3 reads text only, and the composer says so when an image is selected.

### Scanned PDFs without Opus

When a transcription model is configured, a scanned PDF is read page by page as soon as it is uploaded. The panel shows "Read page 3 of 12" while this runs. After that the scan is stored as ordinary text, so every model can answer from it, search can rank its passages, and citations name the page. A page the model cannot read is marked in the text and counted in the panel; the rest still go through. If a run is interrupted, the scan keeps a **Transcribe** button to start it again.

The transcriber is any OpenAI-compatible vision endpoint:

| Setting | Transcriber |
|---|---|
| `BONSAI_BASE_URL` with `BONSAI_VISION=1` | Ternary Bonsai 2.5 27B (the default; the Colab notebook sets this up on GPUs with 20 GB or more) |
| `LEMMA_OCR_BASE_URL`, `LEMMA_OCR_MODEL` | A dedicated document model, for example olmOCR or dots.ocr served with vLLM. Takes precedence over Bonsai. |

Pages are rendered at 1600 px on the long side with `@napi-rs/canvas`, and sent with thinking turned off and a low temperature, so the model copies rather than paraphrases. Up to 60 pages are read (`LEMMA_OCR_MAX_PAGES`), and scans must be 8 MB or smaller.

## Animations with Manim

An animation is made when the question asks to animate, visualize or illustrate something (or to show something moving or changing), when the composer's **Animate** switch is on, or when you click **Animate this with Manim** under an answer. The server detects the request itself, so it no longer depends on the model choosing to animate.

Making the video is a pipeline built so that every request ends in one:

1. **The answer first.** The model writes the explanation, told to put the key formula in an equation block and the reasoning in short steps, and writes no code.
2. **A separate scene call.** The same model then gets the question and its own answer and writes one scene as plain Python in a fenced block, after a title and numbered narration lines, following a worked example. Code no longer travels as an escaped JSON string, which small models often broke. Open models run this call with reasoning off (`chat_template_kwargs.enable_thinking = false`) and temperature 0.6.
3. **Voice once.** The narration is voiced with MioTTS once and reused by every render attempt.
4. **Render, repair twice.** If the render fails or times out, the error and traceback go back to the model for a fix, up to `LEMMA_MANIM_REPAIRS` (default 2) times.
5. **Storyboard fallback.** If it still fails, the server renders a storyboard generated from the answer with fixed templates: the title, the key formulas boxed, and each step as a caption, narrated beat by beat. It renders whenever Manim does, and the player says it is a storyboard.

The code shown under a video, or in place of one, is runnable on its own: scenes call `narrate(self, i)`, which only the app's runner defines, so the displayed and copied code carries a small stand-in after its imports that returns each line's estimated length. `manim -pql scene.py` works on it as is (a test runs it with the Manim CLI).

The runner also forgives the mistakes that most often broke scenes: API names from older Manim versions (`ShowCreation`, `TextMobject`, `FadeInFromDown`, …) are aliased; `MathTex`/`Tex` fall back to Unicode text when LaTeX is not installed or a formula does not compile; `narrate()` with a wrong or repeated index takes the next unspoken line instead of raising; and narration lines the scene never called are still spoken after the last one.

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

Then set `MIOTTS_URL=http://127.0.0.1:8001` (and `MIOTTS_PRESET` if the preset has another id). The 0.6B model card names the 24 kHz codec, while the inference server defaults to its 44.1 kHz codec and ships presets encoded for that one, which is why the commands above build a preset with the 24 kHz codec. `MIOTTS_REFERENCE` can point at a short clip to clone instead of a preset. The Colab notebook does all of this on the GPU (section 5). Note that the server's bundled presets and the model card's sample voices were generated with T5Gemma-TTS and gemini-2.5-pro-tts, which the inference repo says rules out commercial use of audio made with them; use a reference clip you have rights to for anything commercial.

## How a question is answered

1. **Embed.** The question is tokenized (LaTeX commands kept as words, so `\nabla` matches "nabla") and folded into the LSA space built from the notes: TF-IDF, then a truncated SVD to 64 dimensions.
2. **Probe.** The nearest 8 of 32 e-means cells are scanned and the passages in them ranked by cosine similarity. The page reports how many passages were scanned and the recall against an exhaustive scan.
3. **Fuse.** BM25 ranks all passages lexically. With an embedding server configured, a neural dense ranking is added as a third list (see below). Reciprocal rank fusion (k = 60) combines the lists.
4. **Rerank.** With a reranker configured, the 20 best fused passages are scored by a cross-encoder that reads the question and each passage together, and the top 6 go to the model. Without one, the top 6 fused passages do.
5. **Write.** The model writes JSON Lines in a small block vocabulary (paragraph, equation, steps, statement, caveat, animation, follow-ups). The server validates each line and translates it into A2UI components, so the model can never place a component outside the catalog or inject HTML.
6. **Render.** The browser's A2UI `MessageProcessor` applies the messages as they arrive. Markdown is escaped before parsing, links are dropped, and KaTeX runs with `trust: false`.

## Neural retrieval (optional)

The built-in index needs no server and runs anywhere, Vercel included. Two optional llama-server endpoints improve on it, following what recent retrieval studies find strongest for the cost: hybrid lexical + dense retrieval fused with RRF, then a cross-encoder rerank of the fused candidates (e.g. [arXiv:2604.01733](https://arxiv.org/abs/2604.01733), where adding a reranker gave the largest single gain).

| Stage | Model | Configure |
|---|---|---|
| Dense embeddings | [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) or [EmbeddingGemma 2](https://huggingface.co/ggml-org/embeddinggemma-2-GGUF) (both Apache 2.0) | `LEMMA_EMBED_URL`, `LEMMA_EMBED_MODEL` |
| Reranker | [Qwen3-Reranker-0.6B](https://huggingface.co/ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF) (Apache 2.0) | `LEMMA_RERANK_URL` |

```bash
llama-server -hf Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0 --embedding --pooling last -c 8192 -b 8192 -ub 8192 --port 8097
```

or, smaller and faster on a CPU (set `LEMMA_EMBED_MODEL=embeddinggemma-2`; needs a llama.cpp recent enough to know the `gemma-embedding2` architecture):

```bash
llama-server -hf ggml-org/embeddinggemma-2-GGUF:Q8_0 --embedding --pooling mean -c 8192 -b 8192 -ub 8192 --port 8097
```

```bash
llama-server -hf ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF --reranking -c 8192 -b 4096 -ub 4096 --port 8098
```

Then set `LEMMA_EMBED_URL=http://127.0.0.1:8097/v1` and `LEMMA_RERANK_URL=http://127.0.0.1:8098/v1`. Choices in `lib/rag/neural.ts` and `lib/rag/hybrid.ts`:

- **Dense order first.** With an embedder, its ranking decides; LSA and BM25 only break ties and add candidates after it. Equal-weight fusion, the usual hybrid recipe, cost a third of the top hits on this app's questions (see "Choosing the embedder" below). Without an embedder, LSA and BM25 are fused with equal weights as before. `LEMMA_FUSION_WEIGHTS="lsa,bm25,neural"` overrides the weights.
- **Each model's own prompts.** Qwen3-Embedding gets an instruction on queries (its model card reports 1–5% lower retrieval without one) and bare passages. EmbeddingGemma 2 gets `task: search result | query: …` and `title: <note § section> | text: …`, its documented retrieval format. The format follows the model name, or `LEMMA_EMBED_PROMPTS`. `LEMMA_EMBED_DIM` truncates vectors (Matryoshka) for either.
- **Context headers.** Each passage is embedded with its note and section ("Infinite series § Ratio test") or its file and page, the cheap form of contextual retrieval: a chunk that says "the series converges" is embedded knowing which series.
- **LaTeX verbalised for the embedder.** `\sum` becomes "sum" and `x^2` "x squared", since embedding natural-language statements of theorems beats embedding raw LaTeX ([arXiv:2602.05216](https://arxiv.org/abs/2602.05216)). The answer model still reads the original text.
- **Uploads too.** Large uploads (over about 14,000 characters) are ranked by BM25 and embeddings fused with RRF, then reranked. Vectors are cached by content hash, so each passage is embedded once per server process; the library is embedded once, on the first question.
- **Never blocking.** Every call has a timeout; a failing endpoint is skipped for a minute and retrieval falls back to the built-in index.

### Choosing the embedder

[EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2) (Google DeepMind, October 2026, Apache 2.0) is a 740M-parameter multimodal embedder whose text path is only 270M parameters: 768-dimensional vectors with Matryoshka truncation to 512, 256 or 128, an 8K-token context, and a 310 MB `Q8_0` GGUF, half the size of Qwen3-Embedding-0.6B. Google reports MTEB English v2 68.5 (Qwen3-Embedding-0.6B's card: 70.7) and a large gain on code retrieval over EmbeddingGemma 1 (78.7 vs 68.8). It must run in bfloat16 or float32, not float16, which returns NaNs.

To decide between them for this app, `bench/embed-eval.ts` runs 52 student-style questions, worded away from the section titles, each with its correct library passage (`bench/retrieval-eval.json`), through the app's own `searchLibrary()`. It ran on CPU here: llama.cpp built from source, 4 threads, `Q8_0` files.

| Configuration | Hit@1 | Recall@6 | Recall@20 | MRR@10 | Per question (CPU) | Embed library (CPU) |
|---|---|---|---|---|---|---|
| Built-in only: LSA + e-means + BM25 | 61.5% | 86.5% | 92.3% | 0.702 | <1 ms | none |
| Qwen3-Embedding, equal-weight fusion (previous version) | 69.2% | 90.4% | 100% | 0.781 | 153 ms | 34 s |
| **Qwen3-Embedding, dense-first (now)** | **92.3%** | **100%** | 100% | **0.958** | 102 ms | 31 s |
| EmbeddingGemma 2, equal-weight fusion | 59.6% | 92.3% | 100% | 0.728 | 22 ms | 12 s |
| **EmbeddingGemma 2, dense-first (now)** | **76.9%** | **98.1%** | 100% | **0.851** | 25 ms | 12 s |
| EmbeddingGemma 2 alone, "question answering" prompt | 75.0% | 98.1% | 100% | 0.835 | | |
| EmbeddingGemma 2 alone, truncated to 256-d | 71.2% | 98.1% | 100% | 0.815 | | |

What this says:

- **Qwen3-Embedding retrieves better on maths.** It puts the right passage first 92% of the time against EmbeddingGemma 2's 77%; both have it in the top six almost always. With six passages going to the model, both work, but Qwen3's first passage is more often the one that matters.
- **EmbeddingGemma 2 is the CPU and low-memory choice.** It is 4× faster per question and 2.7× faster at embedding the library on a CPU, at half the size. The Colab notebook uses it when Qwen3 does not fit on the GPU next to Bonsai.
- **Fusion weights mattered more than the model.** The usual hybrid recipe, equal-weight RRF with BM25, lowered both models, since on these questions the lexical lists are much weaker than the dense one. `bench/fusion-eval.ts` swept the weights: any weight that let BM25 or LSA reorder the dense list lowered hit@1, and on 12 exact-term questions (theorem names, acronyms: `bench/retrieval-eval-terms.json`) adding BM25 and LSA at any weight changed nothing for either model (Qwen3 92% hit@1, equal to the lexical baseline; EmbeddingGemma 2 83%). So the dense order now decides.
- **Prompt and truncation.** EmbeddingGemma 2's "search result" prompt edged out "question answering" (MRR 0.851 vs 0.835) and is the default (`LEMMA_EMBED_GEMMA_TASK`). Truncating to 256 dimensions cost 6 points of hit@1 for no practical saving on a 110-passage library.

Caveats: 52 questions is a small set (one question is about 2 points), the notes library is the only corpus measured, and uploads were not evaluated. Run it yourself with the servers above:

```bash
EVAL_QWEN_URL=http://127.0.0.1:8202/v1 EVAL_GEMMA_URL=http://127.0.0.1:8201/v1 npx tsx bench/embed-eval.ts
```

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
| Ternary Bonsai 2.5 27B (PrismML, Apache 2.0), local | `BONSAI_BASE_URL` pointing at llama.cpp; `BONSAI_VISION=1` if the server loaded the mmproj. Faster with MTP speculative decoding (below) |

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

Then set `BONSAI_BASE_URL=http://127.0.0.1:8095/v1`. The Colab notebook starts it for you.

### Speculative decoding for Bonsai

Bonsai 2.5's `-mtp.gguf` files carry a multi-token-prediction (MTP) draft head trained by PrismML: one extra layer that guesses the next few tokens from the model's hidden state, which the 27B model then verifies in a single pass, keeping only the tokens it would have produced. That makes it the best drafter for this model:

- **Same output.** PrismML measures a mean KL divergence of 5.2×10⁻⁵ between drafting on and off, no higher than a control that accepts every guess.
- **Faster decoding, where LemmaSlop spends its time.** 1.5–1.8× on NVIDIA GPUs at 3 drafts and minimum probability 0.1 (A100: 105 → 171 tok/s; RTX 4090: 111 → 204 tok/s, PrismML's measurements). Prefill is 9–23% slower because the head makes its own pass over the prompt, but answers here include hundreds of reasoning tokens, so decoding dominates.
- **No second model.** The head adds 0.2 GB, and the `PTQ1_0-mtp` file (6.2 GB) is smaller than stock `Q2_0` (7.7 GB). A separate draft model would need Bonsai's tokenizer and VRAM a T4 does not have, and PrismML has released no separate drafter for 2.5.

It needs PrismML's llama.cpp build ([releases](https://github.com/PrismML-Eng/llama.cpp/releases); the Colab notebook pins `prism-b12178-03ec600`, whose CUDA 12.4 Linux build carries sm_70/sm_80 code for T4, L4 and A100):

```bash
llama-server -m Ternary-Bonsai-2.5-27B-PTQ1_0-mtp.gguf --mmproj Ternary-Bonsai-2.5-27B-mmproj-Q8_0.gguf --jinja -ngl 99 -fa on -c 40960 -np 1 --temp 1.0 --top-p 0.95 --top-k 20 --min-p 0 --spec-type draft-mtp --spec-draft-n-min 0 --spec-draft-n-max 3 --spec-draft-p-min 0.1 --port 8095
```

Check that drafting is active in any response's `timings` (`draft_n`, `draft_n_accepted`). Prompt n-gram drafting (`--spec-type draft-mtp,ngram-mod`) can be added on top; it only drafts when the output repeats the context, such as a scene repair re-emitting code, and is experimental here. Stock llama.cpp with the `Q2_0` file has no MTP support; there the notebook tries `ngram-mod` and keeps it only if the server starts and answers correctly.

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

## Run it on Google Colab (one GPU, everything local)

`colab/lemmaslop-colab.ipynb` runs the whole app on a Colab GPU runtime (the free T4, or an L4 or A100), with no API key. Hosted-model keys are removed from the app's environment, so every answer is generated on the runtime's GPU.

- **Ternary Bonsai 2.5 27B** answers, on PrismML's llama.cpp build with **MTP speculative decoding** (section 6). The notebook smoke-tests each step and reports decode speed and draft acceptance; if the PrismML build fails it retries without drafting, then falls back to stock llama.cpp with `Q2_0`.
- **Qwen3-Embedding-0.6B and Qwen3-Reranker-0.6B** serve neural retrieval (section 7), on the GPU when there is room after Bonsai; otherwise the embedder runs on the CPU and the reranker is skipped.
- **Manim with TeX Live** and **MioTTS-0.6B** make narrated videos (section 5); `ask()` in section 9 plays them inline.
- LFM3 1.7B is optional (`INSTALL_LFM3 = True`).

1. In Colab, go to **File → Open notebook → GitHub**, paste `https://github.com/DS-PNQ/mandatoryslopragapp`, and pick `colab/lemmaslop-colab.ipynb`. You can also use **File → Upload notebook**.
2. Go to **Runtime → Change runtime type** and pick **T4 GPU** (or another GPU).
3. Choose **Runtime → Run all**. Section 10 prints the links: Colab's private port proxy and an optional public Cloudflare tunnel.

The first run takes about 15 minutes on a T4, most of it downloads. Stock llama.cpp comes from conda-forge's CUDA 12 build (native code for T4, L4, A100 and H100); its environment also supplies the CUDA 12 runtime libraries the PrismML build links against. With `LLAMA_INSTALL = "source"`, or if conda fails, llama.cpp is compiled for the GPU instead (20–25 minutes) and, with `CACHE_TO_DRIVE = True`, cached in `MyDrive/lemmaslop-cache`.

## Rust text core

Tokenizing uploaded text is the only retrieval step that costs real CPU time: the tokenizer, stemmer and BM25 scoring for uploads are written in Rust (`crates/lemmaslop-core`), compiled to WebAssembly, and committed as `lib/native/lemmaslop_core.wasm` (150 KB). WebAssembly rather than a native addon means one file that runs wherever Node does (a laptop, Colab, Vercel's serverless functions), with no per-platform builds. The module has no imports and a plain C ABI, so building it needs only `cargo`:

```bash
rustup target add wasm32-unknown-unknown
```

```bash
npm run build:native
```

The TypeScript tokenizer in `lib/rag/text.ts` remains the specification. `tests/native-core.test.ts` checks that both give the same terms, counts and order on the whole library and on Unicode, LaTeX and compound-word edge cases, the same BM25 scores (to 1e-12) and the same ranked passages. If the `.wasm` file is missing or fails to load, or with `LEMMA_NATIVE=off`, the app uses the TypeScript code. `npm run test:native` runs the crate's own tests.

Measured with `npm run bench` on a 1.48M-character upload (the size cap), 4 vCPU:

| Step | TypeScript | Rust/WASM |
|---|---|---|
| First question about a selection (tokenize, index, score) | 129 ms | 30 ms |
| Later questions (cached index, score only) | 2.1 ms | 2.3 ms |
| Library search (110 passages, LSA + IVF + BM25 + RRF) | 0.08 ms | not ported |

The cache is the larger win (every question after the first skips tokenizing in either language), and the Rust core makes the first question 4.3× faster. Library search and the index build were not ported: at 0.08 ms per query and about a second at build time, there is nothing to gain.

The first Rust version was no faster than TypeScript (139 ms). Profiling showed why: a linear scan over 170 stopwords for every word, an allocation per word, SipHash, and Unicode normalization of whole pages when one character was non-ASCII. The current version streams the text once, normalizes only non-ASCII characters, looks stopwords up in an Fx hash set, and stems each distinct word once per index.

Other speedups: narration lines are voiced three at a time (`MIOTTS_CONCURRENCY`) instead of one after another, and `instrumentation.ts` warms the slow first-use steps when the server starts (probing Manim, which takes several seconds to import; loading the Rust core; embedding the library when an embedder is set), so the first question does not pay for them.

## Tests

```bash
npm test
```

The tests run the Opus and LFM3 paths against local mock servers (no keys or network), and check that every message the agent emits passes the A2UI `MessageProcessor`'s validation for the catalog. They also cover the reasoning-trace filter, the markdown sanitizer, PDF/Word/image parsing, upload retrieval, the Manim scene validator (which needs only `python3`), the MioTTS client against a mock of its API, the neural retrieval stages against mock embedding and rerank endpoints (including a dead endpoint, dense-first ranking, and EmbeddingGemma 2's prompts), and the animation pipeline end to end against a mock Bonsai server (scene call with reasoning off, two repairs, storyboard fallback). The render tests run when `MANIM_PYTHON` points at a Python with Manim installed; they render the storyboard, the prompt's example scene, and a scene that uses old Manim names and a bad `narrate()` index, and run the code shown in the chat with the Manim CLI. `tests/native-core.test.ts` checks the Rust core against the TypeScript tokenizer and BM25.

## Deploy on Vercel

The repository deploys as a standard Next.js project; `vercel.json` sets the build command. In the Vercel project settings, add `ANTHROPIC_API_KEY` and/or `OPENROUTER_API_KEY` as environment variables. A local `LFM3_BASE_URL` will not be reachable from Vercel, so use OpenRouter for LFM3 there.

Vercel functions accept request bodies up to 4.5 MB, so uploads are limited to about that size there, and Manim is not available, so animation answers show their scene code instead of a video.

## Adding notes

Each file in `content/notes/` is one note with frontmatter (`id`, `title`, `area`). Every `## ` section becomes one retrievable passage. Write math in `$…$` and `$$…$$`.

## Design

Answers sit on an opaque reading sheet with near-black ink (18.9:1 contrast in light mode, 16.6:1 in dark), so the text stands clear of the liquid background; the reasoning is in `design-system/lemmaslop/pages/notebook.md`. The mark, a melting end-of-proof square, was designed with the [logo-design skill](https://github.com/kaankiziltug/logo-design-skill), installed for this project only in `.claude/skills/logo-design/`; concepts and tests are in `design-system/lemmaslop/logo/`.

The interface was redesigned with the [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill, installed for this project only in `.claude/skills/ui-ux-pro-max/` (Claude Code picks it up when working in this repository). Its design system is in `design-system/lemmaslop/`: `MASTER.md` and `tokens.css` as generated (Swiss-minimal layout, Inter), and `pages/notebook.md` for the page-level choices: a liquid theme (glass on the top bar, sources panel and pills, drifting liquid shapes behind the page), Instrument Serif for names and titles, and the palette, cloud gray and ocean teal in light mode, black and arctic blue in dark mode. Light and dark themes follow the system setting, and the sun/moon button in the top bar overrides it.

## License

LemmaSlop is released under the [MIT License](LICENSE). The project-scoped skills in `.claude/skills/` keep their own licenses (UI UX Pro Max and logo-design are both MIT). Model weights are downloaded at run time under their own licenses (Ternary Bonsai, the Qwen3 embedding and reranker, EmbeddingGemma 2, and MioTTS are Apache 2.0; LFM3 has Liquid AI's license), and the default MioTTS reference voice has the use restrictions described above.

## Layout

```
content/notes/              the library (21 notes, 110 passages)
lib/rag/                    tokenizer, LSA, e-means, IVF + BM25, neural embeddings + reranker
lib/uploads/                file parsing (PDF, Word, text, images), scanned-PDF transcription and upload retrieval
lib/manim/render.ts         Manim render service (sandbox, queue, cleanup)
lib/manim/storyboard.ts     storyboard scene built from an answer (the animation fallback)
lib/native/                 the Rust core as WebAssembly, and its loader
crates/lemmaslop-core/      Rust: tokenizer, stemmer, BM25 index
bench/                      retrieval benchmarks and the embedding evaluation
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
design-system/lemmaslop/    UI UX Pro Max design system, page overrides, and logo/
.claude/skills/             ui-ux-pro-max and logo-design, project-scoped
colab/lemmaslop-colab.ipynb Colab notebook (Bonsai + MTP, neural retrieval, Manim, MioTTS)
```
