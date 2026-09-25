#!/usr/bin/env node
/**
 * extract_page_text.js
 * Extracts text from specified PDF pages into a JSON or Markdown file for editing/curation.
 *
 * Usage:
 *   node scripts/extract_page_text.js --pdf "book.pdf" --pages 25-37 --out chapter1_raw.json
 *   node scripts/extract_page_text.js --pdf "book.pdf" --pages 25-37 --out chapter1_raw.md
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const pdfPath = getArg('pdf');
const pagesArg = getArg('pages');
const outPath = getArg('out') || 'extracted_pages.json';

if (!pdfPath || !pagesArg) {
  console.log(`
extract_page_text.js - Extract raw text per page for review and narration script drafting.

Usage:
  node scripts/extract_page_text.js --pdf <pdfPath> --pages <start>-<end> [--out <output.json|.md>]

Examples:
  node scripts/extract_page_text.js --pdf "book.pdf" --pages 25-37 --out chapter1.json
  node scripts/extract_page_text.js --pdf "book.pdf" --pages 25-37 --out chapter1.md
  `);
  process.exit(0);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: File not found: ${pdfPath}`);
  process.exit(1);
}

const [startP, endP] = pagesArg.split('-').map(Number);
if (isNaN(startP) || isNaN(endP) || startP > endP) {
  console.error('Invalid page range. Format: --pages 10-25');
  process.exit(1);
}

const buf = fs.readFileSync(pdfPath);
let cur = 0;
const pageTextMap = {};

console.log(`Extracting pages ${startP} to ${endP} from ${path.basename(pdfPath)}...`);

pdf(buf, {
  pagerender: (pageData) => {
    cur++;
    if (cur >= startP && cur <= endP) {
      return pageData.getTextContent().then(tc => {
        let lines = [];
        let currentLineY = null;
        let lineStr = '';
        for (const item of tc.items) {
          if (currentLineY === null || Math.abs(item.transform[5] - currentLineY) > 3) {
            if (lineStr.trim()) lines.push(lineStr.trim());
            lineStr = item.str;
            currentLineY = item.transform[5];
          } else {
            lineStr += (item.str ? ' ' + item.str : '');
          }
        }
        if (lineStr.trim()) lines.push(lineStr.trim());
        const fullPageText = lines.join('\n');
        pageTextMap[cur] = fullPageText;
        return fullPageText;
      });
    }
    return '';
  }
}).then(() => {
  const isMd = outPath.toLowerCase().endsWith('.md');
  if (isMd) {
    let md = `# Extracted Pages: ${path.basename(pdfPath)} (Pages ${startP}–${endP})\n\n`;
    for (let p = startP; p <= endP; p++) {
      md += `## Page ${p}\n\n${pageTextMap[p] || ''}\n\n---\n\n`;
    }
    fs.writeFileSync(outPath, md, 'utf8');
  } else {
    fs.writeFileSync(outPath, JSON.stringify(pageTextMap, null, 2), 'utf8');
  }
  console.log(`Saved extracted text for ${Object.keys(pageTextMap).length} page(s) to: ${outPath}`);
}).catch(err => {
  console.error('Extraction failed:', err.message);
});
