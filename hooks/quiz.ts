import type { Question } from '../types'

import { HIRAGANA, PARTICLES, WORDS } from './deck'

export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }

  return out
}

// The answer plus three distractors whose label differs from it (and from each other).
function choicesFor<T>(answer: T, pool: readonly T[], label: (one: T) => string) {
  const right = label(answer)
  const seen = new Set([right])
  const wrong: string[] = []
  for (const one of shuffle(pool)) {
    const text = label(one)
    if (seen.has(text)) continue
    seen.add(text)
    wrong.push(text)
    if (wrong.length === 3) break
  }
  const choices = shuffle([right, ...wrong])

  return { choices, answer: choices.indexOf(right) }
}

function make(): Question {
  const roll = Math.random()

  if (roll < 0.28) {
    const w = pick(WORDS)
    return { kind: 'meaning', ask: 'What does this mean?', big: w.jp, hint: w.kana, ...choicesFor(w, WORDS, one => one.en), explain: `${w.jp}（${w.kana}）= ${w.en}` }
  }
  if (roll < 0.46) {
    const w = pick(WORDS)
    return { kind: 'reverse', ask: 'How do you say this in Japanese?', big: `"${w.en}"`, hint: '', ...choicesFor(w, WORDS, one => one.jp), explain: `${w.en} = ${w.jp}（${w.kana}）` }
  }
  if (roll < 0.62) {
    const w = pick(WORDS)
    return { kind: 'reading', ask: 'How do you read this?', big: w.jp, hint: '', ...choicesFor(w, WORDS, one => one.kana), explain: `${w.jp} is read ${w.kana}: ${w.en}` }
  }
  if (roll < 0.78) {
    const k = pick(HIRAGANA)
    return { kind: 'kana', ask: 'Which sound is this?', big: k.kana, hint: '', ...choicesFor(k, HIRAGANA, one => one.romaji), explain: `${k.kana} = ${k.romaji}` }
  }
  const s = pick(PARTICLES)
  const choices = shuffle(s.options)

  return {
    kind: 'particle',
    ask: 'Fill in the particle',
    big: `${s.before} ＿ ${s.after}`,
    hint: s.en,
    choices,
    answer: choices.indexOf(s.answer),
    explain: `${s.before}${s.answer}${s.after} (${s.why})`,
  }
}

// A fresh question, never the same prompt twice in a row.
export function nextQuestion(previous?: string): Question {
  for (let tries = 0; tries < 5; tries++) {
    const q = make()
    if (q.big !== previous) return q
  }

  return make()
}
