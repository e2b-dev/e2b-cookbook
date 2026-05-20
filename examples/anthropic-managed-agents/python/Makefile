.PHONY: install check build-template start-worker start-webhook-server stop-worker send

install:
	python3.12 -m venv .venv
	.venv/bin/pip install -e .

check:
	.venv/bin/python -m compileall anthropic_managed_agents_e2b

build-template:
	.venv/bin/anthropic-managed-agents-build-template

start-worker:
	.venv/bin/anthropic-managed-agents-start-worker

start-webhook-server:
	.venv/bin/anthropic-managed-agents-start-webhook-server

stop-worker:
	.venv/bin/anthropic-managed-agents-stop-worker $(SANDBOX_ID)

send:
	.venv/bin/anthropic-managed-agents-send-message "Run pwd, then echo hello from E2B"
