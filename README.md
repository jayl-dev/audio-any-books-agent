# Audio Any Books Agent

An AI agent skill that turns any PDF or EPUB book into an audiobook. Clone this repo, open it in an AI agent harness, then ask the agent to generate the voiceover for you (see the [example prompt](#3-prompt-the-agent)).

Once it's done, you'll get something like this: **[Live demo: Alice in Wonderland, Chapter 1](https://alice-chapter-1.zl25drexel.workers.dev/)** (narrated with Google's Gemini 3.8 TTS; see [how to use Gemini](#optional-gemini-38-tts-engine))

<p align="center">
  <img src="screenshot.png" alt="Interactive player showing Alice in Wonderland Chapter 1 with synchronized audio controls" width="480">
</p>

> Turn **ANY PDF or EPUB book** into a presentation-quality, synchronized audiobook with natural spoken descriptions for code & diagrams, alongside an interactive web reader: a dual-pane page view for PDFs, or a reflowing text view for EPUBs.

**Zero manual commands required.** Just clone and prompt your AI agent!

---

## Quickstart: Let the AI Agent Do It All

You don't need to run extraction scripts, timing calculations, or audio synthesis commands yourself. An AI agent harness (such as **Google Antigravity**, **Claude Code**, **Cursor**, etc.) will handle the entire pipeline autonomously using the included agent skill.

### 1. Clone this repository
```bash
git clone https://github.com/jayl-dev/audio-any-books-agent.git
cd audio-any-books-agent
```

### 2. Open in your AI Agent Harness
Open this folder in **Google Antigravity** (or any agent environment that supports `.agents/skills/` or `SKILL.md`). The `book-voiceover` skill is automatically loaded into the agent's skillset.

### 3. Prompt the Agent:

> **"Use the voiceover skill to generate the files for chapter 1 of alice/alice-in-wonderland.pdf"**

*(You don't even need to run `npm install`—the agent checks dependencies and sets up the environment automatically!)*

---

### What the AI Agent Does Automatically

Once you give the prompt, the agent autonomously executes the full production workflow:

1. **Sets Up Environment**: Checks if `node_modules` is present and runs `npm install` automatically if any dependencies are missing.
2. **Finds the Chapter**: For a PDF, scans `alice/alice-in-wonderland.pdf` and identifies that Chapter 1 (*"Down the Rabbit-Hole"*) spans **PDF pages 4 to 7**. For an EPUB, reads the book's table of contents.
3. **Prepares Spoken Script**: Reads narrative text verbatim, sanitizes mathematical/programming symbols, and inserts conversational descriptions for illustrations and diagrams (`Diagram description: ...`).
4. **Synthesizes Neural Audio**: Asks which engine you want. It recommends **Google Gemini 3.8 TTS** for studio-quality narration styled to the book; the free tier is usually enough for some personal use (its quota can be as low as 10 requests a day, about one per page), but you need a free API key from Google AI Studio. **Microsoft Edge voices** (default `en-US-AndrewMultilingualNeural`; also Ava, Emma, Brian, or British Sonia/Ryan) are free with no setup and no limits. Audio is generated page by page with automatic caching and retry on network hiccups.
5. **Computes Precise Markers**: Concatenates audio and calculates millisecond-accurate timestamps in **JSON**, **WebVTT** (`.vtt`), and **CSV**.
6. **Builds the Interactive Player**: Generates `alice_chapter_1_player.html`. For a PDF, a dual-pane page reader with synchronized page flips, drag-to-pan, and pinch-to-zoom (up to 3.8x); for an EPUB, a reflowing text reader that follows the narration paragraph by paragraph.
7. **Makes It Open Offline**: For a PDF, generates a base64 copy of the book next to the player; an EPUB player has the chapter's text and images built in. Either way, you can double-click the HTML player directly from your desktop (`file:///`) without browser origin warnings.

---

## Generating Voiceovers for Any Other Book

To generate voiceovers for any other book or chapter, point the agent at your PDF or EPUB file (anywhere on your computer; the results are saved next to it):

> **"Use the voiceover skill to generate chapter 2 of my_book.pdf"**

> **"Use the voiceover skill to generate chapter 3 of my_book.epub"**

Or specify exact pages and voice preferences:
> **"Use the voiceover skill to generate pages 50 to 75 of deep_learning.pdf using the en-US-AvaMultilingualNeural voice"**

Or use Google's Gemini 3.8 TTS for more expressive narration (needs a `GEMINI_API_KEY`):
> **"Use the voiceover skill with the Gemini engine and the Charon voice to generate chapter 1 of alice/alice-in-wonderland.pdf"**

---

## EPUB Books

DRM-free EPUBs work too (for example from [Project Gutenberg](https://www.gutenberg.org/)):

> **"Use the voiceover skill to generate chapter 1 of my_book.epub"**

EPUB chapters come from the book's table of contents, and the text comes straight from the book, so paragraphs are clean. Instead of page images, you get a **reflowing reader** that fits any screen, including phones:

- The chapter's text and images are built into the page, which opens by double-click.
- The paragraph being read is highlighted and kept in view; scroll away and a **Back to narration** button takes you back.
- Click any paragraph to jump the narration there.
- Adjustable text size, light/dark theme, speed, and previous/next paragraph (`[` / `]`).

To run it by hand:

```bash
node .agents/skills/book-voiceover/scripts/epub_reader.js --epub "my_book.epub" --toc                                # list chapters
node .agents/skills/book-voiceover/scripts/epub_reader.js --epub "my_book.epub" --chapter 4 --out chapter1_raw.json   # draft script
node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --epub "my_book.epub" --chapter 4 --script chapter1_raw.json --prefix my_book_chapter_1
```

Chapter numbers are table-of-contents entries, so they can differ from the book's own numbering: front matter such as a title page or contents list often comes first, so the first chapter may be entry 3 or 4.

DRM-protected EPUBs (most store-bought Kindle, Apple or Kobo books) can't be read. Fixed-layout EPUBs, such as picture books, work better converted to PDF first.

---

## Interactive Player Features

These describe the PDF player; the EPUB reader's features are listed under [EPUB Books](#epub-books) above.

- **Dual-Pane Spread**: Emulates a physical open book (two pages side-by-side on desktop landscape, single-pane on mobile portrait).
- **Drag-to-Pan & 3.8x Zoom**: Smooth freeform navigation with mouse drag or multi-touch pinch. Double-click or press `R` to reset.
- **Real-Time Auto Flipping**: Turns pages automatically in sync with the audio narration.
- **Current-Paragraph Highlight**: Highlights the paragraph being read right on the PDF page. Toggle it with the Highlight button or the `H` key.
- **Paused Manual Browsing with Auto-Resume Sync**: Freely flip through pages while paused; resuming audio instantly flips back and syncs to the spoken page.
- **Collapsible Markers Drawer**: Jump to any page or chapter instantly with the `M` key.

### Player Hotkeys

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `←` / `→` | Skip backward / forward 5 seconds |
| `[` / `]` or `PageUp` / `PageDown` | Flip previous / next page |
| `+` / `-` | Zoom in / out |
| `R` / Double-click | Reset zoom & pan to center |
| `M` | Toggle Markers Drawer |
| `H` | Toggle Paragraph Highlight |
| `F` | Toggle Fullscreen |

The EPUB reader uses `Space` and `←` / `→` the same way, `[` / `]` for the previous / next paragraph, `+` / `-` for text size, `H` for the highlight, `F` to follow the narration, and `T` for light / dark.

---

## Generated Deliverables

When the agent finishes, you will find these files **in the same folder as the source book** (PDF or EPUB, e.g. `alice/`):

| File | Description |
| :--- | :--- |
| `<prefix>.mp3` | Master concatenated audiobook audio (24 kHz, 48 kbps mono MP3) |
| `<prefix>_player.html` | Interactive synchronized player: dual-pane page view (PDF) or reflowing text reader (EPUB) |
| `<prefix>_markers.json` | Structured array of page-turn millisecond timestamps |
| `<prefix>_markers.vtt` | Standard WebVTT chapters / subtitle track |
| `<prefix>_markers.csv` | Spreadsheet format for synchronization tools |
| `<prefix>_paragraphs.json` | Per-paragraph timestamps, text, and where the paragraph is: its position on the PDF page, or the EPUB paragraphs it covers |
| `<prefix>_script.md` | Complete word-for-word narration transcript |
| `<slug>_pdf_data.js` | PDF only: base64 copy of the book for zero-CORS direct offline opening |

---

## Optional: Manual CLI Commands (Without Agent)

If you ever wish to run the pipeline manually via terminal commands (for EPUBs, see the commands under [EPUB Books](#epub-books); steps 3 onward are the same):

```bash
# 1. Discover chapters
node .agents/skills/book-voiceover/scripts/discover_pages.js --pdf "alice/alice-in-wonderland.pdf" --query "Chapter I"

# 2. Generate voiceover and player
node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --pdf "alice/alice-in-wonderland.pdf" --pages 4-7 --title "Alice in Wonderland - Chapter 1" --prefix "alice_chapter_1"

# 3. Launch local streaming player for the folder holding the players (here, next to the PDF)
node server.js alice          # or: npm start -- alice
```

The server lists every `*_player.html` it finds in the chosen folder and its subfolders; with no folder it serves this project folder. You can also switch folders from the home page (`http://localhost:3000/?list`): browse to a folder or paste its path, then click **Serve this folder**. On Windows you can also drag a folder onto `start_player.bat`, or run it and paste a folder path when asked. It only accepts connections from your own computer; add `--host 0.0.0.0` to listen on your network so you can open the player on a phone.

### Optional: Gemini 3.8 TTS engine

The default engine is Microsoft Edge TTS, which is free and needs no key. For more expressive, style-directed narration you can switch to Google's Gemini 3.8 TTS models:

```bash
# Get a key at https://aistudio.google.com/apikey, then either export it
# or put GEMINI_API_KEY=... in a .env file at the repo root (git-ignored)
export GEMINI_API_KEY=...
node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --pdf "alice/alice-in-wonderland.pdf" --pages 4-7 --prefix "alice_chapter_1" \
  --engine gemini --voice Achird --style "warm, playful storyteller reading aloud to a child"
```

- `--model` defaults to `gemini-3.8-flash-lite-tts` (about $0.54 per hour of audio). Use `gemini-3.8-flash-tts` for the higher-fidelity model (about $0.81 per hour). Google doubles both prices on January 1, 2027.
- Voices include Charon, Sadaltager, Sulafat, Gacrux, Achird, Kore, Puck and Aoede.
- Match `--style` and the voice to the kind of book, e.g. a storyteller for novels or a tech expert for programming books. When you use the agent, it picks these for you; see the table in SKILL.md.
- Scripts may include inline vocal tags such as `<sigh>` or `<short pause>` when using Gemini.
- Gemini audio carries Google's inaudible SynthID watermark.
- Prefer to pay through OpenRouter? Use `--engine openrouter` with `OPENROUTER_API_KEY` (from https://openrouter.ai/keys, or in `.env`). It runs the same Gemini 3.8 TTS models, voices and styles.

### Optional: Google Cloud Text-to-Speech

Gemini-TTS models and Chirp 3 HD voices through a Google Cloud service account, using the same voice names as Gemini. Each paragraph is voiced separately, so the highlight timings are exact.

> **Google Cloud vs. the Gemini API:** the newest Gemini TTS models (such as Gemini 3.8) may not be available through Google Cloud Text-to-Speech yet; they appear in the Gemini API first. But Google Cloud has a much more generous free tier: Chirp 3 HD voices get 1 million free characters every month, roughly 17 hours of narration, which is good enough for most personal use and can keep hours of audiobooks free each month. (The Gemini-TTS models on Google Cloud are likely billed separately from that free tier; check your billing report.)

| `--model` | Notes |
| :--- | :--- |
| `gemini-3.1-flash-tts-preview` (recommended, default) | Expressive, follows `--style` prompts |
| `gemini-2.5-pro-tts` | Highest fidelity of the 2.5 models, slower |
| `gemini-2.5-flash-tts` | Fast, follows `--style` prompts |
| `gemini-2.5-flash-lite-preview-tts` | Fastest and cheapest Gemini option |
| `chirp-3-hd` | No style prompts; covered by the monthly Cloud TTS free tier (1 million characters a month) |

Setup:

1. In a Google Cloud project with billing attached, enable the **Cloud Text-to-Speech API**.
2. Create a service account, download its JSON key, and put it in a `credentials/` folder in this repo (git-ignored; never commit key files).
3. Add `GOOGLE_APPLICATION_CREDENTIALS=credentials/<your-key>.json` to `.env`.
4. For the Gemini models, also enable the **Agent Platform (Vertex AI) API** and grant the service account the **Agent Platform User** role (`roles/aiplatform.user`) on the project's **IAM** page. Gemini usage is likely billed separately from the Chirp free tier; check your billing report.

```bash
node .agents/skills/book-voiceover/scripts/generate_chapter_voiceover.js --pdf "alice/alice-in-wonderland.pdf" --pages 4-7 --prefix "alice_chapter_1" \
  --engine google-cloud --voice Achird --style "warm, playful storyteller reading aloud to a child"
```

---

## License

MIT License. Free for personal and commercial use.
