import os
import json

from typing import Any, List

from langchain_core.runnables.config import var_child_runnable_config
from langchain_core.tools import Tool
from pydantic.v1 import BaseModel, Field
from e2b_code_interpreter import CodeInterpreter
from langchain_core.messages import BaseMessage, ToolMessage
from langchain.agents.output_parsers.tools import ToolAgentAction


RECONNECT_TIMEOUT = 60 * 10  # 10 minutes


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

    @staticmethod
    def _get_sandbox(chat_id: str) -> CodeInterpreter:
        sandboxes = CodeInterpreter.list()
        for s in sandboxes:
            if s.metadata and s.metadata.get("CHAT_ID") == chat_id:
                sandbox = CodeInterpreter.reconnect(sandbox_id=s.sandbox_id)
                break
        else:
            sandbox = CodeInterpreter(metadata={"CHAT_ID": chat_id})

        sandbox.keep_alive(RECONNECT_TIMEOUT)
        return sandbox

    def call(self, code: str, chat_id: str, **kwargs: Any):
        print(f"***Code Interpreting...\n{code}\n====")
        code_interpreter = self._get_sandbox(chat_id)
        execution = code_interpreter.notebook.exec_cell(code, on_stdout=print, on_stderr=print)
        return {
            "results": execution.results,
            "stdout": execution.logs.stdout,
            "stderr": execution.logs.stderr,
            "error": execution.error,
        }

    # langchain does not return a dict as a parameter, only a code string
    def langchain_call(self, code: str):
        ctx = var_child_runnable_config.get()
        chat_id = ctx['configurable']["thread_id"]
        return self.call(code, chat_id)

    def to_langchain_tool(self) -> Tool:
        tool = Tool(
            name=self.tool_name,
            description="Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error. You have also have access to the internet",
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
