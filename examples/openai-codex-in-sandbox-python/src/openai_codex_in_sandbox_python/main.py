from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

template_name = 'openai-codex'
sbx = Sandbox(template_name)
print("Sandbox created", sbx.id)

result = sbx.commands.run('codex --help')
print(result.stdout)

sbx.kill()
