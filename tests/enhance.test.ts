import { describe, expect, mock, test } from 'claude-code/testing'
import type {
  CommandInfo,
  ModelCompleteInput,
  ModelCompleteResult,
  On,
  PromptBox,
  PromptFillInput,
  PromptSubmitInput,
  PromptSubmitResult,
} from 'claude-code'
import type { MockClock } from 'claude-code/testing'

import { chordFor } from '../hooks/hotkey'
import {
  buildRequest,
  cleanReply,
  describeSummary,
  draftLanguage,
  ENGLISH,
  PORTUGUESE,
  summarize,
} from '../hooks/rewrite'

const PLUGIN = 'prompt-enhancer'
const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

const COMMANDS: CommandInfo[] = [
  { name: 'simplify', description: 'Review the changed code for reuse and simplification', source: 'builtin' },
  { name: 'code-review', description: 'Review the current diff for correctness bugs', source: 'builtin' },
  { name: 'enhance', description: 'Prompt Enhancer', source: 'plugin', plugin: PLUGIN },
]

const REWRITE = [
  'Quero adicionar modo escuro ao app.',
  '',
  'Skills a usar:',
  '- /simplify para revisar o código no fim',
  '',
  'Pergunte antes de começar:',
  '- O tema deve seguir o sistema operacional?',
  '- Precisa de um seletor manual?',
  '',
  'Pronto quando:',
  '- O app alterna entre claro e escuro.',
].join('\n')

const ANSWER: ModelCompleteResult = { isAnswered: true, text: `\`\`\`\n${REWRITE}\n\`\`\``, usage: USAGE }

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

type World = {
  box: PromptBox
  fills: PromptFillInput[]
  submits: PromptSubmitInput[]
  requests: ModelCompleteInput[]
  toasts: string[]
  clock: MockClock
}

