from e2b import Template

template = (
    Template()
    .from_image("ubuntu:20.04")
    .set_user("root")
    .set_workdir("/")
    .set_envs(
        {
            "DEBIAN_FRONTEND": "noninteractive",
        }
    )
    .run_cmd(
        "apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release"
    )
    .run_cmd(
        "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg"
    )
    .run_cmd(
        'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'
    )
    .run_cmd(
        "apt-get update && apt-get install -y docker-ce=5:27.1.1-1~ubuntu.20.04~focal docker-ce-cli=5:27.1.1-1~ubuntu.20.04~focal containerd.io"
    )
    .run_cmd("apt-get clean && rm -rf /var/lib/apt/lists/*")
    .set_user("user")
    .set_workdir("/home/user")
    .set_start_cmd("sudo /bin/bash", "sleep 20")
)
