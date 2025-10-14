from dotenv import load_dotenv
load_dotenv()
from e2b import Sandbox

def main():
    sbx = Sandbox('code-interpreter') # Use the code-interpreter template
    execution = sbx.run_code("print('hello world')") # Execute Python inside the sandbox
    print(execution.logs)

    files = sbx.files.list("/")
    print(files)