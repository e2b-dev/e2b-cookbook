import { Template } from "e2b";

export const template = Template()
  // Use Ubuntu as the base image
  // Note: Use `FROM e2bdev/code-interpreter:latest` instead if you want to use the code interpreting features (https://github.com/e2b-dev/code-interpreter)
  // and not just plain E2B sandbox.
  .fromImage("ubuntu:20.04")
  .setUser("root")
  .setWorkdir("/")
  // Avoid prompts from apt
  .setEnvs({
    DEBIAN_FRONTEND: "noninteractive",
  })
  // Update and install dependencies
  .runCmd(
    "apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release",
  )
  // Add Docker's official GPG key
  .runCmd(
    "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg",
  )
  // Set up the stable Docker repository
  .runCmd(
    'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
  )
  // Install Docker
  .runCmd(
    "apt-get update && apt-get install -y docker-ce=5:27.1.1-1~ubuntu.20.04~focal docker-ce-cli=5:27.1.1-1~ubuntu.20.04~focal containerd.io",
  )
  // Clean up
  .runCmd("apt-get clean && rm -rf /var/lib/apt/lists/*")
  .setUser("user")
  .setWorkdir("/home/user")
  .setStartCmd("sudo /bin/bash", "sleep 20");
