from e2b import Template

template = (
    Template()
    # Use Ubuntu 24.04 LTS (latest LTS as of 2024)
    # Note: Use `FROM e2bdev/code-interpreter:latest` instead if you want to use the code interpreting features (https://github.com/e2b-dev/code-interpreter)
    # and not just plain E2B sandbox.
    .from_image("ubuntu:24.04")
    .set_user("root")
    .set_workdir("/")
    # Avoid prompts from apt
    .set_envs(
        {
            "DEBIAN_FRONTEND": "noninteractive",
        }
    )
    # Update and install dependencies
    .run_cmd(
        "apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release"
    )
    # Add Docker's official GPG key
    .run_cmd(
        "install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc"
    )
    # Set up the stable Docker repository
    .run_cmd(
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'
    )
    # Install Docker (latest version)
    .run_cmd(
        "apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
    )
    # Clean up
    .run_cmd("apt-get clean && rm -rf /var/lib/apt/lists/*")
    .set_user("user")
    .set_workdir("/home/user")
    .set_start_cmd("sudo /bin/bash", "sleep 20")
)
