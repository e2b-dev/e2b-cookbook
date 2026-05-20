.PHONY: install check build-template start-worker start-webhook-server stop-worker send

install:
	python3.12 -m venv .venv
	.venv/bin/pip install -e .

check:
	.venv/bin/python -m compileall anthropic_managed_agents_e2b *.py

build-template:
	.venv/bin/python build_template.py

start-worker:
	.venv/bin/python start_worker.py

start-webhook-server:
	.venv/bin/anthropic-managed-agents-start-webhook-server

stop-worker:
	.venv/bin/python stop_worker.py $(SANDBOX_ID)

send:
	.venv/bin/python send_message.py "Run pwd, then echo hello from E2B"
