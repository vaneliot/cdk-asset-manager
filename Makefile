# AWS/CDK/SAM quality-of-life targets — only for commands where a default or
# parameter is worth tucking away. Plain passthroughs (cdk synth, cdk diff)
# aren't here; just run them directly. JS-specific commands (build/watch/test)
# stay as npm scripts — see package.json. Background: docs/DEV-WORKFLOW.md.
#
# Usage: make <target> [VAR=value ...]
# Run `make help` to list targets.

OUTPUTS_FILE := outputs.json

.PHONY: help deploy

help:
	@echo "make deploy   cdk deploy, writes $(OUTPUTS_FILE)"

deploy:
	cdk deploy --outputs-file $(OUTPUTS_FILE)
