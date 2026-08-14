# Perplexity Search + E2B Sandbox (TypeScript)

Use the [Perplexity Search API](https://docs.perplexity.ai/docs/search/quickstart) to fetch web sources, then analyze them inside an [E2B Sandbox](https://e2b.dev) with Python.

## What it does

1. Calls `POST https://api.perplexity.ai/search` with a query and optional filters (`max_results`, `search_domain_filter`, `search_recency_filter`).
2. Spawns an E2B sandbox and writes the JSON results to a file inside it.
3. Runs Python in the sandbox to count top domains and print result summaries.

## Prerequisites

- Node.js 18+
- An [E2B API key](https://e2b.dev/dashboard?tab=keys)
- A [Perplexity API key](https://www.perplexity.ai/account/api/keys)

## Setup

```bash
cp .env.template .env
# fill in E2B_API_KEY and PERPLEXITY_API_KEY (PPLX_API_KEY is also accepted)
npm install
```

## Run

```bash
npm start
# or with a custom query:
npm start -- "OpenAI DevDay 2026 announcements"
```

## Search options

The `perplexitySearch` helper in `index.ts` supports:

| Field                   | Type                                                  | Notes                                                                                  |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `query`                 | `string`                                              | Required.                                                                              |
| `max_results`           | `number`                                              | Default 10. Set explicitly to bound results.                                           |
| `search_domain_filter`  | `string[]`                                            | Allowlist (`"nytimes.com"`) **or** denylist (`"-pinterest.com"`). Don't mix the two.   |
| `search_recency_filter` | `"hour" \| "day" \| "week" \| "month" \| "year"`      | Restrict results to a recent time window.                                              |

## API reference

- Search quickstart: https://docs.perplexity.ai/docs/search/quickstart
- Search API reference: https://docs.perplexity.ai/api-reference/search-post
- Domain filter docs: https://docs.perplexity.ai/docs/search/filters/domain-filter
- Date / recency filter docs: https://docs.perplexity.ai/docs/search/filters/date-time-filters
