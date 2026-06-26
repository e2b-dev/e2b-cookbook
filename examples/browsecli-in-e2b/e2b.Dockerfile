# e2b.Dockerfile — the E2B template image for "Browser agent in an E2B sandbox".
#
# Built with the E2B CLI:  e2b template build
# (E2B reads this file via the `dockerfile` field in e2b.toml.)
#
# This image installs Node + the `browse` CLI. NO Chrome/Chromium is installed:
# the browser lives on Browserbase and is reached over CDP at run time. The
# E2B sandbox runs your agent loop; the browser runs remotely.
#
# Any OCI base image works on E2B. We use node:20-slim so `browse` (an npm
# package) and its `node` runtime are first-class.
FROM node:20-slim

# `browse` is the Browserbase CLI (browser automation + cloud APIs). The agent's
# own deps (ai / @ai-sdk/anthropic / zod) are installed at run time by the driver.
RUN npm install -g browse@latest \
    && browse --version

WORKDIR /home/user

# NOTE: On E2B the container does not auto-run CMD — E2B keeps the sandbox alive
# and you drive it from the SDK (sandbox.commands.run(...), see index.ts).
