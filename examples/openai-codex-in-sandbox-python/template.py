from e2b import Template

template = (
    Template()
    .from_image("ubuntu:22.04")
    # Install Node.js 24.0
    .apt_install(["curl", "git-all", "ripgrep"])
    .set_envs(
        {
            "DEBIAN_FRONTEND": "noninteractive",
        }
    )
    # get install script and pass it to execute, then install nodejs in a single RUN command
    .run_cmd(
        "curl -sL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs",
        user="root",
    )
    # confirm that it was successful
    .run_cmd("node -v && npm -v")
    #
    #####
    # Install OpenAI Codex
    .npm_install("@openai/codex")
)
