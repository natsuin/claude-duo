export type QuestionKind = 'meaning' | 'reverse' | 'reading' | 'kana' | 'particle'

export type Question = {
  kind: QuestionKind
  ask: string
  big: string
  hint: string
  choices: string[]
  answer: number
  explain: string
}

export type Phase = 'ask' | 'feedback' | 'lessonDone' | 'noHearts'

export type Mood = 'idle' | 'watch' | 'happy' | 'sad' | 'cheer'

export type Game = {
  q: Question
  phase: Phase
  picked: number | null
  hearts: number
  combo: number
  done: number
  right: number
  mood: Mood
  line: string
}

export type Claude = {
  isWorking: boolean
  startedAt: number
  now: number
  tools: number
  lastTool: string
  answered: number
  lastMs: number
}

export type Profile = { streak: number; lastDay: string; xp: number; isAuto: boolean }

declare module 'claude-code' {
  interface PluginState {
    duo: { game: Game | null; claude: Claude; profile: Profile }
  }
}
