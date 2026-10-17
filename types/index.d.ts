export type EnhancePhase = 'idle' | 'working' | 'done' | 'failed'

export type EnhanceRun = {
  phase: EnhancePhase
  original: string
  note: string
  startedAt: number
  finishedAt: number
}

export type EnhanceModel = 'sonnet' | 'opus' | 'haiku'

export type EnhanceEffort = 'low' | 'medium' | 'high'

export type EnhanceSettings = {
  model: EnhanceModel
  effort: EnhanceEffort
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      run: EnhanceRun
      frame: number
      settings: EnhanceSettings
      isConfiguring: boolean
    }
  }
}
