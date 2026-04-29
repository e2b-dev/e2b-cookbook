"""Perplexity Search + E2B Sandbox example.

Calls the Perplexity Search API for web results, then analyzes them inside an
E2B sandbox.

Run: ``poetry run start`` or ``poetry run start "your custom query"``.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx
from dotenv import load_dotenv
from e2b_code_interpreter import Sandbox

load_dotenv()

PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY") or os.environ.get(
    "PPLX_API_KEY"
)


def perplexity_search(
    query: str,
    *,
    max_results: int | None = None,
    search_domain_filter: list[str] | None = None,
    search_recency_filter: str | None = None,
) -> list[dict[str, Any]]:
    """Call ``POST https://api.perplexity.ai/search`` and return ``results``.

    Filter rules:
    - ``search_domain_filter`` may be an allowlist (``"nytimes.com"``) **or** a
      denylist (``"-pinterest.com"``). Never mix the two in one call.
    - ``search_recency_filter`` is one of ``hour|day|week|month|year``.
    """
    if not PERPLEXITY_API_KEY:
        raise RuntimeError(
            "Set PERPLEXITY_API_KEY (or PPLX_API_KEY). "
            "Get one at https://www.perplexity.ai/account/api/keys"
        )

    body: dict[str, Any] = {"query": query}
    if max_results is not None:
        body["max_results"] = max_results
    if search_domain_filter is not None:
        body["search_domain_filter"] = search_domain_filter
    if search_recency_filter is not None:
        body["search_recency_filter"] = search_recency_filter

    resp = httpx.post(
        "https://api.perplexity.ai/search",
        headers={
            "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


def main() -> None:
    query = " ".join(sys.argv[1:]) or "recent breakthroughs in quantum error correction"

    print(f"Searching Perplexity for: {query}")
    results = perplexity_search(
        query,
        max_results=8,
        search_recency_filter="month",
    )
    print(f"Got {len(results)} results from Perplexity Search.")

    print("Spawning E2B sandbox to summarize results in-sandbox...")
    with Sandbox() as sbx:
        sbx.files.write("/home/user/results.json", json.dumps(results, indent=2))

        execution = sbx.run_code(
            """
import json
from collections import Counter
from urllib.parse import urlparse

with open("/home/user/results.json") as f:
    results = json.load(f)

print(f"Loaded {len(results)} results")
domains = Counter(urlparse(r["url"]).netloc for r in results)
print("Top domains:")
for domain, count in domains.most_common(5):
    print(f"  {domain}: {count}")

print("\\nTop result snippets:")
for r in results[:3]:
    print(f"- {r['title']}")
    print(f"  {r['url']}")
    print(f"  {(r.get('snippet') or '')[:160]}")
    print()
"""
        )

        for line in execution.logs.stdout:
            print(line, end="")
        for line in execution.logs.stderr:
            print(line, end="", file=sys.stderr)


if __name__ == "__main__":
    main()
