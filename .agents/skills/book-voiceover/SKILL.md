---
name: book-voiceover
description: >-
  Generates word-for-word, presentation-style MP3 voiceovers from ANY PDF or DRM-free EPUB book with natural spoken descriptions for code snippets, formulas, diagrams, and tables, alongside exact synchronization markers (JSON, WebVTT, CSV) and an interactive reader (a dual-pane page reader for PDFs, a reflowing text reader for EPUBs). Use this skill whenever asked to generate voiceovers, audiobooks, or synced readings for specific chapters or page ranges of any PDF or EPUB.
---

# Book Voiceover & Interactive Player Skill

This skill provides an automated, resilient workflow for transforming any PDF book into a synchronized, presentation-quality audiobook with an interactive dual-pane canvas reader and exact millisecond page-turn markers.

---

## Core Principles

1. **Verbatim Prose**: Read regular explanatory and narrative text word-for-word without summarizing, omitting, or paraphrasing.
2. **Spoken Code & Non-Text Descriptions**: Never read code snippets, tables, ASCII trees, or mathematical formulas character-by-character. Instead, insert a clear, natural conversational description prefixed with `Code example:`, `Diagram description:`, `Table summary:`, or `Formula description:` explaining the intent, structure, parameters, and return value/behavior.
3. **SSML & Speech Sanitization**: Convert mathematical and programming operators (`<`, `>`, `<=`, `>=`, `&`, `&&`, `||`, `===`, `!==`, `!=`, `==`) into spoken English words (`less than`, `strictly equals`, `and`, etc.) to prevent SSML/XML parser errors.
4. **Natural Neural Voice**: Recommend Google Gemini 3.8 TTS (`--engine gemini`) for studio-quality, style-directed narration; its free tier is usually enough for some personal use, but it needs an API key. Microsoft Edge TTS (the script default, `en-US-AndrewMultilingualNeural`) is free with no setup and no usage limits. Always let the user choose the engine and voice in Step 0.5 before synthesizing.
5. **Exact Page Synchronization**: Synthesize each page into its own audio buffer, compute exact millisecond timestamps, concatenate into a master MP3, and output markers in JSON, WebVTT, and CSV.
6. **Dual-Pane Interactive Web Player**: Generate a zero-dependency, high-DPI HTML player with synchronized page flipping, drag-to-pan, pinch-to-zoom (up to 3.8x), responsive mobile/desktop layouts, and zero-CORS offline loading.

---

## Step-by-Step Procedure for AI Agents

When prompted to generate voiceovers for a chapter or page range of a PDF (for an **EPUB**, Steps 0 and 0.5 are the same, then follow "EPUB Books" below instead of Steps 1-5):

### Step 0: Verify & Install Dependencies
Before running any script, check if `node_modules` exists. If missing or if dependencies (`msedge-tts`, `mp3-duration`, `pdf-parse`, `@google/genai`, `@breezystack/lamejs`, `google-auth-library`, `node-html-parser`) are not installed, automatically execute:
```bash
npm install
```
The user never needs to run `npm install` manually; the agent handles environment setup automatically.

