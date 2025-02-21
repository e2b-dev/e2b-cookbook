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

    const agent = createAgent({
      name: "Coding Agent",
      description: "An expert coding agent",
      system: `You are a coding agent help the user to achieve the described task.

    When running commands, keep in mind that the terminal is non-interactive, remind to use the '-y' flag when running commands.

    Once the task completed, you should return the following information:
    <task_summary>
    </task_summary>

    Think step-by-step before you start the task.
    `,
      model: anthropic({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 4096,
      }),
      tools: [
        // terminal use
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
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
                    // console.log("terminal stdout >", data);
                    buffers.stdout += data;
                  },
                  onStderr: (data: string) => {
                    // console.log("terminal stderr >", data);
                    buffers.stderr += data;
                  },
                });
                return result.stdout;
              } catch (e) {
                console.error(
                  `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
                );
                return `Command failed: ${e} \nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
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
          description: "Read files from the sandbox",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { network, step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const contents = [];
                for (const file of files) {
                  const content = await sandbox.files.read(file);
                  contents.push({ path: file, content });
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
          description: "Run the code in the sandbox",
          parameters: z.object({
            code: z.string(),
          }),
          handler: async ({ code }, { network, step }) => {
            return await step?.run("runCode", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const result = await sandbox.runCode(code);

                return result.logs.stdout.join("\n");
              } catch (e) {
                return "Error: " + e;
              }
            });
          },
        }),
      ],
      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (lastAssistantMessageText) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network?.state.kv.set("task_summary", lastAssistantMessageText);
            }
          }

          return result;
        },
      },
    });

    const network = createNetwork({
      name: "coding-agent-network",
      agents: [agent],
      maxIter: 15,
      defaultRouter: async ({ network }) => {
        if (network?.state.kv.has("task_summary")) {
          return;
        }

        return agent;
      },
    });
    const result = await network.run(event.data.input);

    await step.run("download-artifact", async () => {
      console.log("------------------------------------");
      console.log("Downloading artifact...");
      const sandbox = await getSandbox(sandboxId);
      await sandbox.commands.run(
        "touch artifact.tar.gz && tar --exclude=artifact.tar.gz --exclude=node_modules --exclude=.npm --exclude=.env --exclude=.bashrc --exclude=.profile  --exclude=.bash_logout --exclude=.env* -zcvf artifact.tar.gz ."
      );
      const artifact = await sandbox.files.read("artifact.tar.gz", {
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
