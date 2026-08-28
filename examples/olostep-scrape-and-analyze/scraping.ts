import "dotenv/config";

const ENDPOINT = "https://api.olostep.com/v1/scrapes";

export async function scrapeMarkdown(url: string): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OLOSTEP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url_to_scrape: url, formats: ["markdown"] }),
  });

  if (!res.ok) throw new Error(`Olostep ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.result.markdown_content ?? "";
}
