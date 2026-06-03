.PHONY: build-template show-environment start-app-webhook-server stop-worker

build-template:
	uv run --project .. anthropic-managed-agents-build-template

show-environment:
	uv run --project .. anthropic-managed-agents-show-environment

start-app-webhook-server:
	uv run --project .. anthropic-managed-agents-start-app-webhook-server

stop-worker:
	uv run --project .. anthropic-managed-agents-stop-worker $(SANDBOX_ID)
