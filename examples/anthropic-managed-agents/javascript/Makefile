.PHONY: install check build-template start-worker start-webhook-server stop-worker send

install:
	npm install

check:
	npm run check

build-template:
	npm run build-template

start-worker:
	npm run start-worker

start-webhook-server:
	npm run start-webhook-server

stop-worker:
	npm run stop-worker -- $(SANDBOX_ID)

send:
	npm run send -- "Run pwd, then echo hello from E2B"
