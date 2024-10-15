from e2b_code_interpreter import Sandbox

def code_interpret(code_interpreter: Sandbox, code: str):
  print(f"\n{'='*50}\n> Running following AI-generated code:\n{code}\n{'='*50}")
  exec = code_interpreter.run_code(code)

  if exec.error:
    print("[Code Interpreter error]", exec.error) # Runtime error
  else:
    return exec.results, exec.logs
