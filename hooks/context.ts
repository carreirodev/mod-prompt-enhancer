import type { EngineInterface, FsEntry } from 'claude-code'

export type Skill = {
  name: string
  description: string
  origin: string
}

export type Snapshot = {
  root: string
  text: string
}

type Digest = (name: string, text: string) => string

const DESCRIPTION_CHARS = 180
const NOTE_CHARS = 2400
const SNAPSHOT_CHARS = 16000
const MESSAGE_CHARS = 500
const RECENT_MESSAGES = 6
const SUBFOLDERS = 8
const SUBFOLDER_ENTRIES = 24
const GIT_TIMEOUT_MS = 5000

const NOISE = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.idea',
  '.gradle',
])

const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'composer.json',
  'deno.json',
  'requirements.txt',
  'tsconfig.json',
  '.claude-plugin/plugin.json',
]

const NOTES = ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', 'README.md', 'tasks.md']

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

export const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const section = (title: string, body: string): string =>
  body.trim() === '' ? '' : `## ${title}\n${body.trim()}`

// why: the engine follows $ across files only into function declarations, so each helper taking $ is one.
async function attempt($: EngineInterface, title: string, work: () => Promise<string>): Promise<string> {
  try {
    return await work()
  } catch (error) {
    const reason = clip(oneLine(errorText(error)), 200)
    $.ui.log(`prompt-enhancer: ${title} left out of the snapshot: ${reason}`, { to: 'debug' })
    return section(title, `(unavailable: ${reason})`)
  }
}

export async function listSkills($: EngineInterface, own: string): Promise<Skill[]> {
  const commands = await $.command.list()

  return commands
    .filter(command => command.name !== own)
    .map(command => ({
      name: command.name,
      description: clip(oneLine(command.description), DESCRIPTION_CHARS),
      origin: command.plugin === undefined ? command.source : `plugin ${command.plugin}`,
    }))
}

export async function snapshotProject($: EngineInterface): Promise<Snapshot> {
  const root = (await $.session.root()).replace(/[\\/]+$/, '')
  const parts = await Promise.all([
    attempt($, 'git', () => gitSection($, root)),
    attempt($, 'layout', () => layoutSection($, root)),
    ...MANIFESTS.map(name => attempt($, name, () => fileSection($, root, name, digestManifest))),
    ...NOTES.map(name => attempt($, name, () => fileSection($, root, name, digestNote))),
    attempt($, 'recent conversation', () => conversationSection($)),
  ])
  const body = parts.filter(part => part !== '').join('\n\n')

  return { root, text: clip(`root: ${root}\n\n${body}`, SNAPSHOT_CHARS) }
}

async function gitSection($: EngineInterface, root: string): Promise<string> {
  const repo = await $.session.repo()
  if (repo === null) {
    return section('git', 'not a git repository')
  }

  const [status, log] = await Promise.all([
    $.process.run(['git', 'status', '--short', '--branch'], { cwd: root, timeoutMs: GIT_TIMEOUT_MS }),
    $.process.run(['git', 'log', '--oneline', '--no-decorate', '-n', '8'], {
      cwd: root,
      timeoutMs: GIT_TIMEOUT_MS,
    }),
  ])
  const lines: string[] = []
  if (repo.remote !== null) {
    // why: an https remote can carry a token in its userinfo, and this text leaves the machine.
    lines.push(`remote: ${repo.remote.replace(/\/\/[^@/]+@/, '//')}`)
  }
  if (status.exitCode === 0) {
    lines.push(`status:\n${clip(status.stdout.trimEnd(), 1500)}`)
  }
  const hasCommits = log.exitCode === 0 && log.stdout.trim() !== ''
  lines.push(hasCommits ? `recent commits:\n${log.stdout.trimEnd()}` : 'recent commits: none yet')

  return section('git', lines.join('\n'))
}

const visible = (entries: readonly FsEntry[]): FsEntry[] =>
  entries
    .filter(entry => !NOISE.has(entry.name))
    .sort(
      (a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name),
    )

const label = (entry: FsEntry): string => (entry.kind === 'dir' ? `${entry.name}/` : entry.name)

async function layoutSection($: EngineInterface, root: string): Promise<string> {
  const entries = visible(await $.fs.list(root))
  const folders = entries
    .filter(entry => entry.kind === 'dir' && !entry.name.startsWith('.'))
    .slice(0, SUBFOLDERS)
  const nested = await Promise.all(
    folders.map(folder =>
      attempt($, `${folder.name}/`, async () => {
        const inner = visible(await $.fs.list(`${root}/${folder.name}`))
        const shown = inner.slice(0, SUBFOLDER_ENTRIES).map(label).join('  ')
        const more = inner.length > SUBFOLDER_ENTRIES ? `  (+${inner.length - SUBFOLDER_ENTRIES} more)` : ''

        return `${folder.name}/: ${shown}${more}`
      }),
    ),
  )

  return section('layout', [entries.map(label).join('  '), ...nested].join('\n'))
}

async function fileSection($: EngineInterface, root: string, name: string, digest: Digest): Promise<string> {
  const path = `${root}/${name}`
  if (!(await $.fs.exists(path))) {
    return ''
  }

  return section(name, digest(name, await $.fs.read(path)))
}

const digestNote: Digest = (_name, text) => clip(text.trim(), NOTE_CHARS)

const digestManifest: Digest = (name, text) =>
  name === 'package.json' ? digestPackage(text) : clip(text.trim(), NOTE_CHARS)

const digestPackage = (text: string): string => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return `${clip(text.trim(), NOTE_CHARS)}\n(not valid JSON: ${errorText(error)})`
  }
  if (!isRecord(parsed)) {
    return clip(text.trim(), NOTE_CHARS)
  }

  const lines: string[] = []
  for (const key of ['name', 'description', 'type', 'packageManager']) {
    const value = parsed[key]
    if (typeof value === 'string') {
      lines.push(`${key}: ${value}`)
    }
  }
  const scripts = parsed.scripts
  if (isRecord(scripts)) {
    const listed = Object.entries(scripts).map(([name, command]) => `${name}: ${String(command)}`)
    lines.push(`scripts:\n${listed.map(line => `  ${clip(line, 120)}`).join('\n')}`)
  }
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const value = parsed[key]
    if (isRecord(value)) {
      lines.push(`${key}: ${Object.entries(value).map(([dep, range]) => `${dep}@${String(range)}`).join(', ')}`)
    }
  }

  return clip(lines.join('\n'), NOTE_CHARS)
}

async function conversationSection($: EngineInterface): Promise<string> {
  const recent = (await $.session.messages())
    .map(message => ({ role: message.role, text: oneLine(message.text.replace(REMINDER, ' ')) }))
    .filter(message => message.text !== '')
    .slice(-RECENT_MESSAGES)

  return section(
    'recent conversation',
    recent.map(message => `${message.role}: ${clip(message.text, MESSAGE_CHARS)}`).join('\n'),
  )
}
