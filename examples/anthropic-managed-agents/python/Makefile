.PHONY: install check build-template start-worker stop-worker send

install:
	python3.12 -m venv .venv
	.venv/bin/pip install -e .

check:
	.venv/bin/python -m py_compile *.py

build-template:
	.venv/bin/python build_template.py

start-worker:
	.venv/bin/python start_worker.py

stop-worker:
	.venv/bin/python stop_worker.py

send:
	.venv/bin/python send_message.py "Run pwd, then echo hello from E2B"

