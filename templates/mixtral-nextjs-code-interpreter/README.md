// Nextjs Backend:

import { Sandbox } from 'e2b'
const sandbox = await Sandbox.create('my-sandbox')

const autorunStream  = sandbox.autorunStream({
  allowedLanguages: ['python', 'bash']
})
const registerStream = sandbox.registerStream()

// -----------------------------

// React Frontend:
import {
  useCodeInterpreter,
} from 'e2b'

const {
  results,
  fileUpload,
  fileDownload,
} = useCodeInterpreter(hash)

// NOTE: We could price E2B per code execution?
