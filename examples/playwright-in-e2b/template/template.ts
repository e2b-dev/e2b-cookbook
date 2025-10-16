import { Template } from "e2b";

export const template = Template()
  .fromImage("node:20-slim")
  .setUser("root")
  .setWorkdir("/")
  // Install Node.js dependencies
  .setWorkdir("/app")
  // Initialize a new Node.js project
  .runCmd("npm init -y")
  // Install Playwright Node.js package
  .npmInstall(["playwright"])
  // Install Playwright browsers and dependencies
  .runCmd(
    "PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium",
  )
  // Allow the user "user" to write output files
  .runCmd("chmod a+rwX /app")
  .setUser("user")
  .setWorkdir("/home/user");
