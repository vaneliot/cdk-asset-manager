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

## 2. `samconfig.toml` — stop repeating `-t cdk.out/AssetManagerStack.template.json`

SAM's own config file, not a workaround. Lets `sam local invoke` default its template path.

```toml
version = 0.1

[default.local_invoke.parameters]
template_file = "cdk.out/AssetManagerStack.template.json"
```

Once this exists, `-t ...` is never needed again on any `sam local invoke` call.

## 3. Ergonomic `sam local invoke` — via `make invoke`

Rather than a `package.json` script per function (would need a new entry for every Lambda, with no way to parameterize which one), the `Makefile`'s `invoke`/`invoke-fast` targets take `NAME` and an optional `EVENT` — `EVENT` defaults to `<NAME>.json` in `events/` if not given.

**With `cdk synth`** (always fresh — use when you've just changed infra or Lambda code and want the template/bundle to reflect it):
```bash
make invoke NAME=UpsertAssetV1
```

**Without `cdk synth`** (once you know `cdk.out/` is already up to date):
```bash
make invoke-fast NAME=UpsertAssetV1
```

**Pointing at a specific event file instead of the `<NAME>.json` default:**
```bash
make invoke NAME=UpsertAssetV1 EVENT=SomeOtherFile.json
```

These use dummy event data by default (`example-bucket`, `test/key`) — no real AWS resources are touched by the invoke itself, though the *code* inside the handler will attempt real AWS SDK calls (DynamoDB writes), which fail safely against a non-existent placeholder table/bucket until you point the event at real values (see the `--env-vars` note below for testing against real resources).

`GetPresignedUploadUrlV1` isn't wired up for `sam local invoke` yet — it's HTTP-triggered via a Function URL, not S3-event-triggered, and needs a different event shape than the two functions above. For now, test it against the real deployed endpoint:
```bash
curl "$(jq -r '.AssetManagerStack.getPresignedUploadUrlFunctionUrl' outputs.json)?key=test.jpg"
```

**Related — generating event files instead of hand-writing them:**
```
sam local generate-event s3 put > events/UpsertAssetV1.json
sam local generate-event s3 delete > events/DeleteAssetV1.json
```
Edit `bucket.name`/`object.key` afterward to match whatever you're testing.

**Related — `--env-vars` override, needed pre-deploy:** since `ASSETS_BUCKET`/`TABLE_NAME` reference CDK-auto-generated names, they're unresolved (`{"Ref": ...}`) until a real deploy exists. To test locally before deploying, pass explicit values:
```json
{ "UpsertAssetV1": { "ASSETS_BUCKET": "placeholder-bucket", "TABLE_NAME": "placeholder-table" } }
```
```bash
sam local invoke UpsertAssetV1 --event events/UpsertAssetV1.json --env-vars env.local.json
```
**To do:** `--env-vars` isn't wired into the `Makefile`'s `invoke`/`invoke-fast` targets yet (no `ENV_VARS` variable) — use the raw `sam` command above until that's added.
