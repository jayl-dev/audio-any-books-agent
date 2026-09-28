#!/usr/bin/env node
/**
 * epub_reader.js
 * Reads DRM-free EPUB books: lists chapters from the table of contents and extracts a chapter
 * as numbered blocks (paragraphs, headings, code, images, tables). The same numbering is used to
 * build the reader page, so a narrated paragraph can be highlighted in the text.
 *
 * Usage:
 *   node scripts/epub_reader.js --epub book.epub --toc
 *   node scripts/epub_reader.js --epub book.epub --chapter 3 [--out chapter3_raw.json|.md]
 *
 * Relative --out paths resolve against the EPUB's folder (default: extracted_chapter.json).
 * The JSON output is a narration script draft: { "1": "...", "2": "..." }, one entry per part of
 * roughly a page, with paragraphs separated by blank lines and code blocks marked "CODE:".
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { parse: parseHtml } = require('node-html-parser');
// Parse <pre> contents as HTML too (the library keeps them as raw text by default), so code blocks give their text
const parse = (html, options = {}) => parseHtml(html, { blockTextElements: { script: true, noscript: true, style: true }, ...options });

// ---------- ZIP (an EPUB is a zip archive) ----------

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip/EPUB file (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: name => entries.has(name),
    names: () => [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`Missing file in EPUB: ${name}`);
      const lh = e.localOffset;
      const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
      const data = buf.subarray(start, start + e.compSize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported zip compression method ${e.method} for ${name}`);
    }
  };
}

// ---------- EPUB structure ----------

const attrsOf = tag => {
  const attrs = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[3] !== undefined ? m[3] : m[4];
  return attrs;
};
const decodeEntities = s => parse(`<x>${s}</x>`).text;
const resolveHref = (fromFile, href) => {
  const [file, anchor] = href.split('#');
  const resolved = file ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decodeURIComponent(file))) : fromFile;
  return { file: resolved, anchor: anchor ? decodeURIComponent(anchor) : null };
};

function openEpub(epubPath) {
  const zip = readZip(fs.readFileSync(epubPath));
  if (zip.has('META-INF/encryption.xml') && /EncryptedData/.test(zip.read('META-INF/encryption.xml').toString('utf8'))
      && !/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(zip.read('META-INF/encryption.xml').toString('utf8'))) {
    throw new Error('This EPUB is DRM-protected (encrypted) and cannot be read. Use a DRM-free copy.');
  }
  const container = zip.read('META-INF/container.xml').toString('utf8');
  const opfPath = attrsOf(container.match(/<rootfile\b[^>]*>/)[0])['full-path'];
  const opf = zip.read(opfPath).toString('utf8');

  const titleMatch = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : path.basename(epubPath, '.epub');

  const manifest = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const a = attrsOf(m[0]);
    manifest[a.id] = { href: resolveHref(opfPath, a.href).file, type: a['media-type'], properties: a.properties || '' };
  }
  const spine = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/g)) {
    const a = attrsOf(m[0]);
    if (manifest[a.idref] && a.linear !== 'no') spine.push(manifest[a.idref].href);
  }
  const layout = /rendition:layout[^>]*>\s*pre-paginated/.test(opf) ? 'pre-paginated' : 'reflowable';

  // Table of contents: EPUB 3 nav document, else EPUB 2 NCX
  let toc = [];
  const navItem = Object.values(manifest).find(i => /\bnav\b/.test(i.properties));
  if (navItem) {
    const doc = parse(zip.read(navItem.href).toString('utf8'));
    const navs = doc.querySelectorAll('nav');
    const nav = navs.find(n => /toc/.test(n.getAttribute('epub:type') || n.getAttribute('role') || '')) || navs[0];
    const walk = (ol, level) => {
      for (const li of ol.childNodes.filter(c => c.rawTagName && c.rawTagName.toLowerCase() === 'li')) {
        const a = li.childNodes.find(c => c.rawTagName && /^(a|span)$/i.test(c.rawTagName));
        if (a && a.getAttribute('href')) toc.push({ title: a.text.replace(/\s+/g, ' ').trim(), level, ...resolveHref(navItem.href, a.getAttribute('href')) });
        const sub = li.childNodes.find(c => c.rawTagName && c.rawTagName.toLowerCase() === 'ol');
        if (sub) walk(sub, level + 1);
      }
    };
    const ol = nav && nav.querySelector('ol');
    if (ol) walk(ol, 1);
  }
  const ncxId = (opf.match(/<spine\b[^>]*toc="([^"]+)"/) || [])[1];
  if (!toc.length && ncxId && manifest[ncxId]) {
    const ncxFile = manifest[ncxId].href;
    const ncx = zip.read(ncxFile).toString('utf8');
    let depth = 0;
    let pending = null;
    for (const m of ncx.matchAll(/<navPoint\b|<\/navPoint>|<text>([\s\S]*?)<\/text>|<content\b[^>]*>/g)) {
      if (m[0] === '<navPoint') { depth++; pending = { level: depth }; }
      else if (m[0] === '</navPoint>') depth--;
      else if (m[1] !== undefined && pending && !pending.title) pending.title = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
      else if (m[0].startsWith('<content') && pending) {
        toc.push({ ...pending, ...resolveHref(ncxFile, attrsOf(m[0]).src) });
        pending = null;
      }
    }
  }
  if (!toc.length) toc = spine.map((file, i) => ({ title: `Section ${i + 1}`, level: 1, file, anchor: null }));
  toc = toc.filter(t => spine.includes(t.file));

  return { path: epubPath, title, spine, toc, manifest, layout, zip };
}

// ---------- Blocks ----------

const HEADING = /^h[1-6]$/;
const LEAF = new Set(['p', 'pre', 'li', 'dt', 'dd', 'figcaption', 'table', 'caption', 'address']);
const CONTAINER = new Set(['body', 'div', 'section', 'article', 'main', 'blockquote', 'figure', 'ul', 'ol', 'dl', 'header', 'footer', 'aside', 'center', 'hgroup', 'details', 'summary']);
const SKIP = new Set(['script', 'style', 'head', 'nav', 'noscript', 'template', 'iframe', 'object', 'embed', 'audio', 'video']);
const tagOf = n => (n.rawTagName || '').toLowerCase();
const isElement = n => n.nodeType === 1;
const isBlockTag = t => HEADING.test(t) || LEAF.has(t) || CONTAINER.has(t) || t === 'img' || t === 'svg' || t === 'hr';
const idsOf = el => [el.getAttribute && el.getAttribute('id'), el.getAttribute && el.getAttribute('name')].filter(Boolean);
function containsId(el, id) {
  if (idsOf(el).includes(id)) return true;
  return (el.childNodes || []).some(c => isElement(c) && containsId(c, id));
}
const hasBlockChild = el => el.childNodes.some(c => isElement(c) && isBlockTag(tagOf(c)));

// Walk one XHTML document in reading order, calling onBlock(tag, html, el) for each block
function walkBlocks(root, { startId, endId, onBlock }) {
  let started = !startId;
  let stopped = false;
  const visit = (el) => {
    if (stopped) return;
    const t = tagOf(el);
    if (SKIP.has(t)) return;
    const leafish = HEADING.test(t) || LEAF.has(t) || t === 'img' || t === 'svg' || t === 'hr';
    if (endId && (idsOf(el).includes(endId) || (leafish && containsId(el, endId)))) { stopped = true; return; }
    if (startId && !started && (idsOf(el).includes(startId) || (leafish && containsId(el, startId)))) started = true;

    if ((['li', 'dd', 'dt'].includes(t) && hasBlockChild(el)) || CONTAINER.has(t) || t === '' || !isBlockTag(t)) {
      // Container: blocks inside, plus runs of loose inline content wrapped as paragraphs
      if (CONTAINER.has(t) && !hasBlockChild(el) && el.text.trim()) {
        if (started) onBlock('p', el.innerHTML, el);
        return;
      }
      let run = [];
      const flush = () => {
        const html = run.map(n => n.toString()).join('');
        if (started && parse(`<p>${html}</p>`).text.trim()) onBlock('p', html, null);
        run = [];
      };
      for (const c of el.childNodes) {
        if (isElement(c) && isBlockTag(tagOf(c))) { flush(); visit(c); if (stopped) return; }
        else if (isElement(c) && (SKIP.has(tagOf(c)))) continue;
        else if (isElement(c) && c.querySelector && hasBlockChild(c)) { flush(); visit(c); if (stopped) return; }
        else run.push(c);
      }
      flush();
      return;
    }
    if (!started || t === 'hr') return;
    onBlock(t, null, el);
  };
  visit(root);
}

function blockText(tag, el) {
  if (tag === 'pre') return el.text.replace(/\r/g, '').replace(/^\n+|\s+$/g, '');
  if (tag === 'table') {
    // One row per clause, cells separated, so the text reads as "cell - cell; next row"
    return el.querySelectorAll('tr')
      .map(tr => tr.querySelectorAll('th, td').map(c => c.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' - '))
      .filter(Boolean).join('; ');
  }
  return el.text.replace(/\s+/g, ' ').trim();
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

// Clean a block's HTML for the reader page: drop scripts/handlers, inline images, neutralize internal links
function cleanHtml(el, docFile, epub, imageCache) {
  for (const s of el.querySelectorAll('script, style, iframe, object, embed')) s.remove();
  for (const n of [el, ...el.querySelectorAll('*')]) {
    for (const name of Object.keys(n.attributes || {})) {
      if (/^on/i.test(name) || name === 'style') n.removeAttribute(name);
    }
    const t = tagOf(n);
    if (t === 'a') {
      const href = n.getAttribute('href') || '';
      if (/^https?:/i.test(href)) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); } else n.removeAttribute('href');
    }
    if (t === 'img' || t === 'image') {
      const attr = t === 'img' ? 'src' : (n.getAttribute('xlink:href') ? 'xlink:href' : 'href');
      const src = n.getAttribute(attr);
      if (src && !/^(data|https?):/i.test(src)) {
        const file = resolveHref(docFile, src).file;
        if (!imageCache.has(file)) {
          let uri = '';
          try {
            const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
            uri = `data:${mime};base64,${epub.zip.read(file).toString('base64')}`;
          } catch (_) {}
          imageCache.set(file, uri);
        }
        n.setAttribute(attr, imageCache.get(file));
      }
    }
  }
  return el;
}

// The TOC entries that are chapters (entries whose range ends at the next entry of the same or higher level)
function listChapters(epub) {
  return epub.toc.map((entry, i) => {
    let end = null;
    for (let j = i + 1; j < epub.toc.length; j++) {
      if (epub.toc[j].level <= entry.level) { end = epub.toc[j]; break; }
    }
    return { number: i + 1, title: entry.title, level: entry.level, start: entry, end };
  });
}

/**
 * Extract a chapter (1-based index into listChapters) as blocks:
 * [{ index, kind: 'heading'|'text'|'code'|'image'|'table'|'list', tag, text, html }]
 * html carries data-b="<index>" so the reader page can highlight it.
 */
