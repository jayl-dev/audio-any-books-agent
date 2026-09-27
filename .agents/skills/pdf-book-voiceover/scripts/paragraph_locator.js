/**
 * paragraph_locator.js
 * Finds where each narrated paragraph sits on its PDF page so the player can highlight it.
 *
 * The narration rarely matches the printed text exactly (extraction artifacts are fixed,
 * code and diagrams are replaced by spoken descriptions), so paragraphs are located by
 * matching overlapping character windows against the page's text layer in reading order.
 * Paragraphs with no printed counterpart that sit between two located paragraphs (e.g. a
 * spoken description of a code block) are mapped to the text between them.
 *
 * Usage as Module:
 *   const { locateParagraphs } = require('./paragraph_locator');
 *   const rectsByPage = await locateParagraphs('book.pdf', { 4: ['First paragraph...', 'Second...'] });
 *   // => { 4: [[[x, y, w, h], ...], [...]] }  one list of line rects per paragraph,
 *   //    normalized to 0-1 of the page size with a top-left origin
 */

const fs = require('fs');
const pdfParse = require('pdf-parse');

const WINDOW = 20;
const STEP = 10;
// Short paragraphs such as headings get a second try with smaller windows
const SHORT_PARAGRAPH_CHARS = 80;
const SHORT_WINDOW = 10;
const SHORT_STEP = 5;
const MIN_HIT_RATIO = 0.25;
const MIN_PARAGRAPH_CHARS = 4;

function normalize(str) {
  return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

async function readPages(pdfPath, pageNums) {
  const wanted = new Set(pageNums.map(Number));
  const pages = {};
  await pdfParse(fs.readFileSync(pdfPath), {
    pagerender: async (pageData) => {
      const num = pageData.pageIndex + 1;
      if (!wanted.has(num)) return '';
      const { items } = await pageData.getTextContent();
      pages[num] = { viewport: pageData.getViewport(1), items };
      return '';
    }
  });
  return pages;
}

// Flatten a page's text items into a normalized character stream with a position per character
function buildCharStream({ viewport, items }) {
  let text = '';
  const chars = [];
  for (const item of items) {
    const str = item.str || '';
    if (!str.trim()) continue;
    const [a, b, c, d, x, y] = item.transform;
    const fontSize = Math.hypot(c, d) || Math.hypot(a, b);
    for (let i = 0; i < str.length; i++) {
      for (const ch of normalize(str[i])) {
        text += ch;
        chars.push({
          x0: x + (item.width * i) / str.length,
          x1: x + (item.width * (i + 1)) / str.length,
          base: y,
          fontSize
        });
      }
    }
  }
  return { text, chars, viewport };
}

// Locate a normalized paragraph in the stream, searching forward from `from`
function matchRange(stream, para, from) {
  if (para.length < MIN_PARAGRAPH_CHARS) return null;
  return matchWindows(stream, para, from, WINDOW, STEP) ||
    (para.length < SHORT_PARAGRAPH_CHARS ? matchWindows(stream, para, from, SHORT_WINDOW, SHORT_STEP) : null);
}

function matchWindows(stream, para, from, size, step) {
  const windows = [];
  if (para.length <= size) {
    windows.push(para);
  } else {
    for (let s = 0; s + size <= para.length; s += step) windows.push(para.slice(s, s + size));
    if ((para.length - size) % step !== 0) windows.push(para.slice(para.length - size));
  }

  let hits = 0;
  let start = -1;
  let end = -1;
  let cursor = from;
  for (const win of windows) {
    const idx = stream.text.indexOf(win, cursor);
    if (idx === -1) continue;
    hits++;
    if (start === -1) start = idx;
    end = Math.max(end, idx + win.length);
    cursor = idx + 1;
  }
  if (!hits || hits / windows.length < MIN_HIT_RATIO) return null;
  return { start, end };
}

// Convert a character range into one rect per text line, normalized to the page size
function rangeToRects(stream, { start, end }) {
  const lines = [];
  for (let i = start; i < end; i++) {
    const ch = stream.chars[i];
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.base - ch.base) < ch.fontSize * 0.5) {
      line.x0 = Math.min(line.x0, ch.x0);
      line.x1 = Math.max(line.x1, ch.x1);
      line.fontSize = Math.max(line.fontSize, ch.fontSize);
    } else {
      lines.push({ x0: ch.x0, x1: ch.x1, base: ch.base, fontSize: ch.fontSize });
    }
  }

  const [a, b, c, d, e, f] = stream.viewport.transform;
  const toView = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  const { width, height } = stream.viewport;
  const round = n => Math.round(n * 10000) / 10000;

  return lines.map(line => {
    const [ax, ay] = toView(line.x0, line.base + line.fontSize * 0.9);
    const [bx, by] = toView(line.x1, line.base - line.fontSize * 0.25);
    const left = Math.min(ax, bx) / width;
    const top = Math.min(ay, by) / height;
    return [round(left), round(top), round(Math.abs(bx - ax) / width), round(Math.abs(by - ay) / height)];
  });
}

function locateOnPage(stream, paragraphs) {
  const ranges = [];
  let cursor = 0;
  for (const para of paragraphs) {
    const range = matchRange(stream, normalize(para), cursor);
    ranges.push(range);
    if (range) cursor = range.end;
  }

  // Unmatched paragraphs between two matched ones cover the text between them
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i]) continue;
    const prev = ranges.slice(0, i).reverse().find(Boolean);
    const next = ranges.slice(i + 1).find(Boolean);
    if (prev && next && next.start > prev.end) {
      ranges[i] = { start: prev.end, end: next.start, gap: true };
    }
  }

  return ranges.map(range => (range ? rangeToRects(stream, range) : []));
}

async function locateParagraphs(pdfPath, paragraphsByPage) {
  const pageNums = Object.keys(paragraphsByPage);
  const pages = await readPages(pdfPath, pageNums);
  const result = {};
  for (const num of pageNums) {
    const paragraphs = paragraphsByPage[num];
    result[num] = pages[num]
      ? locateOnPage(buildCharStream(pages[num]), paragraphs)
      : paragraphs.map(() => []);
  }
  return result;
}

module.exports = { locateParagraphs, normalize };
