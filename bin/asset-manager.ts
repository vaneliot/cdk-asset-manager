#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib/core';
import { AssetManagerStack } from '../lib/asset-manager-stack';

if (!process.env.DOMAIN_PREFIX) {
  throw new Error('DOMAIN_PREFIX is not set — copy .env.example to .env and fill it in.');
}

const app = new cdk.App();
new AssetManagerStack(app, 'AssetManagerStack', {
   env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  domainPrefix: process.env.DOMAIN_PREFIX,
});