function extractChapter(epub, chapterNumber) {
  const chapters = listChapters(epub);
  const chapter = chapters[chapterNumber - 1];
  if (!chapter) throw new Error(`No chapter ${chapterNumber}; the book has ${chapters.length} table-of-contents entries.`);
  const startIdx = epub.spine.indexOf(chapter.start.file);
  let endIdx = epub.spine.length - 1;
  let endId = null;
  if (chapter.end) {
    const e = epub.spine.indexOf(chapter.end.file);
    if (chapter.end.anchor) { endIdx = e; endId = chapter.end.anchor; } else endIdx = e - 1;
  }
  const blocks = [];
  const imageCache = new Map();
  for (let s = startIdx; s <= endIdx; s++) {
    const file = epub.spine[s];
    const doc = parse(epub.zip.read(file).toString('utf8'), { comment: false });
    const body = doc.querySelector('body') || doc;
    walkBlocks(body, {
      startId: s === startIdx ? chapter.start.anchor : null,
      endId: s === endIdx ? endId : null,
      onBlock: (tag, innerHtml, el) => {
        const node = el ? el.clone() : parse(`<p>${innerHtml}</p>`).firstChild;
        const t = el ? tag : 'p';
        cleanHtml(node, file, epub, imageCache);
        const text = blockText(t, node);
        const hasImg = node.querySelector && (node.querySelector('img') || node.querySelector('image') || ['img', 'svg'].includes(t));
        let kind = HEADING.test(t) ? 'heading' : t === 'pre' ? 'code' : t === 'table' ? 'table' : ['li', 'dt', 'dd'].includes(t) ? 'list' : 'text';
        if (!text && hasImg) kind = 'image';
        if (!text && kind !== 'image') return;
        const alt = kind === 'image' ? ((node.querySelector && node.querySelector('img') && node.querySelector('img').getAttribute('alt')) || (t === 'img' && node.getAttribute('alt')) || '') : '';
        const index = blocks.length;
        const wrapTag = t === 'li' ? 'div' : t;
        const html = t === 'li'
          ? `<div class="li" data-b="${index}">${node.innerHTML}</div>`
          : (() => { node.setAttribute('data-b', String(index)); return node.toString(); })();
        blocks.push({ index, kind, tag: wrapTag, text: kind === 'image' ? alt : text, html });
      }
    });
  }
  return { number: chapter.number, title: chapter.title, bookTitle: epub.title, blocks };
}

