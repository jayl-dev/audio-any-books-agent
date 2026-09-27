/**
 * Generalized, Reusable Chapter Voiceover Generator
 * Part of the 'audio-any-books-agent' toolkit.
 *
 * Usage as CLI:
 *   node scripts/generate_chapter_voiceover.js --pdf <pdfPath> --pages <start>-<end> [--title <title>] [--prefix <prefix>] [--engine edge|gemini|openrouter|google-cloud] [--voice <voiceName>] [--model <geminiModel>] [--style <direction>] [--bookPageOffset <offset>] [--outDir <dir>]
 *
 * Usage as Module:
 *   const { processChapter } = require('./generate_chapter_voiceover');
 *   await processChapter({ pagesData, outputPrefix, title, pdfPath, voice });
 *
 * Output files are written next to the source PDF by default (or to the current
 * directory when no pdfPath is given). Pass `baseDir` / `--outDir` to override.
 */

const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const mp3Duration = require('mp3-duration');
const { createPlayerHtml } = require('./create_player_html');
const { preloaderInfo, createPreloader } = require('./make_pdf_preloader');
const { locateParagraphs } = require('./paragraph_locator');

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Gemini inline vocal tags such as <sigh>, <laughs> or <short pause>
const GEMINI_TAG_RE = /<[a-z][a-z ]{0,30}>/g;

function sanitizeForSpeech(text, { preserveTags = false } = {}) {
  const tags = [];
  if (preserveTags) {
    text = text.replace(GEMINI_TAG_RE, m => `\u0000${tags.push(m) - 1}\u0000`);
  }
  return text
    .replace(/<=/g, ' less than or equal to ')
    .replace(/>=/g, ' greater than or equal to ')
    .replace(/</g, ' less than ')
    .replace(/>/g, ' greater than ')
    .replace(/&&/g, ' and ')
    .replace(/&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/===/g, ' strictly equals ')
    .replace(/!==/g, ' strictly does not equal ')
    .replace(/!=/g, ' does not equal ')
    .replace(/==/g, ' equals ')
    .replace(/[\u25a0\u25cb\u25cf\u25aa\u25b6\u25b8\u25c0\u25c2\uF0A1\uF0B7]/g, ' ')
    .replace(/[•●▪■]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => tags[i])
    .trim();
}

const DEFAULT_VOICES = {
  edge: 'en-US-AndrewMultilingualNeural',
  gemini: 'Charon',
  // The same Gemini TTS models, called through OpenRouter
  openrouter: 'Charon',
  // Google Cloud Text-to-Speech: Gemini-TTS models or Chirp 3 HD, which share voice names with Gemini
  'google-cloud': 'Charon'
};
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash-lite-tts';
const GEMINI_ENGINES = ['gemini', 'openrouter'];

// Models available through Google Cloud Text-to-Speech. Gemini-TTS models take a style prompt and
// run through the Agent Platform (Vertex AI) API; Chirp 3 HD is Cloud TTS's own voice model.
const CHIRP_MODEL = 'chirp-3-hd';
const GOOGLE_CLOUD_MODELS = {
  'gemini-3.1-flash-tts-preview': 'Gemini 3.1 Flash TTS (recommended): expressive, follows style prompts',
  'gemini-2.5-pro-tts': 'Gemini 2.5 Pro TTS: highest fidelity of the 2.5 models, slower',
  'gemini-2.5-flash-tts': 'Gemini 2.5 Flash TTS: fast, follows style prompts',
  'gemini-2.5-flash-lite-preview-tts': 'Gemini 2.5 Flash-Lite TTS: fastest and cheapest Gemini option',
  [CHIRP_MODEL]: 'Chirp 3 HD: no style prompts; covered by the Cloud TTS monthly free tier'
};

const DEFAULT_MODELS = {
  gemini: DEFAULT_GEMINI_MODEL,
  openrouter: DEFAULT_GEMINI_MODEL,
  'google-cloud': 'gemini-3.1-flash-tts-preview'
};

// Model ids such as google/gemini-3.8-flash-tts contain slashes; keep cache file names flat
function safeName(name) {
  return String(name).replace(/[^\w.-]+/g, '_');
}

// Gemini models sometimes read the style prompt aloud when the text is very short (a heading such as
// "Module design." came out as "Clear, knowledgeable tech expert... Module design."), so short
// paragraphs are sent without it; they are mostly headings, which are read neutrally anyway.
const MIN_STYLED_CHARS = 60;
function styleFor(text, style) {
  return style && text.length >= MIN_STYLED_CHARS ? style : undefined;
}

// Whether an engine/model combination follows --style prompts
function supportsStyle(engine, model) {
  return GEMINI_ENGINES.includes(engine) || (engine === 'google-cloud' && model !== CHIRP_MODEL);
}
// Each Gemini request is capped at 16,384 output tokens (~11 min of audio at 25 tokens/s),
// so long pages are split into chunks of roughly 5 minutes of speech.
const GEMINI_MAX_CHARS = 4500;

async function synthesizePage(page, text, cacheDir, voice, options = {}) {
  return synthesizeSegment(`page_${page}`, `Page ${page}`, text, cacheDir, voice, options);
}

