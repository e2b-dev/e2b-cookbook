import { Template, waitForURL } from 'e2b'

type Mode = 'code' | 'base'

export function createTemplate(mode: Mode, registry?: string) {
  const prefix = registry ? registry.replace(/\/$/, '') + '/' : ''

  if (mode === 'code') {
    return Template()
      .fromImage(`${prefix}e2bdev/code-interpreter:latest`)
      .setUser('user')
      .setWorkdir('/home/user')
      .setStartCmd('sudo /root/.jupyter/start-up.sh', waitForURL('http://localhost:49999/health'))
      .runCmd('echo Hello World E2B! > hello.txt')
  }

  return Template()
    .fromImage(`${prefix}e2bdev/base:latest`)
    .setUser('user')
    .setWorkdir('/home/user')
    .setStartCmd('sudo /bin/bash')
    .runCmd('echo Hello World E2B! > hello.txt')
}
