import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { owlCells } from '../hooks/owl'

// The pane must fit the rows it is given, or it scrolls and cuts Duo's head (or the answers) off.

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

function engine(on: On) {
  const opens: { id: string; rows?: number }[] = []
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', (_$, e) => {
    opens.push({ id: e.id, rows: e.rows })
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.focus', () => ({}))

  return { opens }
}

const pane = (bodyRows: number, bodyColumns: number) =>
  ({
    plugin: 'duo',
    component: 'Pane',
    requestId: 'duo',
    surface: 'terminal',
    props: { title: 'Duo', isFocused: true, bodyColumns, placement: 'inline', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

test('a tall, wide pane gets the big owl; a short or narrow one the small owl, with every answer still there', async ($, on) => {
  engine(on)
  await $.session.start(START)

  for (const [rows, columns, size, width] of [
    [30, 100, 'big', 16],
    [12, 100, 'small', 10],
    [30, 44, 'small', 10],
  ] as const) {
    const ui = await $.ui.mount(pane(rows, columns))
    const owl = await ui.find({ type: 'Raster', key: 'owl' })
    expect(owl?.props.columns).toBe(width)
    expect(owl?.props.cells).toBe(owlCells('idle', size))
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(4)
    await ui.unmount()
  }
})

test('a short pane drops the key hints; a roomy one keeps them', async ($, on) => {
  engine(on)
  await $.session.start(START)

  const short = await $.ui.mount(pane(12, 100))
  expect(await short.find({ text: /Esc back to prompt/ })).toBeUndefined()
  await short.unmount()

  const roomy = await $.ui.mount(pane(30, 100))
  expect(await roomy.find({ text: /Esc back to prompt/ })).toBeDefined()
})

test('/duo asks for enough rows to show the whole pane', async ($, on) => {
  const { opens } = engine(on)
  await $.session.start(START)
  await $.command.run({ command: 'duo', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(opens).toEqual([{ id: 'duo', rows: 16 }])
})

test('above the prompt the screen height picks the owl, since the pane shrinks to fit him', async ($, on) => {
  engine(on)
  await $.session.start(START)

  for (const [screenRows, columns] of [
    [45, 16],
    [30, 10],
  ] as const) {
    const ui = await $.ui.mount({ ...pane(8, 120), viewport: { columns: 120, rows: screenRows, isFullscreen: false } })
    expect((await ui.find({ type: 'Raster', key: 'owl' }))?.props.columns).toBe(columns)
    await ui.unmount()
  }
})
