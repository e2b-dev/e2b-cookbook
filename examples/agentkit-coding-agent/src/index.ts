/* eslint-disable */
import "dotenv/config";

import fs from "fs";
import { z } from "zod";
import { Inngest } from "inngest";
import {
  createAgent,
  createNetwork,
  createTool,
  anthropic,
} from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";

import { getSandbox, lastAssistantTextMessageContent } from "./utils.js";
import { Sandbox } from "@e2b/code-interpreter";
import {
  truncateText,
  truncateCommandOutput,
  estimateTokens,
  summarizeConversation,
  CONTEXT_CONFIG,
  isValidClaudeModel,
  getModelErrorMessage,
} from "./contextManager.js";

const inngest = new Inngest({ id: "agentkit-coding-agent" });

const agentFunction = inngest.createFunction(
  {
    id: "Coding Agent",
  },
  { event: "coding-agent/run" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create();
      return sandbox.sandboxId;
    });

    // Validate model configuration
    const modelName = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
    if (!isValidClaudeModel(modelName)) {
      throw new Error(getModelErrorMessage(modelName));
    }
    console.log(`[Model] Using Claude model: ${modelName}`);

    const agent = createAgent({
      name: "Coding Agent",
      description: "An expert coding agent",
      system: `You are a coding agent that helps users achieve their described tasks efficiently.

IMPORTANT - Token Efficiency Guidelines:
- You operate under a token budget. Be concise and strategic.
- Only read files when absolutely necessary. If you need info from a file, read just that file.
- Avoid commands that produce excessive output (e.g., 'npm install' verbose logs, large directory listings).
- When you receive tool outputs, you don't need to repeat or summarize them back - just use the information.
- Focus on actionable steps rather than verbose explanations.
- Tool outputs may be truncated for efficiency - this is normal and expected.

Task Execution:
- Think step-by-step before starting.
- The terminal is non-interactive - always use '-y' flag for commands requiring confirmation.
- Once the task is completed, return:
<task_summary>
Brief summary of what was accomplished
</task_summary>
`,
      model: anthropic({
        model: modelName,
        defaultParameters: {
          max_tokens: 4096,
        },
      }),
      tools: [
        // terminal use
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands. Outputs may be truncated for token efficiency.",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { network, step }) => {
            return await step?.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };

              try {
                const sandbox = await getSandbox(sandboxId);
                const result = await sandbox.commands.run(command, {
                  onStdout: (data: string) => {
                    buffers.stdout += data;
                  },
                  onStderr: (data: string) => {
                    buffers.stderr += data;
                  },
                });

                // Truncate output for token efficiency
                const output = truncateCommandOutput(
                  result.stdout,
                  buffers.stderr,
                  CONTEXT_CONFIG.MAX_TERMINAL_OUTPUT
                );

                return output;
              } catch (e) {
                console.error(
                  `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
                );

                // Truncate error output too
                const errorOutput = truncateCommandOutput(
                  buffers.stdout,
                  buffers.stderr,
                  CONTEXT_CONFIG.MAX_TERMINAL_OUTPUT
                );

                return `Command failed: ${e}\n\n${errorOutput}`;
              }
            });
          },
        }),
        // create or update file
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sandbox",
          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              })
            ),
          }),
          handler: async ({ files }, { network, step }) => {
            return await step?.run("createOrUpdateFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                console.log(sandbox.sandboxId)
                for (const file of files) {
                  await sandbox.files.write(file.path, file.content);
                }
                return `Files created or updated: ${files
                  .map((f) => f.path)
                  .join(", ")}`;
              } catch (e) {
                return "Error: " + e;
              }
            });
          },
        }),
        // read files
        createTool({
          name: "readFiles",
          description: "Read files from the sandbox. File contents may be truncated for token efficiency. Read only necessary files.",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { network, step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const contents = [];
                let totalLength = 0;

                for (const file of files) {
                  let content = await sandbox.files.read(file);

                  // Truncate individual files if too large
                  if (content.length > CONTEXT_CONFIG.MAX_FILE_CONTENT) {
                    content = truncateText(content, CONTEXT_CONFIG.MAX_FILE_CONTENT);
                  }

                  contents.push({ path: file, content });
                  totalLength += content.length;

                  // Stop if total content is getting too large
                  if (totalLength > CONTEXT_CONFIG.MAX_TOTAL_FILE_CONTENT) {
                    contents.push({
                      path: "[truncated]",
                      content: `Remaining ${files.length - contents.length} files not read due to token limits. Read files individually if needed.`
                    });
                    break;
                  }
                }

                return JSON.stringify(contents);
              } catch (e) {
                return "Error: " + e;
              }
            });
          },
        }),
        // run code
        createTool({
          name: "runCode",
          description: "Run the code in the sandbox. Output may be truncated for token efficiency.",
          parameters: z.object({
            code: z.string(),
          }),
          handler: async ({ code }, { network, step }) => {
            return await step?.run("runCode", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const result = await sandbox.runCode(code);

                const output = result.logs.stdout.join("\n");

                // Truncate if output is too large
                if (output.length > CONTEXT_CONFIG.MAX_CODE_OUTPUT) {
                  return truncateText(output, CONTEXT_CONFIG.MAX_CODE_OUTPUT);
                }

                return output;
              } catch (e) {
                return "Error: " + e;
              }
            });
          },
        }),
      ],
      lifecycle: {
        onResponse: async ({ result, network }) => {
          // Check for task completion
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (lastAssistantMessageText) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network?.state.kv.set("task_summary", lastAssistantMessageText);
            }
          }

          // Monitor conversation length
          const conversationTokens = result.output.reduce((sum, msg: any) => {
            const content = msg.content
              ? typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content)
              : "";
            return sum + estimateTokens(content);
          }, 0);

          console.log(`[Context Manager] Conversation at ~${conversationTokens} tokens`);

          // Warning if approaching limit
          if (conversationTokens > CONTEXT_CONFIG.CONVERSATION_TOKEN_LIMIT) {
            console.warn(
              `[Context Manager] WARNING: Approaching token limit (${conversationTokens}/${CONTEXT_CONFIG.HARD_TOKEN_LIMIT})`
            );
          }

          // Attempt to summarize if we're getting too close to hard limit
          if (conversationTokens > CONTEXT_CONFIG.HARD_TOKEN_LIMIT) {
            console.log("[Context Manager] Attempting to summarize conversation...");
            const { messages: summarizedMessages, wasSummarized } = summarizeConversation(
              result.output,
              CONTEXT_CONFIG.HARD_TOKEN_LIMIT,
              CONTEXT_CONFIG.KEEP_RECENT_MESSAGES
            );

            if (wasSummarized) {
              console.log(
                `[Context Manager] Summarized conversation: ${result.output.length} → ${summarizedMessages.length} messages`
              );
              result.output = summarizedMessages;
            }
          }

          return result;
        },
      },
    });

    const network = createNetwork({
      name: "coding-agent-network",
      agents: [agent],
      maxIter: 20, // Increased since we now manage token limits better
      defaultRouter: async ({ network }) => {
        if (network?.state.kv.has("task_summary")) {
          return;
        }

        return agent;
      },
    });

    // Run the agent with error handling
    let result;
    try {
      result = await network.run(event.data.input);
    } catch (error: any) {
      // Provide better error messages for common API errors
      if (error?.message?.includes("prompt is too long")) {
        const match = error.message.match(/(\d+) tokens > (\d+) maximum/);
        if (match) {
          throw new Error(
            `Context window exceeded: ${match[1]} tokens > ${match[2]} maximum.\n` +
            `This shouldn't happen with context management enabled. Please check:\n` +
            `1. Tool outputs might be unusually large\n` +
            `2. Context management settings in contextManager.ts\n` +
            `3. Consider reducing CONTEXT_CONFIG.HARD_TOKEN_LIMIT`
          );
        }
      }

      if (error?.message?.includes("model") || error?.type === "invalid_request_error") {
        throw new Error(
          `API Error: ${error.message}\n\n` +
          `If this is a model-related error, check that your model name is correct.\n` +
          `Current model: ${modelName}\n\n` +
          getModelErrorMessage(modelName)
        );
      }

      // Re-throw with context
      throw new Error(`Agent execution failed: ${error.message || error}`);
    }

    await step.run("download-artifact", async () => {
      console.log("------------------------------------");
      console.log("Downloading artifact...");
      const sandbox = await getSandbox(sandboxId);
      await sandbox.commands.run(
        "cd /tmp/todolist-demo/ && touch artifact.tar.gz && tar --exclude=artifact.tar.gz --exclude=node_modules --exclude=.npm --exclude=.env --exclude=.bashrc --exclude=.profile  --exclude=.bash_logout --exclude=.env* -zcvf artifact.tar.gz ."
      );
      const artifact = await sandbox.files.read("/tmp/todolist-demo/artifact.tar.gz", {
        format: "blob",
      });
      const localFileName = `artifact-${new Date().toISOString()}.tar.gz`;
      // convert blob to arraybuffer
      const arrayBuffer = await artifact.arrayBuffer();
      fs.writeFileSync(localFileName, Buffer.from(arrayBuffer));
      console.log(`Artifact downloaded in ${localFileName}`);
      console.log(
        `Extract artifact by running: \`mkdir artifact && tar -xvzf ${localFileName} -C artifact\``
      );
      console.log("------------------------------------");

      await sandbox.kill();
    });

    return result.state.kv.get("task_summary");
  }
);

const server = createServer({
  functions: [agentFunction],
});

server.listen(3000, () => {
  console.log("AgentKit server is running on port 3000");
});
