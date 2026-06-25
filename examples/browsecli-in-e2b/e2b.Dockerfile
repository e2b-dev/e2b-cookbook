# e2b.Dockerfile — the E2B template image for "BrowseCLI in an E2B sandbox".
#
# Built with the E2B CLI:  e2b template build
# (E2B reads this file via the `dockerfile` field in e2b.toml.)
#
# This image installs Node + the `browse` CLI. NO Chrome/Chromium is installed:
# the browser lives on Browserbase and is reached over CDP at run time. The
# E2B sandbox runs your agent loop / the CLI; the Verified browser runs remotely.
#
# Any OCI base image works on E2B. We use node:20-slim so `browse` (an npm
# package) and its `node` runtime are first-class.
FROM node:20-slim

# `browse` is the unified Browserbase CLI (browser automation + cloud APIs).
RUN npm install -g browse@latest \
    && browse --version

WORKDIR /app
COPY browsecli-demo.sh /app/browsecli-demo.sh
RUN chmod +x /app/browsecli-demo.sh

# Optionally override the protected site to visit.
ENV TARGET_URL=https://nowsecure.nl

# NOTE: On E2B the container does not auto-run CMD — E2B keeps the sandbox alive
# and you drive it from the SDK (sbx.commands.run(...), see index.ts). CMD is
# here only so the image is runnable as a plain Docker container for local
# `docker run` testing (the Docker-equivalent of the E2B sandbox).
CMD ["/app/browsecli-demo.sh"]
