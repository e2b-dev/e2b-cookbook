.PHONY: create-environment create-agent build-template start-worker send stop-worker

create-environment:
	npm --prefix .. run create-environment -- $(NAME)

create-agent:
	npm --prefix .. run create-agent -- $(NAME)

build-template:
	npm --prefix .. run build-template

start-worker:
	npm --prefix .. run start-worker

send:
	npm --prefix .. run send -- "Run pwd, then echo hello from E2B"

stop-worker:
	npm --prefix .. run stop-worker -- $(SANDBOX_ID)
