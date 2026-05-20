.PHONY: create-environment create-agent build-template show-environment start-worker send stop-worker

create-environment:
	uv run --project .. anthropic-managed-agents-create-environment $(NAME)

create-agent:
	uv run --project .. anthropic-managed-agents-create-agent $(NAME)

build-template:
	uv run --project .. anthropic-managed-agents-build-template

show-environment:
	uv run --project .. anthropic-managed-agents-show-environment

start-worker:
	uv run --project .. anthropic-managed-agents-start-worker

send:
	uv run --project .. anthropic-managed-agents-send-message "Run pwd, then echo hello from E2B"

stop-worker:
	uv run --project .. anthropic-managed-agents-stop-worker $(SANDBOX_ID)
