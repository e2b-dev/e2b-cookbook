
import json
from langchain_e2b_python.code_interpreter_tool import CodeInterpreterFunctionTool
from crewai_tools import BaseTool

class CodeInterpreterTool(BaseTool):
    """
    This is a wrapper around E2B's LangChain tool, adapted for CrewAI.
    It calls arbitrary code against a Python Jupyter notebook.
    It requires an E2B_API_KEY to create a sandbox.
    """
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
        # Because CrewAI expects a string as an output, convert the entire tool output to a JSON string.
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
