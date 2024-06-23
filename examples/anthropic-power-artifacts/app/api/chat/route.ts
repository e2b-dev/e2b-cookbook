import { z } from 'zod'
import { type CoreMessage, streamText, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

import {
  // createOrConnect,
  // runCommand,
  // listFiles,
  // runR,
  runPython,
} from '@/lib/sandbox'
import { Sandbox } from 'e2b'

export interface ServerMessage {
  role: 'user' | 'assistant' | 'function';
  content: string;
}

export async function POST(req: Request) {
  const { messages }: { messages: CoreMessage[] } = await req.json()
  const userID = 'dummy-user-id'

  console.log('Messages', messages)
  const allSandboxes = await Sandbox.list()
  console.log('All sandboxes', allSandboxes)

  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    tools: {
      // writeFile: tool({
      //   description: 'Writes to a file. If the file does not exists, it gets created. If it does, it gets overwritten.',
      //   parameters: z.object({
      //     path: z.string(),
      //     content: z.string(),
      //   }),
      //   // execute:
      // }),
      // readFile: tool({
      //   description: 'Reads the content of a file.',
      //   parameters: z.object({
      //     path: z.string(),
      //   }),
      //   // execute:
      // }),
      // listFiles: tool({
      //   description: 'Lists all files in the current directory.',
      //   parameters: z.object({
      //     path: z.string(),
      //   }),
      //   execute: async ({ path }) => {
      //     console.log('Listing files', path)
      //     const files = await listFiles(userID, path)
      //     console.log('Listing files', files)
      //     return {
      //       files,
      //     }
      //   },
      // }),
      // runCommand: tool({
      //   description: 'Runs a command in the terminal.',
      //   parameters: z.object({
      //     command: z.string(),
      //   }),
      //   execute: async ({ command }) => {
      //     const result = await runCommand(userID, command)
      //     return {
      //       stdout: result.stdout,
      //       stderr: result.stderr,
      //       exitCode: result.exitCode,
      //     }
      //   },
      // }),
      runPython: tool({
        description: 'Runs Python code.',
        parameters: z.object({
          title: z.string().describe('Short title (5 words max) of the artifact.'),
          description: z.string().describe('Short description (10 words max) of the artifact.'),
          code: z.string().describe('The code to run.'),
        }),
        execute: async ({ code }) => {
          const execOutput = await runPython(userID, code)
          const stdout = execOutput.logs.stdout
          const stderr = execOutput.logs.stderr
          const runtimeError = execOutput.error ?? ''
          const results = execOutput.results

          return {
            stdout,
            stderr,
            runtimeError,
            cellResults: results,
          }
        },
      }),
    },
    toolChoice: 'auto',
    // system: 'You are a skilled frontend developer that is building Nextjs web app. You work in a sandbox environment inside /home/user directory. User sees the app you are building in the browser.',
    system: `
    You are a skilled Python developer.
    One of your expertise is also data science.
    You can run Python, and bash code. Code for each programming language runs in its own context and reference previous definitions and variables.
    The code runs inside a Jupyter notebook so we can easily get visualizations.
    Use seaborn for data visualization.

    Messages inside [] means that it's a UI element or a user event. For example:
    - "[Chart was generated]" means a chart in a Jupyter notebook was generated and displayed to user.
    `,
    messages,
  })

  return result.toAIStreamResponse()
}