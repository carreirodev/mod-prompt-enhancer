import type { EngineInterface, RenderInput } from 'claude-code'

import type { EnhanceRun } from '../types'

export type BandView = {
  run: EnhanceRun
  frame: number
  hotkey: string
  now: number
}

export type BandActions = {
  enhance: () => void
  send: () => void
  undo: () => void
  cancel: () => void
}

const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const INK = '#1c1c1c'
const SEND_BACKGROUND = '#4b5563'
const PAPER = '#ffffff'
const SHIMMER_REACH = 2
const ROOMY_COLUMNS = 72

const seconds = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')

export function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, view: BandView, act: BandActions) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const width = Math.max(24, e.props.bodyColumns)
  const isRoomy = width >= ROOMY_COLUMNS
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
  const enhance = (
    <Button key="enhance" label="Enhance" plain variant="primary" autoFocus onPress={act.enhance}>
      <Text backgroundColor="claude" color={INK} bold>
        {` ${glyph} Enhance `}
      </Text>
    </Button>
  )

  // why: a plugin's submit always lands in the main conversation, so Send would miss an agent in view.
  const send =
    e.props.view.agentId === undefined ? (
      <Button key="send" label="Send" plain onPress={act.send}>
        <Text backgroundColor={SEND_BACKGROUND} color={PAPER} bold>
          {' ➤ Send '}
        </Text>
      </Button>
    ) : null

  const hint = (
    <Text wrap="truncate-end">
      <Text color="claude">{view.hotkey === '' ? '/enhance' : view.hotkey}</Text>
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
        {isRoomy && <Text dimColor>{` · ${note} · ${seconds(finishedAt - startedAt)} s`}</Text>}
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
      <Button key="cancel" label="Cancelar" plain dimColor onPress={act.cancel} />
    ) : phase === 'done' ? (
      <Button key="undo" label="Desfazer" plain onPress={act.undo}>
        <Text color="claude">↶</Text> Desfazer
      </Button>
    ) : isRoomy && phase === 'idle' ? (
      hint
    ) : null

  return (
    <Box flexDirection="row" width={width} justifyContent="space-between">
      <Box flexDirection="row" flexShrink={1} gap={1}>
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
}
