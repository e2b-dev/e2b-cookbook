from dotenv import load_dotenv
load_dotenv()
import os
from openai import OpenAI
from e2b_code_interpreter import Sandbox

# Create AI/ML API client using OpenAI-compatible endpoint
client = OpenAI(base_url="https://api.aimlapi.com/v1", api_key=os.environ["AIML_API_KEY"])

system_prompt = (
    "You are a helpful assistant that can execute python code in a Jupyter notebook. "
    "Only respond with the code to be executed and nothing else. Strip backticks in code blocks."
)
prompt = "Calculate how many r's are in the word 'strawberry'"

# Send the prompt to the model
response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ],
)

# Extract the code from the response
code = response.choices[0].message.content

# Execute code in E2B Sandbox
with Sandbox() as sandbox:
    execution = sandbox.run_code(code)
    result = execution.text

print(result)
