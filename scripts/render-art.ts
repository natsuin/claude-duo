// Draws the README's pictures from the mod's own sprite, so they always show
// the real Duo. Run with Node 23.6+ from the repo root: node scripts/render-art.ts
import { writeFileSync } from 'node:fs'

import type { Mood } from '../types/index.d.ts'
import { owlSvg } from '../hooks/owl.ts'

const FONT = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Noto Sans Mono CJK JP', monospace`

const owlAt = (mood: Mood, x: number, y: number, size: number) =>
  owlSvg(mood).replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" `)

const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" font-size="15">${body}</svg>\n`

const text = (x: number, y: number, content: string, attrs = 'fill="#e6edf3"') => `<text x="${x}" y="${y}" ${attrs}>${content}</text>`

writeFileSync('assets/duo.svg', svg(160, 160, owlAt('cheer', 0, 0, 160)))

const MOODS: [Mood, string][] = [
  ['idle', 'waiting'],
  ['watch', 'watching Claude'],
  ['happy', 'right answer'],
  ['sad', 'wrong answer'],
  ['glare', 'you, slacking'],
  ['cheer', 'lesson done'],
]
writeFileSync(
  'assets/moods.svg',
  svg(
    MOODS.length * 130,
    140,
    MOODS.map(([mood, label], i) => owlAt(mood, i * 130 + 17, 4, 96) + text(i * 130 + 65, 128, label, 'fill="#8b949e" text-anchor="middle" font-size="13"')).join(''),
  ),
)

const choice = (n: number, kana: string, x: number, y: number) =>
  `<text x="${x}" y="${y}"><tspan fill="#D97757" font-weight="bold">${n}</tspan><tspan fill="#e6edf3">: ${kana}</tspan></text>`

// The pane as a roomy terminal draws it: the big owl, with the bubble, stats and Claude's
// progress beside him and the answers two by two underneath.
writeFileSync(
  'assets/pane.svg',
  svg(
    760,
    356,
    [
      '<rect x="0.5" y="0.5" width="759" height="355" rx="12" fill="#0d1117" stroke="#30363d"/>',
      '<circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>',
      text(380, 25, 'Duo 🦉', 'fill="#8b949e" text-anchor="middle" font-size="13"'),
      owlAt('glare', 24, 50, 128),
      '<rect x="174" y="52" width="562" height="62" rx="10" fill="none" stroke="#58CC02" stroke-width="2"/>',
      text(190, 78, "Claude has been coding for 52s and you've"),
      text(190, 100, 'answered 0. Duo sees everything. 👀'),
      `<text x="176" y="138"><tspan fill="#FF4B4B">♥♥♥♥</tspan><tspan fill="#6e7681">♡</tspan><tspan dx="18" fill="#FFC800" font-weight="bold">⚡120 XP</tspan><tspan dx="18" fill="#FF9600" font-weight="bold">🔥3</tspan></text>`,
      text(176, 162, '⏳ Claude is working · 52s · 7 tools · Edit', 'fill="#8b949e"'),
      '<rect x="176" y="172" width="68" height="14" fill="#58CC02"/><rect x="244" y="172" width="102" height="14" fill="#30363d"/>',
      text(356, 184, '4/10', 'fill="#8b949e"'),
      text(24, 222, 'Fill in the particle', 'fill="#e6edf3" font-weight="bold"'),
      text(44, 246, 'だれ ＿ きましたか。', 'fill="#1CB0F6" font-weight="bold"'),
      text(236, 246, 'Who came?', 'fill="#8b949e"'),
      choice(1, 'は', 24, 276),
      choice(2, 'が', 390, 276),
      choice(3, 'を', 24, 300),
      choice(4, 'に', 390, 300),
      text(24, 336, '1-4 answer · c continue · Esc back to prompt · ctrl+x tab back to Duo · /duo off', 'fill="#6e7681" font-size="13"'),
    ].join(''),
  ),
)
