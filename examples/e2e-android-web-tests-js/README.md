# End-to-end tests on Android and in Chromium with e2e + E2B

[e2e](https://github.com/e2e-inc/e2e) is an open-source runner for end-to-end tests. A test can use scripted steps, agent steps (a model works toward a goal), or both. This example runs tests in E2B sandboxes with the two providers from [`@e2e-dev/e2b`](https://github.com/e2e-inc/e2e/tree/main/packages/e2b):

- `e2b()` leases Android 16 sandboxes. The example tests the game 2048. You do not need the Android SDK, an emulator, or `adb` on your machine.
- `e2bBrowsers()` leases Chromium sandboxes. The example tests Wikipedia.

Each target has one scripted test and one agent test. The tests do not change when you move them from a local device or browser to E2B.

```
your machine                              E2B
e2e run ──┬─ target "android" ──tunnel──▶ Android 16 sandbox (template android-16)
          │                               2048.apk installed by the provider
          └─ target "web" ──────tunnel──▶ Chromium sandbox (template e2e-chromium)
```

The runner leases one sandbox per target for each worker and deletes them when the run ends. The sandboxes refuse public traffic: the runner reaches each one through a tunnel on `127.0.0.1` that adds the E2B access token.

## Prerequisites

- Node.js 22.22.3 or later (or 24.8.0 or later)
- An [E2B API key](https://e2b.dev/dashboard)

## Run the Android tests

```bash
cd examples/e2e-android-web-tests-js
npm install
cp .env.example .env     # add E2B_API_KEY
npm run download-apk     # saves apps/2048.apk from F-Droid and checks its SHA-256
npm start
```

The Android target uses E2B's public `android-16` template, so there is nothing to build. The scripted test passes and the agent test is skipped.

## Optional: run the agent tests

Add an [Anthropic API key](https://console.anthropic.com/settings/keys) to `.env` as `ANTHROPIC_API_KEY` and run `npm start` again. The agent gets a goal ("start a new game, and swipe the board until the score is above 0"), and a scripted assertion checks the result.

## Optional: run the Chromium tests

The web target needs a sandbox template with Chromium. Build it one time for each E2B team:

```bash
npm run build-template   # builds the e2e-chromium template from the Playwright image
npm run test:web         # only Chromium
npm run test:all         # Android and Chromium
```

The image tag in `scripts/build-template.ts` must match the Playwright version that `@e2e-dev/web` uses. When you update `@e2e-dev/web`, update the tag and build the template again.

## Results

`npm run test:all` runs four tests. With an Anthropic key, all four pass. Without it, the two scripted tests pass and the two agent tests are skipped. A run takes about one minute.

The report, the screenshots, and the agent step cache are in `.e2e/`. The runner can replay a passed agent step from the cache without model calls. It calls the model again when the screen changed or when a step used an action that cannot be replayed, such as the Android swipe tool.

## Where to read the code

- `e2e.config.ts`: the two targets, the two E2B providers, and the agent model.
- `tests/android/2048.e2e.ts`: scripted swipes on the board, then the same goal given to an agent.
- `tests/web/wikipedia.e2e.ts`: a scripted search, then the same goal given to an agent.
- `scripts/build-template.ts`: the Chromium template.
- `scripts/download-apk.ts`: the pinned download of the app under test.

`npm run check` runs the typecheck and the lint (no network).

## Use your own app

- **Android**: set `app.appPath` to your `.apk`. Add `bundleId` (the package name of the app) if the runner must not read it from the `.apk`.
- **Web**: set `app.url` to your site. The browser runs in E2B's cloud, so the URL must be reachable from the internet. `localhost` on your machine is not.
- **More workers**: increase `workers`. Each worker gets its own sandbox for each target.

See the [E2B integration guide](https://github.com/e2e-inc/e2e/blob/main/docs/integrations/e2b.mdx) in the e2e repository for all options.

## Limitations

- Android on E2B is x86_64 only, has no Google Play Services, and renders in software. Apps with native libraries need x86_64 builds. The provider installs an `.apk`, not an `.aab`.
- E2B has no iOS sandboxes.
- A sandbox is billed while it runs. The sandboxes run from the start of the run to its end.
- The default sandbox lifetime is 1 hour (`timeoutMs`). If the runner is killed before it deletes a sandbox, E2B deletes it when the lifetime ends.
- The web tests use the live Wikipedia site, so a change to that site can break them.

Tested with e2e 0.23.1, `@e2e-dev/e2b` 0.0.1, E2B SDK 2.63.0 and Node.js 24.

2048 is [Privacy Friendly 2048](https://github.com/SecUSo/privacy-friendly-2048) by SECUSO (GPL-3.0). The example downloads it from F-Droid and does not redistribute it.
