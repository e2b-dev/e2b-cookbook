# How to run a Docker container in E2B

This example [sandbox template](https://e2b.dev/docs/sandbox-template) that shows how to run a Docker container inside an E2B sandbox.

## Test out the premade sandbox
The sandbox template from this example is public and ready to be used. The template ID is `e2b-with-docker`.

**E2B CLI**
```bash
e2b sandbox spawn e2b-with-docker
```
You'll SSH into the sandbox and then run the following command to start a hello world container:
```bash
sudo docker run hello-world
```

**E2B JavaScript SDK**

Check out the [JavaScript example](./js/index.ts).
```js
import { Sandbox } from 'e2b'
const sbx = await Sandbox.create('e2b-with-docker')

// Run the command verifying that Docker is installed
const result = await sbx.commands.run('docker --version')
console.log(result.stdout)

await sbx.kill()
```

**E2B Python SDK**

Check out the [Python example](./python/main.py).
```python
from e2b import Sandbox

sbx = Sandbox.create('e2b-with-docker')

# Run the command verifying that Docker is installed
result = sbx.commands.run('docker --version')
print(result.stdout)

sbx.kill()
```

## How to build your own sandbox that supports running Docker inside

1. Run `npm i -g @e2b/cli@latest` to install the latest version of the E2B CLI
1. Run `e2b template init` in the same directory as your `package.json`
1. Copy the [e2b.Dockerfile](./e2b.Dockerfile) into your project
1. Run `e2b template build` to build your sandbox
1. Start the sandbox either via our SDK or the E2B CLI like this `e2b sandbox spawn <sandbox-template-id>`


> [!WARNING]
> If you want to use the code interpreting features (https://github.com/e2b-dev/code-interpreter)
you can use the `e2bdev/code-interpreter` base image instead of the default `ubuntu:20.04` one in the `e2b.Dockerfile`.
