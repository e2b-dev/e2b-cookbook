from dotenv import load_dotenv
load_dotenv()
from e2b_code_interpreter import Sandbox

def main():
    sbx = Sandbox() # By default the sandbox is alive for 5 minutes
    execution = sbx.run_code("print('hello world')") # Execute Python inside the sandbox
    print(execution.logs)

    files = sbx.files.list("/")
    print(files)