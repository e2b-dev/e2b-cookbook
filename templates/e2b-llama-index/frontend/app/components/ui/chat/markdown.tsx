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

  return <div className="flex flex-col my-4">
    <div className="flex h-12 w-full items-center justify-between bg-zinc-800 px-6 py-2 pr-4 text-zinc-100">
      <span className="text-xs lowercase">
        Result
      </span>
    </div>
    <div className="flex w-full space-x-2 bg-black text-white  p-2">
    {codeResult === undefined ? (
          <div className="flex flex-row space-x-4 p-2 pl-8 text-sm items-center">
            <span>Executing code...</span>
            <Loader2 className="h-4 w-4 animate-spin"/>
          </div>
        ) : (
          <code className="p-2 pl-8 text-sm">{codeResult}</code>
        )}
      </div>
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
          const [delay, setDelay] = useState<number | null>(2000)

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
