import os
import json

from typing import Any, List
from langchain_core.tools import Tool
from pydantic.v1 import BaseModel, Field
from e2b_code_interpreter import CodeInterpreter
from langchain_core.messages import BaseMessage, ToolMessage
from langchain.agents.output_parsers.tools import (
    ToolAgentAction,
)

from crewai_tools import BaseTool

class LangchainCodeInterpreterToolInput(BaseModel):
    code: str = Field(description="Python code to execute.")


class CodeInterpreterFunctionTool:
    """
    This class calls arbitrary code against a Python Jupyter notebook.
    It requires an E2B_API_KEY to create a sandbox.
    """

    tool_name: str = "code_interpreter"

    def __init__(self):
        # Instantiate the E2B sandbox - this is a long lived object
        # that's pinging E2B cloud to keep the sandbox alive.
        if "E2B_API_KEY" not in os.environ:
            raise Exception(
                "Code Interpreter tool called while E2B_API_KEY environment variable is not set. Please get your E2B api key here https://e2b.dev/docs and set the E2B_API_KEY environment variable."
            )
        self.code_interpreter = CodeInterpreter()

    def close(self):
        self.code_interpreter.close()

    def call(self, parameters: dict, **kwargs: Any):
        code = parameters.get("code", "")
        print(f"***Code Interpreting...\n{code}\n====")
        execution = self.code_interpreter.notebook.exec_cell(code)
        return {
            "results": execution.results,
            "stdout": execution.logs.stdout,
            "stderr": execution.logs.stderr,
            "error": execution.error,
        }

    # langchain does not return a dict as a parameter, only a code string
    def langchain_call(self, code: str):
        return self.call({"code": code})

    def to_langchain_tool(self) -> Tool:
        tool = Tool(
            name=self.tool_name,
            description="Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error.",
            func=self.langchain_call,
        )
        tool.args_schema = LangchainCodeInterpreterToolInput
        return tool

    @staticmethod
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

        return new_messages


class MyCustomTool(BaseTool):
    name: str = "code_interpreter"
    description: str = "Execute Python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error. Non-standard packages are by appending !pip install [packagenames] and the Python code in one single code block."
    _code_interpreter_tool: CodeInterpreterFunctionTool | None = None

    def __init__(self, *args, **kwargs):
        # Call the superclass's init method
        super().__init__(*args, **kwargs)
        # Initialize the code interpreter tool and store it in the instance
        self._code_interpreter_tool = CodeInterpreterFunctionTool()

    def _run(self, code: str) -> str:
        # Delegate the execution to the CodeInterpreterFunctionTool's langchain_call
        result = self._code_interpreter_tool.langchain_call(code)
        content = json.dumps(
            {
                k: [str(item) for item in v] if k == "results" else v
                for k, v in result.items()
            },
            indent=2
        )
        return content

    def close(self):
        # Close the interpreter tool when done
        self._code_interpreter_tool.close()
