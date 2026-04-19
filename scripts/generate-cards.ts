import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const __dirname =
  typeof import.meta.url === 'string'
    ? dirname(fileURLToPath(import.meta.url))
    : (globalThis as { __dirname?: string }).__dirname ?? process.cwd();

type Song = {
  id: string;
  title: string;
  artist: string;
  year: number;
};

const ROOT = resolve(__dirname, '..');
const SONGS_PATH = resolve(ROOT, 'data/songs.json');
const DIST_DIR = resolve(ROOT, 'dist');

const BASE_URL =
  process.env.YEARWORM_BASE_URL ?? 'https://shayantan-debbarman.github.io/yearworm';

// A4 portrait in mm, converted to PDF points (1 mm = 2.83465 pt).
const MM = 2.83465;
const A4_W_MM = 210;
const A4_H_MM = 297;
const MARGIN_MM = 10;
const CARD_MM = 60;
const GUTTER_MM = 5;

const COLS = 3;
const ROWS = 3;
const CARDS_PER_PAGE = COLS * ROWS;

function cellOrigin(col: number, row: number, mirrored: boolean) {
  // Top-left anchored computation, converted to pdf-lib (origin bottom-left).
  const effectiveCol = mirrored ? COLS - 1 - col : col;
  const xMm = MARGIN_MM + effectiveCol * (CARD_MM + GUTTER_MM);
  const yMmTop = MARGIN_MM + row * (CARD_MM + GUTTER_MM);
  const yMm = A4_H_MM - yMmTop - CARD_MM;
  return { x: xMm * MM, y: yMm * MM, size: CARD_MM * MM };
}

function wrapText(text: string, maxLineLen: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxLineLen) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildFronts(songs: Song[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageCount = Math.ceil(songs.length / CARDS_PER_PAGE);
  for (let p = 0; p < pageCount; p++) {
    const page = pdf.addPage([A4_W_MM * MM, A4_H_MM * MM]);
    for (let i = 0; i < CARDS_PER_PAGE; i++) {
      const songIdx = p * CARDS_PER_PAGE + i;
      if (songIdx >= songs.length) break;
      const song = songs[songIdx];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const { x, y, size } = cellOrigin(col, row, false);

      // QR code — about 75% of card width, centered near the top.
      const qrUrl = `${BASE_URL}/play/${song.id}`;
      const pngBytes = await QRCode.toBuffer(qrUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 8,
      });
      const png = await pdf.embedPng(pngBytes);
      const qrSize = size * 0.75;
      const qrX = x + (size - qrSize) / 2;
      const qrY = y + size - qrSize - size * 0.04;
      page.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      // Brand and ID below the QR.
      const brandSize = 10;
      const idSize = 12;
      const brand = 'YEARWORM';
      const brandWidth = font.widthOfTextAtSize(brand, brandSize);
      page.drawText(brand, {
        x: x + (size - brandWidth) / 2,
        y: y + size * 0.1,
        size: brandSize,
        font,
        color: rgb(0.35, 0.35, 0.35),
      });
      const idText = `#${song.id}`;
      const idWidth = bold.widthOfTextAtSize(idText, idSize);
      page.drawText(idText, {
        x: x + (size - idWidth) / 2,
        y: y + size * 0.04,
        size: idSize,
        font: bold,
        color: rgb(0, 0, 0),
      });
    }
  }

  return pdf.save();
}

async function buildBacks(songs: Song[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageCount = Math.ceil(songs.length / CARDS_PER_PAGE);
  for (let p = 0; p < pageCount; p++) {
    const page = pdf.addPage([A4_W_MM * MM, A4_H_MM * MM]);
    for (let i = 0; i < CARDS_PER_PAGE; i++) {
      const songIdx = p * CARDS_PER_PAGE + i;
      if (songIdx >= songs.length) break;
      const song = songs[songIdx];
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      // Horizontally mirrored so front-of-card-N aligns with back-of-card-N
      // when printed duplex (flip on long edge).
      const { x, y, size } = cellOrigin(col, row, true);

      const year = String(song.year);
      const yearSize = 36;
      const yearWidth = bold.widthOfTextAtSize(year, yearSize);
      page.drawText(year, {
        x: x + (size - yearWidth) / 2,
        y: y + size * 0.58,
        size: yearSize,
        font: bold,
        color: rgb(0, 0, 0),
      });

      const titleSize = 14;
      const titleLines = wrapText(song.title, 22).slice(0, 2);
      titleLines.forEach((line, idx) => {
        const w = bold.widthOfTextAtSize(line, titleSize);
        page.drawText(line, {
          x: x + (size - w) / 2,
          y: y + size * 0.45 - idx * (titleSize + 2),
          size: titleSize,
          font: bold,
          color: rgb(0, 0, 0),
        });
      });

      const artistSize = 12;
      const artistLines = wrapText(song.artist, 26).slice(0, 2);
      const artistBlockStart = y + size * 0.2;
      artistLines.forEach((line, idx) => {
        const w = font.widthOfTextAtSize(line, artistSize);
        page.drawText(line, {
          x: x + (size - w) / 2,
          y: artistBlockStart - idx * (artistSize + 2),
          size: artistSize,
          font,
          color: rgb(0.25, 0.25, 0.25),
        });
      });

      // Small ID marker (useful during sorting; doesn't give the answer away).
      const idSize = 8;
      const idText = `#${song.id}`;
      const idWidth = font.widthOfTextAtSize(idText, idSize);
      page.drawText(idText, {
        x: x + (size - idWidth) / 2,
        y: y + size * 0.05,
        size: idSize,
        font,
        color: rgb(0.55, 0.55, 0.55),
      });
    }
  }

  return pdf.save();
}

async function main() {
  const subset = process.argv.includes('--test')
    ? 9
    : process.argv.includes('--count')
      ? Number(process.argv[process.argv.indexOf('--count') + 1])
      : undefined;

  const all: Song[] = JSON.parse(await readFile(SONGS_PATH, 'utf8'));
  const songs = subset ? all.slice(0, subset) : all;
  console.log(`Generating cards for ${songs.length} songs at base URL ${BASE_URL}`);

  await mkdir(DIST_DIR, { recursive: true });
  const fronts = await buildFronts(songs);
  const backs = await buildBacks(songs);
  const outFronts = resolve(DIST_DIR, subset ? 'fronts-test.pdf' : 'fronts.pdf');
  const outBacks = resolve(DIST_DIR, subset ? 'backs-test.pdf' : 'backs.pdf');
  await writeFile(outFronts, fronts);
  await writeFile(outBacks, backs);
  console.log(`Wrote ${outFronts}`);
  console.log(`Wrote ${outBacks}`);
  console.log('\nPrint both PDFs double-sided, flipping on the LONG edge.');
  console.log('Verify: front-of-card-#001 lines up with back-of-card-#001.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
