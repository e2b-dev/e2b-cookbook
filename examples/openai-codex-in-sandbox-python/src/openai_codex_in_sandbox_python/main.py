from dotenv import load_dotenv
from e2b import Sandbox

load_dotenv()

template_name = 'openai-codex'
sbx = Sandbox(template_name)
print("Sandbox created", sbx.sandbox_id)

result = sbx.commands.run('codex --help', request_timeout=0, timeout=0) # Codex can run for a long time, so we need to set the request_timeout and timeout to 0.
print(result.stdout)

sbx.kill()
