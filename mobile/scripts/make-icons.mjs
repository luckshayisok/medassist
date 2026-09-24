// Run: node mobile/scripts/make-icons.mjs  (uses sharp from backend/node_modules)
// MedAssist brand mark v2: an "M" whose middle stroke is a check mark (dose taken), with a
// mustard dot (the pill / reminder). Generates every app icon asset from one vector.
import { createRequire } from 'node:module';
const require = createRequire('C:/padhaiii/PROJECTS/medassist/backend/package.json');
const sharp = require('sharp');

const OUT = 'C:/padhaiii/PROJECTS/medassist/mobile/assets';
const INK = '#1F1D1B', CREAM = '#F6F0E4', BLUSH = '#F5A9CB', MUSTARD = '#F4D66F';

/** The mark on a 1024 canvas, scaled around the centre. `mono` draws everything in one colour. */
export function mark({ scale = 1, mono = null } = {}) {
  const c = (col) => mono ?? col;
  return `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512) translate(-28 16)">
    <path d="M300 720 V370" stroke="${c(CREAM)}" stroke-width="116" stroke-linecap="round"/>
    <path d="M744 300 V720" stroke="${c(CREAM)}" stroke-width="116" stroke-linecap="round"/>
    <path d="M300 370 L468 628 L744 300" fill="none" stroke="${c(BLUSH)}" stroke-width="116" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="846" cy="206" r="60" fill="${c(MUSTARD)}"/>
  </g>`;
}

const svg = (body, bg = INK, size = 1024) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`);

// Store / iOS icon: full-bleed ink (the OS rounds the corners).
await sharp(svg(mark({ scale: 0.78 }))).png().toFile(`${OUT}/icon.png`);
// Android adaptive icon: mark inside the 66% safe zone on a transparent layer, ink background layer.
await sharp(svg(mark({ scale: 0.6 }), null)).png().toFile(`${OUT}/android-icon-foreground.png`);
await sharp(svg('', INK)).png().toFile(`${OUT}/android-icon-background.png`);
// Themed (monochrome) icon: Android tints it.
await sharp(svg(mark({ scale: 0.6, mono: '#FFFFFF' }), null)).png().toFile(`${OUT}/android-icon-monochrome.png`);
// Splash (on cream or ink): the mark on its own ink tile.
const tileSvg = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="230" fill="${INK}"/>${mark({ scale: 0.78 })}</svg>`);
await sharp(tileSvg(512)).png().toFile(`${OUT}/splash-icon.png`);
await sharp(tileSvg(64)).png().toFile(`${OUT}/favicon.png`);

// Preview sheet (not shipped).
const round = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="512" fill="${INK}"/>${mark({ scale: 0.6 / 0.66 * 0.66 })}</svg>`);
const monoPrev = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="512" fill="#3A4A5C"/>${mark({ scale: 0.6, mono: '#DCE6F2' })}</svg>`);
await sharp({ create: { width: 1000, height: 260, channels: 4, background: CREAM } })
  .composite([
    { input: await sharp(tileSvg(200)).png().toBuffer(), left: 30, top: 30 },
    { input: await sharp(round).png().toBuffer(), left: 270, top: 34 },
    { input: await sharp(monoPrev).png().toBuffer(), left: 500, top: 34 },
    { input: await sharp(tileSvg(96)).png().toBuffer(), left: 730, top: 82 },
    { input: await sharp(tileSvg(48)).png().toBuffer(), left: 860, top: 106 },
  ])
  .png()
  .toFile('C:/Users/laksh/AppData/Local/Temp/mi-icon-preview.png');
console.log('icons written');
