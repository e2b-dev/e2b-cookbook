// Terminal output for npm start, kept apart so start.ts reads as the flow. Adapted from the
// anthropic-computer-use-orangehrm-js example:
//
//   tui.header({ Task: task, Box: url })   title card
//   tui.step(1, 'Uploading the contract')  a numbered stage of the demo
//   tui.ok('Memo is in Box')               a result line under the stage
//   tui.agent(event)                        every tool call the agent makes in the sandbox, with result and time
//   tui.findings(memo)                      the deviations table of the memo, one line per finding
//   tui.done({ Review: url })               footer with links
//   await tui.holdOpen('destroy it')        wait for Enter so the sandbox stays up
//
// Presentation only. Colors turn off when piped or with NO_COLOR.
import { once } from "node:events";
import type { AgentEvent } from "./sandbox.ts";

const startedAt = performance.now();
let calls = 0;
const callStarts = new Map<string, number>();

// The title card. A `Box` row is also opened in your browser when running in a terminal.
export function header(rows: Record<string, string>): void {
  console.log(`\n  ${bold(magenta("E2B"))} ${dim("×")} ${bold("Box Mount")} ${dim("×")} ${bold("Claude")}  ${dim("contract review")}`);
  console.log(`  ${dim("─".repeat(Math.min(width() - 4, 60)))}`);
  printRows(rows);
  console.log();
}

// `① Uploading the contract to Box`: a stage of the demo.
export function step(n: number, text: string): void {
  console.log(`\n  ${magenta(String.fromCodePoint(0x2460 + n - 1))} ${bold(text)}`);
}

// `  ✓ Memo is in Box (2.0s)`: a result under the current stage.
export function ok(text: string): void {
  console.log(`    ${green("✓")} ${text}`);
}

// `    dim detail`: context under the current stage, such as the mount status.
export function info(text: string): void {
  for (const line of text.split("\n")) console.log(`    ${dim(line)}`);
}

// One agent event from inside the sandbox: a tool call, its result, a blocked call or the final tally.
export function agent(event: AgentEvent): void {
  switch (event.event) {
    case "tool": {
      calls++;
      callStarts.set(event.id, performance.now());
      const name = event.name.replace(/^mcp__\w+__/, "");
      const arg = toolArg(event.input);
      console.log(`    ${cyan("●")} ${bold(name)}${arg ? `  ${clip(arg, width() - name.length - 10)}` : ""}`);
      break;
    }
    case "tool_result": {
      const started = callStarts.get(event.id);
      const time = started === undefined ? "" : `${((performance.now() - started) / 1000).toFixed(1)}s`.padStart(5);
      const line = event.error ? red("error") : dim(`${event.chars.toLocaleString()} chars`);
      console.log(`      ${dim("└")} ${dim(time)}  ${line}`);
      break;
    }
    case "blocked":
      console.log(`      ${dim("└")} ${red(`blocked ${event.name} outside /srv/box`)}`);
      break;
    case "result":
      ok(`Agent finished in ${event.turns} turns ${dim(`· ${calls} tool calls · USD ${event.costUsd.toFixed(4)}`)}`);
      break;
    case "log":
      info(event.text);
  }
}

// The memo's deviations table as `Critical  §8.1  "Kestrel's total liability..."`, with a count per severity.
export function findings(memo: string): void {
  const rows = parseDeviations(memo);
  if (rows.length === 0) return;
  const critical = rows.filter((row) => row.severity === "Critical").length;
  console.log(`\n    ${bold(`${rows.length} deviation${rows.length === 1 ? "" : "s"}`)}${critical ? `, ${red(bold(`${critical} critical`))}` : ""}`);
  for (const { severity, section, text } of rows) {
    const tag = severityColor[severity](severity.padEnd(8));
    const where = dim(clip(`§${section}`, 11).padEnd(11));
    console.log(`    ${tag} ${where} ${clip(text, width() - 28)}`);
  }
}

// The footer, with a link per row.
export function done(rows: Record<string, string>): void {
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n  ${green("✓")} ${bold("Done")} ${dim(`in ${seconds}s`)}`);
  printRows(rows);
}

// In a terminal, wait for Enter (or `signal`, for Ctrl+C) before continuing; without one, continue at once.
export async function holdOpen(what: string, signal: AbortSignal): Promise<void> {
  if (!process.stdin.isTTY) return;
  console.log(`\n  ${dim(`Press Enter to ${what}.`)}`);
  await once(process.stdin, "data", { signal }).catch(() => {});
  process.stdin.pause();
}

type Severity = "Critical" | "High" | "Medium" | "Low";
type Deviation = { severity: Severity; section: string; text: string };

// Rows of the Markdown table that has a Severity column. The playbook asks for Severity, Section,
// Agreement text, Approved position, Proposed change; models often add a Topic column, which is
// the shortest label, so it is shown when present. Columns are found by their header names.
export function parseDeviations(memo: string): Deviation[] {
  const rows: Deviation[] = [];
  let columns: string[] = [];
  for (const line of memo.split("\n")) {
    if (!line.trim().startsWith("|")) {
      columns = []; // the table ended
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.replace(/\*\*|`/g, "").trim());
    if (cells.some((cell) => cell.toLowerCase() === "severity")) {
      columns = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    const at = (name: string) => (columns.includes(name) ? cells[columns.indexOf(name)] : undefined);
    const severity = severityOf(at("severity") ?? "");
    if (!severity) continue;
    const section = (at("section") ?? "").replace(/^(Section|§)\s*/i, "");
    rows.push({ severity, section, text: oneLine(at("topic") ?? at("agreement text") ?? "") });
  }
  return rows;
}

function severityOf(cell: string): Severity | undefined {
  const word = cell.toLowerCase();
  return (["Critical", "High", "Medium", "Low"] as const).find((severity) => severity.toLowerCase() === word);
}

function printRows(rows: Record<string, string>): void {
  for (const [label, value] of Object.entries(rows)) {
    const style = /^https?:/.test(value) ? cyan : label === "Sandbox" ? dim : (text: string) => text;
    console.log(`  ${dim(label.padEnd(8))}  ${style(value)}`);
  }
}

// The argument that matters instead of raw JSON: a path relative to the mount, or a glob.
function toolArg(input: Record<string, unknown>): string {
  const value = [input.path, input.file_path, input.pattern].find((v) => typeof v === "string");
  return typeof value === "string" ? value.replace(/^\/srv\/box\/?/, "") || "." : "";
}

const color = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint("1");
const dim = paint("2");
const red = paint("31");
const green = paint("32");
const yellow = paint("33");
const cyan = paint("36");
const magenta = paint("35");
const severityColor: Record<Severity, (text: string) => string> = { Critical: red, High: yellow, Medium: cyan, Low: dim };

const width = () => Math.min(process.stdout.columns || 100, 110);
const oneLine = (text: string) => text.replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim();
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text);
