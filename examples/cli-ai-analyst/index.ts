import { program } from 'commander'
import { analyze } from './analyze'

program
  .name('aa')
  .description('AI Analyst in your command line')
  .argument('<question>', 'Your question about the file')
  .option('-f, --file <file>', 'file to analyze')
  .action(async (question: string, options: { file: string }) => {
    const { file } = options
    await analyze(file, question)
  })

program.parse()
