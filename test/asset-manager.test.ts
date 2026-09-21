import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as AssetManager from '../lib/asset-manager-stack';

function synth() {
  const app = new cdk.App();
  const stack = new AssetManager.AssetManagerStack(app, 'MyTestStack', {
    domainPrefix: 'test-asset-manager',
  });
  return Template.fromStack(stack);
}

// The SQS Queue / SNS Topic below were the original `cdk init` sample resources.
// They're commented out in the stack itself (not part of the real upload pipeline),
// so there's nothing left to assert against — keeping these as sample code here

// test('SQS Queue and SNS Topic Created', () => {
//   const template = synth();
//
//   template.hasResourceProperties('AWS::SQS::Queue', {
//     VisibilityTimeout: 300
//   });
//   template.resourceCountIs('AWS::SNS::Topic', 1);
// });

describe('storage', () => {
  test('AssetsTableV2 is keyed on asset_key, pay-per-request', () => {
    const template = synth();

    // hasResourceProperties: match a subset of properties on a resource of this type
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'asset_key', AttributeType: 'S' },
      ]),
      KeySchema: [
        { AttributeName: 'asset_key', KeyType: 'HASH' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('exactly one assets bucket exists', () => {
    const template = synth();

    // resourceCountIs: just asserts presence/count, no property inspection
    template.resourceCountIs('AWS::S3::Bucket', 1);

    // NOTE: intentionally not asserting PublicAccessBlockConfiguration here —
    // the bucket doesn't set blockPublicAccess in code at all, so there's
    // nothing in the template to assert on. It currently relies entirely on
    // the AWS account's own default. Add this assertion once that's fixed.
  });
});

describe('auth (Cognito)', () => {
  test('user pool supports self-signup via email, with email auto-verification', () => {
    const template = synth();

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: false, // false = self sign-up is allowed
      },
    });
  });

  test('web client is configured for the Hosted UI authorization-code flow', () => {
    const template = synth();

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: Match.arrayWith(['https://example.com/callback']),
    });
  });

  test('Hosted UI domain uses the prefix passed in via props', () => {
    const template = synth();

    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'test-asset-manager',
    });
  });
});

describe('API Gateway', () => {
  test('every route requires a JWT (Cognito) — regression guard against an accidentally-public route', () => {
    const template = synth();

    // Match.objectLike: assert on a couple of fields without having to spell out the entire (larger, mostly-generated) resource shape.
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', Match.objectLike({
      RouteKey: 'POST /create-upload-url',
      AuthorizationType: 'JWT',
    }));

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', Match.objectLike({
      RouteKey: 'GET /assets/{assetKey}',
      AuthorizationType: 'JWT',
    }));

    template.resourceCountIs('AWS::ApiGatewayV2::Route', 2);
  });
});

describe('compute', () => {
  test('exactly the expected number of Lambda functions are deployed', () => {
    const template = synth();

    // 4 handlers (GetPresignedUploadUrlV1, UpsertAssetV1, DeleteAssetV1, GetAssetV1)
    // + 1 CDK-generated custom-resource Lambda that handles the S3 bucket event notifications (Custom::S3BucketNotifications)
    template.resourceCountIs('AWS::Lambda::Function', 5);
  });
});
