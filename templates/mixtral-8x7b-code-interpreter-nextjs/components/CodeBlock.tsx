interface CodeBlock {
  type: 'language-py' | 'language-sh'
  code: string
  out: { text: string, timestamp: number }[]
}

export interface Props {
  codeBlock: CodeBlock
}

function CodeBlock({ codeBlock }: Props) {
  return (
    <div className="w-full flex flex-col items-start rounded border p-2 space-y-4 border border-zinc-300 bg-zinc-100 whitespace-pre-line text-sm">
      {codeBlock.out.map((out) => (
        <div
          className="font-mono text-zinc-600"
          key={out.timestamp}
        >
          {out.text}
        </div>
      ))}
    </div>
  )
}

export default CodeBlock
