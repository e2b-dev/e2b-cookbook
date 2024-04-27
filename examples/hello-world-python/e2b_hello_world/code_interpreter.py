from e2b_code_interpreter import CodeInterpreter

def code_interpret(code_interpreter: CodeInterpreter, code: str):
  print(f"\n{'='*50}\n> Running following AI-generated code:\n{code}\n{'='*50}")
  exec = code_interpreter.notebook.exec_cell(
    code,
    # You can stream logs from the code interpreter
    # on_stderr=lambda stderr: print("\n[Code Interpreter stdout]", stderr),
    # on_stdout=lambda stdout: print("\n[Code Interpreter stderr]", stdout),
    #
    # You can also stream additional results like charts, images, etc.
    # on_result=...
  )

  if exec.error:
    print("[Code Interpreter error]", exec.error) # Runtime error
  else:
    return exec.results, exec.logs
