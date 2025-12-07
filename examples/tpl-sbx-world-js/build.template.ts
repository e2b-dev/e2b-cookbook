import { Template, defaultBuildLogger } from 'e2b'
import dotenv from 'dotenv'
import path from 'node:path'
import { template } from './template'

function getArg(name: string) {
  const prefix = `--${name}=`
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : undefined
}

async function main() {
  dotenv.config({ override: true, path: path.resolve(process.cwd(), '.env') })
  const alias = getArg('alias')
  if (!alias) {
    process.stderr.write('alias is required. usage: npm run e2b:build:template -- --alias=<name>\n')
    process.exit(1)
  }
  await Template.build(template, {
    alias,
    cpuCount: 1,
    memoryMB: 512,
    onBuildLogs: defaultBuildLogger(),
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
