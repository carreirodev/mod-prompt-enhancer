import type { EngineInterface } from 'claude-code'

import { isRecord } from './text'

export const chordFor = (config: unknown, action: string): string => {
  if (!isRecord(config) || !Array.isArray(config.bindings)) {
    return ''
  }

  for (const block of config.bindings) {
    if (!isRecord(block) || block.context !== 'Chat' || !isRecord(block.bindings)) {
      continue
    }
    for (const [chord, bound] of Object.entries(block.bindings)) {
      if (bound === action) {
        return chord
      }
    }
  }

  return ''
}

export async function readHotkey($: EngineInterface, command: string): Promise<string> {
  const configured = await $.env.get('CLAUDE_CONFIG_DIR')
  // why: Claude Code resolves its home from USERPROFILE on Windows, where HOME may point elsewhere.
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const dir = configured ?? (home === undefined ? undefined : `${home}/.claude`)
  if (dir === undefined) {
    return ''
  }

  const path = `${dir}/keybindings.json`
  if (!(await $.fs.exists(path))) {
    return ''
  }

  return chordFor(JSON.parse(await $.fs.read(path)), `command:${command}`)
}
