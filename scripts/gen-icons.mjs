// Generates the PWA PNG icons from scratch (no image deps) so `npm run build`
// never depends on binary assets being checked in.
import { deflateSync } from 'node:zlib';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const BG = [0x0e, 0x11, 0x16];
const FG = [0xf2, 0x6b, 0x3a];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Rounded-rect coverage, antialiased by 3x3 supersampling. */
const roundRect = (x, y, w, h, r) => (px, py) => {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const ux = px + (sx + 0.5) / 3;
      const uy = py + (sy + 0.5) / 3;
      if (ux < x || ux > x + w || uy < y || uy > y + h) continue;
      const cx = Math.min(Math.max(ux, x + r), x + w - r);
      const cy = Math.min(Math.max(uy, y + r), y + h - r);
      if ((ux - cx) ** 2 + (uy - cy) ** 2 <= r * r) hits++;
    }
  }
  return hits / 9;
};

// Dumbbell, expressed on a 512 grid (matches public/icon.svg).
const BARBELL = [
  roundRect(64, 216, 44, 80, 14),
  roundRect(404, 216, 44, 80, 14),
  roundRect(116, 188, 56, 136, 18),
  roundRect(340, 188, 56, 136, 18),
  roundRect(172, 238, 168, 36, 18),
];

function render(size, { radius, inset }) {
  const scale = size / 512;
  const bgShape = roundRect(0, 0, size, size, radius * scale);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Map pixel into the 512-space, honouring the maskable safe-area inset.
      const u = (x / scale - 256) / inset + 256;
      const v = (y / scale - 256) / inset + 256;
      let fg = 0;
      for (const shape of BARBELL) fg = Math.max(fg, shape(u, v));
      const a = bgShape(x, y);
      const o = 1 + x * 4;
      for (let c = 0; c < 3; c++) row[o + c] = Math.round(BG[c] * (1 - fg) + FG[c] * fg);
      row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, { radius: 112, inset: 1 }],
  ['icon-512.png', 512, { radius: 112, inset: 1 }],
  // Maskable icons get cropped to a circle, so shrink the art into the safe area
  // and let the background bleed to the square edges.
  ['icon-maskable-512.png', 512, { radius: 0, inset: 1.45 }],
];
for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), render(size, opts));
  console.log('wrote', name, size + 'px');
}
