# You can use most Debian-based base images
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies and customize sandbox
RUN apt-get update && apt-get install -y \
    curl \
    git \
    nodejs \
    npm

# Install nvm
RUN npm install -g n
RUN n 18

RUN npm install -g create-react-app
RUN mkdir /home/user
RUN cd /home/user && create-react-app my-app
