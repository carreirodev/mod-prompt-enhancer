import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelEffort, PluginOptions, Register } from 'claude-code'

import type { EnhanceRun } from '../types'
import { drawBand } from './band'
import { clip, errorText, listSkills, oneLine, snapshotProject } from './context'
import { readHotkey } from './hotkey'
import { buildRequest, cleanReply, describeSummary, failureText, summarize } from './rewrite'

type Settings = {
  model: string
  effort: ModelEffort
}

const COMMAND = 'enhance'
const TICK_MS = 80
const EFFORTS: readonly ModelEffort[] = ['low', 'medium', 'high']
// why: a plugin's submit does not expand pastes or images, so a draft holding one must go out by Enter.
const PLACEHOLDER = /\[(?:Pasted text #\d+|Image #\d+|\.\.\.Truncated text #\d+|✦ Team setup guide #\d+)/
const SLASH = /^\/([A-Za-z0-9:_-]+)(?:\s+([\s\S]*))?$/
const DIALOG_OPEN = 'Há um diálogo aberto; feche-o e tente de novo'

const IDLE: EnhanceRun = {
  phase: 'idle',
  original: '',
  note: '',
  startedAt: 0,
  finishedAt: 0,
}

const run = atom({ plugin: 'prompt-enhancer', key: 'run' } as const, IDLE)
const frame = atom({ plugin: 'prompt-enhancer', key: 'frame' } as const, 0)
const hotkey = atom({ plugin: 'prompt-enhancer', key: 'hotkey' } as const, '')

let inFlight: AbortController | undefined

const settingsOf = (options: PluginOptions): Settings => ({
  model: typeof options.model === 'string' && options.model !== '' ? options.model : 'sonnet',
  effort: EFFORTS.find(level => level === options.effort) ?? 'medium',
})

function detach($: EngineInterface, label: string, work: Promise<void>): void {
  work.catch((error: unknown) => {
    $.ui.log(`prompt-enhancer: ${label} failed: ${errorText(error)}`, { to: 'debug' })
    $.ui.toast(`${label} falhou: ${clip(oneLine(errorText(error)), 120)}`)
  })
}

async function finish($: EngineInterface, phase: 'done' | 'failed', note: string): Promise<void> {
  const finishedAt = await $.clock.now()
  await update($, run, current => ({ ...current, phase, note, finishedAt }))
}

async function enhance($: EngineInterface, settings: Settings, args: string): Promise<void> {
  if ((await read($, run)).phase === 'working') {
    $.ui.toast('Já estou melhorando o rascunho, só um instante')

    return
  }

  const box = await $.prompt.read()
  const typed = args.trim()
  const draft = typed === '' ? box.text : typed
  if (draft.trim() === '') {
    $.ui.toast('Escreva um rascunho na caixa de prompt e tente de novo')

    return
  }

  const controller = new AbortController()
  inFlight = controller
  const startedAt = await $.clock.now()
  await update($, run, () => ({
    phase: 'working',
    original: draft,
    note: 'lendo o projeto',
    startedAt,
    finishedAt: 0,
  }))
  const ticker = $.clock.every(TICK_MS, () => {
    update($, frame, count => count + 1).catch((error: unknown) => {
      $.ui.log(`prompt-enhancer: animation frame lost: ${errorText(error)}`, { to: 'debug' })
    })
  })

  try {
    const [skills, snapshot] = await Promise.all([listSkills($, COMMAND), snapshotProject($)])
    if (controller.signal.aborted) {
      return
    }

    await update($, run, current => ({ ...current, note: `reescrevendo com ${settings.model}` }))
    const request = buildRequest({ draft, skills, snapshot, ...settings })
    const reply = await $.model.complete(request, { signal: controller.signal })
    if (controller.signal.aborted) {
      return
    }
    if (!reply.isAnswered) {
      await finish($, 'failed', `Não deu para melhorar: ${failureText(reply)}`)

      return
    }

    const rewritten = cleanReply(reply.text)
    if (rewritten === '') {
      await finish($, 'failed', 'Não deu para melhorar: o modelo respondeu sem texto')

      return
    }

    // invariant: the person's own typing always wins over a rewrite that arrives late.
    const latest = await $.prompt.read()
    if (controller.signal.aborted) {
      return
    }
    const isUntouched = latest.text === box.text || (typed !== '' && latest.text.trim() === '')
    if (!isUntouched) {
      await finish($, 'failed', 'Você editou o rascunho enquanto eu trabalhava, então não troquei nada')

      return
    }

    const filled = await $.prompt.fill({ text: rewritten, mode: 'replace' })
    if (!filled.isFilled) {
      await finish($, 'failed', filled.refusal === 'dialog' ? DIALOG_OPEN : 'A caixa de prompt não aceitou o texto')

      return
    }

    await finish($, 'done', describeSummary(summarize(rewritten, skills)))
  } catch (error) {
    if (controller.signal.aborted) {
      return
    }
    $.ui.log(`prompt-enhancer: enhance failed: ${errorText(error)}`, { to: 'debug' })
    await finish($, 'failed', `Não deu para melhorar: ${clip(oneLine(errorText(error)), 140)}`)
  } finally {
    ticker.cancel()
    if (inFlight === controller) {
      inFlight = undefined
    }
  }
}

async function send($: EngineInterface, isBusy: boolean): Promise<void> {
  const { text } = await $.prompt.read()
  const prompt = text.trim()
  if (prompt === '') {
    $.ui.toast('Nada para enviar: escreva um prompt primeiro')

    return
  }
  if (PLACEHOLDER.test(prompt)) {
    $.ui.toast('Este rascunho tem colagem ou imagem; envie com Enter para que ela vá junto')

    return
  }

  const slash = SLASH.exec(prompt)
  const command = slash?.[1] ?? ''
  const isCommand = command !== '' && (await $.command.list()).some(known => known.name === command)
  // why: the engine refuses a plugin prompt that opens with "/", since it would run a command as the person.
  if (prompt.startsWith('/') && !isCommand) {
    $.ui.toast('Começa com / mas não é um comando conhecido; envie com Enter')

    return
  }

  const cleared = await $.prompt.fill({ text: '', mode: 'replace' })
  if (!cleared.isFilled) {
    $.ui.toast(cleared.refusal === 'dialog' ? DIALOG_OPEN : 'Não consegui esvaziar a caixa de prompt')

    return
  }
  // why: sending mid-rewrite means "send it as it is", so the rewrite must not land afterwards.
  inFlight?.abort()
  inFlight = undefined
  await update($, run, () => IDLE)

  try {
    if (isCommand) {
      await $.command.run({ command, args: slash?.[2] ?? '' })

      return
    }

    if (isBusy) {
      $.ui.toast('Na fila: envio assim que o Claude terminar')
    }
    const result = await $.prompt.submit({ text: prompt, asUser: true })
    if (result.drop !== undefined) {
      await $.prompt.fill({ text, mode: 'replace' })
      $.ui.toast(`Não enviado: ${clip(oneLine(result.drop), 140)}`)
    }
  } catch (error) {
    // invariant: the box was emptied for this send, so a send that fails hands the draft back.
    await $.prompt.fill({ text, mode: 'replace' })
    $.ui.toast(`Não enviado: ${clip(oneLine(errorText(error)), 140)}`)
  }
}

async function undo($: EngineInterface): Promise<void> {
  const current = await read($, run)
  if (current.phase !== 'done') {
    return
  }

  const filled = await $.prompt.fill({ text: current.original, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast(filled.refusal === 'dialog' ? DIALOG_OPEN : 'A caixa de prompt não aceitou o texto')

    return
  }
  await update($, run, () => IDLE)
}

async function cancel($: EngineInterface): Promise<void> {
  inFlight?.abort()
  inFlight = undefined
  await update($, run, current => (current.phase === 'working' ? IDLE : current))
  $.ui.toast('Cancelado: o rascunho ficou como estava')
}

export const register: Register = (on, options) => {
  const settings = settingsOf(options)

  on('session.start', async ($, e, next) => {
    // why: the engine recognises a hook that answers its own command only when both name it as a literal.
    await $.command.register({
      name: 'enhance',
      description: 'Reescreve o rascunho da caixa de prompt com skills, contexto, perguntas e critério de pronto',
      argumentHint: '[rascunho]',
      immediate: true,
    })

    // why: a reload drops the old environment and its in-flight work, so a stored "working" is stale.
    if ((await read($, run)).phase === 'working') {
      await update($, run, () => IDLE)
    }

    try {
      const chord = await readHotkey($, COMMAND)
      await update($, hotkey, () => chord)
    } catch (error) {
      $.ui.log(`prompt-enhancer: keybindings.json unreadable, hint falls back to /enhance: ${errorText(error)}`, {
        to: 'debug',
      })
    }

    return next(e)
  })

  on('command.run', { command: 'enhance' }, ($, e) => {
    detach($, 'Enhance', enhance($, settings, e.args))

    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    const { phase } = await read($, run)
    if (phase === 'done' || phase === 'failed') {
      await update($, run, current => (current.phase === 'working' ? current : IDLE))
    }

    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const [current, tick, chord, now] = await Promise.all([
      read($, run),
      read($, frame),
      read($, hotkey),
      $.clock.now(),
    ])

    return drawBand(
      $,
      e,
      { run: current, frame: tick, hotkey: chord, now },
      {
        enhance: () => detach($, 'Enhance', enhance($, settings, '')),
        send: () => detach($, 'Send', send($, e.props.isWorking)),
        undo: () => detach($, 'Desfazer', undo($)),
        cancel: () => detach($, 'Cancelar', cancel($)),
      },
    )
  })
}
