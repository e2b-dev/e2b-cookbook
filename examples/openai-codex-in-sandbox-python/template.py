from e2b import Template

template = (
    Template()
    .from_image("ubuntu:22.04")
    .set_user("root")
    .set_workdir("/")
    .set_envs(
        {
            "DEBIAN_FRONTEND": "noninteractive",
        }
    )
    # Install Node.js 24.0
    # update and install curl in a single RUN command to reduce layers
    .run_cmd("apt-get update && apt-get install -y curl git-all ripgrep")
    # get install script and pass it to execute, then install nodejs in a single RUN command
    .run_cmd(
        "curl -sL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs"
    )
    # confirm that it was successful
    .run_cmd("node -v && npm -v")
    #
    #####
    # Install OpenAI Codex
    .run_cmd("npm install -g @openai/codex")
    .set_user("user")
    .set_workdir("/home/user")
)