### Step 0.5: Ask the User to Pick an Engine and Voice
Unless the user already named an engine or voice in their request, ask them to choose **before** running any synthesis (use your harness's question/choice tool if it has one; otherwise ask in chat and wait for the answer).

**First, the engine.** Offer these options, with Gemini first as the recommendation:

1. **Google Gemini 3.8 TTS (Recommended)**: studio-quality, expressive narration with a delivery style matched to the book. Gemini's free tier is usually enough for some personal use, but the user has to get a free API key from Google AI Studio first. The free quota can be small (as low as 10 requests per day); the generator uses about one request per page, so the free tier covers a few pages a day, and a whole book needs billing enabled on the key.
2. **Google Cloud Text-to-Speech** (`--engine google-cloud`): Gemini-TTS models and Chirp 3 HD voices through a Google Cloud service account, with the same voice names as Gemini (Charon, Kore, Sadaltager...). Each paragraph is its own request, so paragraph timings are exact. Needs more setup (see below). If the user picks it, offer the model with `--model`, recommending Gemini 3.1 Flash:

   | `--model` | Notes |
   | :--- | :--- |
   | `gemini-3.1-flash-tts-preview` (Recommended, default) | Expressive, follows `--style` prompts |
   | `gemini-2.5-pro-tts` | Highest fidelity of the 2.5 models, slower |
   | `gemini-2.5-flash-tts` | Fast, follows `--style` prompts |
   | `gemini-2.5-flash-lite-preview-tts` | Fastest and cheapest Gemini option |
   | `chirp-3-hd` | No style prompts; covered by the Cloud TTS monthly free tier (1 million characters a month, roughly 17 hours of narration, resetting each month) |

   The Gemini-TTS models run through Google's Agent Platform (Vertex AI) and are likely billed as Gemini usage rather than from the Chirp 3 HD free tier; tell the user this is unconfirmed and that their Cloud billing report shows the actual charge.
3. **Microsoft Edge voices**: free, no setup, and no usage limits. Very good, but less expressive than Gemini.

- If a `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) is already available, in the environment or in the repo-root `.env` file, say so: Gemini then needs no extra setup.
- The same Gemini voices can also be used through **OpenRouter** (`--engine openrouter`) with an `OPENROUTER_API_KEY` (from https://openrouter.ai/keys, saved in the repo-root `.env`). Use it when the user asks for OpenRouter or already has an OpenRouter key but no Gemini key; it bills OpenRouter credits instead of a Google account, at the same listed per-token prices. Voices, styles, the book-type table below, and all Gemini notes apply unchanged.
- If the user picks Gemini and has no key, walk them through it: create a key at https://aistudio.google.com/apikey, then save it as `GEMINI_API_KEY=<key>` in a `.env` file at the repo root (it is git-ignored). Wait for the key before synthesizing. If they would rather not set one up, use the Edge voices.
- If `GOOGLE_APPLICATION_CREDENTIALS` is set (in the environment or `.env`) and points to an existing key file, Google Cloud needs no extra setup: say so. If the user picks it without a key, walk them through it: in a Google Cloud project with billing attached, enable the Cloud Text-to-Speech API, create a service account, download its JSON key, save the key in the repo's `credentials/` folder (git-ignored), and add `GOOGLE_APPLICATION_CREDENTIALS=credentials/<file>.json` to `.env`. Never commit key files. The Gemini-TTS models additionally need the **Agent Platform (Vertex AI) API** enabled and the **"Agent Platform User"** role (`roles/aiplatform.user`) granted to that service account on the project's **IAM** page (not on the service account's own Permissions tab, and not on another account such as the App Engine default service account). Role changes take a minute or two to apply. `chirp-3-hd` needs only the Text-to-Speech API.
- If the user wants no setup or no limits, or declines to choose, use the Edge voices.

**Then, the voice.** For Gemini, recommend the voice and style matched to the book type (see "Match the Gemini style and voice to the book type" below). For Google Cloud, recommend the voice and style from the same table (`--engine google-cloud --voice <name> --style "<direction>"`); `--style` is ignored by `chirp-3-hd`. For Edge, offer these options, with Andrew first as the recommended default:

| Voice ID | Style | Best for |
| :--- | :--- | :--- |
| `en-US-AndrewMultilingualNeural` (Recommended, default) | Warm, confident male | General narration, non-fiction |
| `en-US-AvaMultilingualNeural` | Expressive, caring female | Fiction, character-heavy dialogue |
| `en-US-EmmaMultilingualNeural` | Cheerful, clear female | Light, conversational books |
| `en-US-BrianMultilingualNeural` | Casual, sincere male | Relaxed audiobook feel |
| `en-GB-SoniaNeural` / `en-GB-RyanNeural` | British female / male | British literature (older, slightly flatter voices) |

- If the user picks "Other", accept any valid Edge TTS voice ID they give.
- If the user declines to choose or says "whatever", use `en-US-AndrewMultilingualNeural`.
- Pass the chosen ID to the generator with `--voice`, and mention the voice used in your final summary.
- Avoid the older `en-US-GuyNeural` / `en-US-JennyNeural` unless the user asks for them explicitly — they sound noticeably more robotic.

#### Gemini 3.8 TTS engine (direct or via OpenRouter)
Gemini reads its key from `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), either as an environment variable or in a `.env` file at the repo root (git-ignored). Beyond the free tier, Gemini costs roughly $0.54 per hour of audio on `gemini-3.8-flash-lite-tts` (default) or $0.81 per hour on `gemini-3.8-flash-tts` at 2026 prices, which double on 2027-01-01. Before synthesizing a long chapter, mention that usage beyond the free tier is billed and give the estimate. If synthesis fails with a quota or rate-limit error (429), the free-tier quota is used up: tell the user, and offer to wait for it to reset, enable billing, or switch to the Edge voices. Pages finished before the failure are cached, so a re-run resumes where it stopped. The generator retries rate limits (using the wait Google suggests) and false-positive safety blocks automatically; code-heavy technical books trigger these blocks often, and a page that stays blocked is re-sent one paragraph at a time. If a single paragraph is still refused, the run stops and names it: reword that paragraph slightly in the script and re-run. All Gemini audio carries an inaudible SynthID watermark.

