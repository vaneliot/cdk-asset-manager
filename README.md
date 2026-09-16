# Asset Manager

A CDK (TypeScript) app for uploading files via presigned S3 URLs, with a DynamoDB record kept in sync automatically as files are added or removed.

See [docs/ARCHITECTURE-DIAGRAM.md](docs/ARCHITECTURE-DIAGRAM.md) for how the pieces fit together.

## Setup

Deploys and local testing should use a dedicated non-root IAM user, not `default` or root — see [docs/DEV-WORKFLOW.md](docs/DEV-WORKFLOW.md) for why and how to set one up.

## Quick start

Type-check the project:
```bash
npm run build
```

Run all Jest unit tests:
```bash
npm test
```

For everything else — deploying, local Lambda testing, the full command reference — see **[docs/DEV-WORKFLOW.md](docs/DEV-WORKFLOW.md)**, the source of truth for day-to-day usage.
