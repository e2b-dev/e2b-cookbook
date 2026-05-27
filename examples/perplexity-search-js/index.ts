import 'dotenv/config'
import { Sandbox } from '@e2b/code-interpreter'

const PERPLEXITY_API_KEY =
  process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY

if (!PERPLEXITY_API_KEY) {
  throw new Error(
    'Set PERPLEXITY_API_KEY (or PPLX_API_KEY). Get one at https://www.perplexity.ai/account/api/keys'
  )
}

type SearchOptions = {
  query: string
  max_results?: number
  search_domain_filter?: string[]
  search_recency_filter?: 'hour' | 'day' | 'week' | 'month' | 'year'
}

type SearchResult = {
  title: string
  url: string
  snippet: string
  date?: string
}

async function perplexitySearch(opts: SearchOptions): Promise<SearchResult[]> {
  const body: Record<string, unknown> = { query: opts.query }
  if (opts.max_results !== undefined) body.max_results = opts.max_results
  if (opts.search_domain_filter)
    body.search_domain_filter = opts.search_domain_filter
  if (opts.search_recency_filter)
    body.search_recency_filter = opts.search_recency_filter

  const res = await fetch('https://api.perplexity.ai/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Perplexity Search API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { results?: SearchResult[] }
  return data.results ?? []
}

async function main() {
  const query =
    process.argv.slice(2).join(' ') || 'recent breakthroughs in quantum error correction'

  console.log(`Searching Perplexity for: ${query}`)
  const results = await perplexitySearch({
    query,
    max_results: 8,
    search_recency_filter: 'month',
  })
  console.log(`Got ${results.length} results from Perplexity Search.`)

  console.log('Spawning E2B sandbox to summarize results in-sandbox...')
  const sandbox = await Sandbox.create()
  try {
    await sandbox.files.write(
      '/home/user/results.json',
      JSON.stringify(results, null, 2)
    )

    const execution = await sandbox.runCode(`
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
    print(f"- {r['title']}\\n  {r['url']}\\n  {r.get('snippet', '')[:160]}\\n")
`)

    console.log(execution.logs.stdout.join(''))
    if (execution.logs.stderr.length) {
      console.error(execution.logs.stderr.join(''))
    }
  } finally {
    await sandbox.kill()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
