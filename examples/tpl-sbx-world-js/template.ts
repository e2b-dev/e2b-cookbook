import { Template } from 'e2b'

export const template = Template()
  .fromImage('e2bdev/base')
  .runCmd('sleep 36')
  .runCmd('echo Hello World E2B! > hello.txt')