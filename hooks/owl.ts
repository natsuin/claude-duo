import type { Mood } from '../types'

// Duo as 16×16 pixels. Rows 6 and 7 are the eyes, swapped per mood.
const BODY = [
  '..G..........G..',
  '..GG........GG..',
  '..GGGGGGGGGGGG..',
  '.GGGGGGGGGGGGGG.',
  '.GWWWWGGGGWWWWG.',
  '.WWWWWWGGWWWWWW.',
  '',
  '',
  '.GWWWWGOOGWWWWG.',
  '.GGGGGGOOGGGGGG.',
  'DGGLLLLLLLLLLGGD',
  'DGLLLLLLLLLLLLGD',
  'DGLLLLLLLLLLLLGD',
  '.GGLLLLLLLLLLGG.',
  '..GGGGGGGGGGGG..',
  '...OO......OO...',
]

const EYES: Record<Mood, [string, string]> = {
  idle: ['WWKKWW', 'WWKKWW'],
  watch: ['KKWWWW', 'KKWWWW'],
  happy: ['WWKKWW', 'WKWWKW'],
  cheer: ['WWKKWW', 'WKWWKW'],
  sad: ['WWWWWW', 'WWKKWW'],
}

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

function pixels(mood: Mood): string[] {
  const [top, bottom] = EYES[mood]
  const rows = BODY.map((row, y) => (y === 6 ? `.${top}GG${top}.` : y === 7 ? `.${bottom}GG${bottom}.` : row))
  const mark = (y: number, x: number, c: string) => {
    const row = rows[y] as string
    rows[y] = row.slice(0, x) + c + row.slice(x + 1)
  }
  if (mood === 'sad') mark(8, 1, 'B')
  if (mood === 'cheer') {
    mark(8, 1, 'P')
    mark(8, 14, 'P')
  }

  return rows
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

const cache = new Map<Mood, string>()

// The owl as a 16×8 Raster: each cell is a half block, its top pixel the
// foreground and its bottom pixel the background.
export function owlCells(mood: Mood): string {
  const hit = cache.get(mood)
  if (hit !== undefined) return hit

  const rows = pixels(mood)
  const words = new Uint32Array(16 * 8 * 3)
  for (let cy = 0; cy < 8; cy++) {
    for (let x = 0; x < 16; x++) {
      const top = COLORS[(rows[cy * 2] as string)[x] as string]
      const bottom = COLORS[(rows[cy * 2 + 1] as string)[x] as string]
      const at = (cy * 16 + x) * 3
      if (top === undefined && bottom === undefined) words.set([0x20, DEFAULT, DEFAULT], at)
      else if (top === undefined) words.set([0x2584, bottom as number, DEFAULT], at)
      else words.set([0x2580, top, bottom ?? DEFAULT], at)
    }
  }
  const cells = base64(new Uint8Array(words.buffer))
  cache.set(mood, cells)

  return cells
}

// The same pixels as an SVG, for the surfaces without a Raster.
export function owlSvg(mood: Mood): string {
  const rects = pixels(mood).flatMap((row, y) =>
    [...row].flatMap((c, x) => {
      const color = COLORS[c]
      return color === undefined ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="#${color.toString(16).padStart(6, '0')}"/>`]
    }),
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
