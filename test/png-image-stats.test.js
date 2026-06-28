import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { analyzePng } from "../src/png-image-stats.js";

test("PNG stats detect nonblank RGB image data", () => {
  const png = makePng({
    width: 2,
    height: 1,
    colorType: 2,
    bytesPerPixel: 3,
    rows: [[255, 0, 0, 0, 0, 255]],
  });

  const stats = analyzePng(png);

  assert.equal(stats.width, 2);
  assert.equal(stats.height, 1);
  assert.equal(stats.colorType, 2);
  assert.equal(stats.byteLength, png.length);
  assert.match(stats.sha256, /^[0-9a-f]{64}$/);
  assert.equal(stats.nonBlank, true);
  assert.equal(stats.uniqueColors, 2);
});

test("PNG stats detect blank RGBA image data", () => {
  const png = makePng({
    width: 2,
    height: 2,
    colorType: 6,
    bytesPerPixel: 4,
    rows: [
      [0, 0, 0, 255, 0, 0, 0, 255],
      [0, 0, 0, 255, 0, 0, 0, 255],
    ],
  });

  const stats = analyzePng(png);

  assert.equal(stats.nonBlank, false);
  assert.equal(stats.pixels, 4);
  assert.equal(stats.uniqueColors, 1);
});

test("PNG stats reject invalid signature", () => {
  assert.throws(() => analyzePng(Buffer.from("not a png")), /signature/);
});

function makePng({ width, height, colorType, bytesPerPixel, rows }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rawRows = rows.map((row) => {
    assert.equal(row.length, width * bytesPerPixel);
    return Buffer.from([0, ...row]);
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rawRows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}
