import { Sandbox } from 'e2b'
import dotenv from 'dotenv'

dotenv.config()

const templateName = 'openai-codex'
const sbx = await Sandbox.create('openai-codex')
console.log('Sandbox created', sbx.sandboxId)

const result = await sbx.commands.run('codex --help')
console.log(result.stdout)

sbx.kill()
