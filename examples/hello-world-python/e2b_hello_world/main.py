from dotenv import load_dotenv
load_dotenv()
from e2b import Sandbox

def main():
    sbx = Sandbox() # By default the sandbox is alive for 5 minutes
    result = sbx.commands.run('echo "hello world"') # Execute a command inside the sandbox
    print(result.stdout)

    files = sbx.files.list("/")
    print(files)
