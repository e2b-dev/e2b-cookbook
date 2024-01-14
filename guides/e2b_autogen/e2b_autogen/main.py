import json
from typing import Optional
import uuid

# Import E2B
from e2b import Sandbox

# Import autogen
from autogen import AssistantAgent, UserProxyAgent, config_list_from_json

# load .env
from dotenv import load_dotenv

load_dotenv()

# Get your Sandbox session
sandbox = Sandbox(template="base")


# mock autogen execute_code function with e2b equivalent
# To run locally: from autogen.code_utils import execute_code
def execute_code(code: Optional[str] = None,
                 timeout: Optional[int] = None,
                 filename: Optional[str] = None,
                 work_dir: Optional[str] = "/home/user",  # default to e2b default cwd
                 # use_docker: Optional[Union[List[str], str, bool]] = None,  # N/A we're using e2b
                 lang: Optional[str] = "python"):
    if lang == "node":
        binary = "node"
    elif lang == "python":
        binary = "python3"
    else:
        raise ValueError(f"Unsupported runtime {lang}")

    if filename is None:
        # generate a random filename
        filename = f"{work_dir}/{str(uuid.uuid4())}.py"

    if code is not None:
        sandbox.filesystem.write(filename, code)

    proc = sandbox.process.start(
        f"{binary} {filename}",
        cwd=work_dir,
    )

    proc.wait(timeout)

    # https://microsoft.github.io/autogen/docs/reference/code_utils/#execute_code
    return [proc.exit_code, proc.stderr if proc.exit_code > 0 else proc.stdout]


config_list = config_list_from_json(
    "OAI_CONFIG_LIST",
    filter_dict={
        # Function calling with GPT 3.5
        "model": ["gpt-3.5-turbo-16k-0613"],

        # Uncomment to use gpt-4 turbo
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
                        "description": "JSON schema of arguments encoded as a string. For example: { \"url\": { \"type\": \"string\", \"description\": \"The URL\", }}",
                    },
                    "packages": {
                        "type": "string",
                        "description": "A list of package names imported by the function, and that need to be installed with pip prior to invoking the function. This solves ModuleNotFoundError.",
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
    json_args = json.loads(arguments)
    function_config = {
        "name": name,
        "description": description,
        "parameters": {"type": "object", "properties": json_args},
        # TODO Make all arguments required
        "required": ["url"],
    }
    llm_config["functions"] = llm_config["functions"] + [function_config]
    user_proxy.register_function(function_map={name: lambda **args: execute_func(name, packages, code, **args)})
    assistant.update_function_signature(function_config, is_remove=False)
    return f"A function has been added to the context of this conversation.\nDescription: {description}"


def execute_func(name, packages, code, **args):
    pip_install = (
        f"""print("Installing package: {packages}")\nsubprocess.run(["pip", "-qq", "install", "{packages}"])"""
        if packages
        else ""
    )
    str = f"""
import subprocess
{pip_install}
print("Result of {name} function execution:")
{code}
args={args}
result={name}(**args)
if result is not None: print(result)
"""
    print(f"execute_code:\n{str}")
    result = execute_code(str, timeout=120)[1]
    print(f"Result: {result}")
    return result


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
    user_proxy.initiate_chat(
        assistant, message="What functions do you know about?")

    user_proxy.initiate_chat(
        assistant, message="Define a function that gets a URL, then prints the response body.\nReply TERMINATE when the function is defined.")

    user_proxy.initiate_chat(
        assistant, message="List functions do you know about.")

    user_proxy.initiate_chat(
        assistant, message="Print the response body of https://api.costly.ai/v1/\nUse the functions you know about.")


    # Close the sandbox once done
    sandbox.close()