| Gemini voice | Style |
| :--- | :--- |
| `Charon` (default) | Informative |
| `Sadaltager` | Knowledgeable |
| `Sulafat` | Warm |
| `Gacrux` | Mature |
| `Achird` | Friendly |
| `Kore` | Firm |
| `Puck` | Upbeat |
| `Aoede` | Breezy |

- Pass `--engine gemini --voice <name>`; add `--model gemini-3.8-flash-tts` for the higher-fidelity model.
- `--style "<short direction>"` sets the delivery for every page. Keep it short. Always pass a style matched to the book type (below) rather than a generic one.

##### Match the Gemini style and voice to the book type
Before synthesizing with Gemini, work out what kind of book it is from its title, table of contents, and first pages, then pick the matching style and voice:

| Book type | `--style` | Suggested voice |
| :--- | :--- | :--- |
| Novel / fiction | `"expressive storyteller, gentle pacing, lively dialogue"` | `Sulafat` or `Aoede` |
| Children's book | `"warm, playful storyteller reading aloud to a child"` | `Achird` or `Puck` |
| Technical / programming | `"clear, knowledgeable tech expert explaining to a colleague"` | `Sadaltager` or `Charon` |
| Academic / textbook | `"calm, precise lecturer, steady pace"` | `Charon` or `Gacrux` |
| Business / self-help | `"confident, engaging presenter"` | `Kore` |
| History / biography | `"measured documentary narrator"` | `Gacrux` |

- When asking the user to pick a voice (Step 0.5), name the detected book type and offer the suggested voice and style as the recommended option. The user's explicit choice of voice or style always wins.
- For a book that mixes types (e.g. a narrative history of computing), pick the type that best describes most of the prose.
- Use the same style and voice for every chapter of a book so the narration stays consistent, and mention the book type, style, and voice in your final summary.
- The script may include Gemini inline vocal tags such as `<sigh>`, `<laughs>` or `<short pause>`; they are preserved for Gemini only (Edge would read them aloud as "less than ... greater than", so do not add them when using Edge).
- Gemini detects the language from the text, so it suits non-English books without picking a language-specific voice.

> **Output location**: All generated files (extracted text, audio, markers, transcript, player, preloader) are written to **the same folder as the source PDF** by default, not the current working directory. Relative `--out` paths resolve against the PDF's folder; pass `--outDir <dir>` to the generator to override.

### Step 1: Discover Page Boundaries
Find the exact 1-indexed PDF document page numbers and printed book page numbers:
```bash
node .agents/skills/book-voiceover/scripts/discover_pages.js --pdf "path/to/book.pdf" --query "Chapter 1"
```
Or check the Table of Contents:
```bash
node .agents/skills/book-voiceover/scripts/discover_pages.js --pdf "path/to/book.pdf" --toc
```

### Step 2: Extract & Prepare Page Scripts
Extract the raw text for the target range:
```bash
node .agents/skills/book-voiceover/scripts/extract_page_text.js --pdf "path/to/book.pdf" --pages 25-37 --out chapter1_raw.json
```
This writes `path/to/chapter1_raw.json` (next to the PDF).
For each page:
- Keep all narrative prose word-for-word.
- **Separate paragraphs with a blank line** (`\n\n`), following the printed paragraphs. The raw extraction has one line per printed line, so rejoin lines within a paragraph. Each paragraph becomes one highlight in the player; a page without blank lines is treated as a single paragraph. Keep a spoken description (`Code example:`, `Diagram description:`...) as its own paragraph at the point where the code or figure appears.
- Replace code blocks with `Code example: [Conversational description of the function, loop, or logic]`.
- Replace diagrams, charts, and architecture figures with `Diagram description: [Clear explanation of components and dataflow]`.
- Replace tables with `Table summary: [Summary of columns and key rows]`.
- Clean bullet symbols (``, `•`, `■`) so speech engines pronounce sentences cleanly.