// Draft narration script grouped into parts of roughly a page, one paragraph per block
function scriptFromBlocks(blocks, maxChars = 3000) {
  const parts = {};
  let part = 1;
  let size = 0;
  for (const b of blocks) {
    // Skip decorative blocks such as "* * * *" section breaks, which would be read out symbol by symbol
    if (b.kind !== 'image' && b.kind !== 'code' && !/[\p{L}\p{N}]/u.test(b.text)) continue;
    const text = b.kind === 'code' ? `CODE:\n${b.text}`
      : b.kind === 'image' ? `IMAGE: ${b.text || '(no description)'}`
      : b.kind === 'table' ? `TABLE: ${b.text}`
      : b.text;
    if (size && size + text.length > maxChars) { part++; size = 0; }
    parts[part] = parts[part] ? `${parts[part]}\n\n${text}` : text;
    size += text.length;
  }
  return parts;
}

module.exports = { openEpub, listChapters, extractChapter, scriptFromBlocks, readZip };

// ---------- CLI ----------
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = name => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };
  const epubPath = getArg('epub');
  if (!epubPath) {
    console.log(`
epub_reader.js - List and extract chapters from a DRM-free EPUB.

Usage:
  node scripts/epub_reader.js --epub <book.epub> --toc
  node scripts/epub_reader.js --epub <book.epub> --chapter <N> [--out <file.json|file.md>]

  Relative --out paths resolve against the EPUB's folder (default: extracted_chapter.json).
`);
    process.exit(0);
  }
  try {
    const epub = openEpub(epubPath);
    if (args.includes('--toc')) {
      console.log(`${epub.title}${epub.layout === 'pre-paginated' ? '  (fixed-layout EPUB: convert to PDF for best results)' : ''}\n`);
      for (const c of listChapters(epub)) console.log(`${String(c.number).padStart(3)}. ${'  '.repeat(c.level - 1)}${c.title}`);
      process.exit(0);
    }
    const n = parseInt(getArg('chapter'), 10);
    if (!n) throw new Error('Pass --toc to list chapters, or --chapter <N> to extract one.');
    const chapter = extractChapter(epub, n);
    const outPath = path.resolve(path.dirname(path.resolve(epubPath)), getArg('out') || 'extracted_chapter.json');
    if (outPath.toLowerCase().endsWith('.md')) {
      let md = `# ${chapter.bookTitle}: ${chapter.title}\n\n`;
      for (const b of chapter.blocks) {
        md += b.kind === 'heading' ? `## ${b.text}\n\n`
          : b.kind === 'code' ? '```\n' + b.text + '\n```\n\n'
          : b.kind === 'image' ? `[Image: ${b.text || 'no description'}]\n\n`
          : b.kind === 'table' ? `[Table] ${b.text}\n\n`
          : `${b.text}\n\n`;
      }
      fs.writeFileSync(outPath, md, 'utf8');
    } else {
      fs.writeFileSync(outPath, JSON.stringify(scriptFromBlocks(chapter.blocks), null, 2), 'utf8');
    }
    const counts = chapter.blocks.reduce((m, b) => ({ ...m, [b.kind]: (m[b.kind] || 0) + 1 }), {});
    console.log(`Chapter ${n}: ${chapter.title}`);
    console.log(`${chapter.blocks.length} blocks (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})`);
    console.log(`Saved to: ${outPath}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
