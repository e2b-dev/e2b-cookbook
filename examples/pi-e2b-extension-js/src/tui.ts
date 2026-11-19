/**
 * Terminal output for the example, kept out of index.ts so that file stays plain SDK usage:
 *
 *   tui.header(rows)                   title card
 *   session.subscribe(tui.trace)       every tool call with its result and time, and the agent's answer
 *   bindExtensions({ uiContext: tui.ui })   the extension's notices and dialogs; dialogs are answered "yes"
 *   tui.shell(cwd, command)            run a command on your machine and show it like a prompt
 *   await tui.holdOpen(what)           wait for Enter so the preview URL stays up
 *
 * Presentation only. Colors turn off when piped or with NO_COLOR.
 */
import { execSync } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import type { AgentSessionEvent, ExtensionUIContext } from '@earendil-works/pi-coding-agent'

const startedAt = performance.now()
let calls = 0
/** Call lines by tool call ID: printed with their result, since parallel calls finish in any order. */
const pending = new Map<string, string>()
/** When the extension's status said "starting" and "uploading", to split its sandbox start time in two. */
const sandboxStart: { starting?: number; uploading?: number } = {}

const color = (process.stdout.isTTY || !!process.env['FORCE_COLOR']) && !process.env['NO_COLOR']
const paint = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)
const bold = paint('1')
const dim = paint('2')
const cyan = paint('36')
const green = paint('32')
const red = paint('31')
const yellow = paint('33')
const magenta = paint('35')

const width = () => Math.min(process.stdout.columns || 100, 110)
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text)

/** The title card. Long values wrap under their column. */
export function header(rows: Record<string, string>): void {
  console.log(`\n  ${bold(magenta('E2B'))} ${dim('×')} ${bold('Pi')}  ${dim('@e2b/pi')}`)
  console.log(`  ${dim('─'.repeat(Math.min(width() - 4, 60)))}`)
  for (const [label, value] of Object.entries(rows)) {
    const [first, ...rest] = wrapPlain(value, width() - 12)
    console.log(`  ${dim(label.padEnd(8))}  ${first ?? ''}`)
    for (const line of rest) console.log(`            ${line}`)
  }
  console.log()
}

/** Session listener: `● bash  …` and `└ 1.5s  …` when a tool call ends, the answer when a turn ends. */
export function trace(event: AgentSessionEvent): void {
  if (event.type === 'tool_execution_start') {
    calls++
    const arg = toolArg(event.toolName, event.args as Record<string, unknown>)
    pending.set(event.toolCallId, `  ${cyan('●')} ${bold(event.toolName)}${arg ? `  ${clip(arg, width() - event.toolName.length - 8)}` : ''}`)
  } else if (event.type === 'tool_execution_end') {
    console.log(pending.get(event.toolCallId) ?? `  ${cyan('●')} ${bold(event.toolName)}`)
    pending.delete(event.toolCallId)
    toolResult(event.toolName, event.result, event.isError, event.durationMs ?? 0)
  } else if (event.type === 'message_end' && event.message.role === 'assistant') {
    const text = event.message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
    if (text.trim()) answer(text)
  }
}

/**
 * What the extension shows through Pi's UI: `notify` prints a line, `confirm` prints the dialog and answers yes,
 * as you would in the TUI. Only the members @e2b/pi uses are implemented.
 */