### Step 3: Run the Resilient TTS Synthesizer
Run the synthesizer using `.agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js` or a curated generator script:
```bash
node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --script chapter1_raw.json --title "Book Title - Chapter 1" --prefix "book_chapter_1" --pdf "path/to/book.pdf" --voice "<voice chosen in Step 0.5>"
# Gemini engine instead of Edge:
node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --script chapter1_raw.json --title "Book Title - Chapter 1" --prefix "book_chapter_1" --pdf "path/to/book.pdf" --engine gemini --voice Sadaltager --style "clear, knowledgeable tech expert explaining to a colleague"
```
`--script` is looked up relative to the current directory first, then the PDF's folder. Outputs land in the PDF's folder unless `--outDir` is given.
* **Page-by-page caching**: Saves intermediate MP3s in `<output dir>/audio_<prefix>_cache/page_<N>.mp3` so interrupted jobs resume instantly without re-synthesizing completed pages.
* **Exponential backoff retry**: Automatically retries up to 4 attempts on network hiccups.
* **Duration measurement**: Uses `mp3-duration` on exact concatenated audio buffers.

### Step 4: Concatenate Audio & Output Markers
The generator automatically outputs (into the PDF's folder):
- **Master Audio** (`<prefix>.mp3` & `<prefix>_voiceover.mp3`): Seamless concatenated audiobook audio.
- **Timing Markers JSON** (`<prefix>_markers.json`): Array of `{ page, bookPage, startTime, endTime, startSeconds, endSeconds, durationSeconds }`.
- **WebVTT** (`<prefix>_markers.vtt`): Standard chapter/subtitle track format (`<track kind="chapters">`).
- **CSV** (`<prefix>_markers.csv`): Tabular timing format.
- **Reading Script** (`<prefix>_script.md`): Complete word-for-word transcript.
- **Paragraph Markers** (`<prefix>_paragraphs.json`): Array of `{ page, bookPage, paragraph, startTime, endTime, startSeconds, endSeconds, text, rects }`. `rects` lists one `[x, y, width, height]` box per printed line, as fractions of the page size from the top-left. Paragraph timings are exact with Edge (each paragraph is voiced separately). With Gemini, a page is voiced in one request to save quota and each paragraph break is found from the pauses in the audio, typically accurate to a fraction of a second. Positions are matched to the PDF's text layer, so `rects` is empty for text with no printed counterpart (e.g. a description of an image) and for scanned PDFs without a text layer.

### Step 5: Generate Zero-CORS Preloader & Interactive Player
1. The generator automatically creates the base64 preloader (`<slug>_pdf_data.js`, next to the player) and links it from the player, so the HTML can be double-clicked directly from the local filesystem (`file:///`) without CORS origin errors. It is only rebuilt when the PDF changes. To create one manually:
```bash
node .agents/skills/book-voiceover/scripts/make_pdf_preloader.js --pdf "path/to/book.pdf"
```
2. The HTML player (`<prefix>_player.html`) is automatically generated with:
- **Dual-Pane Open Book Spread**: Two pages displayed side-by-side on desktop landscape, single-pane on mobile portrait.
- **Drag-to-Pan & Zoom (up to 3.8x)**: Free-form panning with mouse drag or touch pinch. Double-click or `R` key resets view.
- **Real-Time Synchronized Flipping**: Automatically turns pages as audio reaches marker boundaries.
- **Current-Paragraph Highlight**: Highlights the paragraph being read on the page (toggle with the Highlight button or `H`; on by default).
- **Manual Browsing with Auto-Resume Sync**: Browse pages while paused; resuming playback automatically flips back to the active audio page.
- **Keyboard Shortcuts**: `Space` (play/pause), `←`/`→` (skip ±5s), `[`/`]` or `PageUp`/`PageDown` (page turn), `+`/`-` (zoom), `R` (reset), `M` (markers drawer), `H` (paragraph highlight).

### Step 6: Stream & Play
Launch the local HTTP range streaming server:
```bash
node server.js "path/to/book-folder"   # or: npm start -- "path/to/book-folder"
# no folder: serves this repo; also --dir <folder>, or AUDIOBOOK_DIR=<folder>
```
Pass the folder that holds the generated players, usually the book's folder (outputs are written next to the PDF). The server searches that folder and its subfolders for `*_player.html` files and opens the browser: straight to the player when there is only one, otherwise to a list of all players. On Windows, the user can also drag the folder onto `start_player.bat`, which otherwise asks for one. The home page (`http://localhost:3000/?list`) also has a folder picker to switch folders without restarting; it opens automatically when the served folder has no players. The server is reachable only from this computer; add `--host 0.0.0.0` to open it to other devices on the network (such as a phone), and `--no-open` to skip opening the browser.

---

## EPUB Books

DRM-free EPUBs (for example from Project Gutenberg, or books sold DRM-free) are supported natively: the text comes from the book's own HTML, so paragraphs are explicit and there are no line breaks or split words to repair. DRM-protected EPUBs (most store-bought Kindle, Apple or Kobo books) cannot be read; `epub_reader.js` reports this. For fixed-layout EPUBs (picture books, comics), `--toc` warns that converting to PDF (for example with Calibre's `ebook-convert`) and using the PDF workflow gives better results.

