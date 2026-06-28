import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngStats(filePath) {
  return analyzePng(readFileSync(filePath));
}

export function analyzePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) {
    throw new Error("PNG data is empty or not a buffer.");
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("PNG signature is invalid.");
  }

  let offset = PNG_SIGNATURE.length;
  let ihdr = null;
  const idat = [];
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      throw new Error("PNG chunk header is truncated.");
    }
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`PNG chunk ${type} is truncated.`);
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      ihdr = parseIhdr(data);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!ihdr) {
    throw new Error("PNG IHDR chunk is missing.");
  }
  if (idat.length === 0) {
    throw new Error("PNG IDAT chunk is missing.");
  }

  return samplePixels(ihdr, Buffer.concat(idat));
}

function parseIhdr(data) {
  if (data.length !== 13) {
    throw new Error("PNG IHDR chunk has invalid length.");
  }
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8];
  const colorType = data[9];
  const compression = data[10];
  const filter = data[11];
  const interlace = data[12];
  if (width === 0 || height === 0) {
    throw new Error("PNG dimensions are empty.");
  }
  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}.`);
  }
  if (compression !== 0 || filter !== 0 || interlace !== 0) {
    throw new Error("Unsupported PNG compression, filter, or interlace mode.");
  }
  return { width, height, bitDepth, colorType };
}

function samplePixels(ihdr, compressedIdat) {
  const bpp = bytesPerPixel(ihdr.colorType);
  const rowBytes = ihdr.width * bpp;
  const inflated = inflateSync(compressedIdat);
  const expectedBytes = (rowBytes + 1) * ihdr.height;
  if (inflated.length < expectedBytes) {
    throw new Error("PNG image data is truncated.");
  }

  let sourceOffset = 0;
  let previous = new Uint8Array(rowBytes);
  let firstPixel = null;
  let differentPixels = 0;
  let transparentPixels = 0;
  const uniqueColors = new Set();

  for (let y = 0; y < ihdr.height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const raw = inflated.subarray(sourceOffset, sourceOffset + rowBytes);
    sourceOffset += rowBytes;
    const decoded = unfilterRow(filterType, raw, previous, bpp);
    for (let x = 0; x < rowBytes; x += bpp) {
      const pixel = decoded.subarray(x, x + bpp);
      if (firstPixel === null) {
        firstPixel = Buffer.from(pixel);
      } else if (pixelEquals(pixel, firstPixel) === false) {
        differentPixels += 1;
      }
      if (bpp === 4 && pixel[3] === 0) {
        transparentPixels += 1;
      }
      if (uniqueColors.size < 1024) {
        uniqueColors.add(Buffer.from(pixel).toString("hex"));
      }
    }
    previous = decoded;
  }

  const pixels = ihdr.width * ihdr.height;
  return {
    width: ihdr.width,
    height: ihdr.height,
    colorType: ihdr.colorType,
    bitDepth: ihdr.bitDepth,
    pixels,
    differentPixels,
    uniqueColors: uniqueColors.size,
    transparentPixels,
    nonBlank: pixels > 0 && uniqueColors.size > 1,
  };
}

function bytesPerPixel(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type: ${colorType}.`);
}

function unfilterRow(filterType, raw, previous, bpp) {
  const decoded = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const left = i >= bpp ? decoded[i - bpp] : 0;
    const up = previous[i] ?? 0;
    const upperLeft = i >= bpp ? previous[i - bpp] ?? 0 : 0;
    if (filterType === 0) {
      decoded[i] = raw[i];
    } else if (filterType === 1) {
      decoded[i] = (raw[i] + left) & 0xff;
    } else if (filterType === 2) {
      decoded[i] = (raw[i] + up) & 0xff;
    } else if (filterType === 3) {
      decoded[i] = (raw[i] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filterType === 4) {
      decoded[i] = (raw[i] + paeth(left, up, upperLeft)) & 0xff;
    } else {
      throw new Error(`Unsupported PNG row filter: ${filterType}.`);
    }
  }
  return decoded;
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function pixelEquals(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}
