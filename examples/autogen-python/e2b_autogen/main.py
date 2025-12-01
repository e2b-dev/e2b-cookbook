import json
import logging

from hashlib import md5
from typing import Optional

# Import E2B
from e2b_code_interpreter import Sandbox

# Import autogen
from autogen import AssistantAgent, UserProxyAgent, config_list_from_json

# load .env
from dotenv import load_dotenv

load_dotenv()

# Suppress verbose HTTP logs from external libraries
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logging.getLogger('openai').setLevel(logging.WARNING)
logging.getLogger('e2b').setLevel(logging.WARNING)

# Get your Sandbox session
sandbox = Sandbox.create()


config_list = config_list_from_json(
    "OAI_CONFIG_LIST",
    filter_dict={
        # Function calling with GPT 3.5 - cheaper/faster but less accurate
        "model": ["gpt-3.5-turbo"],

        # "model": ["gpt-4-1106-preview"],
    },
)

llm_config = {
    "functions": [
        {
            "name": "define_function",
            "description": "Define a function to add to the context of the conversation. Necessary Python packages must be declared. Once defined, the assistant may decide to use this function, respond with a normal message.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The name of the function to define.",
                    },
                    "description": {
                        "type": "string",
                        "description": "A short description of the function.",
                    },
                    "arguments": {
                        "type": "string",
                        "description": "JSON schema of arguments encoded as a string. For example: { \"url\": { \"type\": \"string\", \"description\": \"The URL\" }}. For arrays, include 'items': { \"url\": { \"type\": \"array\", \"items\": { \"type\": \"number\" }, \"description\": \"Array of numbers\" }}",
                    },
                    "packages": {
                        "type": "string",
                        "description": "A list of space separated package names imported by the function, and that need to be installed with pip prior to invoking the function, for example `requests`. This solves ModuleNotFoundError.",
                    },
                    "code": {
                        "type": "string",
                        "description": "The implementation in Python. Do not include the function declaration.",
                    },
                },
                "required": ["name", "description", "arguments", "packages", "code"],
            },
        },
    ],
    "config_list": config_list,
}

def define_function(name, description, arguments, packages, code):
    # Handle both JSON with double quotes and Python dict with single quotes
    try:
        json_args = json.loads(arguments)
    except json.JSONDecodeError:
        # If JSON parsing fails, try replacing single quotes with double quotes
        arguments_fixed = arguments.replace("'", '"')
        json_args = json.loads(arguments_fixed)

    # Fix array types that are missing 'items' field
    for _, arg_schema in json_args.items():
        if arg_schema.get("type") == "array" and "items" not in arg_schema:
            # Add default items schema for arrays (assuming number type)
            arg_schema["items"] = {"type": "number"}

    function_config = {
        "name": name,
        "description": description,
        "parameters": {"type": "object", "properties": json_args},
        "required": list(json_args.keys()),
    }
    llm_config["functions"] = llm_config["functions"] + [function_config]
    user_proxy.register_function(function_map={name: lambda **args: execute_func(name, packages, code, **args)})
    assistant.update_function_signature(function_config, is_remove=False)
    return f"A function has been added to the context of this conversation.\nDescription: {description}"


def execute_func(name, packages, code, **args):
    code_str = f"""
{code}
args={args}
result={name}(**args)
if result is not None: print(result)
"""

    # Install packages if needed (skip empty string, "-", or None)
    if packages and packages not in ["", "-"]:
        exec_result = sandbox.run_code(f"!pip install -qq {packages}")
        if exec_result.error:
            return f"Error installing packages: {exec_result.error}"

    # Execute the code
    exec_result = sandbox.run_code(code_str)

    if exec_result.error:
        return f"Error: {exec_result.error}"

    # Get stdout from logs (this contains the result)
    output = ""
    for row in exec_result.logs.stdout:
        output += row

    # Check stderr for any warnings
    if exec_result.logs.stderr:
        for row in exec_result.logs.stderr:
            output += row

    return output if output else str(exec_result.results)


def _is_termination_msg(message):
    """Check if a message is a termination message."""
    if isinstance(message, dict):
        message = message.get("content")
        if message is None:
            return False
        return message.rstrip().endswith("TERMINATE")


assistant = AssistantAgent(
    name="chatbot",
    system_message="""You are an assistant.
        The user will ask a question.
        You may use the provided functions before providing a final answer.
        Only use the functions you were provided.
        The "arguments" field must be STRICT valid JSON.
        Always wrap keys and strings in double quotes.
        Never use single quotes.
        Never omit quotes around keys.
        When the answer has been provided, reply TERMINATE.""",
    llm_config=llm_config,
)

user_proxy = UserProxyAgent(
    "user_proxy",
    code_execution_config=False,
    is_termination_msg=_is_termination_msg,
    default_auto_reply="Reply TERMINATE when the initial request has been fulfilled.",
    human_input_mode="NEVER",
)


user_proxy.register_function(
    function_map={
        "define_function": define_function
    }
)

def main():
    while True:
        message = input("What task would you like executed?\n\n> ")
        print("\n")
        if message in ["exit", "TERMINATE"]:
            print("Exiting...")
            sandbox.kill()
            break

        user_proxy.initiate_chat(
            assistant, message=message)

def demo():
    user_proxy.initiate_chat(
        assistant,
        message="Define a function called 'fetch_url' that takes a URL as a parameter, fetches the URL using the requests library, and returns the response body as text. Reply TERMINATE when done.",
        max_turns=3)

    user_proxy.initiate_chat(
        assistant,
        message="Use the fetch_url function to get the response from https://echo.free.beeceptor.com/. Reply TERMINATE when done.",
        max_turns=5)

    user_proxy.initiate_chat( 
        assistant, 
        message="Define a function called 'calculate_sum' that takes an array of numbers and returns their sum. Reply TERMINATE when done.", 
        max_turns=3)
    
    user_proxy.initiate_chat( 
        assistant, 
        message="Use the calculate_sum function to add these numbers: [10, 20, 30, 40]. Reply TERMINATE when done.", 
        max_turns=5)
    
    # Close the sandbox once done
    sandbox.kill()