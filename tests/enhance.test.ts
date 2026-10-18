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
import { buildRequest, cleanReply, draftLanguage, ENGLISH, PORTUGUESE } from '../hooks/rewrite'
import { parseSettings } from '../hooks/settings'

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
  'Quero adicionar um modo escuro ao app.',
  '',
  'Pronto quando:',
  '- O app alterna entre claro e escuro.',
].join('\n')

const ANSWER: ModelCompleteResult = { isAnswered: true, text: `\`\`\`\n${REWRITE}\n\`\`\``, usage: USAGE }

const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

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

// why: nothing sits beneath the plugins in a test, so this stands for the engine's band with no survey and no other mod.
const engineBand = (on: On) => on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))

type World = {
  box: PromptBox
  fills: PromptFillInput[]
  submits: PromptSubmitInput[]
  requests: ModelCompleteInput[]
  toasts: string[]
  stored: Record<string, unknown>
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
    stored: {},
    clock: mock.clock(on, { now: 1_000 }),
  }
  mock.env(on, {})
  on('store.get', ($, e) => ({ value: seen.stored[e.key] }))
  on('store.set', ($, e) => {
    seen.stored[e.key] = e.value

    return { value: undefined }
  })
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
  engineBand(on)

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

  test('desktop draws native buttons with room below; the terminal keeps its chips', async ($, on) => {
    world(on, '', ANSWER)
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const nativeEnhance = await desktop.find({ type: 'Button', key: 'enhance' })
    const nativeSend = await desktop.find({ type: 'Button', key: 'send' })
    expect(nativeEnhance?.props.plain).toBeUndefined()
    expect(nativeEnhance?.props.variant).toBe('primary')
    expect(nativeEnhance?.props.autoFocus).toBe(true)
    expect(nativeSend?.props.plain).toBeUndefined()
    expect(nativeSend?.props.variant).toBe('secondary')
    expect((await desktop.find({ type: 'Box', key: 'actions' }))?.props.marginBottom).toBe('md')
    await desktop.unmount()

    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await terminal.find({ type: 'Button', key: 'enhance' }))?.props.plain).toBe(true)
    expect((await terminal.find({ type: 'Button', key: 'send' }))?.props.plain).toBe(true)
    expect(await terminal.find({ text: /Enhance/ })).toBeDefined()
    expect((await terminal.find({ type: 'Box', key: 'actions' }))?.props.marginBottom).toBe(0)
    await terminal.unmount()
  })

  test('the first draw names the chord on the terminal and /enhance on desktop', async ($, on) => {
    mock.clock(on, { now: 1_000 })
    mock.env(on, { USERPROFILE: '/home/me' })
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({
      value: JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'alt+e': 'command:enhance' } }] }),
    }))
    engineBand(on)

    // invariant: no session.start first, as when the band draws before the engine's start hooks have settled.
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await terminal.find({ text: 'alt+e' })).toBeDefined()
    expect(await terminal.find({ text: '/enhance' })).toBeUndefined()
    await terminal.unmount()

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await desktop.find({ text: '/enhance' })).toBeDefined()
    expect(await desktop.find({ text: 'alt+e' })).toBeUndefined()
    await desktop.unmount()
  })

  test('yields the band to a survey', async ($, on) => {
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['survey'] }))
    world(on, '', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
    expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeUndefined()
    expect(await ui.find({ text: 'survey' })).toBeDefined()
    await ui.unmount()
  })

  test('keeps what the mods beneath it draw, above Enhance, on terminal and desktop', async ($, on) => {
    // invariant: registered before world, so it answers above the engine's empty band.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['bars'] }))
    world(on, '', ANSWER)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const column = await ui.find({ type: 'Box' })
      expect(column?.props.flexDirection).toBe('column')
      expect(column?.children[0]).toMatchObject({ type: 'Text', children: ['bars'] })
      expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeDefined()
      await ui.unmount()
    }
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
    expect(await ui.find({ text: /Prompt melhorado/ })).toBeDefined()
    expect(await ui.find({ text: /pergunta|skill/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'undo' })).toBeDefined()
    await ui.unmount()
  })

  test('the request carries only the draft, never the project, skills or conversation', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    const prompt = seen.requests[0]?.prompt ?? ''
    expect(prompt.startsWith('<draft>\nadd dark mode\n</draft>\n\nRewrite the draft.')).toBe(true)
    expect(prompt).not.toContain('<project>')
    expect(prompt).not.toContain('<installed_skills>')
    expect(prompt).not.toContain('/simplify')
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

describe('Settings', () => {
  test('/prompt-enhancer opens the row with the stored choice on terminal and desktop', async ($, on) => {
    const seen = world(on, '', ANSWER)
    seen.stored.settings = { model: 'opus', effort: 'high' }
    const closed = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await closed.find({ type: 'Select', key: 'model' })).toBeUndefined()
    await closed.unmount()

    const answer = await $.command.run({ command: 'prompt-enhancer', args: '', ...TYPED })

    expect(answer.text).toContain('modelo opus · esforço high')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const model = await ui.find({ type: 'Select', key: 'model' })
      expect(model?.props.value).toBe('opus')
      expect(model?.props.autoFocus).toBe(true)
      expect((await ui.find({ type: 'Select', key: 'effort' }))?.props.value).toBe('high')
      expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a pick in the row is saved and the next Enhance uses it', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER)
    await $.command.run({ command: 'prompt-enhancer', args: '', ...TYPED })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.select({ key: 'model', value: 'haiku' })
    await ui.select({ key: 'effort', value: 'low' })

    expect(seen.stored.settings).toEqual({ model: 'haiku', effort: 'low' })
    expect((await ui.find({ type: 'Select', key: 'model' }))?.props.value).toBe('haiku')

    await ui.press({ key: 'enhance' })

    expect(seen.requests[0]?.model).toBe('haiku')
    expect(seen.requests[0]?.effort).toBe('low')
    await ui.unmount()
  })

  test('Fechar closes the row and leaves Enhance and Send', async ($, on) => {
    world(on, '', ANSWER)
    await $.command.run({ command: 'prompt-enhancer', args: '', ...TYPED })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'close' })

    expect(await ui.find({ type: 'Select', key: 'model' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'enhance' })).toBeDefined()
    await ui.unmount()
  })

  test('/prompt-enhancer with words saves them without opening the row', async ($, on) => {
    const seen = world(on, '', ANSWER)
    const answer = await $.command.run({ command: 'prompt-enhancer', args: 'opus high', ...TYPED })

    expect(answer.text).toBe('agora usa modelo opus · esforço high.')
    expect(seen.stored.settings).toEqual({ model: 'opus', effort: 'high' })

    await $.command.run({ command: 'prompt-enhancer', args: ' LOW ', ...TYPED })

    expect(seen.stored.settings).toEqual({ model: 'opus', effort: 'low' })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Select', key: 'model' })).toBeUndefined()
    await ui.unmount()
  })

  test('an unknown word changes nothing and lists the choices', async ($, on) => {
    const seen = world(on, '', ANSWER)
    seen.stored.settings = { model: 'opus', effort: 'high' }
    const answer = await $.command.run({ command: 'prompt-enhancer', args: 'gpt low', ...TYPED })

    expect(answer.text).toContain('gpt')
    expect(answer.text).toContain('sonnet, opus, haiku')
    expect(seen.stored.settings).toEqual({ model: 'opus', effort: 'high' })
  })

  test('Enhance falls back to sonnet and medium when the stored choice is invalid', async ($, on) => {
    const seen = world(on, 'add dark mode', ANSWER)
    seen.stored.settings = { model: 'gpt-4', effort: 'max' }
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'enhance' })

    expect(seen.requests[0]?.model).toBe('sonnet')
    expect(seen.requests[0]?.effort).toBe('medium')
    await ui.unmount()
  })
})

