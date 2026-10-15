/**
 * Pi runs on your machine; its tools run in an E2B sandbox. The @e2b/pi extension, driven from a script.
 *
 *   npm start                      Pi builds a one-page site for "Sandbox Roasters" and serves it at a public URL
 *   npm start -- "your task"       the whole command line is the task
 *
 * The same steps as `cd sandbox-roasters && pi --e2b` in a terminal:
 *   1. Start: a git checkout on your machine; the sandbox starts with the first prompt and gets a copy of it.
 *   2. Work:  bash, read, write and edit run in the sandbox; `preview_url` turns a port into a public link.
 *   3. Pull:  `/e2b pull` applies the sandbox's changes to your checkout.
 *
 * Needs E2B_API_KEY and ANTHROPIC_API_KEY (in .env). `tui.*` only prints.
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import * as tui from './tui.ts'

const task =
  process.argv.slice(2).join(' ') ||
  'Build a one-page site for Sandbox Roasters, a small coffee roaster: index.html with inline CSS, dark and warm, ' +
    'a big hero, three coffee cards with prices, and opening hours. Serve it on port 8080 and share the public link.'

// 1. Your project: a git checkout with a README. Its working tree is what the sandbox gets.
const project = path.join(mkdtempSync(path.join(os.tmpdir(), 'pi-e2b-')), 'sandbox-roasters')
const git = (...args: string[]) => execFileSync('git', args, { cwd: project, stdio: 'pipe' })
execFileSync('git', ['init', '-q', '-b', 'main', project])
writeFileSync(path.join(project, 'README.md'), '# Sandbox Roasters\n\nSmall-batch coffee, roasted slow.\n')
git('add', '-A')
git('-c', 'user.name=Pi example', '-c', 'user.email=pi@example.com', 'commit', '-qm', 'init')

// Pi with the @e2b/pi package loaded: what `pi install npm:@e2b/pi` does for the CLI.
const extension = path.dirname(createRequire(import.meta.url).resolve('@e2b/pi/package.json'))
const resourceLoader = new DefaultResourceLoader({
  cwd: project,
  agentDir: getAgentDir(),
  additionalExtensionPaths: [extension],
})
await resourceLoader.reload()

const modelRuntime = await ModelRuntime.create()
const model = modelRuntime.getModel('anthropic', 'claude-sonnet-5-5')
if (!model) throw new Error('Pi does not know anthropic/claude-sonnet-5-5; update @earendil-works/pi-coding-agent')
const { session } = await createAgentSession({
  cwd: project,
  model,
  thinkingLevel: 'medium',
  modelRuntime,
  resourceLoader,
  sessionManager: SessionManager.inMemory(project), // like `pi --no-session`: the sandbox is killed, never paused
})

try {
  session.extensionRunner.setFlagValue('e2b', true) // the `--e2b` flag
  // Fires session_start: the extension swaps bash, read, write and edit for sandbox-backed ones and adds preview_url.
  await session.bindExtensions({ uiContext: tui.ui })
  session.subscribe(tui.trace)
  tui.header({ Task: task, Project: project, Model: `${model.provider}/${model.id}` })

  // 2. Work. The first prompt starts the sandbox and uploads the checkout while the model thinks.
  await session.prompt(task)

  // 3. Pull. The extension shows the diff stat and asks first; tui.ui answers yes.
  await session.prompt('/e2b pull')
  tui.shell(project, 'ls && git status --short')
  tui.done()

  await tui.holdOpen('kill the sandbox (the preview URL stays up until then)')
} finally {
  await session.prompt('/e2b kill').catch(() => undefined) // also after an error, so no sandbox is left running
  session.dispose()
}
