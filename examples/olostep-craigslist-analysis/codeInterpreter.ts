import { Sandbox } from '@e2b/code-interpreter'

export async function codeInterpret(
  codeInterpreter: Sandbox,
  code: string
) {
  console.log(
    `\n${'='.repeat(50)}\n> Running AI-generated Python code:\n${code}\n${'='.repeat(50)}`
  )
  
  const exec = await codeInterpreter.runCode(code, {
    // You can stream logs from the code interpreter
    // onStderr: (stderr: string) => console.log("\n[Code Interpreter stderr]", stderr),
    // onStdout: (stdout: string) => console.log("\n[Code Interpreter stdout]", stdout),
    
    // You can also stream additional results like charts, images, etc.
    // onResult: ...
  })

  if (exec.error) {
    console.log('❌ [Code Interpreter error]', exec.error) // Runtime error
    return undefined
  }

  return exec
}