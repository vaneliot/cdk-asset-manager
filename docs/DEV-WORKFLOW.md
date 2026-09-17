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

## 4. `cdk deploy` using the non-root IAM user

Deploys must use a dedicated non-root IAM user profile (`<your-iam-user-profile>` below) — not the account's root-tied profile (avoid for routine work) or the default profile. `make deploy` checks `AWS_PROFILE` is actually set first and fails fast with a clear message if not, rather than silently deploying with whatever's active.

```bash
export AWS_PROFILE=<your-iam-user-profile>
make deploy
```

**Background, for later reference:**
- `<your-iam-user-profile>` should be a plain IAM user authenticated via a **static access key** (`aws configure --profile <your-iam-user-profile>`) — chosen specifically because it doesn't expire, unlike the `aws login` browser flow (12-hour session cap, and also the likely cause of a `sam local invoke` `LoginRefreshRequired` error we hit when still using root).
- It has exactly one policy attached, `CdkDeployAssumeRole` — grants `sts:AssumeRole` on the CDK bootstrap roles only (tagged `aws-cdk:bootstrap-role`), not broad permissions directly. The actual deploy permissions live on the bootstrap roles themselves (created once via `cdk bootstrap`, done under root).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:ResourceTag/aws-cdk:bootstrap-role": [
            "image-publishing",
            "file-publishing",
            "deploy",
            "lookup"
          ]
        }
      }
    }
  ]
}
```

- This is also why a plain `aws cloudformation describe-stacks --profile <your-iam-user-profile>` fails with `AccessDenied` — that user has no direct CloudFormation permissions, only the ability to assume CDK's own roles. `cdk deploy`/`sam local invoke` work because they route through those roles; ad-hoc `aws` CLI queries with this profile generally won't, unless the policy is deliberately widened.

**Update:** `sam local invoke` now runs under this same non-root profile when testing against real resources, rather than a separate one — confirmed by AWS-side errors showing `<your-iam-user-profile>` as the caller identity.

That surfaced a gap worth understanding: `sam local invoke` does **not** assume the Lambda's own execution role. Any AWS SDK call made inside the handler runs as *this IAM user*, not as the role CDK grants via `table.grantReadWriteData(...)` in `asset-manager-stack.ts`. So real-credential local testing needs its own permissions on `<your-iam-user-profile>`, layered on top of the `CdkDeployAssumeRole` policy above — separate from, and in addition to, whatever the deployed Lambda's role has.

Added so far, via IAM console (inline policy, not CDK): `dynamodb:DeleteItem` on `AssetsTable`, needed to locally test `DeleteAssetV1` against the real table. Expect to add the equivalent for `PutItem`/`GetItem` if `UpsertAssetV1` gets the same real-credential local-testing treatment.

## 5. Other conventions, and open TODOs

**Already in place, noted here for reference:**
- **Shared AWS SDK client modules** — `lambda/shared/s3Client.ts`, `lambda/shared/dynamoClient.ts`. Each lambda that needs a client imports from here instead of declaring its own `new S3Client()`/`new DynamoDBDocumentClient()`. Not a runtime singleton across functions (each Lambda bundles its own copy), but is a singleton within one warm execution environment, and keeps client construction in one place if config (retries, endpoint override for LocalStack, etc.) is ever needed.
- **`commonLambdaProps`** — a shared object (`{ runtime, handler }`) spread into each `NodejsFunction` definition in `asset-manager-stack.ts`, instead of repeating the same two lines per function.
- **Jest discovers co-located tests** — `jest.config.js`'s `roots` is `['<rootDir>']` (Jest's actual default), so `*.test.ts` files next to source (e.g. `lambda/GetPresignedUploadUrlV1/getPresignedUploadUrl.test.ts`) are picked up, not just files under `test/`.
- **Testing pattern per lambda** — thin `index.ts` handler (parses event, calls logic function, shapes response) + separate logic file with the real behavior, independently unit-testable with AWS SDK calls mocked (`jest.mock('@aws-sdk/s3-request-presigner')`, etc.) rather than hitting real AWS in unit tests.

**Still to do:**
- [ ] **Local, fully-offline testing (LocalStack)** — not set up yet. Would let `S3Client`/DynamoDB clients point at a local Docker-emulated AWS instead of the real account, via an `endpoint` override (best added to the shared client modules above, gated by an env var like `AWS_ENDPOINT_URL` so it's a no-op in real deployments).
- [ ] **`.gitignore`: `cdk.context.json`** — CDK's auto-generated lookup cache isn't in there yet; add it if/when a context lookup (e.g. `Vpc.fromLookup`) gets introduced. (`outputs.json` is already ignored, from #1.)
- [ ] **Model dev-identity permissions through CDK, not the IAM console** — `CdkDeployAssumeRole` (#4) and the DynamoDB inline policy (#4) were both added via console click-ops, which conflicts with this project's stated goal (root `CLAUDE.md`: "Everything provisioned through CDK and committed to git — no ClickOps"). Acceptable stopgap for now since these are personal dev-identity permissions, not part of the deployed app's own infrastructure — but revisit once the set of permissions needed for real-credential local testing stabilizes, e.g. as a small `iam.Policy` construct attached to the dev user, defined and committed alongside the rest of the stack.
- [ ] Establish the process for ensuring data integrity and preventing data drift between S3 and DynamoDB in case DynamoDB needs a schema change.
