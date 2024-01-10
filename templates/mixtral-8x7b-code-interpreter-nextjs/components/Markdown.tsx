import { FC, memo } from 'react'
import ReactMarkdown, { Options, Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import CodeBlock from '@/components/CodeBlock'

export interface Props {
  markdown: string
}

const components: Partial<Components> = {
  code({ node, className, children, ...props }) {
    const isInline = node?.position?.start.line === node?.position?.end.line
    if (isInline) {
      return (
        <code>{children}</code>
      )
    }
    return (
      <CodeBlock
        code={children as string}
      />
    )
  }
}

export const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className
)


export function Markdown({
  markdown,
}: Props) {
  return (
    <MemoizedReactMarkdown
      className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
      remarkPlugins={[remarkGfm, remarkMath]}
      components={components}
    >
      {markdown}
    </MemoizedReactMarkdown>
  )
}