import hljs from 'highlight.js'
import { useCodeInterpreter } from '@/hooks/useCodeIntepreter'
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
  console.log('hash', hash)
  const { stdout, stderr, isLoading } = useCodeInterpreter(hash)
  return (
    <div className="w-full flex flex-col items-start gap-4">
      <div className="w-full flex flex-col items-start rounded border p-2 space-y-4 border border-zinc-300 bg-zinc-100 whitespace-pre-line text-sm">
        <div className="flex items-center justify-center gap-1">
          <span className="text-zinc-400 text-xs">Code</span>
        </div>
        <pre
          className="font-mono text-zinc-800"
        >
          {code}
        </pre>

      </div>

      <div className="w-full flex flex-col items-start rounded border p-2 space-y-4 border border-zinc-300 bg-zinc-100 whitespace-pre-line text-sm">
        <div className="flex items-center justify-center gap-1">
          <span className="text-zinc-400 text-xs">Output</span>
          {isLoading && <Loader className="animate-spin text-zinc-500" size={12} />}
        </div>
        <pre className="font-mono">
          {stdout}
        </pre>
      </div>
    </div>
  )
}

export default CodeBlock