// Synthesize one piece of narration to MP3, cached as <cacheName>.mp3 (per engine)
async function synthesizeSegment(cacheName, label, text, cacheDir, voice, { engine = 'edge', model, style } = {}) {
  voice = voice || DEFAULT_VOICES[engine];
  model = model || DEFAULT_MODELS[engine];
  const cachePath = path.join(cacheDir, engine === 'edge' ? `${cacheName}.mp3` : `${cacheName}_${engine}_${safeName(model)}.mp3`);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000) {
    console.log(`${label} found in cache, skipping synthesis.`);
    return fs.readFileSync(cachePath);
  }

  let buf;
  if (GEMINI_ENGINES.includes(engine)) {
    buf = await synthesizeGemini(label, sanitizeForSpeech(text, { preserveTags: true }), voice, model, style, engine);
  } else if (engine === 'edge') {
    buf = await synthesizeEdge(label, sanitizeForSpeech(text), cacheDir, voice);
  } else if (engine === 'google-cloud') {
    buf = await synthesizeGoogleCloud(label, sanitizeForSpeech(text), voice, model, style);
  } else {
    throw new Error(`Unknown TTS engine "${engine}". Use "edge", "gemini", "openrouter" or "google-cloud".`);
  }
  fs.writeFileSync(cachePath, buf);
  return buf;
}

// Paragraphs are separated by blank lines; a page without blank lines is one paragraph
function splitParagraphs(text) {
  return String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

async function synthesizeEdge(label, cleanText, cacheDir, voice) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let tts;
    try {
      tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const res = await tts.toFile(cacheDir, cleanText);
      tts.close();
      const buf = fs.readFileSync(res.audioFilePath);
      try { fs.unlinkSync(res.audioFilePath); } catch (_) {}
      return buf;
    } catch (err) {
      if (tts) {
        try { tts.close(); } catch (_) {}
      }
      console.warn(`Attempt ${attempt} for ${label} failed: ${err.message}`);
      if (attempt === 4) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

// Google Cloud Text-to-Speech (Gemini-TTS models or Chirp 3 HD). Authenticates with a service account
// key named by GOOGLE_APPLICATION_CREDENTIALS (environment or .env; relative paths resolve against the
// repo root). Text is capped per request (5,000 bytes for Chirp, 4,000 bytes for Gemini-TTS), so long
// paragraphs are split by sentence.
const GOOGLE_CLOUD_MAX_CHARS = { chirp: 4000, gemini: 3500 };
// Paragraph requests sent at once for this engine; Gemini-TTS takes several seconds per request
const GOOGLE_CLOUD_CONCURRENCY = 4;
let googleCloudAuth = null;

async function getGoogleCloudToken() {
  if (!googleCloudAuth) {
    loadEnvFile();
    let keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyFile) {
      throw new Error('The google-cloud engine needs a service account key. Set GOOGLE_APPLICATION_CREDENTIALS to the key file path (in .env or the environment).');
    }
    if (!path.isAbsolute(keyFile)) keyFile = path.join(__dirname, '..', keyFile);
    if (!fs.existsSync(keyFile)) throw new Error(`Service account key not found: ${keyFile}`);
    const { GoogleAuth } = require('google-auth-library');
    googleCloudAuth = new GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }
  const client = await googleCloudAuth.getClient();
  return (await client.getAccessToken()).token;
}

// A short voice name such as "Charon" means US English; a full Chirp name such as
// "en-GB-Chirp3-HD-Charon" sets the language (and, for Gemini-TTS models, just the voice name)
function googleCloudVoice(voice, model) {
  if (/Neural$/.test(voice)) {
    throw new Error(`"${voice}" is an Edge voice. Pick a Gemini / Chirp 3 HD voice such as Charon, Kore or Puck.`);
  }
  const parts = voice.split('-');
  const languageCode = parts.length > 2 ? parts.slice(0, 2).join('-') : 'en-US';
  const shortName = parts[parts.length - 1];
  if (model === CHIRP_MODEL) return { languageCode, name: voice.includes('-') ? voice : `en-US-Chirp3-HD-${voice}` };
  return { languageCode, name: shortName, modelName: model };
}

async function synthesizeGoogleCloud(label, cleanText, voice, model = DEFAULT_MODELS['google-cloud'], style) {
  const voiceParams = googleCloudVoice(voice, model);
  const isChirp = model === CHIRP_MODEL;
  const chunks = splitForTts(cleanText, isChirp ? GOOGLE_CLOUD_MAX_CHARS.chirp : GOOGLE_CLOUD_MAX_CHARS.gemini);
  const pcmParts = [];
  let sampleRate = 24000;
  for (let c = 0; c < chunks.length; c++) {
    const chunkLabel = chunks.length > 1 ? `${label} part ${c + 1}/${chunks.length}` : label;
    let prompt = isChirp ? undefined : styleFor(chunks[c], style);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${await getGoogleCloudToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: prompt ? { text: chunks[c], prompt } : { text: chunks[c] },
            voice: voiceParams,
            audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 }
          })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(`${res.status} ${(body.error && body.error.message) || res.statusText}`);
          err.status = res.status;
          throw err;
        }
        const decoded = decodePcm(Buffer.from(body.audioContent, 'base64'), 24000);
        // Far longer audio than the text needs usually means the style prompt was read aloud (it adds
        // about 4 seconds): redo it without the prompt. Expected length assumes ~15 characters a second.
        const seconds = decoded.samples.length / decoded.sampleRate;
        const expected = chunks[c].length / 15;
        if (prompt && seconds - expected > Math.max(3, expected * 0.35)) {
          console.warn(`${chunkLabel}: ${seconds.toFixed(1)}s of audio for ${chunks[c].length} characters; retrying without the style prompt.`);
          prompt = undefined;
          attempt--;
          continue;
        }
        sampleRate = decoded.sampleRate;
        pcmParts.push(decoded.samples);
        break;
      } catch (err) {
        console.warn(`Attempt ${attempt} for ${chunkLabel} failed: ${err.message}`);
        // Bad credentials, a disabled API, or an unknown voice will not succeed on retry
        if (attempt === MAX_ATTEMPTS || [400, 401, 403, 404].includes(err.status) || !err.status && /key|credentials/i.test(err.message)) {
          if (err.status === 403) {
            err.message += isChirp
              ? '\nCheck that the Cloud Text-to-Speech API is enabled for the project and the service account can use it.'
              : '\nGemini-TTS models also need the Agent Platform (Vertex AI) API enabled and the "Agent Platform User" role (roles/aiplatform.user) on the service account, granted on the project\'s IAM page. Or use --model chirp-3-hd.';
          }
          if (err.status === 400 && /not supported/i.test(err.message)) {
            err.message += `\nSupported --model values for google-cloud: ${Object.keys(GOOGLE_CLOUD_MODELS).join(', ')}.`;
          }
          throw err;
        }
        await new Promise(r => setTimeout(r, (err.status === 429 ? 10000 : 2000) * attempt));
      }
    }
  }
  return encodeMp3(concatPcm(pcmParts), sampleRate);
}

