#!/usr/bin/env node
/**
 * discover_pages.js
 * Scans a PDF and prints page numbers matching queries (e.g. "Chapter 1", "Introduction").
 *
 * Usage:
 *   node scripts/discover_pages.js --pdf "book.pdf" --query "Chapter 1"
 *   node scripts/discover_pages.js --pdf "book.pdf" --toc
 */

const fs = require('fs');
const pdf = require('pdf-parse');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const pdfPath = getArg('pdf');
const query = getArg('query');
const isToc = args.includes('--toc');

if (!pdfPath) {
  console.log(`
discover_pages.js - Scan a PDF to locate chapters and page boundaries.

Usage:
  node scripts/discover_pages.js --pdf <path-to-pdf> --query <keyword-or-chapter>
  node scripts/discover_pages.js --pdf <path-to-pdf> --toc

Examples:
  node scripts/discover_pages.js --pdf "book.pdf" --query "Chapter 1"
  node scripts/discover_pages.js --pdf "book.pdf" --toc
  `);
  process.exit(0);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: PDF file not found at ${pdfPath}`);
  process.exit(1);
}

const buf = fs.readFileSync(pdfPath);
let pageNum = 0;
const matches = [];

console.log(`Analyzing "${pdfPath}" (${(buf.length / 1024 / 1024).toFixed(2)} MB)...`);

pdf(buf, {
  pagerender: (pageData) => {
    pageNum++;
    return pageData.getTextContent().then(tc => {
      const text = tc.items.map(s => s.str).join(' ');
      
      if (isToc && (text.includes('Contents') || text.includes('Table of Contents'))) {
        matches.push({ page: pageNum, preview: text.slice(0, 300) });
      } else if (query) {
        const regex = new RegExp(query, 'i');
        if (regex.test(text)) {
          matches.push({ page: pageNum, preview: text.slice(0, 160).replace(/\s+/g, ' ') });
        }
      }
      return text;
    });
  }
}).then(data => {
  console.log(`Total Pages: ${data.numpages}`);
  console.log(`Found ${matches.length} matching page(s):\n`);
  for (const m of matches) {
    console.log(`* PDF Page ${m.page}: ${m.preview}...`);
  }
}).catch(err => {
  console.error('Failed to parse PDF:', err.message);
});
