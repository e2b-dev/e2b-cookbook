import os
from dotenv import load_dotenv
from anthropic import Anthropic
from e2b_code_interpreter import Sandbox

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
E2B_API_KEY = os.getenv("E2B_API_KEY")

MODEL_NAME = "claude-sonnet-4-5-20250929"

SYSTEM_PROMPT = """
## your job & context
you are a python data scientist. you are given tasks to complete and you run python code to solve them.
- the python code runs in jupyter notebook.
- every time you call `execute_python` tool, the python code is executed in a separate cell. it's okay to multiple calls to `execute_python`.
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
- you can run any python code you want, everything is running in a secure sandbox environment.

## style guide
tool response values that have text inside "[]"  mean that a visual element got rendered in the notebook. for example:
- "[chart]" means that a chart was generated in the notebook.
"""

tools = [
    {
        "name": "execute_python",
        "description": "Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The python code to execute in a single cell."
                }
            },
            "required": ["code"]
        }
    }
]


def code_interpret(e2b_code_interpreter, code):
    print("Running code interpreter...")
    exec_result = e2b_code_interpreter.run_code(
        code,
        on_stderr=lambda stderr: print("[Code Interpreter stderr]", stderr),
        on_stdout=lambda stdout: print("[Code Interpreter stdout]", stdout)
    )

    if exec_result.error:
        print("[Code Interpreter ERROR]", exec_result.error)
        return []
    else:
        return exec_result.results


client = Anthropic(api_key=ANTHROPIC_API_KEY)


def process_tool_call(e2b_code_interpreter, tool_name, tool_input):
    if tool_name == "execute_python":
        return code_interpret(e2b_code_interpreter, tool_input["code"])
    return []


def chat_with_claude(e2b_code_interpreter, user_message):
    print(f"\n{'='*50}\nUser Message: {user_message}\n{'='*50}")

    messages = [{"role": "user", "content": user_message}]
    all_results = []

    while True:
        print("Waiting for Claude to respond...")
        message = client.messages.create(
            model=MODEL_NAME,
            system=SYSTEM_PROMPT,
            max_tokens=4096,
            messages=messages,
            tools=tools,
        )

        print(f"\nResponse:\nStop Reason: {message.stop_reason}")

        if message.stop_reason == "tool_use":
            tool_use = next((block for block in message.content if block.type == "tool_use"), None)
            if not tool_use:
                print("No tool use block found")
                break

            tool_name = tool_use.name
            tool_input = tool_use.input

            print(f"\nTool Used: {tool_name}")
            print(f"Tool Input: {tool_input}")

            code_interpreter_results = process_tool_call(e2b_code_interpreter, tool_name, tool_input)
            print(f"Tool Result: {len(code_interpreter_results)} results")
            all_results.extend(code_interpreter_results)

            # Add assistant message and tool result to conversation
            messages.append({"role": "assistant", "content": message.content})
            messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": str(code_interpreter_results)
                }]
            })

            # Continue loop to get next response from Claude
        else:
            # Conversation ended
            print("Conversation ended")
            break

    return all_results


def main():
    with Sandbox(api_key=E2B_API_KEY) as code_interpreter:
        code_interpreter_results = chat_with_claude(
            code_interpreter,
            "Calculate value of pi using monte carlo method. Use 1000 iterations. Visualize all point of all iterations on a single plot, a point inside the unit circle should be orange, other points should be grey.",
        )

        print(f"\nResults: {len(code_interpreter_results)} results")

        if code_interpreter_results:
            result = code_interpreter_results[0]
            print(f"First result: {result}")

            # Save image if available
            if hasattr(result, 'png') and result.png:
                import base64
                with open('output.png', 'wb') as f:
                    f.write(base64.b64decode(result.png))
                print("Image saved to output.png")


if __name__ == "__main__":
    main()
