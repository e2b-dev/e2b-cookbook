import { Template } from "e2b";

export const template = Template()
  .fromImage("ubuntu:20.04")
  .setUser("root")
  .setWorkdir("/")
  .setEnvs({
    DEBIAN_FRONTEND: "noninteractive",
  })
  .runCmd(
    "apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release",
  )
  .runCmd(
    "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg",
  )
  .runCmd(
    'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
  )
  .runCmd(
    "apt-get update && apt-get install -y docker-ce=5:27.1.1-1~ubuntu.20.04~focal docker-ce-cli=5:27.1.1-1~ubuntu.20.04~focal containerd.io",
  )
  .runCmd("apt-get clean && rm -rf /var/lib/apt/lists/*")
  .setUser("user")
  .setWorkdir("/home/user")
  .setStartCmd("sudo /bin/bash", "sleep 20");
