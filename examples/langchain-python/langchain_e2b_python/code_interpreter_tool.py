import os
import json
import agentops
from dotenv import load_dotenv

from typing import Any, List
from langchain_core.tools import Tool
from pydantic.v1 import BaseModel, Field
from e2b_code_interpreter import CodeInterpreter
from langchain_core.messages import BaseMessage, ToolMessage
from langchain.agents.output_parsers.tools import (
    ToolAgentAction,
)

# Load environment variables
load_dotenv()

# Initialize AgentOps
agentops.init(os.getenv('AGENTOPS_API_KEY'))

class LangchainCodeInterpreterToolInput(BaseModel):
    code: str = Field(description="Python code to execute.")

class CodeInterpreterFunctionTool:
    """
    This class calls arbitrary code against a Python Jupyter notebook.
    It requires an E2B_API_KEY to create a sandbox.
    """

    tool_name: str = "code_interpreter"

    @agentops.record_function('CodeInterpreterFunctionTool_init')
    def __init__(self):
        # Instantiate the E2B sandbox - this is a long lived object
        # that's pinging E2B cloud to keep the sandbox alive.
        if "E2B_API_KEY" not in os.environ:
            raise Exception(
                "Code Interpreter tool called while E2B_API_KEY environment variable is not set. Please get your E2B api key here https://e2b.dev/docs and set the E2B_API_KEY environment variable."
            )
        self.code_interpreter = CodeInterpreter()

    @agentops.record_function('CodeInterpreterFunctionTool_close')
    def close(self):
        self.code_interpreter.close()

    @agentops.record_function('CodeInterpreterFunctionTool_call')
    def call(self, parameters: dict, **kwargs: Any):
        code = parameters.get("code", "")
        print(f"***Code Interpreting...\n{code}\n====")
        
        with agentops.record_span('code_execution'):
            execution = self.code_interpreter.notebook.exec_cell(code)
        
        # Record metrics
        agentops.record_metric('code_execution_success', 1 if not execution.error else 0)
        agentops.record_metric('code_execution_time', execution.duration)
        
        return {
            "results": execution.results,
            "stdout": execution.logs.stdout,
            "stderr": execution.logs.stderr,
            "error": execution.error,
        }

    @agentops.record_function('CodeInterpreterFunctionTool_langchain_call')
    def langchain_call(self, code: str):
        return self.call({"code": code})

    @agentops.record_function('CodeInterpreterFunctionTool_to_langchain_tool')
    def to_langchain_tool(self) -> Tool:
        tool = Tool(
            name=self.tool_name,
            description="Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error.",
            func=self.langchain_call,
        )
        tool.args_schema = LangchainCodeInterpreterToolInput
        return tool

    @staticmethod
    @agentops.record_function('CodeInterpreterFunctionTool_format_to_tool_message')
    def format_to_tool_message(
        agent_action: ToolAgentAction,
        observation: dict,
    ) -> List[BaseMessage]:
        """
        Format the output of the CodeInterpreter tool to be returned as a ToolMessage.
        """
        new_messages = list(agent_action.message_log)

        # TODO: Add info about the results for the LLM
        content = json.dumps(
            {k: v for k, v in observation.items() if k not in ("results")}, indent=2
        )
        new_messages.append(
            ToolMessage(content=content, tool_call_id=agent_action.tool_call_id)
        )

        # Record metric for message count
        agentops.record_metric('tool_message_count', len(new_messages))

        return new_messages

# End of program
agentops.end_session('Success')