1. **List the chapters** (numbers come from the table of contents; nested entries are indented):
   ```bash
   node .agents/skills/book-voiceover/scripts/epub_reader.js --epub "path/to/book.epub" --toc
   ```
2. **Extract the chapter** as a draft narration script (and a readable Markdown copy for review):
   ```bash
   node .agents/skills/book-voiceover/scripts/epub_reader.js --epub "path/to/book.epub" --chapter 4 --out chapter4_raw.json
   node .agents/skills/book-voiceover/scripts/epub_reader.js --epub "path/to/book.epub" --chapter 4 --out chapter4_raw.md
   ```
   The JSON is `{ "1": "...", "2": "..." }`: parts of roughly a page (they only group paragraphs for synthesis), with paragraphs separated by blank lines. Code blocks appear as `CODE:` followed by the code, images as `IMAGE: <alt text>`, and tables as `TABLE: ...`. Decorative lines such as "* * *" are already dropped.
3. **Prepare the script** exactly as in Step 2 for PDFs: keep prose verbatim, and replace each `CODE:`, `IMAGE:` and `TABLE:` paragraph with a spoken `Code example:`, `Diagram description:` or `Table summary:` paragraph (the EPUB's image alt text is often a good starting point). Keep one paragraph per book paragraph; do not merge or split paragraphs, since each is matched back to the book's text for the highlight. Keep exactly one description per code block, image or table, in the book's order and starting with those exact prefixes: descriptions cannot be matched by their words, so each is paired with the next unclaimed block of its kind (code, image or table) between the matched paragraphs around it. Dropping a block (for example a decorative image) is fine.
4. **Generate** with the same engine, voice and style options as PDFs:
   ```bash
   node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --epub "path/to/book.epub" --chapter 4 --script chapter4.json --prefix "book_chapter_4" --engine <engine> --voice <voice>
   ```
   The title defaults to "<book title> - <chapter title>" from the EPUB; pass `--title` to override it. Without `--script`, the chapter's text is narrated as extracted, skipping code, images and tables.
5. **Outputs** go next to the EPUB, with the same files as for PDFs (`<prefix>.mp3`, markers, `<prefix>_paragraphs.json` where each paragraph lists the book `blocks` it covers, transcript), plus `<prefix>_player.html`: a **reflowing reader** with the chapter's text and images built in (it opens by double-click; only the MP3 is loaded from beside it). It highlights the paragraph being read and scrolls to follow it (scrolling away pauses following until "Back to narration" is clicked), and clicking any paragraph jumps the audio there. Controls: play/pause, ±5s, previous/next paragraph, speed, font size, light/dark theme. Keys: `Space`, `←`/`→`, `[`/`]` (paragraph), `H` (highlight), `F` (follow), `T` (theme), `+`/`-` (text size).

---

## Code & Diagram Conversion Guidelines

- **Functions & Methods**: State function name, arguments, and purpose:
  *Example*: `"Code example: A function calculateTax accepting amount and rate, returning the total formatted as currency."`
- **Loops & Control Flow**: Describe iteration criteria and condition:
  *Example*: `"Code example: A while loop prepending leading zeros until string length reaches 3."`
- **Architectural Diagrams**: Describe entities, dataflow, and arrows:
  *Example*: `"Diagram description: Figure 1.2 illustrates a multi-agent system where a controller receives user queries and delegates tasks between a coder agent and a tester agent."`
- **Tables**: Summarize headings and key row relationships:
  *Example*: `"Table summary: A three-column table comparing model latency, context window size, and cost per million tokens."`
