const http = require("node:http");
const dns = require("node:dns").promises;
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("content-type", "application/json");
    try {
      if (url.pathname === "/dns")
        return res.end(
          JSON.stringify({ addresses: await dns.resolve4("example.com") }),
        );
      if (url.pathname === "/outbound") {
        const target = url.searchParams.get("target") || "https://example.com";
        const r = await fetch(target, { signal: AbortSignal.timeout(6000) });
        return res.end(
          JSON.stringify({
            status: r.status,
            body: (await r.text()).slice(0, 120),
          }),
        );
      }
      let body = "";
      for await (const part of req) body += part;
      res.end(
        JSON.stringify({
          ok: true,
          method: req.method,
          path: url.pathname,
          body,
        }),
      );
    } catch (e) {
      res.statusCode = 502;
      res.end(
        JSON.stringify({ error: String(e), cause: String(e.cause || "") }),
      );
    }
  })
  .listen(8080, "0.0.0.0", () => console.log("container ready"));
