import type { EngineInterface, RenderInput } from 'claude-code'

import type { EnhanceRun, EnhanceSettings } from '../types'
import { EFFORTS, MODELS } from './settings'

export type BandView = {
  run: EnhanceRun
  frame: number
  hotkey: string
  // invariant: present only while /prompt-enhancer has the settings row open.
  settings: EnhanceSettings | undefined
  now: number
}

export type BandActions = {
  enhance: () => void
  send: () => void
  undo: () => void
  cancel: () => void
  pickModel: (value: string) => void
  pickEffort: (value: string) => void
  closeSettings: () => void
}

const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const INK = '#1c1c1c'
const SEND_BACKGROUND = '#4b5563'
const PAPER = '#ffffff'
const SHIMMER_REACH = 2
const ROOMY_COLUMNS = 72

const seconds = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')

export function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, view: BandView, act: BandActions) {
  const elements = $.ui.resolve(e)
  const { Box, Button, Text } = elements
  // why: mobile draws no picker, so there the row stays shut and the typed /prompt-enhancer form is the way.
  const Select = 'Select' in elements ? elements.Select : undefined
  const width = Math.max(24, e.props.bodyColumns)
  const isRoomy = width >= ROOMY_COLUMNS
  // why: a desktop draws a plain Button as bare text and drops the chip's colors, so there each control is its native button.
  const isNative = e.surface !== 'terminal'
  const { phase, note, startedAt, finishedAt } = view.run

  const shimmer = (text: string) => {
    const chars = [...text]
    const head = (view.frame % (chars.length + SHIMMER_REACH * 4)) - SHIMMER_REACH * 2

    return chars.map((char, index) => (
      <Text color={Math.abs(index - head) <= SHIMMER_REACH ? 'claudeShimmer' : 'claude'}>{char}</Text>
    ))
  }

  const glyph = phase === 'working' ? (SPINNER[Math.floor(view.frame / 2) % SPINNER.length] ?? '✦') : '✦'

  // invariant: Enhance stays a Button in every phase, so the focus ring never slides onto Send mid-rewrite.
  const enhance = isNative ? (
    <Button key="enhance" label="Enhance" variant="primary" autoFocus onPress={act.enhance} />
  ) : (
    <Button key="enhance" label="Enhance" plain variant="primary" autoFocus onPress={act.enhance}>
      <Text backgroundColor="claude" color={INK} bold>
        {` ${glyph} Enhance `}
      </Text>
    </Button>
  )

  // why: a plugin's submit always lands in the main conversation, so Send would miss an agent in view.
  const send =
    e.props.view.agentId !== undefined ? null : isNative ? (
      <Button key="send" label="Send" variant="secondary" onPress={act.send} />
    ) : (
      <Button key="send" label="Send" plain onPress={act.send}>
        <Text backgroundColor={SEND_BACKGROUND} color={PAPER} bold>
          {' ➤ Send '}
        </Text>
      </Button>
    )

  // why: the desktop app has its own fixed shortcuts and never reads keybindings.json, so there the chord does nothing.
  const hint = (
    <Text wrap="truncate-end">
      <Text color="claude">{isNative || view.hotkey === '' ? '/enhance' : view.hotkey}</Text>
      <Text dimColor> melhora o rascunho</Text>
    </Text>
  )

  const status =
    phase === 'working' ? (
      <Text wrap="truncate-end">
        {shimmer('Melhorando seu prompt')}
        <Text dimColor>{` · ${note} · ${Math.floor(Math.max(0, view.now - startedAt) / 1000)}s`}</Text>
      </Text>
    ) : phase === 'done' ? (
      <Text wrap="truncate-end">
        <Text color="success" bold>
          ✓
        </Text>
        <Text> Prompt melhorado</Text>
        {isRoomy && <Text dimColor>{` · ${seconds(finishedAt - startedAt)} s`}</Text>}
      </Text>
    ) : phase === 'failed' ? (
      <Text wrap="truncate-end">
        <Text color="error" bold>
          ✗
        </Text>
        <Text>{` ${note}`}</Text>
        <Text dimColor> · rascunho intacto</Text>
      </Text>
    ) : null

  const trailing =
    phase === 'working' ? (
      isNative ? (
        <Button key="cancel" label="Cancelar" variant="secondary" onPress={act.cancel} />
      ) : (
        <Button key="cancel" label="Cancelar" plain dimColor onPress={act.cancel} />
      )
    ) : phase === 'done' ? (
      isNative ? (
        <Button key="undo" label="Desfazer" variant="secondary" onPress={act.undo} />
      ) : (
        <Button key="undo" label="Desfazer" plain onPress={act.undo}>
          <Text color="claude">↶</Text> Desfazer
        </Button>
      )
    ) : isRoomy && phase === 'idle' ? (
      hint
    ) : null

  // why: another mod may draw right under this band (status-pills puts its pills there), so on desktop it keeps a step of air below.
  const actions = (
    <Box
      flexDirection="row"
      width={width}
      justifyContent="space-between"
      alignItems={isNative ? 'center' : 'stretch'}
      marginBottom={isNative ? 'md' : 0}
    >
      <Box flexDirection="row" flexShrink={1} gap={isNative ? 'sm' : 1} alignItems={isNative ? 'center' : 'stretch'}>
        {enhance}
        {send}
        {status !== null && (
          <Box marginLeft={1} flexShrink={1}>
            {status}
          </Box>
        )}
      </Box>
      {trailing !== null && (
        <Box flexShrink={0} marginLeft={1}>
          {trailing}
        </Box>
      )}
    </Box>
  )

  if (view.settings === undefined || Select === undefined) {
    return actions
  }

  // why: drawn above Enhance so its autoFocus wins the ring, and the focus chord lands on the Model picker.
  return (
    <Box flexDirection="column" width={width}>
      <Box flexDirection="row" width={width} gap={2}>
        <Select
          key="model"
          label="Modelo"
          options={MODELS.map(value => ({ value }))}
          value={view.settings.model}
          autoFocus
          onSelect={act.pickModel}
        />
        <Select
          key="effort"
          label="Esforço"
          options={EFFORTS.map(value => ({ value }))}
          value={view.settings.effort}
          onSelect={act.pickEffort}
        />
        <Button key="close" label="Fechar" plain dimColor onPress={act.closeSettings} />
        {isRoomy && (
          <Text dimColor wrap="truncate-end">
            ctrl+x tab escolhe · Esc volta ao prompt
          </Text>
        )}
      </Box>
      {actions}
    </Box>
  )
}
