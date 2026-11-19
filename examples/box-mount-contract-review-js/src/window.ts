// The Box window for npm start: one Chromium window, driven by Playwright, whose single tab
// follows the run, so you see in Box what the agent is doing. It keeps its own browser profile in
// .browser-profile/, so you sign in to Box once and later runs start signed in.
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type BrowserContext, type Page, chromium } from "playwright";
import { ROOT } from "./config.ts";

const PROFILE_DIR = resolve(ROOT, ".browser-profile");
const RECORDINGS_DIR = resolve(ROOT, "recordings");
// A MacBook Pro 14" at its default resolution: 1512x982 points at 2x. The window opens full
// screen with no tabs or address bar, so the page fills the display, and videos are Retina sharp.
const VIEWPORT = { width: 1512, height: 982 };
const SCALE = 2;
// Every page stays up at least this long before the next one, so a viewer can take it in.
const DWELL_MS = 4_000;
const SIGNED_IN = /^https:\/\/app\.box\.com\//;

type Options = { record: boolean; signal: AbortSignal; onSignInNeeded: () => void };

export class BoxWindow {
  private readonly context: BrowserContext;
  private readonly page: Page;
  private queue: Promise<void> = Promise.resolve();

  private constructor(context: BrowserContext, page: Page) {
    this.context = context;
    this.page = page;
  }

  // Open the window on `url`. The first time, Box asks you to sign in: this waits until you have.
  // With `record`, Playwright records the window to recordings/ in real time.
  static async open(url: string, { record, signal, onSignInNeeded }: Options): Promise<BoxWindow> {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      args: ["--start-fullscreen", "--hide-crash-restore-bubble"],
      recordVideo: record ? { dir: RECORDINGS_DIR, size: { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE } } : undefined,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    try {
      await page.goto(url);
      if (!SIGNED_IN.test(page.url())) {
        onSignInNeeded();
        const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        await Promise.race([page.waitForURL(SIGNED_IN, { timeout: 10 * 60_000 }), aborted]);
        await page.goto(url);
      }
    } catch (error) {
      await context.close();
      throw error;
    }
    return new BoxWindow(context, page);
  }

  // Show `url` once the current page has had its time, then run `then` on it (for example a
  // scroll). Returns at once: the window follows the run and never holds it up. A failed
  // navigation only affects the view, so it is ignored.
  show(url: string, then?: (page: Page) => Promise<void>): void {
    this.queue = this.queue
      .then(async () => {
        await this.page.goto(url, { waitUntil: "domcontentloaded" });
        await then?.(this.page);
        await sleep(DWELL_MS);
      })
      .catch(() => {});
  }

  // Wait for the pages still queued, close the window and return the video file, if recording.
  async close(): Promise<string | undefined> {
    await this.queue;
    const video = this.page.video();
    await this.context.close();
    return video ? await video.path() : undefined;
  }
}

// Scroll Box's file preview, which scrolls inside its own container, from top to bottom in
// steps, like someone reading it.
export async function readThrough(page: Page): Promise<void> {
  for (let step = 0; step < 12 && (await scrollPreview(page, 650)); step++) await sleep(1_500);
}

// Jump to the end of Box's file preview, where the reviewer note added in Box is.
export async function scrollToEnd(page: Page): Promise<void> {
  await scrollPreview(page, Number.MAX_SAFE_INTEGER);
  await sleep(1_500);
}

// Scroll the preview's container down by `pixels`. Returns false once it is at the bottom.
// The container is the largest scrollable element; it appears once Box has rendered the file.
async function scrollPreview(page: Page, pixels: number): Promise<boolean> {
  const handle = await page
    .waitForFunction(() => {
      const scrollable = [...document.querySelectorAll("div")].filter(
        (el) => el.scrollHeight > el.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(el).overflowY),
      );
      return scrollable.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] ?? null;
    }, undefined, { timeout: 15_000 })
    .catch(() => undefined);
  if (!handle) return false;
  return (await handle.asElement()?.evaluate((el, by) => {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    el.scrollBy({ top: by, behavior: "smooth" });
    return !atBottom;
  }, pixels)) ?? false;
}
