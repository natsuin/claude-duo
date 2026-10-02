import type { Mood } from '../types'

type Sprite = {
  body: string[]
  // Each mood redraws the face rows it changes, by row index.
  faces: Record<Mood, Record<number, string>>
}

export type OwlSize = 'big' | 'small'

const SPRITES: Record<OwlSize, Sprite> = {
  // 16×16 pixels: a 16×8 Raster.
  big: {
    body: [
      '..G..........G..',
      '..GG........GG..',
      '..GGGGGGGGGGGG..',
      '.GGGGGGGGGGGGGG.',
      '.GWWWWGGGGWWWWG.',
      '.WWWWWWGGWWWWWW.',
      '.WWKKWWGGWWKKWW.',
      '.WWKKWWGGWWKKWW.',
      '.GWWWWGOOGWWWWG.',
      '.GGGGGGOOGGGGGG.',
      'DGGLLLLLLLLLLGGD',
      'DGLLLLLLLLLLLLGD',
      'DGLLLLLLLLLLLLGD',
      '.GGLLLLLLLLLLGG.',
      '..GGGGGGGGGGGG..',
      '...OO......OO...',
    ],
    faces: {
      idle: {},
      watch: { 6: '.KKWWWWGGKKWWWW.', 7: '.KKWWWWGGKKWWWW.' },
      happy: { 7: '.WKWWKWGGWKWWKW.' },
      cheer: { 7: '.WKWWKWGGWKWWKW.', 8: '.PWWWWGOOGWWWWP.' },
      sad: { 6: '.WWWWWWGGWWWWWW.', 8: '.BWWWWGOOGWWWWG.' },
      glare: { 4: '.GGGGGGGGGGGGGG.', 5: '.WDDDDDGGDDDDDW.', 6: '.WWKKWDGGDWKKWW.' },
    },
  },
  // 10×8 pixels: a 10×4 Raster, for panes too short for the big one.
  small: {
    body: [
      '.G......G.',
      '.GGGGGGGG.',
      'GWWWGGWWWG',
      'GWKWGGWKWG',
      'GGGGOOGGGG',
      'DLLLLLLLLD',
      '.GLLLLLLG.',
      '..O....O..',
    ],
    faces: {
      idle: {},
      watch: { 3: 'GKWWGGKWWG' },
      happy: { 2: 'GGKGGGGKGG', 3: 'GKGKGGKGKG' },
      cheer: { 2: 'GGKGGGGKGG', 3: 'GKGKGGKGKG', 4: 'PGGGOOGGGP' },
      sad: { 2: 'GDWWGGWWDG', 4: 'GBGGOOGGGG' },
      glare: { 2: 'GWWDGGDWWG' },
    },
  },
}

/** The Raster's size in terminal cells: each cell holds two pixels, one above the other. */
export const owlSize = (size: OwlSize) => ({
  columns: (SPRITES[size].body[0] as string).length,
  rows: SPRITES[size].body.length / 2,
})

const COLORS: Record<string, number> = {
  G: 0x58cc02,
  D: 0x46a302,
  L: 0x89e219,
  W: 0xffffff,
  K: 0x1a1a1a,
  O: 0xff9600,
  B: 0x1cb0f6,
  P: 0xff86d0,
}

const DEFAULT = 0x01000000

function pixels(mood: Mood, size: OwlSize): string[] {
  const { body, faces } = SPRITES[size]
  return body.map((row, y) => faces[mood][y] ?? row)
}

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ABC[(n >> 18) & 63]
    out += ABC[(n >> 12) & 63]
    out += b === undefined ? '=' : ABC[(n >> 6) & 63]
    out += c === undefined ? '=' : ABC[n & 63]
  }

  return out
}

const cache = new Map<string, string>()

// The owl as a Raster: each cell is a half block, its top pixel the
// foreground and its bottom pixel the background.
export function owlCells(mood: Mood, size: OwlSize = 'big'): string {
  const hit = cache.get(`${size}:${mood}`)
  if (hit !== undefined) return hit

  const rows = pixels(mood, size)
  const { columns, rows: cellRows } = owlSize(size)
  const words = new Uint32Array(columns * cellRows * 3)
  for (let cy = 0; cy < cellRows; cy++) {
    for (let x = 0; x < columns; x++) {
      const top = COLORS[(rows[cy * 2] as string)[x] as string]
      const bottom = COLORS[(rows[cy * 2 + 1] as string)[x] as string]
      const at = (cy * columns + x) * 3
      if (top === undefined && bottom === undefined) words.set([0x20, DEFAULT, DEFAULT], at)
      else if (top === undefined) words.set([0x2584, bottom as number, DEFAULT], at)
      else words.set([0x2580, top, bottom ?? DEFAULT], at)
    }
  }
  const cells = base64(new Uint8Array(words.buffer))
  cache.set(`${size}:${mood}`, cells)

  return cells
}

// The same pixels as an SVG, for the surfaces without a Raster.
export function owlSvg(mood: Mood, size: OwlSize = 'big'): string {
  const { columns, rows } = owlSize(size)
  const rects = pixels(mood, size).flatMap((row, y) =>
    [...row].flatMap((c, x) => {
      const color = COLORS[c]
      return color === undefined ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="#${color.toString(16).padStart(6, '0')}"/>`]
    }),
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${rows * 2}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