const world = (
  on: On,
  draft: string,
  reply: ModelCompleteResult,
  whileAsking?: (seen: World) => void | Promise<void>,
  answerSubmit: (e: PromptSubmitInput) => PromptSubmitResult = e => ({ text: e.text }),
): World => {
  const seen: World = {
    box: { text: draft, cursor: draft.length },
    fills: [],
    submits: [],
    requests: [],
    toasts: [],
    clock: mock.clock(on, { now: 1_000 }),
  }
  mock.env(on, {})
  on('prompt.read', () => ({ value: seen.box }))
  on('prompt.fill', ($, e) => {
    seen.fills.push(e)
    seen.box = { text: e.text, cursor: e.text.length }

    return { isFilled: true }
  })
  on('prompt.submit', ($, e) => {
    seen.submits.push(e)

    return answerSubmit(e)
  })
  on('command.list', () => ({ value: COMMANDS }))
  on('command.register', () => ({ value: { command: 'enhance' } }))
  on('session.root', () => ({ value: '/work/app' }))
  on('session.repo', () => ({ value: null }))
  on('session.messages', () => ({ value: [] }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('model.complete', async ($, e) => {
    seen.requests.push(e)
    await whileAsking?.(seen)

    return { value: reply }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))

  return seen
}

describe('band', () => {
  test('draws Enhance and Send above the prompt on terminal and desktop', async ($, on) => {
    world(on, '', ANSWER)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'send' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('yields the band to a survey', async ($, on) => {
    world(on, '', ANSWER)
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['survey'] }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
    expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('Enhance', () => {
  test('rewrites the draft in place and never sends it', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    expect(seen.fills.map(fill => [fill.mode, fill.text])).toEqual([['replace', REWRITE]])
    expect(seen.submits).toHaveLength(0)
    expect(seen.requests[0]?.prompt).toContain('<draft>\nadd dark mode\n</draft>')
    expect(seen.requests[0]?.prompt).toContain('/simplify (builtin)')
    expect(seen.requests[0]?.prompt).not.toContain('/enhance (')
    expect(await ui.find({ text: /Prompt melhorado/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'undo' })).toBeDefined()
    await ui.unmount()
  })

  test('a failed rewrite leaves the draft alone and says why', async ($, on) => {
    const seen = world(on, 'add dark mode', {
      isAnswered: false,
      reason: 'api-error',
      status: 429,
      error: 'rate_limit',
      usage: USAGE,
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    expect(seen.fills).toHaveLength(0)
    expect(seen.box.text).toBe('add dark mode')
    expect(await ui.find({ text: /limite de requisições/ })).toBeDefined()
    await ui.unmount()
  })

  test('typing during the rewrite wins over the late rewrite', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER, during => {
      during.box = { text: 'add dark mode now', cursor: 17 }
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    expect(seen.fills).toHaveLength(0)
    expect(seen.box.text).toBe('add dark mode now')
    expect(await ui.find({ text: /editou o rascunho/ })).toBeDefined()
    await ui.unmount()
  })

  test('an empty box asks for a draft and calls no model', async ($, on) => {
    const seen = world(on, '   ', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    expect(seen.requests).toHaveLength(0)
    expect(seen.toasts.some(text => text.includes('rascunho'))).toBe(true)
    await ui.unmount()
  })

  test('Undo puts the original draft back', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })
    await ui.press({ key: 'undo' })

    expect(seen.box.text).toBe('add dark mode')
    expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
    await ui.unmount()
  })

  test('Cancel stops the rewrite and the late reply never lands', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER, during => during.clock.sleep(5_000))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })
    await ui.press({ key: 'cancel' })
    await seen.clock.advance(5_000)

    expect(seen.fills).toHaveLength(0)
    expect(seen.box.text).toBe('add dark mode')
    expect(seen.toasts.some(text => text.includes('Cancelado'))).toBe(true)
    expect(await ui.find({ type: 'Button', key: 'cancel' })).toBeUndefined()
    await ui.unmount()
  })

  test('/enhance with text enhances that text', async ($, on) => {
    const seen = world(on, '', ANSWER)
    await $.command.run({
      command: 'enhance',
      args: 'add dark mode',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 120 },
    })
    await seen.clock.settle()

    expect(seen.requests[0]?.prompt).toContain('<draft>\nadd dark mode\n</draft>')
    expect(seen.fills.map(fill => fill.text)).toEqual([REWRITE])
  })
})

describe('Send', () => {
  test('submits the draft as the person typed it and empties the box', async ($, on) => {
    const seen = world(on, '  ship it  ', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'send' })

    expect(seen.submits.map(submit => submit.text)).toEqual(['ship it'])
    expect(seen.box.text).toBe('')
    await ui.unmount()
  })

  test('while a rewrite runs Enhance keeps the focus and a second press starts nothing', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER, during => during.clock.sleep(5_000))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    expect((await ui.find({ type: 'Button', key: 'enhance' }))?.props.autoFocus).toBe(true)
    expect((await ui.find({ type: 'Button', key: 'send' }))?.props.autoFocus).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'cancel' })).toBeDefined()
    await ui.press({ key: 'enhance' })
    expect(seen.requests).toHaveLength(1)
    expect(seen.toasts.some(text => text.includes('Já estou melhorando'))).toBe(true)
    await seen.clock.advance(5_000)
    await ui.unmount()
  })

  test('sending mid-rewrite sends the draft as it is and drops the late rewrite', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER, during => during.clock.sleep(5_000))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })
    await ui.press({ key: 'send' })
    await seen.clock.advance(5_000)

    expect(seen.submits.map(submit => submit.text)).toEqual(['add dark mode'])
    expect(seen.fills.map(fill => fill.text)).toEqual([''])
    expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
    await ui.unmount()
  })

  test('a draft naming a known command runs it as that command', async ($, on) => {
    const seen = world(on, '/simplify the band code', ANSWER)
    const ran: string[] = []
    on('command.run', ($, e) => {
      ran.push(`${e.command} ${e.args}`)

      return { text: 'ok' }
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'send' })

    expect(ran).toEqual(['simplify the band code'])
    expect(seen.submits).toHaveLength(0)
    await ui.unmount()
  })

  test('a draft opening with / that names no command stays in the box for Enter', async ($, on) => {
    const seen = world(on, '/usr is full again', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'send' })

    expect(seen.submits).toHaveLength(0)
    expect(seen.fills).toHaveLength(0)
    expect(seen.box.text).toBe('/usr is full again')
    expect(seen.toasts.some(text => text.includes('Enter'))).toBe(true)
    await ui.unmount()
  })

  test('a send the engine refuses hands the draft back', async ($, on) => {
    const seen = world(on, 'ship it', ANSWER, undefined, () => ({ drop: 'blocked by a hook' }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'send' })

    expect(seen.box.text).toBe('ship it')
    expect(seen.toasts.some(text => text.includes('blocked by a hook'))).toBe(true)
    await ui.unmount()
  })

  test('a send that throws hands the draft back', async ($, on) => {
    const seen = world(on, 'ship it', ANSWER, undefined, () => {
      throw new Error('queue closed')
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'send' })

    expect(seen.box.text).toBe('ship it')
    expect(seen.toasts.some(text => text.includes('Não enviado'))).toBe(true)
    await ui.unmount()
  })

  test('leaves a draft holding a pasted image for Enter', async ($, on) => {
    const seen = world(on, 'what is wrong here [Image #1]', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'send' })

    expect(seen.submits).toHaveLength(0)
    expect(seen.box.text).toBe('what is wrong here [Image #1]')
    expect(seen.toasts.some(text => text.includes('Enter'))).toBe(true)
    await ui.unmount()
  })
})

