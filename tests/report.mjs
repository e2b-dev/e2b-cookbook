/**
 * Turn tests/results.json into the two things the workflow reports with:
 *
 *   tests/Tests.txt          - the per-example table, uploaded as an artifact
 *   tests/slack-payload.json - the webhook body
 *
 * The body targets a Slack Workflow Builder webhook trigger, which accepts a
 * FLAT object of the Data Variables declared on the trigger - no nesting, no
 * arrays, and every value a string. That is why this is not Block Kit: an
 * incoming webhook would take {text, blocks}, a Workflow Builder trigger will
 * not. The message itself is composed in Workflow Builder from these variables.
 *
 * Declare these on the trigger, all type Text:
 *   outcome status headline details footer
 *   failed skipped rate_limited branch commit run_url
 *
 * Workflow Builder cannot do conditionals, so a template of one line per category
 * prints "Failed: none" and "Skipped: none" on a healthy run - two lines saying
 * nothing - and cannot show the rate-limited names at all. `details` is therefore
 * composed here: only the lines that apply, already formatted. A message of
 * {{status}} / {{headline}} / {{details}} / {{footer}} needs no conditionals.
 *
 * `outcome` is the one to branch on: pass | skip | fail | crash, no emoji and no
 * sentinel string to compare against. `status` is the human-facing version and
 * `failed` is a name list, so conditioning on either means matching an emoji or
 * the literal "none".
 *
 * Posting is a plain curl rather than a third-party action, so the webhook secret
 * is never handed to someone else's code.
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

// Workflow Builder rejects a missing key and renders an empty one as a blank gap,
// so every variable is always present and never an empty string.
const NONE = 'none'

function list(names, limit = 12) {
  if (!names.length) return NONE
  if (names.length <= limit) return names.join(', ')
  return `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`
}

function variables({ passed, skipped, failed, rateLimited = [], total, crashed }) {
  if (crashed) {
    return {
      outcome: 'crash',
      status: '❌ runner crashed',
      headline: 'No results were written, so no example was judged.',
      details: crashed,
      footer: [GITHUB_REF_NAME, GITHUB_SHA && GITHUB_SHA.slice(0, 7), runUrl].filter(Boolean).join(' · '),
      summary: 'No results were written, so no example was judged.',
      failed: crashed,
      skipped: NONE,
      rate_limited: NONE,
      branch: GITHUB_REF_NAME || NONE,
      commit: GITHUB_SHA ? GITHUB_SHA.slice(0, 7) : NONE,
      run_url: runUrl || NONE,
    }
  }

  const real = passed.length - rateLimited.length
  const headline =
    `${real}/${total} ran clean` +
    (rateLimited.length ? `, ${rateLimited.length} rate limited` : '') +
    (skipped.length ? `, ${skipped.length} skipped` : '') +
    (failed.length ? `, ${failed.length} failed` : '')

  // Only the lines that apply. A clean run gets one line, not three saying "none".
  const lines = []
  if (failed.length) lines.push(`❌ Failed: ${list(failed)}`)
  if (rateLimited.length) {
    lines.push(`⏳ Rate limited, counted OK: ${list(rateLimited)}`)
  }
  if (skipped.length) {
    lines.push(`⏭️ Skipped, the model varied rather than the sandbox: ${list(skipped)}`)
  }
  if (!lines.length) lines.push('Nothing to report - every example ran and returned.')

  return {
    outcome: failed.length ? 'fail' : skipped.length ? 'skip' : 'pass',
    status: failed.length ? '❌ failed' : skipped.length ? '⚠️ passed with skips' : '✅ passed',
    headline,
    details: lines.join('\n'),
    footer: [GITHUB_REF_NAME, GITHUB_SHA && GITHUB_SHA.slice(0, 7), runUrl].filter(Boolean).join(' · '),
    // Kept for anyone composing their own layout.
    summary:
      `${passed.length} passed · ${skipped.length} skipped · ${failed.length} failed (of ${total})` +
      (rateLimited.length ? ` · ${rateLimited.length} rate limited` : ''),
    failed: list(failed),
    skipped: list(skipped),
    rate_limited: list(rateLimited),
    branch: GITHUB_REF_NAME || NONE,
    commit: GITHUB_SHA ? GITHUB_SHA.slice(0, 7) : NONE,
    run_url: runUrl || NONE,
  }
}

async function main() {
  let results
  try {
    results = JSON.parse(await fs.readFile(resultsPath, 'utf8'))
  } catch (err) {
    const note = `Could not read tests/results.json: ${err.message}`
    console.error(note)
    await fs.writeFile(tablePath, `${note}\n`)
    await fs.writeFile(payloadPath, JSON.stringify(variables({ crashed: note }), null, 2))
    return
  }

  const assertions = (results.testResults ?? []).flatMap((t) => t.assertionResults ?? [])
  const byStatus = (status) => assertions.filter((a) => a.status === status).map((a) => a.title)
  const passed = byStatus('passed')
  const skipped = byStatus('pending')
  const failed = byStatus('failed')
  // Passes that were really the provider refusing. Counted OK on purpose, but
  // named so a dry account is visible rather than indistinguishable from health.
  const rateLimited = assertions.filter((a) => a.rateLimited).map((a) => a.title)

  const table = assertions
    .map((a) => `| ${a.title} | ${LABEL[a.status] ?? a.status} |`)
    .join('\n')
  const summary =
    `${passed.length} passed · ${skipped.length} skipped · ${failed.length} failed (of ${assertions.length})` +
    (rateLimited.length ? ` · ${rateLimited.length} rate limited` : '')

  await fs.writeFile(tablePath, `${summary}\n\n${table}\n`)

  await fs.writeFile(
    payloadPath,
    JSON.stringify(
      variables({ passed, skipped, failed, rateLimited, total: assertions.length }),
      null,
      2,
    ),
  )

  console.log(summary)
  console.log(table)
}

main().catch((err) => {
  console.error('report.mjs failed:', err)
  process.exitCode = 1
})
