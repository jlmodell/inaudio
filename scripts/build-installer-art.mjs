// Renders the Windows installer's hero animations and header into out/installer-art, which
// assets/installer/installer.nsh embeds. Built on demand by build-release.mjs, never committed:
// 24-bit BMP is what NSIS can show, and dozens of frames would bloat the repository.
//
//   install  welcome page: the mark on a white tile, sound bars rising and falling
//   ready    finish page: an accent tile with a check, the same bars
//   remove   uninstaller: muted colours, bars barely moving
//   removed  uninstaller done page: one still frame
//
// Each set is rendered at 1x (497×150, the page width at 96 dpi) and 2x for high-DPI screens.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'out', 'installer-art');
export const FRAMES = 20;
const W = 497;
const H = 150;

const logo = (await fs.readFile(path.join(root, 'assets', 'logo.svg'), 'utf8'))
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '');

const THEMES = {
  install: { ground: '#E6ECFD', bar: '#2F5BEA', tile: '#FFFFFF', mark: '#2F5BEA', shadow: '#2F5BEA', amp: 1, check: false },
  ready: { ground: '#E6ECFD', bar: '#2F5BEA', tile: '#2F5BEA', mark: '#FFFFFF', shadow: '#2F5BEA', amp: 1, check: true },
  remove: { ground: '#F1F2F5', bar: '#8A919C', tile: '#FFFFFF', mark: '#5B6270', shadow: '#14161A', amp: 0.25, check: false },
  removed: { ground: '#F1F2F5', bar: '#8A919C', tile: '#FFFFFF', mark: '#5B6270', shadow: '#14161A', amp: 0, check: true },
};

/** Five bars; `anchor` is where they grow from. Heights follow offset sine waves over the loop. */
function bars(theme, frame, x, y, anchor) {
  return Array.from({ length: 5 }, (_, i) => {
    const wave = 0.5 + 0.5 * Math.sin((frame / FRAMES) * Math.PI * 2 + i * 1.1);
    const height = 10 + (6 + 26 * wave) * theme.amp + (theme.amp ? 0 : 2 + (i % 2) * 6);
    const top = anchor === 'bottom' ? y - height : y;
    return `<rect x="${x + i * 11}" y="${top.toFixed(2)}" width="6" height="${height.toFixed(2)}" rx="3" fill="${theme.bar}" fill-opacity="${theme.amp ? 0.55 : 0.35}"/>`;
  }).join('');
}

function scene(theme, frame) {
  const tile = 64;
  const tx = (W - tile) / 2;
  const ty = (H - tile) / 2;
  const mark = theme.check
    ? `<path d="M${tx + 20} ${ty + 33} l9 8 l16 -18" fill="none" stroke="${theme.mark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<g transform="translate(${tx + 12} ${ty + 12}) scale(0.625)" color="${theme.mark}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${logo}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="${theme.shadow}" flood-opacity="0.2"/></filter></defs>
  <rect width="${W}" height="${H}" fill="${theme.ground}"/>
  ${bars(theme, frame, 64, H - 34, 'bottom')}
  ${bars(theme, frame + FRAMES / 2, W - 64 - 50, 30, 'top')}
  <rect x="${tx}" y="${ty}" width="${tile}" height="${tile}" rx="16" fill="${theme.tile}" filter="url(#s)"/>
  ${mark}
</svg>`;
}

function header() {
  // 2x of MUI's 150×57 header image; MUI fits it to the control.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="#E6ECFD"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${24 + i * 8}" y="${28.5 - [8, 14, 20, 12, 6][i] / 2}" width="4" height="${[8, 14, 20, 12, 6][i]}" rx="2" fill="#2F5BEA" fill-opacity="0.55"/>`).join('')}
  <rect x="83" y="12.5" width="32" height="32" rx="8" fill="#FFFFFF"/>
  <g transform="translate(89 18.5) scale(0.3125)" color="#2F5BEA" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${logo}</g>
</svg>`;
}

/** RGBA pixels (opaque) to a bottom-up 24-bit BMP, the format NSIS's LoadImage reads. */
export function bmp(rgba, width, height) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + stride * height;
  const file = Buffer.alloc(size);
  file.write('BM', 0, 'ascii');
  file.writeUInt32LE(size, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(stride * height, 34);
  file.writeInt32LE(2835, 38);
  file.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      file[row + x * 3] = rgba[from + 2];
      file[row + x * 3 + 1] = rgba[from + 1];
      file[row + x * 3 + 2] = rgba[from];
    }
  }
  return file;
}

function render(svg, width) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: '#FFFFFF' }).render();
  return bmp(image.pixels, image.width, image.height);
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  await fs.rm(out, { recursive: true, force: true });
  for (const [name, theme] of Object.entries(THEMES)) {
    const count = theme.amp ? FRAMES : 1;
    for (const scale of [1, 2]) {
      const dir = path.join(out, name, `${scale}x`);
      await fs.mkdir(dir, { recursive: true });
      for (let frame = 0; frame < count; frame++) {
        await fs.writeFile(path.join(dir, `${String(frame).padStart(2, '0')}.bmp`), render(scene(theme, frame), W * scale));
      }
    }
  }
  await fs.writeFile(path.join(out, 'header.bmp'), render(header(), 300));
  console.log('installer art written to', path.relative(root, out));
}
