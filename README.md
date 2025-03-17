# ✴️ E2B Cookbook

Example code and guides for building with [E2B SDK](https://github.com/e2b-dev/e2b).

Read more about E2B on the [E2B website](https://e2b.dev) and the official [E2B documentation](https://e2b.dev/docs).

## Examples

**Open-source apps**

- [E2B AI Analyst](https://github.com/e2b-dev/ai-analyst) - analyze your data & create interactive charts
- [E2B Fragments](https://github.com/e2b-dev/fragments) - prompt different LLMS to generate apps with UI
- [E2B Surf](https://github.com/e2b-dev/surf) - computer use AI agent powered by OpenAI

**Hello World guide**

- [TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-js)
- [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-python)

**Example use cases**

- Anthropic's Artifacts UI with AI Code Execution - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/anthropic-power-artifacts)
- Upload dataset and analyze it with Llama 3 - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/upload-dataset-code-interpreter)
- Scrape Airbnb and analyze data with Claude 3 Opus and Firecrawl - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/scrape-and-analyze-airbnb-data-with-firecrawl)
- Visualize website topics with Claude 3.5 Sonnet and Firecrawl - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-visualize-website-topics)

**LLM providers**

- **🦙 Meta**
  - Llama 3.1 405B, 70B or 8B with code interpreter & Together AI
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-python)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-js)
  - Llama 3.1 405B, 70B or 8B with code interpreter & Fireworks
    - [Python](https://github.com/e2b-dev/e2b-cookbook/blob/fireworks/examples/fireworks-code-interpreter-python/llama_3.1_code_interpreter.ipynb)
  - Llama 3 with code interpreter
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/llama-3-code-interpreter-python)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/llama-3-code-interpreter-js)
- **OpenAI**
  - o1 (or o3-mini) with data analysis and visualization of a csv file
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/openai-python)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/openai-js)
  - GPT-4o with code interpreter and reasoning on image data
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/gpt-4o-python)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/gpt-4o-js)
  - o1 (or o3-mini) and GPT-4 with code interpreter performing machine learning on dataset
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/o1-and-gpt-4-python)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/o1-and-gpt-4-js)
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
- **Groq**
  - Llama 3 hosted on Groq + function calling + E2B Code interpreter
    - [Python](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/llama-3-code-interpreter-python/llama_3_code_interpreter_groq.ipynb)
- **Fireworks AI**
  - Qwen2.5-Coder-32B-Instruct with code interpreter - [Python](https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/fireworks-code-interpreter-python/qwen_code_interpreter.ipynb)
- **Together AI**
  - Code interpreter usable with Meta Llama 3.1 Instruct Turbo (8B or 70B or 405B), Qwen 2 Instruct (72B), Code Llama Instruct (70B), or DeepSeek Coder Instruct (33B)
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-python)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-with-code-interpreting/together-ai-code-interpreter-js)
- **WatsonX AI**
  - Code interpreter usable with IBM Graphite, Llama or Mistral
    - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/watsonx-ai-code-interpreter/granite_code_interpreter_py.ipynb)
    - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/watsonx-ai-code-interpreter/granite_code_interpreter_ts.ipynb)
      
**AI frameworks integrations**

- **🦜⛓️ LangChain**

  - LangChain with Code Interpreter - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/langchain-python)

- **🦜🕸️ LangGraph**

  - LangGraph with code interpreter - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/langgraph-python)

- **Autogen**

  - Autogen with secure sandboxed for code interpreting - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/e2b_autogen)

- **▲ Vercel AI SDK**
  - Vercel AI SDK's Next.js + AI SDK + Code Interpreter - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/nextjs-code-interpreter)
  - Anthropic's Artifacts UI with Vercel AI SDK - [JavaScript/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/anthropic-power-artifacts)
