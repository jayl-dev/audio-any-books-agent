/**
 * Generalized, Reusable Chapter Voiceover Generator
 * Part of the 'audio-any-books-agent' toolkit.
 *
 * Usage as CLI:
 *   node scripts/generate_chapter_voiceover.js --pdf <pdfPath> --pages <start>-<end> [--title <title>] [--prefix <prefix>] [--voice <voiceName>] [--bookPageOffset <offset>]
 *
 * Usage as Module:
 *   const { processChapter } = require('./generate_chapter_voiceover');
 *   await processChapter({ pagesData, outputPrefix, title, pdfPath, voice });
 */

const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const mp3Duration = require('mp3-duration');
const { createPlayerHtml } = require('./create_player_html');

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function sanitizeForSpeech(text) {
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
    .trim();
}

async function synthesizePage(page, text, cacheDir, voice = 'en-US-AndrewMultilingualNeural') {
  const cachePath = path.join(cacheDir, `page_${page}.mp3`);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000) {
    console.log(`Page ${page} found in cache, skipping synthesis.`);
    return fs.readFileSync(cachePath);
  }

  const cleanText = sanitizeForSpeech(text);

  for (let attempt = 1; attempt <= 4; attempt++) {
    let tts;
    try {
      tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const res = await tts.toFile(cacheDir, cleanText);
      tts.close();
      const buf = fs.readFileSync(res.audioFilePath);
      try { fs.unlinkSync(res.audioFilePath); } catch (_) {}
      fs.writeFileSync(cachePath, buf);
      return buf;
    } catch (err) {
      if (tts) {
        try { tts.close(); } catch (_) {}
      }
      console.warn(`Attempt ${attempt} for Page ${page} failed: ${err.message}`);
      if (attempt === 4) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function processChapter({
  pagesData,
  outputPrefix,
  title,
  pdfPath,
  voice = 'en-US-AndrewMultilingualNeural',
  bookPageOffset = 0,
  pageMap = null,
  baseDir = process.cwd()
}) {
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

  // 2. Synthesize each page
  const pageBuffers = [];
  const pageDurations = [];

  for (const pageNum of sortedPages) {
    const bookPage = pageMap && pageMap[pageNum] !== undefined ? pageMap[pageNum] : pageNum + bookPageOffset;
    console.log(`Synthesizing Page ${pageNum} (Book p. ${bookPage})...`);
    const buf = await synthesizePage(pageNum, pagesData[pageNum], cacheDir, voice);
    const duration = await mp3Duration(buf);
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

  // 5. Generate Synchronized HTML Player
  try {
    const pdfFilename = pdfPath ? path.basename(pdfPath) : 'book.pdf';
    const playerHtml = createPlayerHtml({
      title: chapterTitle,
      pdfFilename: pdfFilename,
      audioFilename: `${outputPrefix}.mp3`,
      markers: markers
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

  return { masterMp3Path, totalDuration, markers };
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
  const voiceArg = getArg('voice') || 'en-US-AndrewMultilingualNeural';
  const scriptArg = getArg('script'); // JSON file with { pageNum: text }
  const offsetArg = parseInt(getArg('bookPageOffset') || '0', 10);

  (async () => {
    let pagesData = {};

    if (scriptArg && fs.existsSync(scriptArg)) {
      pagesData = JSON.parse(fs.readFileSync(scriptArg, 'utf8'));
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
      `);
      process.exit(0);
    }

    await processChapter({
      pagesData,
      outputPrefix: prefixArg,
      title: titleArg,
      pdfPath: pdfArg,
      voice: voiceArg,
      bookPageOffset: offsetArg
    });
    console.log('\nProcessing completed successfully!');
  })().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { processChapter, synthesizePage, sanitizeForSpeech, formatTime };
