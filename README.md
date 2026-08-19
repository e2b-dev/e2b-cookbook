![E2B Cookbook Preview Light](/readme-assets/cookbook-light.png#gh-light-mode-only)
![E2B Cookbook Preview Dark](/readme-assets/cookbook-dark.png#gh-dark-mode-only)

# ✴️ E2B Cookbook

Example code and guides for building with [E2B SDK](https://github.com/e2b-dev/e2b).

Read more about E2B on the [E2B website](https://e2b.dev/?utm_source=github&utm_medium=referral&utm_campaign=readme&utm_content=e2b-cookbook) and the official [E2B documentation](https://e2b.dev/docs?utm_source=github&utm_medium=referral&utm_campaign=readme&utm_content=e2b-cookbook).

## Examples

**Hello World guide**

- [TypeScript](./examples/hello-world-js)
- [Python](./examples/hello-world-python)

**Open-source apps**

- [E2B AI Analyst](https://github.com/e2b-dev/ai-analyst) - analyze your data & create interactive charts
- [E2B Fragments](https://github.com/e2b-dev/fragments) - prompt different LLMS to generate apps with UI
- [E2B Surf](https://github.com/e2b-dev/surf) - computer use AI agent powered by OpenAI

**LLM providers**

<table>
  <thead>
    <tr>
      <th>Provider</th>
      <th>Topic(s)</th>
      <th>Example</th>
      <th>Python</th>
      <th>TypeScript</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="5">OpenAI</td>
      <td>Agents SDK</td>
      <td>Agentic workflows running in E2B sandboxes</td>
      <td><a href="./examples/openai-agents-sdk">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>GPT-5.6</td>
      <td>Data analysis and visualization of a CSV</td>
      <td><a href="./examples/openai-python">Python</a></td>
      <td><a href="./examples/openai-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>GPT-5.6</td>
      <td>Code interpreter and reasoning on image data</td>
      <td><a href="./examples/openai-image-analysis-python">Python</a></td>
      <td><a href="./examples/openai-image-analysis-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>GPT-5.6</td>
      <td>Code interpreter for ML on dataset</td>
      <td><a href="./examples/openai-ml-dataset-python">Python</a></td>
      <td><a href="./examples/openai-ml-dataset-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Codex CLI</td>
      <td>OpenAI Codex, running inside a Sandbox</td>
      <td><a href="./examples/openai-codex-in-sandbox-python">Python</a></td>
      <td><a href="./examples/openai-codex-in-sandbox-js">TypeScript</a></td>
    </tr>
    <tr>
      <td rowspan="3">Anthropic</td>
      <td>Claude Opus 5</td>
      <td>Code interpreter</td>
      <td><a href="./examples/claude-code-interpreter-python">Python</a></td>
      <td><a href="./examples/claude-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Claude Code</td>
      <td>Claude Code, running inside a Sandbox</td>
      <td><a href="./examples/anthropic-claude-code-in-sandbox-python">Python</a></td>
      <td><a href="./examples/anthropic-claude-code-in-sandbox-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Claude Managed Agents</td>
      <td>Self-hosted worker running inside a Sandbox</td>
      <td><a href="./examples/anthropic-managed-agents/python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>Mistral</td>
      <td>Codestral</td>
      <td>Code interpreter</td>
      <td><a href="./examples/codestral-code-interpreter-python">Python</a></td>
      <td><a href="./examples/codestral-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Groq</td>
      <td>Llama 3</td>
      <td>Code interpreter via function calling</td>
      <td><a href="./examples/groq-code-interpreter-python/groq_code_interpreter.ipynb">Python</a></td>
      <td><a href="./examples/groq-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td rowspan="2">Fireworks AI</td>
      <td>Qwen2.5-Coder-32B-Instruct</td>
      <td>Code interpreter</td>
      <td><a href="./examples/fireworks-code-interpreter-python/qwen_code_interpreter.ipynb">Python</a></td>
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
      <td><a href="./examples/together-ai-code-interpreter-python">Python</a></td>
      <td><a href="./examples/together-ai-code-interpreter-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>WatsonX AI</td>
      <td>IBM Graphite, Llama, Mistral</td>
      <td>Code interpreter</td>
      <td><a href="./examples/watsonx-ai-code-interpreter-python">Python</a></td>
      <td><a href="./examples/watsonx-ai-code-interpreter-js">TypeScript</a></td>
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
      <td><a href="./examples/langchain-python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>🦜🕸️ LangGraph</td>
      <td>LangGraph with code interpreter</td>
      <td><a href="./examples/langgraph-python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
      <td>CrewAI</td>
      <td>CrewAI agent with sandboxed Python execution</td>
      <td><a href="./examples/crewai-python">Python</a></td>
      <td>-</td>
    </tr>
    <tr>
    <td>▲ Vercel AI SDK</td>
      <td>Next.js + AI SDK + Code Interpreter</td>
      <td>-</td>
      <td><a href="./examples/nextjs-code-interpreter">TypeScript</a></td>
    </tr>
    <tr>
    <td>▲ <a href="https://ai-sdk.dev">Vercel AI SDK</a></td>
      <td>AI SDK sandbox provider: sandboxed tools via restricted sessions, and harness coding agents (Claude Code, Codex) running inside E2B</td>
      <td>-</td>
      <td><a href="./examples/vercel-ai-sdk-sandbox-js">TypeScript</a></td>
    </tr>
    <tr>
    <td>▲ <a href="https://eve.dev/docs">Vercel eve</a></td>
      <td>Feedback analyst agent whose sandbox backend is E2B, publishing an HTML report from the sandbox</td>
      <td>-</td>
      <td><a href="./examples/vercel-eve-feedback-analyst-js">TypeScript</a></td>
    </tr>
    <tr>
    <td><a href="https://flueframework.com">Flue</a></td>
      <td>Feedback analyst agent running entirely inside an E2B sandbox, publishing an HTML report from the sandbox</td>
      <td>-</td>
      <td><a href="https://github.com/e2b-dev/e2b-cookbook/tree/main/examples/flue-feedback-analyst-js">TypeScript</a></td>
    </tr>
    <tr>
    <td>AgentKit</td>
      <td>AgentKit Coding Agent</td>
      <td>-</td>
      <td><a href="./examples/agentkit-coding-agent">TypeScript</a></td>
    </tr>
    <tr>
    <td><a href="https://sandboxagent.dev/docs/sdk-overview">Sandbox Agent SDK</a></td>
      <td>Run Sandbox Agent inside E2B and connect with the SDK</td>
      <td>-</td>
      <td><a href="./examples/sandbox-agent-sdk-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>Stirrup</td>
      <td>The lightweight framework for building agents</td>
      <td><a href="./examples/stirrup-python">Python</a></td>
      <td>-</td>
    </tr>
  </tbody>
</table>

**Model Context Protocol (MCP)**

<table>
  <thead>
    <tr>
      <th>Example</th>
      <th>Description</th>
      <th>TypeScript</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>MCP Client</td>
      <td>Basic MCP client connection to E2B sandbox</td>
      <td><a href="./examples/mcp-client-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>MCP Custom Server</td>
      <td>Connect to custom filesystem MCP server from GitHub</td>
      <td><a href="./examples/mcp-custom-server-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>MCP Custom Template</td>
      <td>Create custom E2B template with pre-installed MCP servers</td>
      <td><a href="./examples/mcp-custom-template-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>MCP Research Agent</td>
      <td>Research agent using arXiv and DuckDuckGo MCP servers</td>
      <td><a href="./examples/mcp-research-agent-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>MCP Claude Code</td>
      <td>Claude Code with MCP integration</td>
      <td><a href="./examples/mcp-claude-code-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>MCP Browserbase</td>
      <td>Web automation agent using Browserbase MCP server</td>
      <td><a href="./examples/mcp-browserbase-js">TypeScript</a></td>
    </tr>
    <tr>
      <td>MCP Groq Exa</td>
      <td>AI research using Groq with Exa MCP server</td>
      <td><a href="./examples/mcp-groq-exa-js">TypeScript</a></td>
    </tr>
  </tbody>
</table>

**Example use cases**

- Upload dataset and analyze it with Llama 3.3 - [Python](./examples/upload-dataset-code-interpreter)
- Scrape Airbnb and analyze data with Claude Opus 5 and Firecrawl - [TypeScript](./examples/firecrawl-scrape-and-analyze-airbnb-data)
- Visualize website topics with Claude Sonnet 5 and Firecrawl - [Python](./examples/claude-visualize-website-topics)
- Next.js app with LLM + Code Interpreter and streaming - [TypeScript](./examples/nextjs-code-interpreter)
- How to run a Docker container in E2B - [Python/TypeScript](./examples/docker-in-e2b)
- How to run Playwright in E2B - [TypeScript](./examples/playwright-in-e2b)
- Map custom subdomains to your sandboxes - [TypeScript](./examples/custom-sandbox-domain-proxy)
- Feedback analyst agent on Flue, publishing an HTML report from a sandbox - [TypeScript](./examples/flue-feedback-analyst-js)

## Running the examples as a test suite

Every example is exercised nightly against live E2B by `tests/run-examples.ts`: each
one is uploaded into a fresh sandbox, installed with its own toolchain (npm, uv,
Poetry, or nbconvert for notebooks) and run. An example passes if it exits 0.

```bash
npm install
npm test                      # all of them
npm test -- hello-world       # substring filter, one or a few
```

You need an `E2B_API_KEY` plus whichever provider key the examples you are running
use - see `.env.example`. `hello-world-js` and `hello-world-python` need only the E2B
key, so they are the ones to try first.

**What counts as a failure.** The suite checks the sandbox, not the model. A provider
rate limit or an exhausted quota counts as OK, because the sandbox still built,
installed and ran; non-deterministic model behaviour - no chart produced, a malformed
tool call, generated code raising inside the sandbox - is reported as skipped. Real
failures are the things that are actually broken: missing templates, dependency
resolution, wrong entrypoints, auth, retired model ids, sandbox timeouts.

Some examples are deliberately not covered - they need a provider key this repo does
not hold, a long-lived server the runner cannot assert on, or an upstream fix. Each
exclusion is listed with its reason at the top of `tests/run-examples.ts`, so a gap is
never silent.
