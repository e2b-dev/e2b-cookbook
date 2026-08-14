/**
 * Turn tests/results.json into the two things the workflow reports with:
 *
 *   tests/Tests.txt          - the per-example table, uploaded as an artifact
 *   tests/slack-payload.json - a Slack Block Kit message, POSTed to a webhook
 *
 * Posting is a plain curl to an incoming webhook rather than a third-party
 * action, so the webhook secret is never handed to someone else's code and the
 * payload is whatever we put in the file.
 *
 * If results.json is missing or unreadable the runner crashed before writing it.
 * That has to be reported too - silence is the failure mode this whole PR exists
 * to remove - so we still emit a payload saying so.
 */
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const resultsPath = path.join(dir, 'results.json')
const tablePath = path.join(dir, 'Tests.txt')
const payloadPath = path.join(dir, 'slack-payload.json')

const {
  GITHUB_SERVER_URL = 'https://github.com',
  GITHUB_REPOSITORY = '',
  GITHUB_RUN_ID = '',
  GITHUB_REF_NAME = '',
  GITHUB_SHA = '',
} = process.env

const runUrl =
  GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : ''

const LABEL = { passed: '✅ Passed', pending: '⏭️ Skipped', failed: '❌ Failed' }

function list(names, limit = 12) {
  if (names.length <= limit) return names.join(', ')
  return `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`
}

function blocks({ passed, skipped, failed, total, crashed }) {
  const out = []

  if (crashed) {
    out.push(
      { type: 'header', text: { type: 'plain_text', text: '❌ Cookbook examples: runner crashed' } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `No results were written, so no example was judged. ${crashed}`,
        },
      },
    )
  } else {
    const icon = failed.length ? '❌' : skipped.length ? '⚠️' : '✅'
    out.push(
      { type: 'header', text: { type: 'plain_text', text: `${icon} Cookbook examples` } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*${passed.length} passed · ${skipped.length} skipped · ${failed.length} failed*` +
            ` (of ${total})`,
        },
      },
    )

    if (failed.length) {
      out.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Failed*\n${list(failed)}` },
      })
    }
    if (skipped.length) {
      out.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Skipped*\n${list(skipped)}\n` +
            '_The sandbox worked; the model did something non-deterministic ' +
            '(no chart, malformed tool call, provider quota). Not a failure._',
        },
      })
    }
  }

  const context = [GITHUB_REF_NAME && `\`${GITHUB_REF_NAME}\``, GITHUB_SHA && `\`${GITHUB_SHA.slice(0, 7)}\``]
    .filter(Boolean)
    .join(' · ')
  if (context || runUrl) {
    out.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: [context, runUrl && `<${runUrl}|run + per-example logs>`].filter(Boolean).join(' · '),
        },
      ],
    })
  }
  return out
}

async function main() {
  let results
  try {
    results = JSON.parse(await fs.readFile(resultsPath, 'utf8'))
  } catch (err) {
    const note = `Could not read tests/results.json: ${err.message}`
    console.error(note)
    await fs.writeFile(tablePath, `${note}\n`)
    await fs.writeFile(
      payloadPath,
      JSON.stringify({ text: 'Cookbook examples: runner crashed', blocks: blocks({ crashed: note }) }, null, 2),
    )
    return
  }

  const assertions = (results.testResults ?? []).flatMap((t) => t.assertionResults ?? [])
  const byStatus = (status) => assertions.filter((a) => a.status === status).map((a) => a.title)
  const passed = byStatus('passed')
  const skipped = byStatus('pending')
  const failed = byStatus('failed')

  const table = assertions
    .map((a) => `| ${a.title} | ${LABEL[a.status] ?? a.status} |`)
    .join('\n')
  const summary = `${passed.length} passed · ${skipped.length} skipped · ${failed.length} failed (of ${assertions.length})`

  await fs.writeFile(tablePath, `${summary}\n\n${table}\n`)

  const payload = {
    // Fallback for notifications and clients that ignore blocks.
    text: `Cookbook examples: ${summary}`,
    blocks: blocks({ passed, skipped, failed, total: assertions.length }),
  }
  await fs.writeFile(payloadPath, JSON.stringify(payload, null, 2))

  console.log(summary)
  console.log(table)
}

main().catch((err) => {
  console.error('report.mjs failed:', err)
  process.exitCode = 1
})
