# Dev workflow

The source of truth for how to actually use this project day to day — deploying, local Lambda testing, and the reasoning behind each piece of tooling. `README.md` only covers the bare-minimum quick start (build/test) and points here for everything else, so command syntax lives in exactly one place.

AWS/CDK/SAM tooling lives in the `Makefile` — only for commands where a default or parameter is worth tucking away (see `make help`). Plain passthroughs like `cdk synth`/`cdk diff` aren't wrapped, just run them directly. `package.json` is reserved for JS-specific commands (build/watch/test) only.

## 1. `outputs.json` — read stack outputs (e.g. the Function URL) without the AWS console

`cdk deploy` already prints outputs to the terminal, but writing them to a file means you can just open it in VS Code instead of re-running a command or opening the console.

```bash
make deploy
```

- Writes something like `{ "AssetManagerStack": { "someFunctionUrlOutput": "https://..." } }` to a local `outputs.json`.
- Only goes stale if a resource behind an output is deleted/recreated (e.g. the Function URL, which gets a new URL if the function is deleted and re-added).
