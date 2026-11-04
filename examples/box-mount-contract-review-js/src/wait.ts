import { BoxError } from "./box.ts";

// Poll `check` every second until it returns true. Returns the seconds it took.
// Stops at once on Box auth or permission errors (retrying will not fix them) and on `signal`.
export async function waitFor(label: string, check: () => Promise<boolean>, signal: AbortSignal, timeoutMs = 90_000): Promise<number> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    signal.throwIfAborted();
    try {
      if ((await check()) && Date.now() - started < timeoutMs) return (Date.now() - started) / 1000;
    } catch (error) {
      if (error instanceof BoxError && [401, 403, 404].includes(error.status)) throw error;
      if (signal.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for ${label}.${lastError ? ` Last error: ${lastError}` : ""}`);
}
