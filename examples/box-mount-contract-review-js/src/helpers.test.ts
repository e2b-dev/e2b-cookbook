import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { BoxError } from "./box.ts";
import { parseFolderId } from "./config.ts";
import { type AgentEvent, agentEvents, parseFileList, shellQuote } from "./sandbox.ts";
import { parseDeviations } from "./tui.ts";
import { waitFor } from "./wait.ts";

const never = new AbortController().signal;

test("shellQuote survives the shell unchanged", () => {
  for (const value of ["plain", "with space", "it's", "$(touch /tmp/x)", "a\nb", "'; rm -rf / '"]) {
    assert.equal(execFileSync("sh", ["-c", `printf %s ${shellQuote(value)}`]).toString(), value);
  }
});

test("parseFileList keeps unusual names and drops the trailing entry", () => {
  const stdout = "/srv/box/Reviewed/a.md\0/srv/box/new\nline.md\0/srv/box/trailing \0";
  assert.deepEqual(parseFileList(stdout, "/srv/box"), ["/srv/box/Reviewed/a.md", "/srv/box/new\nline.md", "/srv/box/trailing "]);
  assert.deepEqual(parseFileList("", "/srv/box"), []);
});

test("parseFolderId accepts digits only", () => {
  assert.equal(parseFolderId("425223414288"), "425223414288");
  for (const bad of ["123; id", "https://app.box.com/folder/1", " 12", "abc"]) {
    assert.throws(() => parseFolderId(bad));
  }
});

test("waitFor returns once the check passes", async () => {
  let calls = 0;
  const seconds = await waitFor("x", async () => ++calls === 2, never, 5_000);
  assert.equal(calls, 2);
  assert.ok(seconds >= 1 && seconds < 3);
});

test("waitFor rejects a success that arrives after the deadline", async () => {
  const slow = () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 60));
  await assert.rejects(waitFor("slow", slow, never, 20), /Timed out/);
});

test("waitFor stops at once on a Box auth error and on abort", async () => {
  const expired = async () => {
    throw new BoxError("expired", 401);
  };
  await assert.rejects(waitFor("x", expired, never, 10_000), BoxError);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(waitFor("x", async () => false, abort.signal, 10_000));
});

test("waitFor reports the last transient error on timeout", async () => {
  const flaky = async () => {
    throw new Error("network down");
  };
  await assert.rejects(waitFor("x", flaky, never, 1_500), /Last error: network down/);
});

test("agentEvents joins split chunks and passes other output through as log", () => {
  const events: AgentEvent[] = [];
  const feed = agentEvents((event) => events.push(event));
  feed('{"event":"tool","id":"t1","name":"Read","inp');
  feed('ut":{"file_path":"/srv/box/a.md"}}\nnode warning\n{"event":"result","turns":3,');
  feed('"costUsd":0.04}\n');
  assert.deepEqual(events, [
    { event: "tool", id: "t1", name: "Read", input: { file_path: "/srv/box/a.md" } },
    { event: "log", text: "node warning" },
    { event: "result", turns: 3, costUsd: 0.04 },
  ]);
});

test("parseDeviations reads the severity table by column name", () => {
  const memo = [
    "| Severity | Section | Agreement text | Approved position | Proposed change |",
    "|---|---|---|---|---|",
    '| **Critical** | 8.1 | "Kestrel\'s total liability<br>will not exceed" | 12 months | Raise cap |',
    "| High | Section 4.2 | 10 business days | 72 hours | Shorten |",
    "",
    "| Severity | Topic | Section | Agreement Text |",
    "|---|---|---|---|",
    "| **Medium** | Renewal | 9.1 | 36 month renewals |",
    "",
    "| Topic | Approved position |",
    "| Critical | not a finding |",
  ].join("\n");
  assert.deepEqual(parseDeviations(memo), [
    { severity: "Critical", section: "8.1", text: '"Kestrel\'s total liability will not exceed"' },
    { severity: "High", section: "4.2", text: "10 business days" },
    { severity: "Medium", section: "9.1", text: "Renewal" },
  ]);
});
