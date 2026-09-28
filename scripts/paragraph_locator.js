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
  const [va, vb, vc, vd, , vf] = viewport.transform;
  for (const item of items) {
    const str = item.str || '';
    if (!str.trim()) continue;
    const [a, b, c, d, x, y] = item.transform;
    // Skip page numbers (number-only text in the top or bottom margin) so highlights don't reach them
    const top = (vb * x + vd * y + vf) / viewport.height;
    if (/^\s*([0-9]+|[ivxlcdm]+)\s*$/i.test(str) && (top < 0.15 || top > 0.85)) continue;
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
    windows.push({ text: para, offset: 0 });
  } else {
    for (let s = 0; s + size <= para.length; s += step) windows.push({ text: para.slice(s, s + size), offset: s });
    if ((para.length - size) % step !== 0) windows.push({ text: para.slice(para.length - size), offset: para.length - size });
  }

  // Each window should sit near its own offset from where the paragraph starts; a hit far from that
  // is the same words recurring elsewhere (common over a whole EPUB chapter) and is ignored
  const drift = para.length * 0.5 + 100;
  let hits = 0;
  let start = -1;
  let end = -1;
  let base = null;
  let cursor = from;
  for (const win of windows) {
    const idx = stream.text.indexOf(win.text, cursor);
    if (idx === -1) continue;
    if (base !== null && Math.abs(idx - (base + win.offset)) > drift) continue;
    if (base === null) base = idx - win.offset;
    hits++;
    if (start === -1) start = idx;
    end = Math.max(end, idx + win.text.length);
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
  return locateRanges(stream, paragraphs).map(range => (range ? rangeToRects(stream, range) : []));
}

// Character range of each paragraph within stream.text, in order (null where nothing fits)
function locateRanges(stream, paragraphs) {
  const ranges = [];
  let cursor = 0;
  for (const para of paragraphs) {
    const range = matchRange(stream, normalize(para), cursor);
    ranges.push(range);
    if (range) cursor = range.end;
  }

  // Unmatched paragraphs (e.g. spoken descriptions of code) cover the text between their matched
  // neighbours; at the top or bottom of a page (a code block split across pages) they cover the
  // text from the page start, or to the page end
  const found = ranges.filter(Boolean);
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i] || !found.length) continue;
    const prev = ranges.slice(0, i).reverse().find(r => r && !r.gap);
    const next = ranges.slice(i + 1).find(r => r && !r.gap);
    const start = prev ? prev.end : 0;
    const end = next ? next.start : stream.text.length;
    if (end > start) ranges[i] = { start, end, gap: true };
  }
  return ranges;
}

/**
 * EPUB: map narrated paragraphs to the book's blocks (from epub_reader's extractChapter).
 * The whole chapter is one text stream, so matching continues across parts.
 * Returns { [part]: [[blockIndex, ...] per paragraph] }.
 */
// Spoken descriptions name what they replace, so they can be matched to blocks of that kind
function describedKind(paragraph) {
  if (/^code example/i.test(paragraph)) return 'code';
  if (/^(diagram description|image|illustration|figure|picture)\b/i.test(paragraph)) return 'image';
  if (/^table summary/i.test(paragraph)) return 'table';
  return null;
}

function locateInBlocks(blocks, paragraphsByPart) {
  let text = '';
  const owner = [];
  const lengths = new Map();
  for (const b of blocks) {
    const norm = normalize(b.text || '');
    lengths.set(b.index, norm.length);
    for (const ch of norm) {
      text += ch;
      owner.push(b.index);
    }
  }
  const stream = { text };
  const parts = Object.keys(paragraphsByPart).sort((a, b) => a - b);
  const all = parts.flatMap(part => paragraphsByPart[part]);
  const ranges = locateRanges(stream, all);

  // Text matches: blocks the match mostly covers (a match can graze a neighbouring block's edge)
  const assigned = ranges.map(range => {
    if (!range || range.gap) return null;
    const covered = new Map();
    for (const b of owner.slice(range.start, range.end)) covered.set(b, (covered.get(b) || 0) + 1);
    const hit = [...covered].filter(([b, n]) => n >= lengths.get(b) * 0.5 || n >= 40).map(([b]) => b);
    return hit.length ? hit : [...covered.keys()];
  });

  // Unmatched paragraphs (spoken descriptions of code, images and tables, or reworded text) take the
  // unclaimed blocks between their matched neighbours: a description takes the next block of its
  // kind ("continued" reuses the previous one), other paragraphs the next text-like block
  const claimed = new Set(assigned.filter(Boolean).flat());
  for (let i = 0; i < all.length; i++) {
    if (assigned[i]) continue;
    let prev = -1;
    for (let j = i - 1; j >= 0; j--) if (assigned[j] && !assigned[j].filled) { prev = Math.max(...assigned[j]); break; }
    let next = blocks.length;
    for (let j = i + 1; j < all.length; j++) if (assigned[j] && !assigned[j].filled) { next = Math.min(...assigned[j]); break; }
    const kind = describedKind(all[i]);
    const previous = assigned[i - 1];
    if (kind && /^\w+ \w+,? continued/i.test(all[i]) && previous && previous.filled && previous.kind === kind) {
      assigned[i] = Object.assign([...previous], { filled: true, kind });
      continue;
    }
    const candidates = blocks.filter(b => b.index > prev && b.index < next && !claimed.has(b.index));
    const pick = kind
      ? candidates.find(b => b.kind === kind) || (kind === 'image' ? candidates.find(b => b.kind === 'text' && /^figure|^fig\./i.test(b.text)) : null)
      : candidates.find(b => !['code', 'image', 'table'].includes(b.kind));
    if (pick) {
      claimed.add(pick.index);
      assigned[i] = Object.assign([pick.index], { filled: true, kind });
    }
  }

  const result = {};
  let i = 0;
  for (const part of parts) {
    result[part] = paragraphsByPart[part].map(() => [...(assigned[i++] || [])]);
  }
  return result;
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

module.exports = { locateParagraphs, locateInBlocks, normalize };
