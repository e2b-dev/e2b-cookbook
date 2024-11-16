import Sandbox from "@e2b/code-interpreter";

const sandboxTimeout = 10 * 60 * 1000; // 10 minute in ms

export const maxDuration = 60;

export async function POST(req: Request) {
  const { code } = await req.json();
  console.log("Executing code");

  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: sandboxTimeout,
  });

  const { text, results, logs, error } = await sandbox.runCode(code);

  return new Response(
    JSON.stringify({
      text,
      results,
      logs,
      error,
    })
  );
}