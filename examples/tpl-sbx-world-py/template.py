from e2b import Template


template = (
    Template()
    .from_image("e2bdev/code-interpreter:latest")
    .run_cmd('sleep 10')
    .run_cmd('echo Hello World E2B! > hello.txt')
)
