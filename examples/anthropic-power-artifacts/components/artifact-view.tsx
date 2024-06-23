import Image from 'next/image'
import { Terminal } from 'lucide-react'

import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert'


export interface Props {
  toolInvocation?: any
}

function ArtifactWrapper({ children }: { children?: React.ReactNode }) {
  return (
    <div className="p-8 flex-1 flex flex-col shadow-2xl rounded-lg border border-[#FFE7CC] bg-white max-w-[1100px]">
      {children}
    </div>
  )
}

function Output({ stdout, stderr }: {
  stdout: string[]
  stderr: string[]
}) {
  if (stdout.length === 0 && stderr.length === 0) return null

  return (
    <div className="flex-1 flex flex-col items-start justify-start space-y-1 p-4 bg-[#F5F5F5] rounded-b-lg">
      {stdout && stdout.length > 0 && stdout.map((out: string, index: number) => (
        <pre key={index} className="text-xs">
          {out}
        </pre>
      ))}
      {stderr && stderr.length > 0 && stderr.map((err: string, index: number) => (
        <pre key={index} className="text-xs text-red-500">
          {err}
        </pre>
      ))}
    </div>
  )
}

export function ArtifactView({
  toolInvocation,
}: Props) {
  console.log('toolInvocation', toolInvocation)

  if (!toolInvocation) return null

  const { args, result } = toolInvocation

  if (!args && !result) {
    return (
      <ArtifactWrapper />
    )
  }

  if (result) {
    console.log('result', result)
    const { cellResults, stdout, stderr, runtimeError } = result

    // The AI-generated code experienced runtime error
    if (runtimeError) {
      const { name, value, tracebackRaw } = runtimeError
      return (
        <ArtifactWrapper>
          <Alert variant="destructive">
            <Terminal className="h-4 w-4"/>
            <AlertTitle>{name}: {value}</AlertTitle>
            <AlertDescription className="font-mono whitespace-pre-wrap">
              {tracebackRaw}
            </AlertDescription>
          </Alert>
        </ArtifactWrapper>
      )
    }

    // Cell results can contain text, pdfs, images, and code (html, latex, json)
    if (cellResults.length > 0) {
      const imgInBase64 = cellResults[0].png
      return (
        <ArtifactWrapper>
          <div className="flex-1 p-4">
            <div className="flex flex-col items-center justify-center">
              <Image
                src={`data:image/png;base64,${imgInBase64}`}
                alt="result"
                width={800}
                height={600}
              />
            </div>
          </div>
          <pre className="p-4 bg-[#F5F5F5] rounded-b-lg text-xs">
            {stdout}
          </pre>
          <pre className="p-4 bg-[#F5F5F5] rounded-b-lg text-xs">
            {stderr}
          </pre>
        </ArtifactWrapper>
      )
    }

    // No cell results, but there is stdout or stderr
    if (stdout.length > 0 || stderr.length > 0) {
      return (
        <ArtifactWrapper>
          <Output stdout={stdout} stderr={stderr} />
        </ArtifactWrapper>
      )
    }

    return (
      <ArtifactWrapper>No output</ArtifactWrapper>
    )
  } else if (args) {
    return (
      <ArtifactWrapper>
        <div className="flex-1 p-4 bg-[#F5F5F5] rounded-b-lg font-mono whitespace-pre-wrap">
          {args.code}
        </div>
      </ArtifactWrapper>
    )
  }
}