// Split text at sentence boundaries into chunks of at most maxChars
function splitForTts(text, maxChars = GEMINI_MAX_CHARS) {
  const chunks = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const pieces = sentence.length <= maxChars
      ? [sentence]
      : sentence.match(new RegExp(`.{1,${maxChars}}(\\s|$)`, 'g')) || [sentence];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 1 > maxChars) {
        chunks.push(current.trim());
        current = '';
      }
      current += (current ? ' ' : '') + piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Returns mono 16-bit PCM samples from a WAV buffer (or raw L16 PCM when no RIFF header)
function decodePcm(buf, fallbackSampleRate = 24000) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') {
    const len = buf.length - (buf.length % 2);
    return { samples: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len)), sampleRate: fallbackSampleRate };
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = fallbackSampleRate;
  let bitsPerSample = 16;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    let size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      // Streaming-style WAVs may carry a placeholder size; clamp to what is present
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      if (bitsPerSample !== 16) throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
      const interleaved = new Int16Array(buf.buffer.slice(buf.byteOffset + body, buf.byteOffset + body + size - (size % 2)));
      if (channels === 1) return { samples: interleaved, sampleRate };
      const mono = new Int16Array(Math.floor(interleaved.length / channels));
      for (let i = 0; i < mono.length; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += interleaved[i * channels + c];
        mono[i] = Math.round(sum / channels);
      }
      return { samples: mono, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV response has no data chunk');
}

// Encode PCM to MP3 matching the Edge output (mono, 48 kbps) so pages concatenate cleanly
async function encodeMp3(samples, sampleRate) {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(1, sampleRate, 48);
  const parts = [];
  const block = 1152 * 20;
  for (let i = 0; i < samples.length; i += block) {
    const out = encoder.encodeBuffer(samples.subarray(i, i + block));
    if (out.length) parts.push(Buffer.from(out));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}

// Load API keys (GEMINI_API_KEY, OPENROUTER_API_KEY) from a .env file in the current directory or the repo root.
// Variables already set in the environment take precedence.
function loadEnvFile() {
  for (const candidate of [path.resolve('.env'), path.join(__dirname, '..', '.env')]) {
    if (fs.existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

let geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    loadEnvFile();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('The Gemini engine needs an API key. Set GEMINI_API_KEY (get one at https://aistudio.google.com/apikey).');
    }
    const { GoogleGenAI } = require('@google/genai');
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function checkGeminiVoice(voice) {
  if (/Neural$/.test(voice)) {
    throw new Error(`"${voice}" is an Edge voice. Pick a Gemini voice such as Charon, Kore or Puck.`);
  }
}

// Gemini TTS through Google's API
async function googleSpeech(text, voice, model, style) {
  const client = getGeminiClient();
  const textPart = { type: 'text', text };
  if (style) textPart.annotations = [{ type: 'speech_metadata', style }];
  const interaction = await client.interactions.create({
    model,
    input: [{ type: 'user_input', content: [textPart] }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice }] }
  });
  const audio = interaction.output_audio;
  if (!audio || !audio.data) throw new Error('Response contained no audio');
  return decodePcm(Buffer.from(audio.data, 'base64'), audio.sample_rate || 24000);
}

function getOpenRouterKey() {
  loadEnvFile();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('The OpenRouter engine needs an API key. Set OPENROUTER_API_KEY (get one at https://openrouter.ai/keys).');
  }
  return apiKey;
}

