import 'dotenv/config'
import Sandbox from 'e2b'

async function run() {
  const sbx = await Sandbox.create() // By default the sandbox is alive for 5 minutes
  const result = await sbx.commands.run('echo "hello world"') // Execute a command inside the sandbox
  console.log(result.stdout)

  const files = await sbx.files.list('/')
  console.log(files)
}

run()
