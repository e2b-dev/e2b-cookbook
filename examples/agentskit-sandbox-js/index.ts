import 'dotenv/config'

import { createSandbox } from '@agentskit/sandbox'

const apiKey = process.env.E2B_API_KEY

if (!apiKey) {
  throw new Error('Set E2B_API_KEY before running this example.')
}

const sandbox = createSandbox({ apiKey, timeout: 30_000 })

const printResult = (
  label: string,
  result: { stdout: string; stderr: string; exitCode: number; durationMs: number },
) => {
  console.log(`\n${label}`)
  console.log(`exit code: ${result.exitCode}`)
  console.log(`duration: ${result.durationMs} ms`)
  if (result.stdout) console.log(`stdout: ${result.stdout}`)
  if (result.stderr) console.error(`stderr: ${result.stderr}`)

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode}`)
  }
}

try {
  const javascript = await sandbox.execute(
    `const values = [3, 5, 8, 13]
console.log(JSON.stringify({ sum: values.reduce((total, value) => total + value, 0) }))`,
    { language: 'javascript', timeout: 10_000 },
  )
  printResult('JavaScript result', javascript)

  const python = await sandbox.execute(
    `values = [3, 5, 8, 13]
print({"mean": sum(values) / len(values)})`,
    { language: 'python', timeout: 10_000 },
  )
  printResult('Python result', python)
} finally {
  await sandbox.dispose()
}