// Gemini TTS through OpenRouter's speech endpoint; raw PCM (24 kHz, 16-bit, mono) comes back
async function openRouterSpeech(text, voice, model, style) {
  const body = { model: model.includes('/') ? model : `google/${model}`, input: text, voice, response_format: 'pcm' };
  if (style) {
    const google = { speech_metadata: { style } };
    body.provider = { options: { 'google-ai-studio': google, 'google-vertex': google } };
  }
  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getOpenRouterKey()}`, 'Content-Type': 'application/json', 'X-Title': 'audio-any-books-agent' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let message = await res.text();
    try {
      const { error } = JSON.parse(message);
      // Upstream (Google) errors such as safety blocks are passed through in metadata.raw
      message = [error.message, error.metadata && error.metadata.raw].filter(Boolean).join(' ');
    } catch (_) {}
    const retryAfter = res.headers.get('retry-after');
    const err = new Error(`${res.status} ${message}${retryAfter ? ` Please retry in ${retryAfter}s.` : ''}`);
    err.status = res.status;
    err.body = message;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('Response contained no audio');
  return decodePcm(buf, 24000);
}

const MAX_ATTEMPTS = 5;
// Safety-filter refusals of a multi-paragraph request before it is re-sent one paragraph at a time.
// Refusals are much more likely on longer text, and each one takes about a minute, so switch early.
const MAX_BLOCKS_BEFORE_SPLIT = 2;

// One Gemini TTS request (direct or via OpenRouter) with retries; returns mono PCM.
// maxBlocks caps safety-filter refusals separately from other failures such as rate limits.
async function geminiRequest(label, text, voice, model, style, engine = 'gemini', { maxBlocks = MAX_ATTEMPTS } = {}) {
  // Fail fast on a missing key rather than retrying it
  if (engine === 'openrouter') getOpenRouterKey();
  else getGeminiClient();
  const speak = engine === 'openrouter' ? openRouterSpeech : googleSpeech;
  let blocks = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await speak(text, voice, model, style);
    } catch (err) {
      console.warn(`Attempt ${attempt} for ${label} failed: ${err.message}`);
      const status = err.status || err.code;
      // The safety filter occasionally blocks harmless text; the same request usually passes on retry
      const contentBlocked = /content_blocked|blocked for an unspecified policy reason/i.test(`${err.message} ${err.body || ''}`);
      if (contentBlocked) blocks++;
      // Bad keys, missing credits, unknown voices and malformed requests will not succeed on retry
      if (attempt === MAX_ATTEMPTS || (contentBlocked && blocks >= maxBlocks) ||
          ([400, 401, 402, 403, 404].includes(status) && !contentBlocked)) {
        if (status === 429) {
          err.message += engine === 'openrouter'
            ? '\nOpenRouter is rate limiting this key. Wait a bit and re-run, or use --engine edge.'
            : '\nThe Gemini quota is used up. Wait for it to reset, enable billing on the key, or use --engine edge.';
        }
        if (status === 402) err.message += '\nThe OpenRouter account is out of credits. Add credits at https://openrouter.ai/settings/credits.';
        err.contentBlocked = contentBlocked;
        throw err;
      }
      // Rate limits say how long to wait ("Please retry in 35s")
      const retryIn = /retry in (\d+(?:\.\d+)?)s/i.exec(err.message);
      const delay = status === 429 ? (retryIn ? Number(retryIn[1]) + 1 : 15 * attempt) * 1000 : 2000 * attempt;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function concatPcm(parts) {
  const samples = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    samples.set(p, pos);
    pos += p.length;
  }
  return samples;
}

async function synthesizeGemini(label, cleanText, voice, model, style, engine = 'gemini') {
  checkGeminiVoice(voice);
  const chunks = splitForTts(cleanText);
  const pcmParts = [];
  let sampleRate = 24000;
  for (let c = 0; c < chunks.length; c++) {
    const chunkLabel = chunks.length > 1 ? `${label} part ${c + 1}/${chunks.length}` : label;
    const decoded = await geminiRequest(chunkLabel, chunks[c], voice, model, styleFor(chunks[c], style), engine);
    sampleRate = decoded.sampleRate;
    pcmParts.push(decoded.samples);
  }
  return encodeMp3(concatPcm(pcmParts), sampleRate);
}

// Pauses in speech: runs of at least 150 ms well below the loud level, as { start, end, length } in seconds
function findPauses(samples, sampleRate) {
  const frame = Math.max(1, Math.round(sampleRate * 0.01));
  const frames = Math.floor(samples.length / frame);
  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const threshold = (sorted[Math.floor(frames * 0.95)] || 1) * 0.03;
  const pauses = [];
  let start = -1;
  for (let f = 0; f <= frames; f++) {
    const silent = f < frames && rms[f] < threshold;
    if (silent && start < 0) start = f;
    if (!silent && start >= 0) {
      if (f - start >= 15) {
        pauses.push({ start: (start * frame) / sampleRate, end: (f * frame) / sampleRate, length: ((f - start) * frame) / sampleRate });
      }
      start = -1;
    }
  }
  return pauses;
}

// Start time (seconds) of each part within one audio chunk. Breaks are snapped to pauses, choosing
// the in-order set of pauses that favours long pauses (paragraph breaks) while keeping every part's
// length close to its expected duration (its text length at the chunk's average speaking rate).
const BOUNDARY_WINDOW = 0.2;         // only consider pauses within +/- 20% of the chunk of a break's text-share position
const BOUNDARY_DURATION_COST = 0.05; // score lost per second a part's length differs from its expected duration
const BOUNDARY_LEAD = 0.1;           // switch the highlight just before speech resumes

function placeBoundaries(parts, samples, sampleRate) {
  const duration = samples.length / sampleRate;
  const totalChars = parts.reduce((n, p) => n + p.length, 0);
  const expectedDur = parts.map(p => (duration * p.length) / totalChars);
  const expectedAt = [];
  let acc = 0;
  for (let i = 1; i < parts.length; i++) {
    acc += expectedDur[i - 1];
    expectedAt.push(acc);
  }
  if (!expectedAt.length) return [0];

  const breaks = findPauses(samples, sampleRate).map(p => ({
    at: Math.max(p.start, p.end - BOUNDARY_LEAD),
    mid: (p.start + p.end) / 2,
    length: p.length
  }));
  const window = Math.max(3, duration * BOUNDARY_WINDOW);
  const K = expectedAt.length;
  const inWindow = (k, b) => Math.abs(b.mid - expectedAt[k]) <= window;
  const mismatch = (length, k) => BOUNDARY_DURATION_COST * Math.abs(length - expectedDur[k]);

  // best[k][j]: best score with break k (the start of part k + 1) at pause j, pauses strictly in order
  const best = Array.from({ length: K }, () => new Array(breaks.length).fill(-Infinity));
  const from = Array.from({ length: K }, () => new Array(breaks.length).fill(-1));
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < breaks.length; j++) {
      if (!inWindow(k, breaks[j])) continue;
      if (k === 0) {
        best[k][j] = breaks[j].length - mismatch(breaks[j].at, 0);
        continue;
      }
      for (let i = 0; i < j; i++) {
        if (best[k - 1][i] === -Infinity || breaks[j].at - breaks[i].at < 0.3) continue;
        const s = best[k - 1][i] + breaks[j].length - mismatch(breaks[j].at - breaks[i].at, k);
        if (s > best[k][j]) {
          best[k][j] = s;
          from[k][j] = i;
        }
      }
    }
  }

  // The last part runs from the final break to the end of the chunk
  let j = -1;
  let top = -Infinity;
  best[K - 1].forEach((v, i) => {
    if (v === -Infinity) return;
    const s = v - mismatch(duration - breaks[i].at, K);
    if (s > top) {
      top = s;
      j = i;
    }
  });
  if (j < 0) {
    // No consistent set of pauses: fall back to the text-share estimates
    return [0, ...expectedAt];
  }
  const offsets = new Array(K);
  for (let k = K - 1; k >= 0; k--) {
    offsets[k] = breaks[j].at;
    j = from[k][j];
  }
  return [0, ...offsets];
}

// Group whole paragraphs into request-sized chunks; a paragraph longer than a chunk is split by sentence
function packParagraphs(paragraphs, maxChars = GEMINI_MAX_CHARS) {
  const chunks = [];
  let current = [];
  let size = 0;
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
    size = 0;
  };
  paragraphs.forEach((text, index) => {
    if (text.length > maxChars) {
      flush();
      splitForTts(text, maxChars).forEach((piece, n) => chunks.push([{ index, text: piece, starts: n === 0 }]));
      return;
    }
    if (size && size + text.length + 2 > maxChars) flush();
    current.push({ index, text, starts: true });
    size += text.length + 2;
  });
  flush();
  return chunks;
}

// Name the paragraph Gemini's safety filter refuses, so the script can be reworded
function blockedParagraphError(err, label, part, paragraphs) {
  if (!err.contentBlocked) return err;
  const text = paragraphs[part.index];
  err.message = `Gemini's safety filter keeps blocking ${label}, paragraph ${part.index + 1}: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}". ` +
    'It is usually a false positive; reword that paragraph slightly in the script and re-run (finished pages are cached), or use --engine edge.';
  return err;
}

