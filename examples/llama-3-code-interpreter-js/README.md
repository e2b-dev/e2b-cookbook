# Llama 3 + function calling + E2B Code interpreter        
**Powered by open-source [Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) by [E2B](https://e2b.dev/docs)**

E2B's code interpreter SDK quickly creates a secure cloud sandbox powered by [Firecracker](https://github.com/firecracker-microvm/firecracker).

Inside this sandbox is a running Jupyter server that the LLM can use.

### Step 1: Install dependencies

We start by installing the [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter) and [Groq's JS SDK](https://github.com/groq/groq-typescript).

You can do that by simply calling
```bash
npm i
```

### Step 2: Define API keys

Create `.env` file in the root of the project and add your E2B API key to it.
You can use `.env.template` as a template.
```bash
cp .env.template .env
```

### Step 3: Run the code

Just run the code by calling
```bash
npm start
```
