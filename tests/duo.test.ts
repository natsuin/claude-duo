import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'

import { HIRAGANA, PARTICLES, WORDS } from '../hooks/deck'
import { owlCells } from '../hooks/owl'

const PANE = {
  plugin: 'duo',
  component: 'Pane',
  requestId: 'duo',
  props: { title: 'Duo', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

// The engine beneath the plugin: just enough of it for Duo's calls.
function engine(on: On) {
  const opened: string[] = []
  mock.store(on)
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.focus', () => ({}))

  return { opened, clock }
}

// The label the drawn question wants, worked out from the deck.
type Pane = Mounted<'terminal', 'Pane'> | Mounted<'desktop', 'Pane'>

async function rightLabel(ui: Pane): Promise<string> {
  const ask = (await ui.find({ type: 'Text', text: /^(What does this mean\?|How do you say this in Japanese\?|How do you read this\?|Which sound is this\?|Fill in the particle)$/ }))?.text
  const big = (await ui.findAll({ type: 'Text' })).find(one => one.props.color === '#1CB0F6')?.text ?? ''
  const word = WORDS.find(w => w.jp === big || `"${w.en}"` === big)
  if (ask === 'What does this mean?') return word?.en ?? ''
  if (ask === 'How do you say this in Japanese?') return word?.jp ?? ''
  if (ask === 'How do you read this?') return word?.kana ?? ''
  if (ask === 'Which sound is this?') return HIRAGANA.find(k => k.kana === big)?.romaji ?? ''
  return PARTICLES.find(s => `${s.before} ＿ ${s.after}` === big)?.answer ?? ''
}

async function choiceKey(ui: Pane, isRight: boolean): Promise<string> {
  const right = await rightLabel(ui)
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.filter(b => b.props.label === right)).toHaveLength(1)
  const chosen = buttons.find(b => (b.props.label === right) === isRight)

  return chosen?.key ?? ''
}

const xpOf = async (ui: Pane) =>
  Number((await ui.find({ type: 'Text', text: /^⚡\d+ XP$/ }))?.text.match(/\d+/)?.[0])

test('a right answer scores and Continue brings the next question, on terminal and desktop', async ($, on) => {
  engine(on)
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const xp = await xpOf(ui)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(4)

    await ui.press({ key: await choiceKey(ui, true) })
    expect(await ui.find({ text: /Correct/ })).toBeDefined()
    expect(await xpOf(ui)).toBe(xp + 10)
    expect(await ui.find({ text: /^🔥1$/ })).toBeDefined()

    await ui.press({ key: 'continue' })
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(4)
    await ui.unmount()
  }
})

test('five wrong answers run out of hearts, and a new lesson refills them', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  for (let i = 0; i < 5; i++) {
    await ui.press({ key: await choiceKey(ui, false) })
    expect(await ui.find({ text: /Not quite/ })).toBeDefined()
    await ui.press({ key: 'continue' })
  }
  expect(await ui.find({ text: /Out of hearts/ })).toBeDefined()

  await ui.press({ key: 'continue' })
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(4)
  expect(await ui.find({ text: /^♥♥♥♥♥/ })).toBeDefined()
})

test('ten answers finish a lesson with a bonus', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  for (let i = 0; i < 10; i++) {
    await ui.press({ key: await choiceKey(ui, true) })
    await ui.press({ key: 'continue' })
  }
  expect(await ui.find({ text: /Lesson complete! 10\/10/ })).toBeDefined()
  expect(await xpOf(ui)).toBe(120)
})

test('Duo opens on a typed prompt, tracks the turn, and /duo off stops the pop-up', async ($, on) => {
  const { opened } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await $.prompt.submit({ text: 'fix the bug', wait: false, origin: { kind: 'composer' } })
  expect(opened).toEqual(['duo'])

  await $.turn.start({ text: 'fix the bug', turnId: 't1' })
  expect(await ui.find({ text: /Claude is working/ })).toBeDefined()

  await $.turn.complete({ answer: 'done', durationMs: 65_000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await ui.find({ text: /Claude finished in 1m 05s/ })).toBeDefined()

  const ran = await $.command.run({ command: 'duo', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  expect(ran.text).toMatch(/won't pop up/)
  await $.prompt.submit({ text: 'and another', wait: false, origin: { kind: 'composer' } })
  expect(opened).toEqual(['duo'])
})

test('45s into a turn with nothing answered, Duo glares and nags; one answer calms him', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const owl = async () => (await ui.find({ type: 'Raster', key: 'owl' }))?.props.cells

  await $.turn.start({ text: 'refactor everything', turnId: 't1' })
  await clock.advance(30_000)
  expect(await ui.find({ text: /Duo sees everything/ })).toBeUndefined()

  await clock.advance(16_000)
  expect(await ui.find({ text: /coding for 46s and you've answered 0\. Duo sees everything/ })).toBeDefined()
  expect(await owl()).toBe(owlCells('glare'))

  await ui.press({ key: await choiceKey(ui, true) })
  expect(await ui.find({ text: /Duo sees everything/ })).toBeUndefined()
  expect(await owl()).toBe(owlCells('happy'))
})