// Voice a page's paragraphs with as few Gemini requests as possible; returns the MP3 and
// each paragraph's start offset (seconds) within it
async function synthesizeGeminiParagraphs(label, paragraphs, voice, model, style, engine = 'gemini') {
  checkGeminiVoice(voice);
  const clean = paragraphs.map(p => sanitizeForSpeech(p, { preserveTags: true }));
  const chunks = packParagraphs(clean);
  const pcmParts = [];
  const offsets = new Array(paragraphs.length).fill(null);
  let sampleRate = 24000;
  let elapsed = 0;

  for (let c = 0; c < chunks.length; c++) {
    const parts = chunks[c];
    const chunkLabel = chunks.length > 1 ? `${label} part ${c + 1}/${chunks.length}` : label;
    let decoded;
    try {
      // A chunk of several paragraphs can fall back to single paragraphs, so give up on it sooner
      const maxBlocks = parts.length > 1 ? MAX_BLOCKS_BEFORE_SPLIT : MAX_ATTEMPTS;
      decoded = await geminiRequest(chunkLabel, parts.map(p => p.text).join('\n\n'), voice, model, style, engine, { maxBlocks });
    } catch (err) {
      if (!err.contentBlocked || parts.length === 1) throw blockedParagraphError(err, label, parts[0], paragraphs);
      // The safety filter keeps rejecting this chunk: send its paragraphs one at a time instead,
      // which isolates any paragraph it objects to (and makes these paragraph timings exact)
      console.warn(`${chunkLabel} keeps being blocked; retrying it one paragraph at a time.`);
      for (const part of parts) {
        let single;
        try {
          single = await geminiRequest(`${label} paragraph ${part.index + 1}`, part.text, voice, model, styleFor(part.text, style), engine);
        } catch (partErr) {
          throw blockedParagraphError(partErr, label, part, paragraphs);
        }
        sampleRate = single.sampleRate;
        if (part.starts) offsets[part.index] = elapsed;
        pcmParts.push(single.samples);
        elapsed += single.samples.length / sampleRate;
      }
      continue;
    }
    sampleRate = decoded.sampleRate;
    const starts = placeBoundaries(parts.map(p => p.text), decoded.samples, sampleRate);
    parts.forEach((part, i) => {
      if (part.starts) offsets[part.index] = elapsed + starts[i];
    });
    pcmParts.push(decoded.samples);
    elapsed += decoded.samples.length / sampleRate;
  }

  return { buf: await encodeMp3(concatPcm(pcmParts), sampleRate), offsets };
}

