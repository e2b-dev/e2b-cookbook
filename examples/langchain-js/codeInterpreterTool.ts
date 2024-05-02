import { Tool } from 'langchain/tools';
import { BaseMessage, ToolMessage } from 'langchain/schema';
import { ToolAgentAction } from 'langchain/agents';
import { CodeInterpreter } from '@e2b/code-interpreter'

// const LangchainCodeInterpreterToolInput = z.object({
//   code: z.string().describe("Python code to execute."),
// });

// type LangchainCodeInterpreterToolInput = z.infer<typeof LangchainCodeInterpreterToolInput>;

/**
 * This class calls arbitrary code against a Python Jupyter notebook.
 * It requires an E2B_API_KEY to create a sandbox.
 */
export class CodeInterpreterFunctionTool {
  toolName = "code_interpreter";

  static async create() {
    // Instantiate the E2B sandbox - this is a long lived object
    // that's pinging E2B cloud to keep the sandbox alive.
    if (!process.env.E2B_API_KEY) {
      throw new Error(
        "Code Interpreter tool called while E2B_API_KEY environment variable is not set. Please get your E2B api key here https://e2b.dev/docs and set the E2B_API_KEY environment variable."
      );
    }
    const codeInterpreter = new CodeInterpreter();
    return new CodeInterpreterFunctionTool(codeInterpreter);
  }

  constructor(private codeInterpreter: CodeInterpreter) { }

  async close() {
    await this.codeInterpreter.close();
  }

  async call(parameters: LangchainCodeInterpreterToolInput) {
    const code = parameters.code;
    console.log(`***Code Interpreting...\n${code}\n====`);
    const execution = await this.codeInterpreter.notebook.execCell(code);
    return {
      results: execution.results,
      stdout: execution.logs.stdout,
      stderr: execution.logs.stderr,
      error: execution.error,
    };
  }

  // langchain does not return a dict as a parameter, only a code string
  async langchain_call(code: string) {
    return this.call({ code });
  }

  to_langchain_tool(): Tool {
    const tool = new Tool({
      name: this.toolName,
      description:
        "Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error.",
      func: this.langchain_call.bind(this),
    });
    tool.args_schema = LangchainCodeInterpreterToolInput;
    return tool;
  }

  static format_to_tool_message(
    agent_action: ToolAgentAction,
    observation: Record<string, any>
  ): BaseMessage[] {
    /**
     * Format the output of the CodeInterpreter tool to be returned as a ToolMessage.
     */
    const new_messages = [...agent_action.message_log];

    // TODO: Add info about the results for the LLM
    const { results, ...restObservation } = observation;
    const content = JSON.stringify(restObservation, null, 2);
    new_messages.push(
      new ToolMessage({
        content,
        tool_call_id: agent_action.tool_call_id,
      })
    );

    return new_messages;
  }
}
