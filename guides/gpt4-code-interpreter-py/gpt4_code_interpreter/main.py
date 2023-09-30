from dotenv import load_dotenv
import e2b
import openai
import asyncio
import json

load_dotenv()

# The OpenAI functions we want to use in our model.
functions = [
  {
      "name": "exec_code",
      "description": "Executes the passed JavaScript code using Nodejs and returns the stdout and stderr.",
      "parameters": {
          "type": "object",
          "properties": {
              "code": {
                  "type": "string",
                  "description": "The JavaScript code to execute.",
              },
          },
          "required": ["code"],
      },
  },
]

async def parse_gpt_response(response):
  message = response["choices"][0]["message"]
  if message.get("function_call"):
    func = message["function_call"]
    func_name = func["name"]

    # Get rid of newlines and leading/trailing spaces in the raw function arguments JSON string.
    # This sometimes help to avoid JSON parsing errors.
    args = func["arguments"].strip().replace("\n", "")
    # Parse the cleaned up JSON string.
    func_args = json.loads(args)

    # If the model is calling the exec_code function we defined in the `functions` variable, we want to save the `code` argument to a variable.
    if func_name == "exec_code":
      code = func_args["code"]
      stdout, stderr = await e2b.run_code("Node16", code)
      print(stdout)
      print(stderr)
  else:
    # The model didn't call a function, so we just print the message.
    content = message["content"]
    print(content)

async def main():
  response = openai.ChatCompletion.create(
    model="gpt-4", # Or use "gpt-3.5-turbo"
    messages=[
        {"role": "system", "content": "You are a senior developer that can code in JavaScript."},
        {"role": "user", "content": "Write hello world"},
        {"role": "assistant", "content": '{"code": "console.log(\"hello world\")"}', "name":"exec_code"},
        {"role": "user", "content": "Generate first 100 fibonacci numbers"},
    ],
    functions=functions,
  )
  await parse_gpt_response(response)


asyncio.run(main())