// Voice one page and return { buf, offsets }: the page MP3 and each paragraph's start (seconds).
// Edge voices each paragraph separately (exact timings); Gemini uses one request per page to
// stay within its request quota and finds paragraph breaks from the pauses in the audio.
async function synthesizePageParagraphs(pageNum, paragraphs, cacheDir, voice, { engine = 'edge', model, style } = {}) {
  voice = voice || DEFAULT_VOICES[engine];
  model = model || DEFAULT_MODELS[engine];
  const label = `Page ${pageNum}`;

  if (GEMINI_ENGINES.includes(engine)) {
    const cachePath = path.join(cacheDir, `page_${pageNum}_${engine}_${safeName(model)}.mp3`);
    const offsetsPath = path.join(cacheDir, `page_${pageNum}_${engine}_${safeName(model)}.json`);
    if (fs.existsSync(cachePath) && fs.existsSync(offsetsPath)) {
      console.log(`${label} found in cache, skipping synthesis.`);
      return { buf: fs.readFileSync(cachePath), offsets: JSON.parse(fs.readFileSync(offsetsPath, 'utf8')) };
    }
    const result = await synthesizeGeminiParagraphs(label, paragraphs, voice, model, style, engine);
    fs.writeFileSync(cachePath, result.buf);
    fs.writeFileSync(offsetsPath, JSON.stringify(result.offsets));
    return result;
  }

  // Edge and Google Cloud voice each paragraph separately (exact timings); Google Cloud sends a
  // few paragraphs at once since its free tier and quota are counted in characters, not requests
  const concurrency = engine === 'google-cloud' ? GOOGLE_CLOUD_CONCURRENCY : 1;
  const buffers = new Array(paragraphs.length);
  let next = 0;
  const worker = async () => {
    while (next < paragraphs.length) {
      const i = next++;
      const paraLabel = paragraphs.length > 1 ? `${label} paragraph ${i + 1}` : label;
      buffers[i] = await synthesizeSegment(`page_${pageNum}_p${i + 1}`, paraLabel, paragraphs[i], cacheDir, voice, { engine, model, style });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, paragraphs.length) }, worker));

  const offsets = [];
  let elapsed = 0;
  for (const buf of buffers) {
    offsets.push(elapsed);
    elapsed += await mp3Duration(buf);
  }
  return { buf: Buffer.concat(buffers), offsets };
}

