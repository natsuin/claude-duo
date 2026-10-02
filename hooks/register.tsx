import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Claude, Game, Mood, Profile } from '../types'

import type { OwlSize } from './owl'
import { owlCells, owlSize, owlSvg } from './owl'
import { nextQuestion, pick } from './quiz'

const PANE = 'duo'
const TITLE = 'Duo 🦉'
const LESSON = 10
const HEARTS = 5
const DAY = 24 * 60 * 60 * 1000
const NAG_AFTER_MS = 45_000
const PANE_ROWS = 16 // the tallest the pane gets with the big owl: a question's feedback
const PROMPT_ROWS = 15 // what a screen keeps besides a pane above the prompt (measured 13, plus slack for status lines)

const GREEN = '#58CC02'
const RED = '#FF4B4B'
const BLUE = '#1CB0F6'
const GOLD = '#FFC800'
const PURPLE = '#CE82FF'

const game = atom({ plugin: 'duo', key: 'game' } as const, null)
const claude = atom({ plugin: 'duo', key: 'claude' } as const, {
  isWorking: false,
  startedAt: 0,
  now: 0,
  tools: 0,
  lastTool: '',
  answered: 0,
  lastMs: 0,
})
const profile = atom({ plugin: 'duo', key: 'profile' } as const, { streak: 0, lastDay: '', xp: 0, isAuto: true })

const CHEERS = ['Nice!', 'すごい！', 'Perfect!', 'いいね！', 'You got it!', 'じょうず！', 'Claude codes, you learn. Teamwork.']
const OOPS = ['Hoo… not quite.', 'ざんねん！', 'Duo is not mad. Duo is just disappointed.', 'Close! Remember this one.', 'Even Claude makes typos.']
const STARTS = ["Claude's on it! Let's learn while we wait.", 'Claude is coding. You are learning. 🦉', 'While Claude types, you study. Deal?']

const newGame = (line = 'こんにちは！ Press 1-4 to answer.'): Game => ({
  q: nextQuestion(),
  phase: 'ask',
  picked: null,
  hearts: HEARTS,
  combo: 0,
  done: 0,
  right: 0,
  mood: 'idle',
  line,
})

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const isProfile = (value: unknown): value is Profile =>
  typeof value === 'object' && value !== null && 'xp' in value && 'streak' in value && 'lastDay' in value

function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

async function openPane($: EngineInterface) {
  await update($, game, g => g ?? newGame())
  return $.ui.open({ id: PANE, title: TITLE, focus: true, rows: PANE_ROWS })
}

async function saveProfile($: EngineInterface) {
  await $.store.set('profile', await read($, profile))
}

async function answer($: EngineInterface, picked: number) {
  let isRight: boolean | null = null
  await update($, game, (g): Game | null => {
    if (g === null || g.phase !== 'ask') return g
    const right = picked === g.q.answer
    isRight = right
    const combo = right ? g.combo + 1 : 0
    const line = !right ? pick(OOPS) : combo >= 3 ? `${combo} in a row! 🔥` : pick(CHEERS)

    return {
      ...g,
      phase: 'feedback',
      picked,
      combo,
      hearts: right ? g.hearts : g.hearts - 1,
      done: g.done + 1,
      right: g.right + (right ? 1 : 0),
      mood: right ? 'happy' : 'sad',
      line,
    }
  })
  if (isRight === null) return

  const now = await $.clock.now()
  const gained = isRight ? 10 : 0
  await update($, profile, p => {
    const day = dayOf(now)
    const streak = p.lastDay === day ? p.streak : p.lastDay === dayOf(now - DAY) ? p.streak + 1 : 1
    return { ...p, xp: p.xp + gained, streak, lastDay: day }
  })
  await saveProfile($)
  await update($, claude, c => ({ ...c, answered: c.answered + 1 }))
  void $.ui.focus({ requestId: PANE, key: 'continue' }).catch(() => undefined)
}

async function advance($: EngineInterface) {
  let bonus = 0
  const { isWorking } = await read($, claude)
  await update($, game, (g): Game | null => {
    if (g === null || g.phase === 'ask') return g
    if (g.phase === 'feedback' && g.hearts <= 0) {
      return { ...g, phase: 'noHearts', mood: 'sad', line: 'Out of hearts! 💔 A fresh lesson refills them.' }
    }
    if (g.phase === 'feedback' && g.done >= LESSON) {
      bonus = 20
      const line = g.right === LESSON ? 'PERFECT LESSON! Duo is crying happy tears.' : `Lesson complete! ${g.right}/${LESSON} right.`
      return { ...g, phase: 'lessonDone', mood: 'cheer', line }
    }
    if (g.phase !== 'feedback') return newGame(isWorking ? pick(STARTS) : 'New lesson! がんばって！')

    return { ...g, phase: 'ask', picked: null, q: nextQuestion(g.q.big), mood: isWorking ? 'watch' : 'idle' }
  })
  if (bonus > 0) {
    await update($, profile, p => ({ ...p, xp: p.xp + bonus }))
    await saveProfile($)
  }
  void $.ui.focus({ requestId: PANE, key: 'choice-0' }).catch(() => undefined)
}

