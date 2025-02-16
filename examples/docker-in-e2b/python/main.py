from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

sbx = Sandbox('e2b-with-docker')

# Run the command verifying that Docker is installed
result = sbx.commands.run('docker --version')
print("Docker version inside the sandbox:", result.stdout)

# Run hello world container
# Note: we need to run it with sudo
result = sbx.commands.run('sudo docker run hello-world', on_stdout=lambda line: print("[stdout]", line), on_stderr=lambda line: print("[stderr]", line))
# Or you can use the following code to print the output to the console
# print("Hello world: ", result.stdout)

sbx.kill()