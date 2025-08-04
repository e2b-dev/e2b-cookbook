# You can use most Debian-based base images
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 24.0

# update and install curl in a single RUN command to reduce layers
RUN apt-get update && apt-get install -y curl git-all ripgrep

# get install script and pass it to execute, then install nodejs in a single RUN command
RUN curl -sL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs

# confirm that it was successful
RUN node -v && npm -v

#####

# Install Anthropic Claude Code
RUN npm install -g @anthropic-ai/claude-code
