---
name: pdf-book-voiceover
description: >-
  Generates word-for-word, presentation-style MP3 voiceovers from ANY PDF book with natural spoken descriptions for code snippets, formulas, diagrams, and tables, alongside exact page-flip synchronization markers (JSON, WebVTT, CSV) and an immersive dual-pane HTML reader. Use this skill whenever asked to generate voiceovers, audiobooks, or page-synced readings for specific chapters or page ranges of any PDF.
---

# Universal PDF Book Voiceover & Interactive Player Skill

This skill provides an automated, resilient workflow for transforming any PDF book into a synchronized, presentation-quality audiobook with an interactive dual-pane canvas reader and exact millisecond page-turn markers.

---

## Core Principles

1. **Verbatim Prose**: Read regular explanatory and narrative text word-for-word without summarizing, omitting, or paraphrasing.
2. **Spoken Code & Non-Text Descriptions**: Never read code snippets, tables, ASCII trees, or mathematical formulas character-by-character. Instead, insert a clear, natural conversational description prefixed with `Code example:`, `Diagram description:`, `Table summary:`, or `Formula description:` explaining the intent, structure, parameters, and return value/behavior.
3. **SSML & Speech Sanitization**: Convert mathematical and programming operators (`<`, `>`, `<=`, `>=`, `&`, `&&`, `||`, `===`, `!==`, `!=`, `==`) into spoken English words (`less than`, `strictly equals`, `and`, etc.) to prevent SSML/XML parser errors.
4. **Natural Neural Voice**: Use the newer, more natural Microsoft Edge TTS voices. The default is `en-US-AndrewMultilingualNeural`; always let the user pick from the voice menu in Step 0.5 before synthesizing.
5. **Exact Page Synchronization**: Synthesize each page into its own audio buffer, compute exact millisecond timestamps, concatenate into a master MP3, and output markers in JSON, WebVTT, and CSV.
6. **Dual-Pane Interactive Web Player**: Generate a zero-dependency, high-DPI HTML player with synchronized page flipping, drag-to-pan, pinch-to-zoom (up to 3.8x), responsive mobile/desktop layouts, and zero-CORS offline loading.

---

## Step-by-Step Procedure for AI Agents

When prompted to generate voiceovers for a chapter or page range of a PDF:

### Step 0: Verify & Install Dependencies
Before running any script, check if `node_modules` exists. If missing or if dependencies (`msedge-tts`, `mp3-duration`, `pdf-parse`) are not installed, automatically execute:
```bash
npm install
```
The user never needs to run `npm install` manually; the agent handles environment setup automatically.

### Step 0.5: Ask the User to Pick a Voice
Unless the user already named a voice in their request, ask them to choose one **before** running any synthesis (use your harness's question/choice tool if it has one; otherwise ask in chat and wait for the answer). Offer these options, with Andrew first as the recommended default:

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

### Step 1: Discover Page Boundaries
Find the exact 1-indexed PDF document page numbers and printed book page numbers:
```bash
node scripts/discover_pages.js --pdf "path/to/book.pdf" --query "Chapter 1"
```
Or check the Table of Contents:
```bash
node scripts/discover_pages.js --pdf "path/to/book.pdf" --toc
```

### Step 2: Extract & Prepare Page Scripts
Extract the raw text for the target range:
```bash
node scripts/extract_page_text.js --pdf "path/to/book.pdf" --pages 25-37 --out chapter1_raw.json
```
For each page:
- Keep all narrative prose word-for-word.
- Replace code blocks with `Code example: [Conversational description of the function, loop, or logic]`.
- Replace diagrams, charts, and architecture figures with `Diagram description: [Clear explanation of components and dataflow]`.
- Replace tables with `Table summary: [Summary of columns and key rows]`.
- Clean bullet symbols (``, `•`, `■`) so speech engines pronounce sentences cleanly.

### Step 3: Run the Resilient TTS Synthesizer
Run the synthesizer using `scripts/generate_chapter_voiceover.js` or a curated generator script:
```bash
node scripts/generate_chapter_voiceover.js --script chapter1_raw.json --title "Book Title - Chapter 1" --prefix "book_chapter_1" --pdf "path/to/book.pdf" --voice "<voice chosen in Step 0.5>"
```
* **Page-by-page caching**: Saves intermediate MP3s in `audio_<prefix>_cache/page_<N>.mp3` so interrupted jobs resume instantly without re-synthesizing completed pages.
* **Exponential backoff retry**: Automatically retries up to 4 attempts on network hiccups.
* **Duration measurement**: Uses `mp3-duration` on exact concatenated audio buffers.

### Step 4: Concatenate Audio & Output Markers
The generator automatically outputs:
- **Master Audio** (`<prefix>.mp3` & `<prefix>_voiceover.mp3`): Seamless concatenated audiobook audio.
- **Timing Markers JSON** (`<prefix>_markers.json`): Array of `{ page, bookPage, startTime, endTime, startSeconds, endSeconds, durationSeconds }`.
- **WebVTT** (`<prefix>_markers.vtt`): Standard chapter/subtitle track format (`<track kind="chapters">`).
- **CSV** (`<prefix>_markers.csv`): Tabular timing format.
- **Reading Script** (`<prefix>_script.md`): Complete word-for-word transcript.

### Step 5: Generate Zero-CORS Preloader & Interactive Player
1. Create the base64 preloader to allow the HTML player to be double-clicked directly from the local filesystem (`file:///`) without CORS origin errors:
```bash
node scripts/make_pdf_preloader.js --pdf "path/to/book.pdf"
```
2. The HTML player (`<prefix>_player.html`) is automatically generated with:
- **Dual-Pane Open Book Spread**: Two pages displayed side-by-side on desktop landscape, single-pane on mobile portrait.
- **Drag-to-Pan & Zoom (up to 3.8x)**: Free-form panning with mouse drag or touch pinch. Double-click or `R` key resets view.
- **Real-Time Synchronized Flipping**: Automatically turns pages as audio reaches marker boundaries.
- **Manual Browsing with Auto-Resume Sync**: Browse pages while paused; resuming playback automatically flips back to the active audio page.
- **Keyboard Shortcuts**: `Space` (play/pause), `←`/`→` (skip ±5s), `[`/`]` or `PageUp`/`PageDown` (page turn), `+`/`-` (zoom), `R` (reset), `M` (markers drawer).

### Step 6: Stream & Play
Launch the local HTTP range streaming server:
```bash
npm start
# or: node server.js
```
The server automatically launches your default browser at `http://localhost:3000/<prefix>_player.html`.

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
