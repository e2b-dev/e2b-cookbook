import { FC, memo, useState } from 'react'
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CodeBlock } from "./codeblock";
import { CodeBlocks } from '@/app/components/ui/chat/chat.interface'
import { Loader2 } from 'lucide-react'

const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className,
);


export default function Markdown({ content, codeBlocks }: { content: string, codeBlocks: CodeBlocks }) {
  return (
    <MemoizedReactMarkdown
      className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 break-words"
      remarkPlugins={[remarkGfm, remarkMath]}
      components={{
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        code({ node, inline, className, children, ...props }) {
          let codeBlock = undefined
          if (node.data?.meta) {
            if ((node.data?.meta as string).endsWith("}")) {
              try {
                const x =JSON.parse(node.data?.meta as string)
                codeBlock =  x.id
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
            <>
              <CodeBlock
                key={Math.random()}
                language={(match && match[1]) || ""}
                value={String(children).replace(/\n$/, "")}
                {...props}
              />
              {codeBlock && <div className="text-xs text-gray-500">
                <span>Executing code ID: {codeBlock}</span>
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>}
            </>
          );
        },
      }}
    >
      {content}
    </MemoizedReactMarkdown>
  );
}
