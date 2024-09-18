# ✴️ E2B Cookbook
Example code and guides for building with [E2B's Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter).

## Examples

**Hello World guide**
- [TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-js)
- [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-python)

**Example use cases**
  - Anthropic's Artifacts UI with AI Code Execution - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/anthropic-power-artifacts)
  - Upload dataset and analyze it with Llama 3 - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/upload-dataset-code-interpreter)
  - Scrape Airbnb and analyze data with Claude 3 Opus and Firecrawl - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/scrape-and-analyze-airbnb-data-with-firecrawl)
  - Visualize website topics with Claude 3.5 Sonnet and Firecrawl - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-visualize-website-topics)

**LLM providers**
  - **🦙  Meta**
    - Llama 3.1 405B, 70B or 8B with code interpreter & Together AI
      - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-python)
      - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-js)
    - Llama 3.1 405B, 70B or 8B with code interpreter & Fireworks
      - [Python](https://github.com/e2b-dev/e2b-cookbook/blob/fireworks/examples/fireworks-code-interpreter-python/llama_3.1_code_interpreter.ipynb)
    - Llama 3 with code interpreter
      - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/llama-3-code-interpreter-python)
      - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/llama-3-code-interpreter-js)
  - **OpenAI**
    - GPT-4o with code interpreter and reasoning on image data
      - [Python](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/gpt-4o-code-interpreter/gpt_4o.ipynb)
      - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/gpt-4o-code-interpreter-js)
    - o1 with code interpreter performing machine learning on dataset
      - [Python](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/o1-code-interpreter/o1.ipynb)
      - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/o1-code-interpreter-js)
  - **Anthropic**
    - Claude 3 Opus with code interpreter
      - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-code-interpreter-python)
      - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-code-interpreter-js)
    - Anthropic's Artifacts UI with AI Code Execution - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/anthropic-power-artifacts)
    - Anthropic models with Firecrawl
      - Visualize website topics - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-visualize-website-topics)
      - Scrape Airbnb and analyze data - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/scrape-and-analyze-airbnb-data-with-firecrawl)
  - **Mistral**
    - Codestral with code interpreter
      - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/codestral-code-interpreter-python)
      - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/codestral-code-interpreter-js)
  - **Fireworks AI**
    - Firefunction-v2 with code interpreter
      - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/fireworks-code-interpreter-python)
  - **Together AI**
      - Code interpreter usable with Meta Llama 3.1 Instruct Turbo (8B or 70B or 405B), Qwen 2 Instruct (72B), Code Llama Instruct (70B), or DeepSeek Coder Instruct (33B)
        - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-python)
        - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-js)
  

**AI frameworks integrations**
  - **🦜⛓️ LangChain**
    - LangChain with Code Interpreter - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/langchain-python)

  - **🦜🕸️ LangGraph**
    - LangGraph with code interpreter - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/langgraph-python)

  - **Autogen**
    - Autogen with secure sandboxed for code interpreting - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/e2b_autogen)

  - **▲ Vercel AI SDK**
    - Vercel AI SDK's Next.js + AI SDK + Code Interpreter - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/nextjs-code-interpreter)
    -  Anthropic's Artifacts UI with Vercel AI SDK - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/anthropic-power-artifacts)
  - **magentic**
    - Code Interpreter with magentic and GPT-4o - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/magentic-code-interpreter/magentic_code_interpreter.ipynb)


## Getting started with E2B

### 1. Get API key
[Sign up](https://e2b.dev/docs/sign-in?view=sign-up) and [get your E2B API key](https://e2b.dev/docs/getting-started/api-key).

### 2. Install code interpreter SDK
We have built a [dedicated SDK](https://github.com/e2b-dev/code-interpreter) for adding code interpreting to your AI apps.

### 3. Check out Hello World example
Check out the [TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-js) and [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-python) hello world examples.

### 4. Explore documentation
Visit our docs at [e2b.dev/docs](https://e2b.dev/docs).

