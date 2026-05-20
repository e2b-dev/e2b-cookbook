.PHONY: build-template start-webhook-server stop-worker

build-template:
	uv run --project .. anthropic-managed-agents-build-template

start-webhook-server:
	uv run --project .. anthropic-managed-agents-start-webhook-server

stop-worker:
	uv run --project .. anthropic-managed-agents-stop-worker $(SANDBOX_ID)