async function tick($: EngineInterface) {
  const { isWorking } = await read($, claude)
  if (!isWorking) return
  const now = await $.clock.now()
  await update($, claude, c => ({ ...c, now }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'duo',
      description: 'Practice Japanese with Duo while Claude works (/duo, /duo on, /duo off, /duo close)',
    })
    const saved = await $.store.get('profile')
    if (isProfile(saved)) await update($, profile, () => saved)
    await update($, game, g => g ?? newGame())
    $.clock.every(1000, () => void tick($))

    return next(e)
  })

  on('command.run', { command: 'duo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await update($, profile, p => ({ ...p, isAuto: arg === 'on' }))
      await saveProfile($)
      return {
        text: arg === 'on' ? 'Duo will pop up whenever Claude starts working. 🦉' : "Duo won't pop up on its own anymore. Type /duo to practice anytime.",
      }
    }
    if (arg === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Duo is napping. 🦉💤' }
    }
    await openPane($)

    return { text: 'Duo is here. Press 1-4 to answer, c to continue, Esc to go back to the prompt.' }
  })

  // A prompt the person typed at an idle session: Claude is about to work, so Duo shows up.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && e.turnId === undefined && (await read($, profile)).isAuto) {
      void openPane($).catch(() => undefined)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, claude, () => ({ isWorking: true, startedAt: now, now, tools: 0, lastTool: '', answered: 0, lastMs: 0 }))
    await update($, game, (g): Game | null => (g === null ? newGame(pick(STARTS)) : g.phase === 'ask' ? { ...g, line: pick(STARTS), mood: 'watch' } : g))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, claude)).isWorking) {
      await update($, claude, c => ({ ...c, tools: c.tools + 1, lastTool: String(e.tool).split('__').pop() ?? '' }))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const c = await read($, claude)
    if (e.agentId !== undefined || !c.isWorking) return next(e)

    const now = await $.clock.now()
    await update($, claude, one => ({ ...one, isWorking: false, now, lastMs: e.durationMs }))
    const line = e.isAborted ? 'Turn stopped. Keep practicing?' : "Claude's done! Esc to go read it, or one more? 🦉"
    await update($, game, (g): Game | null => (g !== null && g.phase === 'ask' ? { ...g, mood: 'cheer', line } : g))
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      $.ui.toast(`🦉 Claude finished in ${duration(e.durationMs)}. You answered ${c.answered} while you waited.`, { timeoutMs: 6000 })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const g = await read($, game)
    const c = await read($, claude)
    const p = await read($, profile)

    if (g === null) return <Text dimColor>Duo is waking up…</Text>

    const elapsed = (c.isWorking ? c.now : c.startedAt + c.lastMs) - c.startedAt
    const isNagging = g.phase === 'ask' && c.isWorking && c.answered === 0 && elapsed > NAG_AFTER_MS
    const bubble = isNagging
      ? `Claude has been coding for ${duration(elapsed)} and you've answered 0. Duo sees everything. 👀`
      : g.line
    // While Claude works, Duo keeps glancing over at the transcript.
    const mood: Mood = isNagging ? 'glare' : g.phase === 'ask' && c.isWorking ? (Math.floor(c.now / 3000) % 2 === 0 ? 'watch' : 'idle') : g.mood

    // Everything has to fit the pane's rows, or it scrolls and cuts Duo's head off: the big owl
    // needs PANE_ROWS (and some width for the bubble), else the small one, and a really short
    // pane also drops the spacing and the key hints. A pane above the prompt shrinks to what it
    // shows, so there its own height says nothing about the room it could have; the screen's
    // height does, less the rows Claude Code keeps for the prompt and the transcript.
    const isAbovePrompt = e.props.placement === 'inline' && e.viewport !== undefined
    const room = isAbovePrompt ? Math.max(e.props.scroll.bodyRows, (e.viewport?.rows ?? 0) - PROMPT_ROWS) : e.props.scroll.bodyRows
    const size: OwlSize = room >= PANE_ROWS && e.props.bodyColumns >= 50 ? 'big' : 'small'
    const isTight = room < 13
    const sprite = owlSize(size)

    let owl: RenderElement
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      owl = <Raster key="owl" columns={sprite.columns} rows={sprite.rows} cells={owlCells(mood, size)} />
    } else {
      const { Svg } = $.ui.resolve(e)
      owl = <Svg source={owlSvg(mood, size)} alt="Duo the owl" width={sprite.columns * 4} height={sprite.rows * 8} />
    }

    const barWidth = Math.max(8, Math.min(20, e.props.bodyColumns - sprite.columns - 8))
    const filled = Math.round((g.done / LESSON) * barWidth)
    const isGrid = e.props.bodyColumns >= 36

    const status = c.isWorking
      ? `⏳ Claude is working · ${duration(elapsed)} · ${c.tools} tool${c.tools === 1 ? '' : 's'}${c.lastTool ? ` · ${c.lastTool}` : ''}`
      : c.startedAt > 0
        ? `✅ Claude finished in ${duration(c.lastMs)}. Esc, then read the reply`
        : '💤 Claude is idle. Practice anyway?'

    // The bubble, the stats and Claude's progress all sit beside the owl, so the question and
    // the answers fit under him.
    const header = (
      <Box flexDirection="row" gap={2} alignItems="flex-start" flexShrink={0}>
        <Box flexShrink={0}>{owl}</Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1}>
          {size === 'big' ? (
            <Box borderStyle="round" borderColor={GREEN} paddingX={1}>
              <Text wrap="wrap">{bubble}</Text>
            </Box>
          ) : (
            <Text color={GREEN} wrap="wrap">{bubble}</Text>
          )}
          <Box gap={2}>
            <Text color={RED}>{'♥'.repeat(Math.max(0, g.hearts))}<Text dimColor>{'♡'.repeat(HEARTS - Math.max(0, g.hearts))}</Text></Text>
            <Text color={GOLD} bold>⚡{p.xp} XP</Text>
            <Text color="#FF9600" bold>🔥{p.streak}</Text>
            {g.combo >= 2 && <Text color={PURPLE}>×{g.combo}</Text>}
          </Box>
          <Text dimColor wrap="truncate-end">{status}</Text>
          <Text>
            <Text color={GREEN}>{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
            <Text dimColor> {g.done}/{LESSON}</Text>
          </Text>
        </Box>
      </Box>
    )

    let body: RenderElement
    if (g.phase === 'lessonDone' || g.phase === 'noHearts') {
      const isDone = g.phase === 'lessonDone'
      body = (
        <Box gap={2} marginTop={isTight ? 0 : 1} flexShrink={0}>
          <Box backgroundColor={isDone ? GOLD : RED} paddingX={1}>
            <Text color="#000000" bold>{isDone ? `🎉 Lesson complete! ${g.right}/${LESSON} · +20 XP bonus` : '💔 Out of hearts'}</Text>
          </Box>
          <Button key="continue" hotkey="c" variant="primary" autoFocus label={isDone ? 'Next lesson' : 'New lesson (refills ♥)'} onPress={() => advance($)} />
        </Box>
      )
    } else {
      const isRight = g.picked === g.q.answer
      // Two by two where there's the width: two rows instead of four.
      const choices = g.q.choices.map((choice, i) => (
        <Box width={isGrid ? '50%' : '100%'}>
          {g.phase === 'ask' ? (
            <Button key={`choice-${i}`} plain hotkey={String(i + 1)} label={choice} onPress={() => answer($, i)} />
          ) : i === g.q.answer ? (
            <Text color={GREEN} bold>✓ {i + 1}: {choice}</Text>
          ) : i === g.picked ? (
            <Text color={RED} strikethrough>✗ {i + 1}: {choice}</Text>
          ) : (
            <Text dimColor>  {i + 1}: {choice}</Text>
          )}
        </Box>
      ))
      body = (
        <Box flexDirection="column" marginTop={isTight ? 0 : 1} flexShrink={0}>
          <Text bold>{g.q.ask}</Text>
          <Box paddingLeft={2} gap={2}>
            <Text bold color={BLUE}>{g.q.big}</Text>
            {g.q.hint !== '' && <Text dimColor>{g.q.hint}</Text>}
          </Box>
          <Box flexDirection="row" flexWrap="wrap">{choices}</Box>
          {g.phase === 'feedback' && (
            <Box gap={2}>
              <Box backgroundColor={isRight ? GREEN : RED} paddingX={1}>
                <Text color="#ffffff" bold>{isRight ? '✓ Correct! +10 XP' : '✗ Not quite'}</Text>
              </Box>
              <Button key="continue" hotkey="c" variant="primary" autoFocus label="Continue" onPress={() => advance($)} />
            </Box>
          )}
          {g.phase === 'feedback' && <Text wrap="wrap">{g.q.explain}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        {body}
        {g.phase === 'ask' && !isTight && (
          <Text dimColor wrap="truncate-end">1-4 answer · c continue · Esc back to prompt · ctrl+x tab back to Duo · /duo off</Text>
        )}
      </Box>
    )
  })
}