describe('helpers', () => {
  test('cleanReply drops a fence and a preamble but keeps the prompt', () => {
    expect(cleanReply(`\`\`\`text\n${REWRITE}\n\`\`\``)).toBe(REWRITE)
    expect(cleanReply(`Here is the rewritten prompt:\n\n${REWRITE}`)).toBe(REWRITE)
    expect(cleanReply(REWRITE)).toBe(REWRITE)
  })

  test('summarize counts named skills and questions', () => {
    const skills = COMMANDS.map(command => ({ name: command.name, description: '', origin: command.source }))
    const summary = summarize(REWRITE, skills)

    expect(summary).toEqual({ skills: ['simplify'], questions: 2 })
    expect(describeSummary(summary)).toBe('1 skill · 2 perguntas')
    expect(summarize('- /code-review: check the diff', skills).skills).toEqual(['code-review'])
    expect(summarize('- /code-review:deep finds more', skills).skills).toEqual([])
  })

  test('draftLanguage tells English from Portuguese and stays out of the way otherwise', () => {
    expect(draftLanguage('add a short README section about the alt+e shortcut')).toBe(ENGLISH)
    expect(draftLanguage('make the band messages translatable')).toBe(ENGLISH)
    expect(draftLanguage('adicionar um teste para o atalho alt+e quando o arquivo estiver ausente')).toBe(PORTUGUESE)
    expect(draftLanguage('corrigir a validação do login')).toBe(PORTUGUESE)
    expect(draftLanguage('dark mode')).toBeUndefined()
  })

  test('the request names the draft language and its labels', () => {
    const snapshot = { root: '/work/app', text: 'root: /work/app' }
    const ask = (draft: string) => {
      const blocks = buildRequest({ draft, skills: [], snapshot, model: 'sonnet', effort: 'medium' }).prompt

      return typeof blocks === 'string' ? blocks : blocks.map(block => block.text).join('\n')
    }

    expect(ask('add a dark mode toggle to the settings page')).toContain('Write every word of the rewrite in English.')
    expect(ask('adicionar modo escuro na tela de configurações')).toContain('"Pergunte antes de começar:"')
    expect(ask('dark mode')).toContain('in the language the draft is written in')
  })

  test('chordFor finds the Chat binding of the command', () => {
    const config = {
      bindings: [
        { context: 'Global', bindings: { 'ctrl+e': 'command:enhance' } },
        { context: 'Chat', bindings: { 'ctrl+g': 'chat:externalEditor', 'alt+e': 'command:enhance' } },
      ],
    }

    expect(chordFor(config, 'command:enhance')).toBe('alt+e')
    expect(chordFor({ bindings: 'nope' }, 'command:enhance')).toBe('')
  })
})