export const ui = {
  notify(message: string, type: 'info' | 'warning' | 'error' = 'info') {
    // The extension reports one total. Split it at its status changes: creating the sandbox, then uploading the project.
    const ready = message.match(/^E2B sandbox (\S+) ready in [\d.]+s\.$/)
    if (ready && sandboxStart.starting && sandboxStart.uploading) {
      const now = performance.now()
      console.log(`  ${magenta('◆')} E2B sandbox ${ready[1]} created in ${seconds(sandboxStart.uploading - sandboxStart.starting)}`)
      const time = `    ${dim('└')} ${dim(seconds(now - sandboxStart.uploading).padStart(5))}  `
      const indent = 13 // the visible width of `time`, so wrapped lines start under "project"
      const [first, ...rest] = wrapPlain('project uploaded: your git working tree, unpacked and committed as the baseline', width() - indent)
      console.log(`${time}${dim(first ?? '')}`)
      for (const line of rest) console.log(`${' '.repeat(indent)}${dim(line)}`)
      return
    }
    const mark = type === 'error' ? red('✗') : type === 'warning' ? yellow('!') : magenta('◆')
    const [first, ...rest] = message.split('\n')
    console.log(`  ${mark} ${first}`)
    for (const line of rest) console.log(`    ${dim(line)}`)
  },
  async confirm(title: string, message: string) {
    console.log(`\n  ${bold(magenta(title))}`)
    for (const line of fitLines(message.split('\n'), width() - 2)) console.log(`  ${line}`)
    console.log(`  ${green('→ Yes')} ${dim('(answered by the script)')}\n`)
    return true
  },
  async input() {
    return undefined
  },
  setStatus(_key: string, text?: string) {
    if (text === 'e2b: starting...') sandboxStart.starting = performance.now()
    if (text === 'e2b: uploading...') sandboxStart.uploading = performance.now()
  },
  theme: { fg: (_color: string, text: string) => text },
} as unknown as ExtensionUIContext

/** Run `command` in `cwd` on your machine and show it as a shell prompt with its output. */
export function shell(cwd: string, command: string): void {
  console.log(`\n  ${cyan(path.basename(cwd))} ${magenta('❯')} ${command}`)
  const out = execSync(command, { cwd, encoding: 'utf8' }).trimEnd()
  for (const line of out.split('\n')) console.log(`  ${line.startsWith('??') ? `${red('??')}${line.slice(2)}` : line}`)
}

/** Footer: wall time and tool calls. */
export function done(): void {
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(0)
  console.log(`\n  ${green('✓')} ${bold('Done')} ${dim(`in ${seconds}s · ${calls} tool call${calls === 1 ? '' : 's'}`)}`)
}

/** In a terminal, wait for Enter before continuing; without one, continue at once. */
export async function holdOpen(what: string): Promise<void> {
  if (!process.stdin.isTTY) return
  console.log()
  for (const line of wrapPlain(`Press Enter to ${what}.`, width() - 2)) console.log(`  ${dim(line)}`)
  // Ctrl-D (end of input) counts as Enter; otherwise Node exits here and the sandbox is never killed.
  await Promise.race([once(process.stdin, 'data'), once(process.stdin, 'end')])
  process.stdin.pause()
}

/** The argument that matters instead of raw JSON: the command, the path, the port. */
function toolArg(name: string, input: Record<string, unknown>): string {
  if (typeof input['command'] === 'string') return oneLine(input['command'].split('\n')[0] ?? '')
  if (typeof input['path'] === 'string') {
    const size = typeof input['content'] === 'string' ? `  ${dim(`${input['content'].length.toLocaleString()} chars`)}` : ''
    return `${input['path'].replace(/^\/home\/user\/[^/]+\//, '')}${size}` // relative to the project in the sandbox
  }
  if (name === 'preview_url') return `port=${input['port']}`
  return JSON.stringify(input) === '{}' ? '' : JSON.stringify(input)
}

/** `  └  1.5s  HTTP/1.0 200 OK`: what the sandbox sent back to the agent, one line. Preview URLs stand out. */
function toolResult(name: string, result: unknown, isError: boolean, ms: number): void {
  const content = (result as { content?: { type: string; text?: string }[] } | undefined)?.content ?? []
  const text = oneLine(content.flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])).join(' '))
  const time = seconds(ms).padStart(5) + '  '
  const line = clip(text || 'done', width() - 8 - time.length)
  const style = isError ? red : name === 'preview_url' ? (s: string) => bold(cyan(s)) : dim
  console.log(`    ${dim('└')} ${dim(time)}${style(line)}`)
}

