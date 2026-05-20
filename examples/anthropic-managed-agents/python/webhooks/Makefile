.PHONY: build-template show-environment start-webhook-server stop-worker

build-template:
	uv run --project .. anthropic-managed-agents-build-template

show-environment:
	uv run --project .. anthropic-managed-agents-show-environment

start-webhook-server:
	uv run --project .. anthropic-managed-agents-start-webhook-server $(if $(SANDBOX_ID),--sandbox-id $(SANDBOX_ID),)

stop-worker:
	uv run --project .. anthropic-managed-agents-stop-worker $(SANDBOX_ID)
