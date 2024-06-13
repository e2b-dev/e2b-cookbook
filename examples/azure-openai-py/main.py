import os
from openai import AzureOpenAI
import json # for function calling
import inspect # for checking correct arguments are provided to function


# Load config values
with open(r"config.json") as config_file:
    config_details = json.load(config_file)


client = AzureOpenAI(
  azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT"), 
  api_key=os.getenv("AZURE_OPENAI_API_KEY"),  
  api_version="2024-02-01"
)

model_name = config_details["MODEL_NAME"] # We need to ensure the version of the model you are using supports the function calling feature

# TEST FUNCTIONS

# This code calls the model with the user query and the set of functions defined in the functions parameter.
# The model then can choose if it calls a function. If a function is called, the content will be in a strigified JSON object.
# The function call that should be made and arguments are location in: response[choices][0][function_call].

# Define the functions to use


def get_function_call(messages, tool_choice="auto"):
    tools = [
        {
            "type": "function",
            "function": {
                "name": "execute_python",
                "description": "Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "The python code to execute in a single cell.",
                        },
                    },
                    "required": ["code"],
                },
            },
        },
    ]


    # Call the model with the user query (messages) and the functions defined in the functions parameter

    response = client.chat.completions.create(
        model=model_name,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
    )

    return response


# DEFINING FUNCTIONS IN CODE (here just code interpreter)

def code_interpret(e2b_code_interpreter, code):
  print("Running code interpreter...")
  exec = e2b_code_interpreter.notebook.exec_cell(
    code,
    on_stderr=lambda stderr: print("[Code Interpreter]", stderr),
    on_stdout=lambda stdout: print("[Code Interpreter]", stdout),
    # You can also stream code execution results
    # on_result=...
  )

  if exec.error:
    print("[Code Interpreter ERROR]", exec.error)
  else:
    return exec.results
  

# CHECKING THAT CORRECT ARGUMENTS ARE PROVIDED

def check_args(function, args):
    sig = inspect.signature(function)
    params = sig.parameters

    # Check if there are extra arguments
    for name in args:
        if name not in params:
            return False
    # Check if the required arguments are provided
    for name, param in params.items():
        if param.default is param.empty and name not in args:
            return False

    return True

# PUT EVERYTHING TOGETHER 
# TBD ADD CODE INTERPRETER

def run_conversation(messages, tools, available_functions):
    # Step 1: send the conversation and available functions to GPT
    response = client.chat.completions.create(
        model=model_name,
        messages=messages,
        tools=tools,
        tool_choice="auto",
    )

    response_message = response.choices[0].message

    # Step 2: check if GPT wanted to call a function
    if response_message.tool_calls:
        print("Recommended Function call:")
        print(response_message.tool_calls[0])
        print()

        # Step 3: call the function
        # Note: the JSON response may not always be valid; be sure to handle errors

        function_name = response_message.tool_calls[0].function.name

        # verify function exists
        if function_name not in available_functions:
            return "Function " + function_name + " does not exist"
        function_to_call = available_functions[function_name]

        # verify function has correct number of arguments
        function_args = json.loads(response_message.tool_calls[0].function.arguments)
        if check_args(function_to_call, function_args) is False:
            return "Invalid number of arguments for function: " + function_name
        function_response = function_to_call(**function_args)

        print("Output of function call:")
        print(function_response)
        print()

        # Step 4: send the info on the function call and function response to GPT

        # adding assistant response to messages
        messages.append(
            {
                "role": response_message.role,
                "function_call": {
                    "name": response_message.tool_calls[0].function.name,
                    "arguments": response_message.tool_calls[0].function.arguments,
                },
                "content": None,
            }
        )

        # adding function response to messages
        messages.append(
            {
                "role": "function",
                "name": function_name,
                "content": function_response,
            }
        )  # extend conversation with function response

        print("Messages in second request:")
        for message in messages:
            print(message)
        print()

        second_response = client.chat.completions.create(
            messages=messages,
            model=model_name,
        )  # get a new response from GPT where it can see the function response

        return second_response


# USING CHAG COMPLETION API BTW

# response = client.chat.completions.create(
#     model="gpt-35-turbo", # model = "deployment_name".
#     messages=[
#         {"role": "system", "content": "You are a helpful assistant."},
#         {"role": "user", "content": "Does Azure OpenAI support customer managed keys?"},
#         {"role": "assistant", "content": "Yes, customer managed keys are supported by Azure OpenAI."},
#         {"role": "user", "content": "Do other Azure AI services support this too?"}
#     ]
# )

# print(response.choices[0].message.content)