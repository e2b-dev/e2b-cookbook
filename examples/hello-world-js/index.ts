import 'dotenv/config'
import { Sandbox } from 'e2b'

async function run() {
  const sbx = await Sandbox.create('code-interpreter') // Use the code-interpreter template
  const execution = await sbx.runCode('print("hello world")') // Execute Python inside the sandbox
  console.log(execution.logs)

  const files = await sbx.files.list('/')
  console.log(files)
}

run()