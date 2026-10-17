export type EnhancePhase = 'idle' | 'working' | 'done' | 'failed'

export type EnhanceRun = {
  phase: EnhancePhase
  original: string
  note: string
  startedAt: number
  finishedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      run: EnhanceRun
      frame: number
      hotkey: string
    }
  }
}
