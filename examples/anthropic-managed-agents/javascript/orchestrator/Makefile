.PHONY: create-environment create-agent build-template show-environment start-worker send upload-file stop-worker

create-environment:
	npm --prefix .. run create-environment -- $(NAME)

create-agent:
	npm --prefix .. run create-agent -- $(NAME)

build-template:
	npm --prefix .. run build-template

show-environment:
	npm --prefix .. run show-environment

start-worker:
	npm --prefix .. run start-worker

send:
	npm --prefix .. run send -- "Run pwd, then echo hello from E2B"

upload-file:
	npm --prefix .. run upload-file -- $(SANDBOX_ID) $(FILE) $(or $(REMOTE_PATH),/mnt/session/uploads/example-input.txt)

stop-worker:
	npm --prefix .. run stop-worker -- $(SANDBOX_ID)
