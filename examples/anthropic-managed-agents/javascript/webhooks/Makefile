.PHONY: build-template show-environment start-webhook-server stop-worker

build-template:
	npm --prefix .. run build-template

show-environment:
	npm --prefix .. run show-environment

start-webhook-server:
	npm --prefix .. run start-webhook-server -- $(if $(SANDBOX_ID),--sandbox-id $(SANDBOX_ID),)

stop-worker:
	npm --prefix .. run stop-worker -- $(SANDBOX_ID)
