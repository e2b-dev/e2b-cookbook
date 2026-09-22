import { Sandbox, ApiClient, ConnectionConfig } from 'e2b'
import dotenv from 'dotenv'
import path from 'node:path'

function getArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

function hasFlag(name: string) {
  return process.argv.slice(2).includes(`--${name}`)
}

function padEnd(s: string, w: number) {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

function formatDate(d: Date) {
  const iso = d.toISOString()
  return iso.replace('T', ' ').replace('.000Z', 'Z')
}

function getAlias() {
  const fromArg = getArg('alias')
  return fromArg
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

  const client = new ApiClient(new ConnectionConfig(), { requireApiKey: true })

  if (hasFlag('list-templates')) {
    const res = await client.api.GET('/templates')
    if (res.error) {
      const status = res.response?.status
      const content = typeof res.error === 'string' ? res.error : res.error?.message
      const msg = status === 401
        ? `Authentication failed: invalid E2B_API_KEY or domain${content ? ` - ${content}` : ''}`
        : `${status ?? ''}: ${content ?? 'API error'}`
      process.stderr.write(msg + '\n')
      process.exit(1)
    }
    const items = res.data || []
    if (!items.length) {
      process.stdout.write('No templates found\n')
      return
    }
    const rows = items.map((t) => ({
      id: t.templateID,
      aliases: (t.aliases || []).join(','),
      status: t.buildStatus,
      builds: String(t.buildCount ?? ''),
      createdAt: formatDate(new Date(t.createdAt)),
      updatedAt: formatDate(new Date(t.updatedAt)),
      lastUsedAt: t.lastSpawnedAt ? formatDate(new Date(t.lastSpawnedAt)) : '',
    }))
    const wId = Math.max('TEMPLATE ID'.length, ...rows.map((r) => r.id.length))
    const wAliases = Math.max('ALIASES'.length, ...rows.map((r) => r.aliases.length))
    const wStatus = Math.max('STATUS'.length, ...rows.map((r) => r.status.length))
    const wBuilds = Math.max('BUILDS'.length, ...rows.map((r) => r.builds.length))
    const wCreated = Math.max('CREATED AT'.length, ...rows.map((r) => r.createdAt.length))
    const wUpdated = Math.max('UPDATED AT'.length, ...rows.map((r) => r.updatedAt.length))
    const wLast = Math.max('LAST USED AT'.length, ...rows.map((r) => r.lastUsedAt.length))
    process.stdout.write(
      `${padEnd('TEMPLATE ID', wId)}  ${padEnd('ALIASES', wAliases)}  ${padEnd('STATUS', wStatus)}  ${padEnd('BUILDS', wBuilds)}  ${padEnd('CREATED AT', wCreated)}  ${padEnd('UPDATED AT', wUpdated)}  ${padEnd('LAST USED AT', wLast)}\n`
    )
    process.stdout.write(
      `${'-'.repeat(wId)}  ${'-'.repeat(wAliases)}  ${'-'.repeat(wStatus)}  ${'-'.repeat(wBuilds)}  ${'-'.repeat(wCreated)}  ${'-'.repeat(wUpdated)}  ${'-'.repeat(wLast)}\n`
    )
    for (const r of rows) {
      process.stdout.write(
        `${padEnd(r.id, wId)}  ${padEnd(r.aliases, wAliases)}  ${padEnd(r.status, wStatus)}  ${padEnd(r.builds, wBuilds)}  ${padEnd(r.createdAt, wCreated)}  ${padEnd(r.updatedAt, wUpdated)}  ${padEnd(r.lastUsedAt, wLast)}\n`
      )
    }
    return
  }

  const deleteTemplateId = hasFlag('delete-template') ? getArg('id') || getArg('template-id') || getArg('alias') : undefined
  if (deleteTemplateId) {
    let id = deleteTemplateId
    // resolve alias to templateID if alias provided
    if (!/^\w/.test(id) || id.includes('-') || id.length < 10) {
      const res = await client.api.GET('/templates')
      if (res.error) {
        const status = res.response?.status
        const content = typeof res.error === 'string' ? res.error : res.error?.message
        const msg = status === 401
          ? `Authentication failed: invalid E2B_API_KEY or domain${content ? ` - ${content}` : ''}`
          : `${status ?? ''}: ${content ?? 'API error'}`
        process.stderr.write(msg + '\n')
        process.exit(1)
      }
      const match = (res.data || []).find((t) => t.aliases && t.aliases.includes(id))
      if (match) id = match.templateID
    }
    const del = await client.api.DELETE('/templates/{templateID}', { params: { path: { templateID: id } } })
    if (del.error) {
      process.stderr.write(`DELETE FAILED: ${id}\n`)
      process.exit(1)
    }
    process.stdout.write(`DELETED TEMPLATE: ${id}\n`)
    return
  }

  if (hasFlag('connect')) {
    const id = getArg('id') || getArg('sandbox-id')
    if (!id) {
      process.stderr.write('Usage: --connect --id=<sandboxID> [--shell] [--minutes=N]\n')
      return
    }
    const minutes = getMinutes()
    const shell = hasFlag('shell')
    const ttlCapMs = 3_600_000
    const timeoutMs = minutes ? minutes * 60_000 : shell ? ttlCapMs : undefined
    const sandbox = await Sandbox.connect(id, timeoutMs ? { timeoutMs } : undefined)
    if (timeoutMs) {
      await sandbox.setTimeout(timeoutMs)
    }
    const info = await sandbox.getInfo()
    process.stdout.write(
      `mode:connect id:${sandbox.sandboxId} template:${info.name ?? ''} minutes:${minutes ?? ''} endAt:${info.endAt.toISOString()}\n`
    )
    if (shell) {
      const cols = process.stdout.columns || 80
      const rows = process.stdout.rows || 24
      const handle = await sandbox.pty.create({
        cols,
        rows,
        onData: (data) => process.stdout.write(Buffer.from(data)),
        timeoutMs: minutes ? minutes * 60_000 : 0,
      })
      if (process.stdin.isTTY) {
        process.stdin.setRawMode?.(true)
      }
      process.stdin.resume()
      const onInput = (chunk: Buffer) => {
        const u8 = new Uint8Array(chunk)
        sandbox.pty.sendInput(handle.pid, u8).catch(() => {})
      }
      process.stdin.on('data', onInput)
      const onResize = () => {
        const c = process.stdout.columns || 80
        const r = process.stdout.rows || 24
        sandbox.pty.resize(handle.pid, { cols: c, rows: r }).catch(() => {})
      }
      process.stdout.on('resize', onResize)
      try {
        await handle.wait().catch(() => {})
      } finally {
        process.stdout.off('resize', onResize)
        process.stdin.off('data', onInput)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode?.(false)
        }
      }
    }
    return
  }

  if (hasFlag('list')) {
    const paginator = Sandbox.list()
    const items = await paginator.nextItems()
    const rows = items.map((it) => ({
      id: it.sandboxId,
      state: it.state,
      name: it.name ?? '',
      startAt: formatDate(it.startedAt),
      endAt: formatDate(it.endAt),
    }))
    const wId = Math.max('ID'.length, ...rows.map((r) => r.id.length))
    const wState = Math.max('STATE'.length, ...rows.map((r) => r.state.length))
    const wName = Math.max('NAME'.length, ...rows.map((r) => r.name.length))
    const wStart = Math.max('START AT'.length, ...rows.map((r) => r.startAt.length))
    const wEnd = Math.max('END AT'.length, ...rows.map((r) => r.endAt.length))
    process.stdout.write(
      `${padEnd('ID', wId)}  ${padEnd('STATE', wState)}  ${padEnd('NAME', wName)}  ${padEnd('START AT', wStart)}  ${padEnd('END AT', wEnd)}\n`
    )
    process.stdout.write(
      `${'-'.repeat(wId)}  ${'-'.repeat(wState)}  ${'-'.repeat(wName)}  ${'-'.repeat(wStart)}  ${'-'.repeat(wEnd)}\n`
    )
    for (const r of rows) {
      process.stdout.write(
        `${padEnd(r.id, wId)}  ${padEnd(r.state, wState)}  ${padEnd(r.name, wName)}  ${padEnd(r.startAt, wStart)}  ${padEnd(r.endAt, wEnd)}\n`
      )
    }
    return
  }

  const infoId = hasFlag('info') ? getArg('id') || getArg('info') : undefined
  if (infoId) {
    const it = await Sandbox.getInfo(infoId)
    const lines = [
      `ID      : ${it.sandboxId}`,
      `STATE   : ${it.state}`,
      `NAME    : ${it.name ?? ''}`,
      `START AT: ${formatDate(it.startedAt)}`,
      `END AT  : ${formatDate(it.endAt)}`,
      `CPU     : ${it.cpuCount}`,
      `MEM MB  : ${it.memoryMB}`,
    ]
    for (const line of lines) process.stdout.write(line + '\n')
    return
  }

  const killId = hasFlag('kill') ? getArg('id') || getArg('kill') : undefined
  if (killId) {
    const s = await Sandbox.connect(killId)
    await s.kill()
    process.stdout.write(`KILLED  : ${killId}\n`)
    return
  }

  const pauseId = hasFlag('pause') ? getArg('id') || getArg('pause') : undefined
  if (pauseId) {
    const paused = await Sandbox.betaPause(pauseId)
    process.stdout.write(`${paused ? 'PAUSED  :' : 'PAUSE   :'} ${pauseId}\n`)
    return
  }

  const resumeId = hasFlag('resume') ? getArg('id') || getArg('resume') : undefined
  if (resumeId) {
    const s = await Sandbox.connect(resumeId)
    const it = await s.getInfo()
    process.stdout.write(`RESUMED : ${resumeId} STATE:${it.state}\n`)
    return
  }

  const sandboxIdArg = getArg('sandbox-id')
  const minutes = getMinutes()
  const shell = hasFlag('shell')
  const ttlCapMs = 3_600_000
  const timeoutMs = minutes ? minutes * 60_000 : shell ? ttlCapMs : undefined

  let sandbox: Sandbox
  let mode: 'create' | 'connect'

  if (sandboxIdArg) {
    mode = 'connect'
    sandbox = await Sandbox.connect(sandboxIdArg, timeoutMs ? { timeoutMs } : undefined)
    if (timeoutMs) {
      await sandbox.setTimeout(timeoutMs)
    }
  } else {
    mode = 'create'
    const alias = getAlias()
    if (!alias) {
      process.stderr.write('alias is required. usage: --alias=<template_alias> [--shell] [--minutes=N]\n')
      process.exit(1)
    }
    sandbox = await Sandbox.create(alias, timeoutMs ? { timeoutMs } : undefined)
  }

  const info = await sandbox.getInfo()
  const endAt = info.endAt.toISOString()

  process.stdout.write(
    `mode:${mode} id:${sandbox.sandboxId} template:${info.name ?? ''} minutes:${minutes ?? ''} endAt:${endAt}\n`
  )

  if (shell) {
    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 24
    const handle = await sandbox.pty.create({
      cols,
      rows,
      onData: (data) => process.stdout.write(Buffer.from(data)),
      timeoutMs: minutes ? minutes * 60_000 : 0,
    })
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(true)
    }
    process.stdin.resume()
    const onInput = (chunk: Buffer) => {
      const u8 = new Uint8Array(chunk)
      sandbox.pty.sendInput(handle.pid, u8).catch(() => {})
    }
    process.stdin.on('data', onInput)
    const onResize = () => {
      const c = process.stdout.columns || 80
      const r = process.stdout.rows || 24
      sandbox.pty.resize(handle.pid, { cols: c, rows: r }).catch(() => {})
    }
    process.stdout.on('resize', onResize)
    try {
      await handle.wait().catch(() => {})
    } finally {
      process.stdout.off('resize', onResize)
      process.stdin.off('data', onInput)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode?.(false)
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
