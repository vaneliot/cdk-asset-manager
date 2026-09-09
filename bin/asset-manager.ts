#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AssetManagerStack } from '../lib/asset-manager-stack';

const app = new cdk.App();
new AssetManagerStack(app, 'AssetManagerStack');
