/**
 * PWA のアイコン（PNG）を public/ に生成する（仕様書 7 章、Issue #66）。
 * 図柄は public/favicon.svg と同じ（角丸の青い四角に白いチェック）。依存を増やさないため、
 * 四角とチェックの線を距離関数で自分で塗り、PNG も node:zlib で自分で書き出す。
 *
 *   node scripts/icons.mjs
 *
 * 出力:
 *   public/icon-192.png, public/icon-512.png            purpose "any"（角丸、外側は透明）
 *   public/icon-maskable-192.png, public/icon-maskable-512.png  purpose "maskable"（全面を青で塗り、図柄は中央 80% に収める）
 *   public/apple-touch-icon.png（180px、角丸なし。iOS が角を丸める）
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BLUE = [0x25, 0x63, 0xeb];
const WHITE = [0xff, 0xff, 0xff];
/** favicon.svg の viewBox（32 × 32）での図形 */
const SVG = {
  size: 32,
  radius: 6,
  // M9 16.5 L13.5 21 L23 11（stroke-width 3、round cap / join）
  check: [
    [9, 16.5],
    [13.5, 21],
    [23, 11],
  ],
  strokeWidth: 3,
};
/** 1 ピクセルを縦横 4 分割して平均を取る（縁を滑らかにする） */
const SUPERSAMPLE = 4;

/** 点 p から線分 ab までの距離 */
function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

/** 点が角丸の四角（原点〜size、半径 radius）の中にあるか */
function insideRoundedRect([x, y], size, radius) {
  const dx = Math.max(radius - x, 0, x - (size - radius));
  const dy = Math.max(radius - y, 0, y - (size - radius));
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * 1 枚描く。
 * @param {number} size 出力のピクセル数
 * @param {{ maskable?: boolean; square?: boolean }} options maskable は全面を塗り図柄を 80% に縮める。square は角丸なし
 */
function render(size, { maskable = false, square = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  // 図柄（viewBox 32）を出力サイズへ写す。maskable はセーフゾーン（中央 80%）に収める
  const scale = (size / SVG.size) * (maskable ? 0.8 : 1);
  const offset = maskable ? size * 0.1 : 0;
  const halfStroke = (SVG.strokeWidth / 2) * scale;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let background = 0;
      let check = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          const inBackground =
            maskable || square || insideRoundedRect([px, py], size, (SVG.radius / SVG.size) * size);
          if (!inBackground) continue;
          background++;
          const p = [px - offset, py - offset];
          const onCheck = SVG.check.some(
            (a, i) =>
              i < SVG.check.length - 1 &&
              distanceToSegment(
                p,
                a.map((v) => v * scale),
                SVG.check[i + 1].map((v) => v * scale),
              ) <= halfStroke,
          );
          if (onCheck) check++;
        }
      }
      const i = (y * size + x) * 4;
      if (background === 0) continue; // 透明のまま
      const whiteRatio = check / background;
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(BLUE[c] * (1 - whiteRatio) + WHITE[c] * whiteRatio);
      }
      pixels[i + 3] = Math.round((255 * background) / samples);
    }
  }
  return pixels;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** RGBA のピクセル列を PNG にする（8 bit、カラータイプ 6、フィルタなし） */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outputs = [
  ["public/icon-192.png", 192, {}],
  ["public/icon-512.png", 512, {}],
  ["public/icon-maskable-192.png", 192, { maskable: true }],
  ["public/icon-maskable-512.png", 512, { maskable: true }],
  ["public/apple-touch-icon.png", 180, { square: true }],
];

for (const [path, size, options] of outputs) {
  writeFileSync(new URL(`../${path}`, import.meta.url), encodePng(size, render(size, options)));
  console.log(`${path} (${size}px)`);
}
