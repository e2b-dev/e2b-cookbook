# Llama 3 + function calling + E2B Code interpreter        
**Powered by open-source [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) by [E2B](https://e2b.dev/docs)**

E2B's code interpreter SDK quickly creates a secure cloud sandbox powered by [Firecracker](https://github.com/firecracker-microvm/firecracker).

Inside this sandbox is a running Jupyter server that the LLM can use.

### Step 1: Install dependencies

We start by install the [E2B code interpreter SDK](https://github.com/e2b-dev/code-interpreter) and [Groq's JS SDK](https://github.com/groq/groq-typescript).

You can do that by simply calling
```bash
npm i
```

### Step 2: Define API keys, prompt, and tools

Let's define our variables with API keys for Groq and E2B together with the model ID, prompt, and our tools.

### Step 3: Implement the method for code interpreting

Here's the main function that use the E2B code interpreter SDK. We'll be calling this function a little bit further when we're parsing the Llama's response with tool calls.


### Step 4: Implement the method for calling LLM and parsing tools

Now we're going to define and implement `chat_with_llama` method. In this method, we'll call the LLM with our `tools` dictionary, parse the output, and call our `code_interpret` method we defined above.

### Step 5: Put everything together
In this last step, we put all the pieces together. We intantiate a new code interpreter instance using
```python
with CodeInterpreter(api_key=E2B_API_KEY) as code_interpreter:
```

and then call the `chat_with_llama` method with our user message and the `code_interpreter` instance.