async function processChapter({
  pagesData,
  outputPrefix,
  title,
  pdfPath,
  engine = 'edge',
  voice = DEFAULT_VOICES[engine],
  model,
  style = null,
  bookPageOffset = 0,
  pageMap = null,
  baseDir = pdfPath ? path.dirname(path.resolve(pdfPath)) : process.cwd()
}) {
  model = model || DEFAULT_MODELS[engine];
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  console.log(`Output directory: ${baseDir}`);
  console.log(`TTS engine: ${engine}${model ? ` (${model})` : ''}, voice: ${voice}`);
  if (style && !supportsStyle(engine, model)) console.warn(`Note: --style only applies to Gemini voices; ${model || engine} ignores it.`);

  const cacheDir = path.join(baseDir, `audio_${outputPrefix}_cache`);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const sortedPages = Object.keys(pagesData)
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  if (sortedPages.length === 0) {
    throw new Error('No page data provided to processChapter.');
  }

  const chapterTitle = title || outputPrefix.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // 1. Save full transcript
  let scriptMd = `# ${chapterTitle}\n\n`;
  if (pdfPath) scriptMd += `Source PDF: \`${path.basename(pdfPath)}\`\n\n---\n\n`;
  for (const pageNum of sortedPages) {
    const bookPage = pageMap && pageMap[pageNum] !== undefined ? pageMap[pageNum] : pageNum + bookPageOffset;
    scriptMd += `## PDF Page ${pageNum} (Book Page ${bookPage})\n\n${pagesData[pageNum]}\n\n---\n\n`;
  }
  fs.writeFileSync(path.join(baseDir, `${outputPrefix}_script.md`), scriptMd, 'utf8');
  console.log(`Saved transcript script: ${outputPrefix}_script.md`);

  // 2. Synthesize each page and record where each paragraph starts
  const pageBuffers = [];
  const pageDurations = [];
  const paragraphTimings = [];

  for (const pageNum of sortedPages) {
    const bookPage = pageMap && pageMap[pageNum] !== undefined ? pageMap[pageNum] : pageNum + bookPageOffset;
    const paragraphs = splitParagraphs(pagesData[pageNum]);
    console.log(`Synthesizing Page ${pageNum} (Book p. ${bookPage}), ${paragraphs.length} paragraph(s)...`);

    const { buf, offsets } = await synthesizePageParagraphs(pageNum, paragraphs, cacheDir, voice, { engine, model, style });
    const duration = await mp3Duration(buf);
    paragraphs.forEach((text, i) => {
      const end = i + 1 < offsets.length ? offsets[i + 1] : duration;
      paragraphTimings.push({ page: pageNum, bookPage, paragraph: i + 1, offset: offsets[i], duration: end - offsets[i], text });
    });
    console.log(`Page ${pageNum} complete: ${duration.toFixed(3)}s`);

    pageBuffers.push(buf);
    pageDurations.push({
      page: pageNum,
      bookPage: bookPage,
      duration: duration,
      buffer: buf
    });
  }

  // 3. Concatenate master MP3
  const masterBuffer = Buffer.concat(pageBuffers);
  const masterMp3Path = path.join(baseDir, `${outputPrefix}.mp3`);
  fs.writeFileSync(masterMp3Path, masterBuffer);
  // Also save a fallback copy with _voiceover.mp3
  fs.writeFileSync(path.join(baseDir, `${outputPrefix}_voiceover.mp3`), masterBuffer);

  const totalDuration = await mp3Duration(masterBuffer);
  console.log(`Saved master audio: ${outputPrefix}.mp3 (${(totalDuration / 60).toFixed(2)} min, ${(masterBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // 4. Compute timing markers
  let currentStart = 0;
  const markers = [];
  for (const item of pageDurations) {
    const startSec = currentStart;
    const endSec = currentStart + item.duration;
    markers.push({
      page: item.page,
      bookPage: item.bookPage,
      startTime: formatTime(startSec),
      endTime: formatTime(endSec),
      startSeconds: Number(startSec.toFixed(3)),
      endSeconds: Number(endSec.toFixed(3)),
      durationSeconds: Number(item.duration.toFixed(3))
    });
    currentStart = endSec;
  }

  // Save JSON
  fs.writeFileSync(path.join(baseDir, `${outputPrefix}_markers.json`), JSON.stringify(markers, null, 2), 'utf8');
  console.log(`Saved markers JSON: ${outputPrefix}_markers.json`);

  // Save CSV
  let csv = 'PDF Page,Book Page,Start Time,End Time,Start Seconds,End Seconds,Duration Seconds\n';
  for (const m of markers) {
    csv += `${m.page},${m.bookPage},${m.startTime},${m.endTime},${m.startSeconds},${m.endSeconds},${m.durationSeconds}\n`;
  }
  fs.writeFileSync(path.join(baseDir, `${outputPrefix}_markers.csv`), csv, 'utf8');
  console.log(`Saved markers CSV: ${outputPrefix}_markers.csv`);

  // Save WebVTT
  let vtt = `WEBVTT - ${chapterTitle}\n\n`;
  for (const m of markers) {
    vtt += `${m.startTime} --> ${m.endTime}\nPage ${m.page} (Book p. ${m.bookPage})\n\n`;
  }
  fs.writeFileSync(path.join(baseDir, `${outputPrefix}_markers.vtt`), vtt, 'utf8');
  console.log(`Saved markers WebVTT: ${outputPrefix}_markers.vtt`);

  // Paragraph markers with their positions on the PDF page (for the player's highlight)
  const paragraphMarkers = paragraphTimings.map(p => {
    const pageStart = markers.find(m => m.page === p.page).startSeconds;
    const startSec = pageStart + p.offset;
    const endSec = startSec + p.duration;
    return {
      page: p.page,
      bookPage: p.bookPage,
      paragraph: p.paragraph,
      startTime: formatTime(startSec),
      endTime: formatTime(endSec),
      startSeconds: Number(startSec.toFixed(3)),
      endSeconds: Number(endSec.toFixed(3)),
      text: p.text,
      rects: []
    };
  });
  if (pdfPath && fs.existsSync(pdfPath)) {
    try {
      const byPage = {};
      for (const p of paragraphTimings) (byPage[p.page] = byPage[p.page] || []).push(p.text);
      const rectsByPage = await locateParagraphs(pdfPath, byPage);
      for (const m of paragraphMarkers) m.rects = rectsByPage[m.page][m.paragraph - 1] || [];
      const located = paragraphMarkers.filter(m => m.rects.length).length;
      console.log(`Located ${located} of ${paragraphMarkers.length} paragraph(s) on the PDF pages`);
    } catch (err) {
      console.warn('Could not locate paragraphs on the PDF pages:', err.message);
    }
  }
  fs.writeFileSync(path.join(baseDir, `${outputPrefix}_paragraphs.json`), JSON.stringify(paragraphMarkers, null, 2), 'utf8');
  console.log(`Saved paragraph markers: ${outputPrefix}_paragraphs.json`);

  // 5a. Base64 PDF preloader so the player opens straight from disk (file://) without CORS errors
  let preloader = null;
  if (pdfPath && fs.existsSync(pdfPath)) {
    const { fileName, varName } = preloaderInfo(pdfPath);
    const preloaderPath = path.join(baseDir, fileName);
    if (!fs.existsSync(preloaderPath) || fs.statSync(preloaderPath).mtimeMs < fs.statSync(pdfPath).mtimeMs) {
      createPreloader(pdfPath, preloaderPath);
      console.log(`Created PDF preloader: ${fileName}`);
    }
    preloader = { fileName, varName };
  }

  // 5. Generate Synchronized HTML Player
  try {
    const pdfFilename = pdfPath ? path.basename(pdfPath) : 'book.pdf';
    const playerHtml = createPlayerHtml({
      title: chapterTitle,
      pdfFilename: pdfFilename,
      audioFilename: `${outputPrefix}.mp3`,
      markers: markers,
      paragraphs: paragraphMarkers,
      base64Filename: preloader && preloader.fileName,
      base64VarName: preloader && preloader.varName
    });
    const playerPath = path.join(baseDir, `${outputPrefix}_player.html`);
    fs.writeFileSync(playerPath, playerHtml, 'utf8');
    console.log(`Generated Synchronized HTML Player: ${outputPrefix}_player.html`);
  } catch (playerErr) {
    console.warn('Could not generate HTML player:', playerErr.message);
  }

  // Clean cache
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  return { masterMp3Path, totalDuration, markers, paragraphs: paragraphMarkers };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const pdfArg = getArg('pdf');
  const pagesArg = getArg('pages');
  const titleArg = getArg('title');
  const prefixArg = getArg('prefix') || 'chapter_output';
  const engineArg = (getArg('engine') || 'edge').toLowerCase();
  const voiceArg = getArg('voice') || DEFAULT_VOICES[engineArg];
  const modelArg = getArg('model') || DEFAULT_MODELS[engineArg];
  const styleArg = getArg('style');
  const scriptArg = getArg('script'); // JSON file with { pageNum: text }
  const offsetArg = parseInt(getArg('bookPageOffset') || '0', 10);
  const outDirArg = getArg('outDir');
  const bookDir = pdfArg ? path.dirname(path.resolve(pdfArg)) : process.cwd();
  // --script may be given relative to the cwd or to the book's folder
  const scriptPath = scriptArg && !fs.existsSync(scriptArg) && fs.existsSync(path.resolve(bookDir, scriptArg))
    ? path.resolve(bookDir, scriptArg)
    : scriptArg;

  (async () => {
    if (!DEFAULT_VOICES[engineArg]) {
      console.error(`Unknown --engine "${engineArg}". Use "edge", "gemini", "openrouter" or "google-cloud".`);
      process.exit(1);
    }
    let pagesData = {};

    if (scriptPath && fs.existsSync(scriptPath)) {
      pagesData = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
    } else if (pdfArg && pagesArg) {
      const pdfParse = require('pdf-parse');
      const [startP, endP] = pagesArg.split('-').map(Number);
      if (isNaN(startP) || isNaN(endP)) {
        console.error('Invalid --pages argument. Format: --pages <start>-<end>');
        process.exit(1);
      }
      console.log(`Extracting raw text from ${pdfArg} for pages ${startP} to ${endP}...`);
      const buf = fs.readFileSync(pdfArg);
      let cur = 0;
      await pdfParse(buf, {
        pagerender: (pageData) => {
          cur++;
          if (cur >= startP && cur <= endP) {
            return pageData.getTextContent().then(tc => {
              const text = tc.items.map(s => s.str).join(' ');
              pagesData[cur] = text;
              return text;
            });
          }
          return '';
        }
      });
    } else {
      console.log(`
Usage:
  node scripts/generate_chapter_voiceover.js --script pages.json --title "Chapter Title" --prefix ch1
  node scripts/generate_chapter_voiceover.js --pdf "book.pdf" --pages 10-25 --title "Chapter Title" --prefix ch1

Options:
  --engine <name>        TTS engine (default: edge, free Microsoft voices):
                           gemini        Gemini 3.8 TTS via Google (GEMINI_API_KEY)
                           openrouter    Gemini 3.8 TTS via OpenRouter (OPENROUTER_API_KEY)
                           google-cloud  Google Cloud Text-to-Speech (GOOGLE_APPLICATION_CREDENTIALS)
  --voice <name>         Edge voice (default ${DEFAULT_VOICES.edge}), or a Gemini / Chirp 3 HD voice
                         such as Charon (default), Kore or Sadaltager
  --model <id>           gemini / openrouter: ${DEFAULT_GEMINI_MODEL} (default) or gemini-3.8-flash-tts
                         google-cloud: ${Object.entries(GOOGLE_CLOUD_MODELS).map(([id, d]) => `\n                           ${id}${id === DEFAULT_MODELS['google-cloud'] ? ' (default)' : ''}: ${d.replace(/ \(recommended\)/, '')}`).join('')}
  --style "<direction>"  Delivery direction for Gemini models, e.g. "warm, unhurried audiobook narrator" (ignored by Edge and Chirp 3 HD)
  --outDir <dir>         Output folder (default: the PDF's folder)
      `);
      process.exit(0);
    }

    await processChapter({
      pagesData,
      outputPrefix: prefixArg,
      title: titleArg,
      pdfPath: pdfArg,
      engine: engineArg,
      voice: voiceArg,
      model: modelArg,
      style: styleArg,
      bookPageOffset: offsetArg,
      baseDir: outDirArg ? path.resolve(outDirArg) : bookDir
    });
    console.log('\nProcessing completed successfully!');
  })().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { processChapter, synthesizePage, splitParagraphs, packParagraphs, findPauses, placeBoundaries, sanitizeForSpeech, formatTime, splitForTts, decodePcm, encodeMp3 };
