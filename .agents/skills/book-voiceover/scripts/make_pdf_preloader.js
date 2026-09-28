#!/usr/bin/env node
/**
 * make_pdf_preloader.js
 * Encodes a PDF file into base64 JavaScript to allow direct file:/// browser opening without CORS errors.
 *
 * Usage:
 *   node scripts/make_pdf_preloader.js --pdf "path/to/book.pdf" [--out "book_pdf_data.js"]
 *
 * Usage as Module:
 *   const { createPreloader } = require('./make_pdf_preloader');
 *   const { outPath, fileName, varName } = createPreloader('path/to/book.pdf');
 */

const fs = require('fs');
const path = require('path');

// Default preloader file name and global variable for a PDF
function preloaderInfo(pdfPath) {
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { fileName: `${slug}_pdf_data.js`, varName: `${slug.toUpperCase()}_PDF_BASE64` };
}

// Relative outPath (and the default) resolve against the PDF's folder
function createPreloader(pdfPath, outPath) {
  const { fileName, varName } = preloaderInfo(pdfPath);
  const resolvedOut = path.resolve(path.dirname(path.resolve(pdfPath)), outPath || fileName);
  const b64 = fs.readFileSync(pdfPath).toString('base64');

  const content = `// Auto-generated zero-CORS PDF preloader
window.${varName} = "${b64}";
window.BOOK_PDF_BASE64 = window.${varName};
`;

  fs.writeFileSync(resolvedOut, content, 'utf8');
  return { outPath: resolvedOut, fileName: path.basename(resolvedOut), varName };
}

if (require.main === module) {
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

  Relative --out paths resolve against the PDF's folder (default: <slug>_pdf_data.js).

Example:
  node scripts/make_pdf_preloader.js --pdf "path/to/book.pdf"
  `);
    process.exit(0);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  console.log(`Reading "${pdfPath}" and generating base64 preloader...`);
  const { outPath, varName } = createPreloader(pdfPath, getArg('out'));
  console.log(`Created preloader: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Global variables: window.${varName}, window.BOOK_PDF_BASE64`);
}

module.exports = { preloaderInfo, createPreloader };
