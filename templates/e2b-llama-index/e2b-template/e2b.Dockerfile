FROM python:3.11.6

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y \
  build-essential curl git util-linux

ENV PIP_DEFAULT_TIMEOUT=100 \
  PIP_DISABLE_PIP_VERSION_CHECK=1 \
  PIP_NO_CACHE_DIR=1

WORKDIR /home/user

COPY requirements.txt requirements.txt

RUN pip install -r requirements.txt

COPY . .
