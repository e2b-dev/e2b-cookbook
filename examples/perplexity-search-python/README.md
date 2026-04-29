# Perplexity Search + E2B Sandbox (Python)

Use the [Perplexity Search API](https://docs.perplexity.ai/docs/search/quickstart) to fetch web sources, then analyze them inside an [E2B Sandbox](https://e2b.dev) with Python.

## What it does

1. Calls `POST https://api.perplexity.ai/search` with a query and optional filters (`max_results`, `search_domain_filter`, `search_recency_filter`).
2. Spawns an E2B sandbox, writes the JSON results to a file inside it, and runs analysis Python.
3. Prints the top domains and result snippets.

## Prerequisites

- Python 3.10+
- [Poetry](https://python-poetry.org/)
- An [E2B API key](https://e2b.dev/dashboard?tab=keys)
- A [Perplexity API key](https://www.perplexity.ai/account/api/keys)

## Setup

```bash
cp .env.template .env
# fill in E2B_API_KEY and PERPLEXITY_API_KEY (PPLX_API_KEY is also accepted)
poetry install
```

## Run

```bash
poetry run start
# or with a custom query:
poetry run start "OpenAI DevDay 2026 announcements"
```

## Search options

The `perplexity_search` helper in `perplexity_e2b_search/main.py` supports:

| Argument                | Type             | Notes                                                                                  |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `query`                 | `str`            | Required.                                                                              |
| `max_results`           | `int \| None`    | Default 10. Set explicitly to bound results.                                           |
| `search_domain_filter`  | `list[str]`      | Allowlist (`"nytimes.com"`) **or** denylist (`"-pinterest.com"`). Don't mix the two.   |
| `search_recency_filter` | `str \| None`    | One of `hour`, `day`, `week`, `month`, `year`.                                          |

## API reference

- Search quickstart: https://docs.perplexity.ai/docs/search/quickstart
- Search API reference: https://docs.perplexity.ai/api-reference/search-post
- Domain filter docs: https://docs.perplexity.ai/docs/search/filters/domain-filter
- Date / recency filter docs: https://docs.perplexity.ai/docs/search/filters/date-time-filters
