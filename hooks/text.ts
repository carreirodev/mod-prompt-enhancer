export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

export const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
