# AWS/CDK/SAM quality-of-life targets — only for commands where a default or
# parameter is worth tucking away. Plain passthroughs (cdk synth, cdk diff)
# aren't here; just run them directly. JS-specific commands (build/watch/test)
# stay as npm scripts — see package.json. Background: docs/DEV-WORKFLOW.md.
#
# Usage: make <target> [VAR=value ...]
# Run `make help` to list targets.

EVENTS_DIR   := events
OUTPUTS_FILE := outputs.json

# EVENT defaults to "<NAME>.json" if not given explicitly. Deferred (`?=`, not
# `:=`) so it's computed from whatever NAME is passed on the command line.
EVENT ?= $(NAME).json

.PHONY: help deploy invoke invoke-fast

help:
	@echo "make deploy                                cdk deploy, writes $(OUTPUTS_FILE)"
	@echo "make invoke NAME=<Fn> [EVENT=<file.json>]  cdk synth, then sam local invoke <Fn>"
	@echo "make invoke-fast NAME=<Fn> [EVENT=<file>]  same as invoke, skips cdk synth"

deploy:
	cdk deploy --outputs-file $(OUTPUTS_FILE)

invoke:
	@test -n "$(NAME)" || (echo "NAME is required, e.g. make invoke NAME=UpsertAssetV1" && exit 1)
	cdk synth
	sam local invoke $(NAME) --event $(EVENTS_DIR)/$(EVENT)

invoke-fast:
	@test -n "$(NAME)" || (echo "NAME is required, e.g. make invoke-fast NAME=UpsertAssetV1" && exit 1)
	sam local invoke $(NAME) --event $(EVENTS_DIR)/$(EVENT)
