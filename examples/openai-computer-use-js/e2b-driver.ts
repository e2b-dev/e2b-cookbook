/**
 * The E2B side of OpenAI computer use, shared by the numbered examples.
 *
 * - `E2BDriver` is the driver `ComputerToolset` from `openai/helpers/computer` asks for: it turns every action the
 *   `computer` tool can emit into xdotool calls on an E2B desktop, and returns screenshots.
 * - `liveView` starts the desktop stream and opens it in your browser so you can watch.
 * - `run` is the helper's loop with a deadline, logging every action to the terminal.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { Sandbox } from '@e2b/desktop';
import OpenAI from 'openai';
import { ComputerToolset, type ComputerDriver } from 'openai/helpers/computer';
import type { ComputerAction } from 'openai/resources/responses/responses';

export const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-6-luna';

// OpenAI key names to X keysyms; anything else is passed lowercased (letters) or as is (F1 to F12).
const KEYS: Record<string, string> = {
  alt: 'Alt_L', ctrl: 'Control_L', control: 'Control_L', shift: 'Shift_L', cmd: 'Super_L', meta: 'Super_L',
  super: 'Super_L', win: 'Super_L', enter: 'Return', return: 'Return', esc: 'Escape', escape: 'Escape', tab: 'Tab',
  space: 'space', backspace: 'BackSpace', delete: 'Delete', del: 'Delete', insert: 'Insert', home: 'Home', end: 'End',
  pageup: 'Page_Up', pagedown: 'Page_Down', arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
};
// Punctuation as X keysyms; key names are also shell-quoted, so no key can break the command.
const PUNCTUATION: Record<string, string> = {
  ';': 'semicolon', ':': 'colon', "'": 'apostrophe', '"': 'quotedbl', ',': 'comma', '.': 'period', '/': 'slash',
  '\\': 'backslash', '|': 'bar', '?': 'question', '!': 'exclam', '@': 'at', '#': 'numbersign', $: 'dollar',
  '%': 'percent', '^': 'asciicircum', '&': 'ampersand', '*': 'asterisk', '(': 'parenleft', ')': 'parenright',
  '-': 'minus', _: 'underscore', '=': 'equal', '+': 'plus', '[': 'bracketleft', ']': 'bracketright',
  '{': 'braceleft', '}': 'braceright', '<': 'less', '>': 'greater', '`': 'grave', '~': 'asciitilde', ' ': 'space',
};
const BUTTONS = { left: 1, wheel: 2, right: 3, back: 8, forward: 9 };

const xkey = (name: string) =>
  PUNCTUATION[name] ?? KEYS[name.toLowerCase()] ?? (/^f\d+$/i.test(name) ? name.toUpperCase() : name.toLowerCase());
const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** ComputerDriver for the OpenAI helper: each action becomes one xdotool call on the E2B desktop. */
export class E2BDriver implements ComputerDriver {
  readonly desktop: Sandbox;

  constructor(desktop: Sandbox) {
    this.desktop = desktop;
  }

  // Modifier keys held during a click, drag, move or scroll.
  private async xdotool(keys: string[] | null | undefined, ...commands: string[]) {
    const mods = (keys ?? []).map((k) => quote(xkey(k)));
    await this.desktop.commands.run(
      'xdotool ' +
        [...mods.map((m) => `keydown ${m}`), ...commands, ...[...mods].reverse().map((m) => `keyup ${m}`)].join(' '),
    );
  }

  async screenshot() {
    const raw = await this.desktop.screenshot();
    return {
      type: 'computer_screenshot' as const,
      image_url: `data:image/png;base64,${Buffer.from(raw).toString('base64')}`,
    };
  }

  async click(action: ComputerAction.Click) {
    await this.xdotool(action.keys, `mousemove --sync ${action.x} ${action.y}`, `click ${BUTTONS[action.button]}`);
  }

  async double_click(action: ComputerAction.DoubleClick) {
    await this.xdotool(action.keys, `mousemove --sync ${action.x} ${action.y}`, 'click --repeat 2 1');
  }

  async drag(action: ComputerAction.Drag) {
    const [first, ...rest] = action.path;
    await this.xdotool(
      action.keys,
      `mousemove --sync ${first!.x} ${first!.y}`,
      'mousedown 1',
      ...rest.map((p) => `mousemove --sync ${p.x} ${p.y}`),
      'mouseup 1',
    );
  }

  async move(action: ComputerAction.Move) {
    await this.xdotool(action.keys, `mousemove --sync ${action.x} ${action.y}`);
  }

  async scroll(action: ComputerAction.Scroll) {
    // The tool reports pixels; one wheel click scrolls roughly 100.
    const clicks = (pixels: number, forward: number, back: number) =>
      pixels ? [`click --repeat ${Math.max(1, Math.floor(Math.abs(pixels) / 100))} ${pixels > 0 ? forward : back}`] : [];
    await this.xdotool(
      action.keys,
      `mousemove --sync ${action.x} ${action.y}`,
      ...clicks(action.scroll_y, 5, 4),
      ...clicks(action.scroll_x, 7, 6),
    );
  }

  async keypress(action: ComputerAction.Keypress) {
    await this.desktop.commands.run('xdotool key ' + quote(action.keys.map(xkey).join('+')));
  }

  async type(action: ComputerAction.Type) {
    await this.desktop.write(action.text);
  }

  async wait() {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Start a view-only, password-protected stream of the desktop and open it in your browser. */
export async function liveView(desktop: Sandbox): Promise<string> {
  await desktop.stream.start({ requireAuth: true });
  const url = desktop.stream.getUrl({ authKey: desktop.stream.getAuthKey(), viewOnly: true });
  console.log(`Watch live: ${url}`);
  if (process.stdout.isTTY)
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' })
      .on('error', () => {})
      .unref();
  return url;
}

/** beforeAction: print each action as it runs, and allow it. */
function log(action: ComputerAction): true {
  const { type, ...fields } = action as unknown as Record<string, unknown>;
  if ('x' in fields) {
    fields['at'] = `(${fields['x']}, ${fields['y']})`;
    delete fields['x'];
    delete fields['y'];
  }
  const args = Object.entries(fields)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  console.log(`  ${String(type).padEnd(12)} ${args.join('  ')}`.trimEnd());
  return true;
}

/** Give the model a task on this desktop and return its final answer. */
export async function run(
  desktop: Sandbox,
  task: string,
  { maxSteps, timeLimitMs }: { maxSteps: number; timeLimitMs: number },
): Promise<string> {
  const response = await new ComputerToolset(new E2BDriver(desktop)).run(
    new OpenAI({ timeout: 120_000, maxRetries: 2 }),
    { model: MODEL, store: false, tools: [{ type: 'computer' }], input: [{ role: 'user', content: task }] },
    {
      maxSteps, // model calls, including the final answer
      signal: AbortSignal.timeout(timeLimitMs),
      beforeAction: log,
      // Unattended demo on a throwaway desktop: approve the model's safety checks instead of asking a human.
      approveSafetyChecks: () => true,
    },
  );
  return response.output_text;
}

/** In a terminal, wait for Enter so the live view stays up; otherwise continue at once. */
export async function holdOpen(): Promise<void> {
  if (!process.stdin.isTTY) return;
  console.log('\nPress Enter to close the desktop.');
  await once(process.stdin, 'data');
  process.stdin.pause();
}
