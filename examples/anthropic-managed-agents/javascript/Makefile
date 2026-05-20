.PHONY: install check build-template show-environment start-worker start-webhook-server start-app-webhook-server stop-worker send upload-file

install:
	npm install

check:
	npm run check

build-template:
	npm run build-template

show-environment:
	npm run show-environment

start-worker:
	npm run start-worker

start-webhook-server:
	npm run start-webhook-server

start-app-webhook-server:
	npm run start-app-webhook-server

stop-worker:
	npm run stop-worker -- $(SANDBOX_ID)

send:
	npm run send -- "Run pwd, then echo hello from E2B"

upload-file:
	npm run upload-file -- $(SANDBOX_ID) $(FILE) $(REMOTE_PATH)
