/**
 * Boot a VNC stack inside a fresh E2B sandbox and return a public noVNC
 * URL the caller can open in any browser tab.
 *
 * The stack:
 *   Xvfb :99 (1280x720x24)
 *      ▲
 *      │ DISPLAY=:99
 *      │
 *   Playwright / Chromium (headed)
 *      ▲
 *      │ X11 framebuffer at :99
 *      │
 *   x11vnc → RFB on :5900
 *      ▲
 *      │
 *   websockify → wraps :5900 as WebSocket on :6080
 *      ▲
 *      │ (E2B routes https://<host>/* → sandbox:6080)
 *      │
 *   noVNC (served from /usr/share/novnc, same :6080)
 *      ▲
 *      │
 *   Your browser tab
 *
 * E2B's edge serves whatever your sandbox publishes on a port over HTTPS,
 * so the externally-visible URL is always `https://<getHost(6080)>/...`
 * (no `http://` — TLS terminates at E2B's edge).
 *
 * Battle-tested at qualitymax.io: this exact stack is what powers the
 * "Live" tab in the platform's execution view. The pattern is small
 * enough to copy directly into any E2B-driven test runner.
 */

import { Sandbox } from '@e2b/code-interpreter';

const TEMPLATE = 'playwright-chromium';

// Standard X / VNC ports. Xvfb display :99 maps to TCP port 5999 in
// theory but we don't expose that directly; x11vnc proxies it to a
// regular VNC port (5900) and websockify wraps that as WebSocket on
// 6080 so a browser-side noVNC client can connect.
const VNC_DISPLAY = ':99';
const VNC_PORT = 5900;
const NOVNC_PORT = 6080;

/**
 * Shell script that installs (if missing) and starts the VNC stack.
 *
 * Why "install if missing": the `playwright-chromium` template doesn't
 * ship `x11vnc` / `novnc` / `websockify`. The install runs ~once per
 * fresh sandbox cold-start (~5-10s on a warm apt cache). If you run
 * this often enough that the install latency matters, build your own
 * E2B template on top of `playwright-chromium` with these pre-baked.
 *
 * The Xvfb/x11vnc/websockify processes are started in the background
 * and inherit the sandbox's lifetime; killing the sandbox tears them
 * down. The `bg=` redirections capture each daemon's log to /tmp for
 * post-mortem debugging if the noVNC URL refuses to connect.
 */
const VNC_BOOT_SCRIPT = `bash -lc '
set +e
echo "VNC:install_check"
if ! command -v x11vnc >/dev/null 2>&1 || ! command -v websockify >/dev/null 2>&1; then
  echo "VNC:installing"
  apt-get update -qq >/tmp/vnc-apt-update.log 2>&1
  apt-get install -y -qq --no-install-recommends x11vnc novnc websockify \\
    >/tmp/vnc-apt-install.log 2>&1
fi
echo "VNC:xvfb_start"
Xvfb ${VNC_DISPLAY} -screen 0 1280x720x24 >/tmp/vnc-xvfb.log 2>&1 &
sleep 0.5
echo "VNC:x11vnc_start"
x11vnc -display ${VNC_DISPLAY} -forever -shared -nopw \\
  -rfbport ${VNC_PORT} -bg -o /tmp/vnc-x11vnc.log 2>/dev/null
sleep 0.3
echo "VNC:websockify_start"
# --web=/usr/share/novnc serves the noVNC client from the same port
# that proxies the VNC stream, so a single getHost(6080) URL works.
websockify --web=/usr/share/novnc ${NOVNC_PORT} localhost:${VNC_PORT} \\
  >/tmp/vnc-websockify.log 2>&1 &
sleep 0.5
echo "VNC:ready"
'`;

export interface LiveSandbox {
  /** The underlying sandbox handle. Call `.kill()` when done. */
  sandbox: Sandbox;
  /**
   * noVNC URL the caller can open in a browser tab. Includes the
   * `autoconnect=true&resize=scale` query so the page connects on load.
   */
  noVncUrl: string;
  /**
   * X display the headed browser should target. Pass this to the
   * Playwright runner as `DISPLAY=:99` (or set it in `env`).
   */
  display: string;
}

/**
 * Spin up a fresh sandbox with the VNC stack running and return the
 * URL the user should open to watch the browser.
 *
 * Caller owns the returned `sandbox` and must `.kill()` it when done.
 */
export async function createLiveSandbox(): Promise<LiveSandbox> {
  const sandbox = await Sandbox.create(TEMPLATE);

  // Boot the VNC stack synchronously so the noVNC URL is connectable
  // by the time we return. The script runs to completion in ~1-2s on
  // a warm cache, ~10s on cold install of x11vnc/novnc.
  await sandbox.commands.run(VNC_BOOT_SCRIPT, { timeoutMs: 60 * 1000 });

  // `getHost(port)` returns the host portion of the public URL E2B
  // routes to that port. The scheme is always `https://` at the edge —
  // plain `http://` to a getHost URL produces a connection error
  // because TLS is terminated by E2B, not the in-sandbox process.
  const host = sandbox.getHost(NOVNC_PORT);
  const noVncUrl = `https://${host}/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=1500`;

  return { sandbox, noVncUrl, display: VNC_DISPLAY };
}
