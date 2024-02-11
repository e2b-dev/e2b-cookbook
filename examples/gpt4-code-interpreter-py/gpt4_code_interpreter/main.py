from dotenv import load_dotenv
import e2b
import openai
import asyncio
import json

load_dotenv()

session: e2b.Session

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
  {
    "name": "install_package",
    "description": "Installs the passed npm package.",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "The name of an npm package to install.",
            },
        },
        "required": ["name"],
    },
  }
]

async def run_code(code: str):
  global session
  # 1. First we need to write the code to a file.
  await session.filesystem.write("/home/user/index.js", code)
  # 2. Then execute the file with Node.
  proc = await session.process.start("node /home/user/index.js")
  # 3. Wait for the process to finish.
  out = await proc
  # 4. Return the stdout and stderr.
  return out.stdout, out.stderr


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
      stdout, stderr = await run_code(code)
      print(stdout)
      print(stderr)
    elif func_name == "install_package":
      package_name = func_args["name"]
      print(stdout)
      print(stderr)
  else:
    # The model didn't call a function, so we just print the message.
    content = message["content"]
    print(content)

async def main():
  global session
  session = await e2b.Session.create(id="Nodejs")

  response = openai.ChatCompletion.create(
    model="gpt-4", # Or use "gpt-3.5-turbo"
    messages=[
        {"role": "system", "content": "You are a senior developer that can code in JavaScript. Always produce valid JSON."},
        {"role": "user", "content": "Write hello world"},
        {"role": "assistant", "content": '{"code": "console.log(\"hello world\")"}', "name":"exec_code"},
        {"role": "user", "content": "Generate first 100 fibonacci numbers"},
    ],
    functions=functions,
  )
  print(response)
  await parse_gpt_response(response)

asyncio.run(main())
