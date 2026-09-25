/**
 * chapter_generator_template.js
 * Reference template for generating chapter voiceovers with curated spoken descriptions.
 *
 * Copy this file, rename it (e.g. `generate_mybook_ch1.js`), fill in the pages and text,
 * and run: `node generate_mybook_ch1.js`
 */

const { processChapter } = require('../scripts/generate_chapter_voiceover');

// 1. Define page text mapping (PDF Document Page Number -> Spoken Script)
const pagesData = {
  // Replace these with your actual page numbers and speech scripts:
  10: `Chapter 1. Getting Started.
This chapter covers the basic fundamentals of our system.

Diagram description: Figure 1.1 illustrates the architectural flow from client request to database response.

Narrative text continues here verbatim without skipping words.`,

  11: `Understanding Core Principles.
Here we examine how the component handles edge cases.

Code example: A JavaScript function fetchData accepting an endpoint URL and returning a promise resolving to JSON data.

As we can see, handling asynchronous flows requires proper error wrapping.`
};

async function main() {
  await processChapter({
    pagesData,
    outputPrefix: 'mybook_chapter_1',
    title: 'My Book - Chapter 1: Getting Started',
    pdfPath: 'mybook.pdf',
    voice: 'en-US-AndrewMultilingualNeural', // see SKILL.md Step 0.5 for the voice menu
    bookPageOffset: 0 // Optional: if PDF p.10 is Book p.1, set offset to -9
  });
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
