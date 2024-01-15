import React, { FC, Fragment, memo, useContext, useState } from 'react'
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CodeBlock } from "./codeblock";
import { Loader2 } from 'lucide-react'
import { CodeResultsContext } from '@/app/providers/CodeResults'
import { CodeResults } from '@/app/components/ui/chat/chat.interface'
import { ReactElement, ReactMarkdownOptions } from 'react-markdown/lib/react-markdown'
import { useInterval } from '@/app/hooks/useIntervals'
import { updateCodeResults } from '@/app/utils/updateCodeResults'
import { ChatIDContext } from '@/app/providers/ChatID'

function ReactMarkdownWithCR(options: ReactMarkdownOptions & {codeResults: CodeResults}): ReactElement {
  return <ReactMarkdown {...options}>
    {options.children}
  </ReactMarkdown>
}

const MemoizedReactMarkdown: FC<Options & {codeResults: CodeResults}> = memo(
  ReactMarkdownWithCR,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className &&
    prevProps.codeResults === nextProps.codeResults,
);



function CodeResult({ codeID, codeResult }: { codeID: string | undefined, codeResult: string | undefined }) {
  if (!codeID) return null

  if (codeResult === undefined) {
    return <div className="text-xs text-gray-500">
      <span>Executing code ID: {codeID}</span>
      <Loader2 className="h-4 w-4 animate-spin"/>
    </div>
  }

  return <div className="flex flex-col w-full justify-between">
                    <span>Result for Code ID: {codeID}</span>
                    <code className="border-2 border-r-2">{codeResult}</code>
                  </div>

}

export default function Markdown({ content }: { content: string }) {
  const {codeResults, setCodeResults} = useContext(CodeResultsContext);
  const chatID = useContext(ChatIDContext)

  return (
    <MemoizedReactMarkdown
      className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 break-words"
      remarkPlugins={[remarkGfm, remarkMath]}
      codeResults={codeResults}
      components={{
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        code({ node, inline, className, children, ...props }) {
          const [delay, setDelay] = useState<number | null>(1000)

          let codeID: string | undefined
          let codeResult = undefined
          if (node.data?.meta) {
            if ((node.data?.meta as string).endsWith("}")) {
              try {
                const data =JSON.parse(node.data?.meta as string)
                codeID = data.id as string
                codeResult = codeResults[codeID]

                if (codeResult === undefined) {
                  useInterval(() => {
                    // This is polling, no need to await
                    // @ts-ignore
                    updateCodeResults(chatID, codeID as string, setCodeResults, setDelay, delay)
                  }, delay)
                }
              } catch (e) {
                console.error(e);
              }
            }
          }

          if (children.length) {
            if (children[0] == "▍") {
              return (
                <span className="mt-1 animate-pulse cursor-default">▍</span>
              );
            }

            children[0] = (children[0] as string).replace("`▍`", "▍");
          }

          const match = /language-(\w+)/.exec(className || "");

          if (inline) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }

          return (
            <Fragment key={codeID}>
              <CodeBlock
                language={(match && match[1]) || ""}
                value={String(children).replace(/\n$/, "")}
                {...props}
              />
              <CodeResult codeResult={codeResult} codeID={codeID}/>
            </Fragment>
          );
        },
      }}
    >
      {content}
    </MemoizedReactMarkdown>
  );
}
