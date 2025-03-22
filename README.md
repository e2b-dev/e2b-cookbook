![E2B Cookbook Preview Light](/readme-assets/cookbook-light.png#gh-light-mode-only)
![E2B Cookbook Preview Dark](/readme-assets/cookbook-dark.png#gh-dark-mode-only)

# ✴️ E2B Cookbook

Example code and guides for building with [E2B SDK](https://github.com/e2b-dev/e2b).

Read more about E2B on the [E2B website](https://e2b.dev) and the official [E2B documentation](https://e2b.dev/docs).

## Examples

**Hello World guide**

- [TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-js)
- [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/hello-world-python)

**Open-source apps**

- [E2B AI Analyst](https://github.com/e2b-dev/ai-analyst) - analyze your data & create interactive charts
- [E2B Fragments](https://github.com/e2b-dev/fragments) - prompt different LLMS to generate apps with UI
- [E2B Surf](https://github.com/e2b-dev/surf) - computer use AI agent powered by OpenAI

**LLM providers**

<table>
  <thead>
    <tr>
      <th>Provider</th>
      <th>Model(s)</th>
      <th>Example</th>
      <th>Python</th>
      <th>TypeScript</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="3">OpenAI</td>
      <td>o1, o3-mini</td>
      <td>Data analysis and visualization of a CSV</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/openai-python">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/openai-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>GPT-4o</td>
      <td>Code interpreter and reasoning on image data</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/gpt-4o-python">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/gpt-4o-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>o1, o3-mini, GPT-4</td>
      <td>Code interpreter for ML on dataset</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/o1-and-gpt-4-python">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/o1-and-gpt-4-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Anthropic</td>
      <td>Claude 3 Opus</td>
      <td>Code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-code-interpreter-python">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Mistral</td>
      <td>Codestral</td>
      <td>Code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/codestral-code-interpreter-python">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/codestral-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Groq</td>
      <td>Llama 3</td>
      <td>Code interpreter via function calling</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/groq-code-interpreter-python/llama_3_code_interpreter.ipynb">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/groq-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td rowspan="2">Fireworks AI</td>
      <td>Qwen2.5-Coder-32B-Instruct</td>
      <td>Code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/blob/main/examples/fireworks-code-interpreter-python/qwen_code_interpreter.ipynb">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>Llama 3.1 405B, 70B, 8B</td>
      <td>Code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/blob/fireworks/examples/fireworks-code-interpreter-python/llama_3.1_code_interpreter.ipynb">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>Together AI</td>
      <td>Llama 3.1, Qwen 2, Code Llama, DeepSeek Coder</td>
      <td>Code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-code-interpreter-python">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/together-ai-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>WatsonX AI</td>
      <td>IBM Graphite, Llama, Mistral</td>
      <td>Code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/watsonx-ai-code-interpreter/granite_code_interpreter_py.ipynb">Python</a></td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/watsonx-ai-code-interpreter/granite_code_interpreter_ts.ipynb">TypeScript</a></td>
    </tr>
  </tbody>
</table>

**AI frameworks integrations**

<table>
  <thead>
    <tr>
      <th>Framework</th>
      <th>Description</th>
      <th>Python</th>
      <th>TypeScript</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>🦜⛓️ LangChain</td>
      <td>LangChain with Code Interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/langchain-python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>🦜🕸️ LangGraph</td>
      <td>LangGraph with code interpreter</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/langgraph-python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>Autogen</td>
      <td>Autogen with secure sandboxed for code interpreting</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/autogen-python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
    <td>▲ Vercel AI SDK</td>
      <td>Next.js + AI SDK + Code Interpreter</td>
      <td>-</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/nextjs-code-interpreter">TypeScript</a></td>
    </tr>
    <tr>
    <td>AgentKit</td>
      <td>AgentKit Coding Agent</td>
      <td>-</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/agentkit-coding-agent">TypeScript</a></td>
    </tr>
  </tbody>
</table>

**Example use cases**

- Upload dataset and analyze it with Llama 3 - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/upload-dataset-code-interpreter)
- Scrape Airbnb and analyze data with Claude 3 Opus and Firecrawl - [TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/firecrawl-scrape-and-analyze-airbnb-data)
- Visualize website topics with Claude 3.5 Sonnet and Firecrawl - [Python](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/claude-visualize-website-topics)
- Next.js app with LLM + Code Interpreter and streaming - [TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/nextjs-code-interpreter)
- How to run a Docker container in E2B - [Python/TypeScript](https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/docker-in-e2b)

