import { Sandbox } from 'e2b'
import dotenv from 'dotenv'

dotenv.config()

const templateName = 'anthropic-claude-code'

const sbx = await Sandbox.create(templateName)
console.log('Sandbox created', sbx.sandboxId)

const result = await sbx.commands.run('claude --help')
console.log(result.stdout)

sbx.kill()
