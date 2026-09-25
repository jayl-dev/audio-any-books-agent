#!/usr/bin/env node
/**
 * make_pdf_preloader.js
 * Encodes a PDF file into base64 JavaScript to allow direct file:/// browser opening without CORS errors.
 *
 * Usage:
 *   node scripts/make_pdf_preloader.js --pdf "path/to/book.pdf" [--out "book_pdf_data.js"]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const pdfPath = getArg('pdf');
if (!pdfPath) {
  console.log(`
make_pdf_preloader.js - Create a zero-CORS base64 embedded JS file for a PDF.

Usage:
  node scripts/make_pdf_preloader.js --pdf <pdf-path> [--out <output-js-path>]

Example:
  node scripts/make_pdf_preloader.js --pdf "Eloquent JavaScript.pdf"
  `);
  process.exit(0);
}

if (!fs.existsSync(pdfPath)) {
  console.error(`Error: File not found: ${pdfPath}`);
  process.exit(1);
}

const baseName = path.basename(pdfPath, path.extname(pdfPath));
const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const outPath = getArg('out') || `${slug}_pdf_data.js`;
const varName = `${slug.toUpperCase()}_PDF_BASE64`;

console.log(`Reading "${pdfPath}" and generating base64 preloader...`);
const buf = fs.readFileSync(pdfPath);
const b64 = buf.toString('base64');

const content = `// Auto-generated zero-CORS PDF preloader
window.${varName} = "${b64}";
window.BOOK_PDF_BASE64 = window.${varName};
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log(`Created preloader: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Global variables: window.${varName}, window.BOOK_PDF_BASE64`);