/** The agent's text: `**bold**`, `` `code` ``, `- ` bullets and headings, wrapped to the terminal with an indent. */
function answer(text: string): void {
  console.log(`\n  ${bold(green('Pi'))}\n`)
  const lines = text.trim().split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trimEnd()
    if (line.startsWith('|')) {
      const rows: string[] = []
      while ((lines[i] ?? '').trimStart().startsWith('|')) rows.push((lines[i++] ?? '').trim())
      i--
      table(rows)
      continue
    }
    if (!line) {
      console.log()
      continue
    }
    const bullet = /^\s*[-*] /.exec(line)
    const heading = /^#+ /.exec(line)
    const body = line.slice((bullet ?? heading)?.[0].length ?? 0)
    const first = bullet ? `  ${green('•')} ` : '  '
    const rest = bullet ? '    ' : '  '
    wrapMarkdown(heading ? `**${body}**` : body, width() - rest.length - 2).forEach((part, i) =>
      console.log(`${i === 0 ? first : rest}${part}`),
    )
  }
  console.log()
}

/** A markdown table with aligned columns; the `|---|` row becomes a rule under the header. */
function table(rows: string[]): void {
  const cells = rows
    .filter((row) => !/^\|[\s:|-]+\|$/.test(row))
    .map((row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim().replace(/\*\*|`/g, '')))
  const widths = cells[0]?.map((_, col) => Math.max(...cells.map((row) => row[col]?.length ?? 0))) ?? []
  cells.forEach((row, i) => {
    const text = row.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('   ')
    console.log(`    ${i === 0 ? bold(text) : text}`)
    if (i === 0) console.log(`    ${dim('─'.repeat(text.length))}`)
  })
}

/**
 * Dialog lines fitted to `max`. Diffstat lines (`index.html | 65 +++---`) keep their counts and get shorter graphs,
 * all scaled by one factor as `git diff --stat=<width>` does; other long lines wrap. If everything fits, nothing changes.
 */
function fitLines(lines: string[], max: number): string[] {
  const stats = lines.map((line) => line.match(/^(.*\| *\d+ )(\+*)(-*)$/))
  const scale = Math.min(
    1,
    ...stats.flatMap((m) => (m && m[2]! + m[3]! ? [Math.max(1, max - m[1]!.length) / (m[2]! + m[3]!).length] : [])),
  )
  return lines.flatMap((line, i) => {
    const m = stats[i]
    if (m && scale < 1) {
      const [, head = '', plus = '', minus = ''] = m
      // Like git: every non-zero side keeps at least one mark.
      const fit = (n: number) => (n ? Math.max(1, Math.floor(n * scale)) : 0)
      return [`${head}${'+'.repeat(fit(plus.length))}${'-'.repeat(fit(minus.length))}`]
    }
    return line.length > max ? wrapPlain(line, max) : [line]
  })
}

/** Split text into lines of at most `max` characters, at spaces. */
function wrapPlain(text: string, max: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    const next = current ? `${current} ${word}` : word
    if (current && next.length > max) {
      lines.push(current)
      current = word
    } else current = next
  }
  return current ? [...lines, current] : lines
}

/** Wrap markdown by its visible length, then style it; bold and code spans stay open across line breaks. */
function wrapMarkdown(text: string, max: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    const next = current ? `${current} ${word}` : word
    if (current && next.replace(/\*\*|`/g, '').length > max) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  let isBold = false
  let isCode = false
  const reopen = () => (color ? `${isBold ? '\x1b[1m' : ''}${isCode ? '\x1b[36m' : ''}` : '')
  return lines.map((line) => {
    let out = reopen()
    for (const token of line.split(/(\*\*|`)/)) {
      if (token === '**') isBold = !isBold
      else if (token === '`') isCode = !isCode
      else {
        out += token
        continue
      }
      if (color) out += `\x1b[0m${reopen()}`
    }
    return color ? `${out}\x1b[0m` : out
  })
}
