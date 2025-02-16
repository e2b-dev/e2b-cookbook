import { Sandbox } from 'e2b'
import * as dotenv from 'dotenv'

dotenv.config()

const sbx = await Sandbox.create('e2b-with-docker')

// Run the command verifying that Docker is installed
let result = await sbx.commands.run('docker --version')
console.log("Docker version inside the sandbox:", result.stdout)

// Run hello world container
// Note: we need to run it with sudo
result = await sbx.commands.run('sudo docker run hello-world', {
  onStdout: (line) => console.log("[stdout]", line),
  onStderr: (line) => console.log("[stderr]", line)
})
// Or you can use the following code to print the output to the console
// console.log("Hello world: ", result.stdout)

await sbx.kill()
