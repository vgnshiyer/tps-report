// The small Bill for terminals that can't show images: a 16×10 sprite, drawn as
// 16 columns × 5 rows of ▀/▄ half-block cells.
// One character per pixel; '.' is transparent.
const PALETTE = {
  H: 0x704c2d, h: 0x4a301b, I: 0x8f6740, // hair, its shadow and shine
  S: 0xf2c18d, s: 0xd99a6c, // skin, shadow
  G: 0x5a5a5a, L: 0xd6ecff, E: 0x1b1b1b, // glasses frame, lens, pupil
  m: 0xa4553f, O: 0x4a1410, // mouth closed, open
  C: 0xffffff, w: 0xe6eefb, b: 0x86a8e0, // collar, striped shirt
  U: 0x23306b, T: 0x8e1b2a, t: 0x5e1019, // suspenders, tie, knot
  K: 0x6b4226, M: 0xf4f4f4, n: 0xc8c8c8, // coffee, mug, handle
  R: 0xe3261b, r: 0x9c140d, Q: 0xff7a6e, // red stapler, its base and shine
}

const IDLE = [
  '....hHIIHh......',
  '...hSSSSSSh.....',
  '..sGLELLELGs....',
  '...SSSSsSSS.....',
  '...SSSSmmmS.....',
  '....sSSSSs......',
  '..wwCCttCCww....',
  '.wbUwbTTbwUbwKK.',
  'QRRRwbTTbwUbSMMn',
  'rrrrwbwwbwUb.MM.',
]

const swap = (rows, at, row) => rows.map((r, i) => (i === at ? row : r))
const BLINK = swap(IDLE, 2, '..sGLsLLsLGs....')
const TALK = swap(IDLE, 4, '...SSSSOOOS.....')

export const COLUMNS = IDLE[0].length
export const ROWS = IDLE.length / 2

const DEFAULT = 0x01000000 // the terminal's own color
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const SPACE = 0x20

function cells(rows) {
  const words = []
  for (let y = 0; y < rows.length; y += 2) {
    for (let x = 0; x < COLUMNS; x++) {
      const top = PALETTE[rows[y][x]]
      const bottom = PALETTE[rows[y + 1][x]]
      if (top === undefined && bottom === undefined) words.push(SPACE, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(LOWER, bottom, DEFAULT)
      else words.push(UPPER, top, bottom ?? DEFAULT)
    }
  }
  return new Uint8Array(Uint32Array.from(words).buffer).toBase64()
}

export const FRAMES = { idle: cells(IDLE), blink: cells(BLINK), talk: cells(TALK) }