describe('helpers', () => {
  test('cleanReply drops a fence and a preamble but keeps the prompt', () => {
    expect(cleanReply(`\`\`\`text\n${REWRITE}\n\`\`\``)).toBe(REWRITE)
    expect(cleanReply(`Here is the rewritten prompt:\n\n${REWRITE}`)).toBe(REWRITE)
    expect(cleanReply(REWRITE)).toBe(REWRITE)
  })

  test('draftLanguage tells English from Portuguese and stays out of the way otherwise', () => {
    expect(draftLanguage('add a short README section about the alt+e shortcut')).toBe(ENGLISH)
    expect(draftLanguage('make the band messages translatable')).toBe(ENGLISH)
    expect(draftLanguage('adicionar um teste para o atalho alt+e quando o arquivo estiver ausente')).toBe(PORTUGUESE)
    expect(draftLanguage('corrigir a validação do login')).toBe(PORTUGUESE)
    expect(draftLanguage('dark mode')).toBeUndefined()
  })

  test('the request names the draft language and its labels', () => {
    const ask = (draft: string) => {
      const blocks = buildRequest({ draft, model: 'sonnet', effort: 'medium' }).prompt

      return typeof blocks === 'string' ? blocks : blocks.map(block => block.text).join('\n')
    }

    expect(ask('add a dark mode toggle to the settings page')).toContain('Write every word of the rewrite in English.')
    expect(ask('adicionar modo escuro na tela de configurações')).toContain('"Pronto quando:"')
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

  test('parseSettings keeps the valid fields and defaults the rest', () => {
    expect(parseSettings(undefined)).toEqual({ model: 'sonnet', effort: 'medium' })
    expect(parseSettings('opus')).toEqual({ model: 'sonnet', effort: 'medium' })
    expect(parseSettings({ model: 'haiku', effort: 'xhigh' })).toEqual({ model: 'haiku', effort: 'medium' })
  })
})
