# e2b.Dockerfile — the E2B template image for "Browser agent in an E2B sandbox".
#
# Built with the E2B CLI:  e2b template build
# (E2B reads this file via the `dockerfile` field in e2b.toml.)
#
# Builds directly from the official prebuilt `browse` CLI image
# (node:20-slim + browse). NO Chrome/Chromium: the browser lives on Browserbase
# and is reached over CDP at run time. The E2B sandbox runs your agent loop; the
# browser runs remotely.
#
# Pin a version (e.g. ghcr.io/browserbase/browse:0.9.5) for reproducibility, or
# use `FROM node:20-slim` + `RUN npm i -g browse` for a fully self-contained image.
FROM ghcr.io/browserbase/browse:latest

WORKDIR /home/user

# NOTE: On E2B the container does not auto-run CMD — E2B keeps the sandbox alive
# and you drive it from the SDK (sandbox.commands.run(...), see index.ts).
