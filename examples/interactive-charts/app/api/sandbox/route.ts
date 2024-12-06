import Sandbox from "@e2b/code-interpreter";

const sandboxTimeout = 10 * 60 * 1000;

export const maxDuration = 60;

export async function POST(req: Request) {
 const { code } = await req.json();
 console.log("\nPython code being executed:\n", code);

 const sandbox = await Sandbox.create({
   apiKey: process.env.E2B_API_KEY,
   timeoutMs: sandboxTimeout,
 });

 const results = await sandbox.runCode(code);
 console.log("\nSandbox execution results:\n", JSON.stringify(results, null, 2));

 return new Response(
   JSON.stringify({
     text: results.text,
     results: results.results, 
     logs: results.logs,
     error: results.error,
   })
 );
}