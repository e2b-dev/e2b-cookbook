import { CodeInterpreter } from '@e2b/code-interpreter'


async function uploadFile(ci: CodeInterpreter, pathToFile: string) {
  console.log('Reading file...')
  const file = Bun.file(pathToFile)
  console.log('File read')

  console.log('Uploading file...')
  // Uploads `file` to the sandbox and saves it as `/home/user/city_temperature.csv`
  ci.uploadFile(file, 'city_temperature.csv')
  console.log('File uploaded')
}

export async function analyze(file: string, question: string) {
  console.log('Creating Code Interpreter sandbox...')
  const ci = await CodeInterpreter.create({ logger: console })
  console.log('Code Interpreter sandbox created')

  await uploadFile(ci, file)

  console.log('Analyzing file:', file)
  console.log('Question:', question)
}

