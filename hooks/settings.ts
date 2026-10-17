import type { EnhanceEffort, EnhanceModel, EnhanceSettings } from '../types'

import { isRecord } from './context'

export type SettingsChange = { settings: EnhanceSettings } | { unknown: string[] }

export const MODELS: readonly EnhanceModel[] = ['sonnet', 'opus', 'haiku']
export const EFFORTS: readonly EnhanceEffort[] = ['low', 'medium', 'high']
export const DEFAULT_SETTINGS: EnhanceSettings = { model: 'sonnet', effort: 'medium' }

// why: the store is a JSON file anyone can edit, so a field outside the lists counts as unset, as userConfig did.
export const parseSettings = (value: unknown): EnhanceSettings => {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS
  }

  return {
    model: MODELS.find(model => model === value.model) ?? DEFAULT_SETTINGS.model,
    effort: EFFORTS.find(level => level === value.effort) ?? DEFAULT_SETTINGS.effort,
  }
}

export const applyArgs = (current: EnhanceSettings, args: string): SettingsChange => {
  let settings = current
  const unknown: string[] = []
  for (const word of args.toLowerCase().split(/\s+/)) {
    if (word === '') {
      continue
    }
    const model = MODELS.find(name => name === word)
    const effort = EFFORTS.find(level => level === word)
    if (model !== undefined) {
      settings = { ...settings, model }
    } else if (effort !== undefined) {
      settings = { ...settings, effort }
    } else {
      unknown.push(word)
    }
  }

  return unknown.length > 0 ? { unknown } : { settings }
}

export const describeSettings = (settings: EnhanceSettings): string =>
  `modelo ${settings.model} · esforço ${settings.effort}`
