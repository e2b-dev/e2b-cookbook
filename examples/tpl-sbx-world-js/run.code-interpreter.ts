import dotenv from 'dotenv'
import path from 'node:path'
import { Sandbox, OutputMessage, Result, ExecutionError } from '@e2b/code-interpreter'

function getArg(name: string) {
  const p = `--${name}=`
  const a = process.argv.slice(2).find((x) => x.startsWith(p))
  return a ? a.slice(p.length) : undefined
}

function getMinutes(): number | undefined {
  const fromArg = getArg('minutes')
  if (fromArg) {
    const n = Number(fromArg)
    if (!Number.isNaN(n) && n > 0) return n
  }
  const fromEnv = process.env.SANDBOX_MINUTES
  if (fromEnv) {
    const n = Number(fromEnv)
    if (!Number.isNaN(n) && n > 0) return n
  }
  return undefined
}

async function main() {
  dotenv.config({ override: true, path: path.resolve(process.cwd(), '.env') })
  if (!process.env.E2B_API_KEY) {
    process.stderr.write('E2B_API_KEY not set\n')
    process.exit(1)
  }
  const alias = getArg('alias')
  if (!alias) {
    process.stderr.write('alias is required. usage: --alias=<template_alias> [--minutes=N] [--code=<python>]\n')
    process.exit(1)
  }
  const minutes = getMinutes()
  const timeoutMs = minutes ? minutes * 60_000 : undefined
  const sandbox = await Sandbox.create(alias, timeoutMs ? { timeoutMs } : undefined)
  const code = getArg('code') || 'print("hello from code interpreter")'
  const exec = await sandbox.runCode(code, {
    onStdout: (o: OutputMessage) => console.log('[stdout]', o.line),
    onStderr: (o: OutputMessage) => console.log('[stderr]', o.line),
    onResult: (r: Result) => console.log('[result]', r.text || r.html || r.markdown || r.json || ''),
    onError: (e: ExecutionError) => console.error('[error]', e.name, e.value),
  })
  if (exec.error) {
    const e = exec.error as ExecutionError
    process.stderr.write(`[exec-error] ${e.name}: ${e.value}\n`)
  }
  await sandbox.kill()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
