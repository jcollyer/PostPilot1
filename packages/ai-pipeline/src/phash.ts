/**
 * Perceptual hashing (dHash). Computed from a 9x8 grayscale frame: each row of
 * 9 pixels yields 8 "is the next pixel brighter?" bits, giving a 64-bit hash we
 * store as 16 hex chars. dHash is cheap and robust to re-encoding, scaling, and
 * mild trims — exactly the "same clip, different export" case we want to catch.
 */

const WIDTH = 9;
const HEIGHT = 8;

/** Compute a 16-hex-char dHash from raw 9x8 grayscale bytes (72 bytes). */
export function dHashFromGray9x8(gray: Buffer): string {
  if (gray.length < WIDTH * HEIGHT) {
    throw new Error(`dHash expects ${WIDTH * HEIGHT} bytes, got ${gray.length}.`);
  }
  let bits = '';
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH - 1; c++) {
      const left = gray[r * WIDTH + c]!;
      const right = gray[r * WIDTH + c + 1]!;
      bits += left < right ? '1' : '0';
    }
  }
  // 64 bits → 16 hex chars.
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT = Array.from({ length: 16 }, (_, n) =>
  n.toString(2).split('').filter((b) => b === '1').length,
);

/** Hamming distance between two equal-length hex hashes (0..64). */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    dist += POPCOUNT[x]!;
  }
  return dist;
}

/** Similarity in [0,1] derived from Hamming distance over 64 bits. */
export function phashSimilarity(a: string, b: string): number {
  return 1 - hammingDistanceHex(a, b) / 64;
}
