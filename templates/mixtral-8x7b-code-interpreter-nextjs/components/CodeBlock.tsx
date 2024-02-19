import hljs from 'highlight.js'
import { useCodeInterpreterResults } from '@/hooks/useCodeIntepreterResults'
import md5 from 'md5'
import {
  Loader,
} from 'lucide-react'

export interface Props {
  code: string
}

function CodeBlock({
  code,
}: Props) {
  const hash = md5(code.trim())
  const { stdout, stderr, isLoading } = useCodeInterpreterResults(hash)

  return (
    <div className="w-full flex flex-col items-start gap-4 mb-4 py-4 border-b">

      <div className="w-full flex flex-col items-start rounded border p-2 space-y-4 border border-zinc-300 bg-zinc-100 whitespace-pre-line text-sm">
        <div className="flex items-center justify-center gap-1">
          <span className="text-zinc-400 text-xs">Code</span>
        </div>
        <pre
          className="font-mono text-zinc-800 overflow-x-auto max-w-full"
        >
          {code}
        </pre>
      </div>

      <div className="w-full flex flex-col items-start rounded border p-2 space-y-4 border border-zinc-300 bg-zinc-100 whitespace-pre-line text-sm">
        <div className="flex items-center justify-center gap-1">
          <span className="text-zinc-400 text-xs">Output</span>
          {isLoading && <Loader className="animate-spin text-zinc-500" size={12} />}
        </div>
        {stdout && (
          <pre className="font-mono overflow-x-auto max-w-full">
            {stdout}
          </pre>
        )}
        {stderr && (
          <pre className="font-mono text-red-500 overflow-x-auto max-w-full">
            {stderr}
          </pre>
        )}
      </div>
    </div>
  )
}

export default CodeBlock
