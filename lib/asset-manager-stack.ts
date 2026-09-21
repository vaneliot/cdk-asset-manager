import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib/core';

import * as cdk from 'aws-cdk-lib/core';

// Cognito
// https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cognito-readme.html
// https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cognito.UserPool.html
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

// APIGW v2
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';  // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2-readme.html
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';  // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2_integrations-readme.html

// import * as sns from 'aws-cdk-lib/aws-sns';
// import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

import { Construct } from 'constructs';

// NOTE: Organized by feature, in roughly the order a user would move through them
// (sign in -> upload -> [sync happens automatically] -> retrieve), rather than by
// declare-everything-then-wire-everything. Each section co-locates a resource with
// its own permissions/wiring, since that's the more readable unit at this scale.
// Storage is foundational and sits above every feature that references it.

export interface AssetManagerStackProps extends StackProps {
  // Cognito Hosted UI domain prefix — must be globally unique across ALL AWS
  // accounts (see .env.example). Passed in via props rather than read from
  // process.env directly here, per CDK's own guidance: env var lookups belong
  // at the top of the app (bin/asset-manager.ts), not inside the Stack itself.
  domainPrefix: string;
}

export class AssetManagerStack extends Stack {
  constructor(scope: Construct, id: string, props: AssetManagerStackProps) {
    super(scope, id, props);

    // --- ORIGINAL SAMPLE CODE (SNS, SQS)

    // const queue = new sqs.Queue(this, 'AssetManagerQueue', {
    //   visibilityTimeout: Duration.seconds(300)
    // });

    // const topic = new sns.Topic(this, 'AssetManagerTopic');

    // topic.addSubscription(new subs.SqsSubscription(queue));

    // --- STORAGE (DynamoDB, S3)
    // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html

    const table = new dynamodb.TableV2(this, 'AssetsTableV2', {
      partitionKey: { name: 'asset_key', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(), // Serverless pay-per-request
      // removalPolicy: cdk.RemovalPolicy.RETAIN,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const bucket = new s3.Bucket(this, 'AssetsBucket', {
      // accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      // encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // removalPolicy: RemovalPolicy.DESTROY,
      // autoDeleteObjects: true,
    });

    // --- AUTH (Cognito)
    const pool = new cognito.UserPool(this, 'AssetManagerPool', {
      selfSignUpEnabled: true,        // users can register themselves, not just admin-created
      signInAliases: { email: true }, // sign in with email instead of a username
      autoVerify: { email: true },    // Cognito emails a verification code automatically
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const SIGNIN_REDIRECT_URI = 'https://example.com/callback'

    const poolClient = pool.addClient('WebClient', {
      // Use `oAuth` to use the premade signin/signup frontend page
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        // scopes: [ cognito.OAuthScope.OPENID ],
        callbackUrls: [ SIGNIN_REDIRECT_URI ],
        logoutUrls: [ 'https://example.com/signin' ],
      },
      // NOTE: Use authFlows in case you would be using your own signin/signup frontend page
      // authFlows: {
      //   userSrp: true,
      //   userPassword: true,
      // }
    });

    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cognito-readme.html#domains
    const userPoolDomain = pool.addDomain('AssetManagerDomain', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });

    // In case you are to use a separate stack for auth, you may use this approach:
    // const myUserPoolDomain = cognito.UserPoolDomain.fromDomainName(this, 'my-user-pool-domain', 'domain-name');

    // NOTE: This output is optional. This is added just so we can easily reference the hosted UI URL.
    new cdk.CfnOutput(this, 'SignInUrl', {
      value: userPoolDomain.signInUrl(poolClient, { redirectUri: SIGNIN_REDIRECT_URI }),
    });

    const authorizer = new HttpUserPoolAuthorizer('AssetManagerAuthorizer', pool, {
      userPoolClients: [poolClient],
    });

    // --- API GATEWAY SHELL — features below attach their own routes to this
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      defaultAuthorizer: authorizer, // enforce Cognito auth on every route by default
    });

    // --- UPLOAD FEATURE (Lambda, S3, API Gateway)
    const getPresignedUploadUrlFunction = new NodejsFunction(this, "GetPresignedUploadUrlV1", {
      entry: path.join(__dirname, "..", "lambda/GetPresignedUploadUrlV1/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        ASSETS_BUCKET: bucket.bucketName
      },
    });

    bucket.grantPut(getPresignedUploadUrlFunction);
    // NOTE: Use grantWrite if `delete` permission is needed

    // CfnOutput version. Comment out when using the APIGW2 Lambda Integration
    // const createPresignedUploadUrlFunctionUrl = getPresignedUploadUrlFunction.addFunctionUrl({
    //   authType: lambda.FunctionUrlAuthType.NONE,
    // });

    // new cdk.CfnOutput(this, "createPresignedUploadUrlFunctionUrl", {
    //   value: createPresignedUploadUrlFunctionUrl.url,
    // })

    const createPresignedUploadUrlLambdaIntegration = new HttpLambdaIntegration('CreatePresignedUploadUrlFunctionUrl', getPresignedUploadUrlFunction);

    httpApi.addRoutes({
      path: '/create-upload-url',
      methods: [ apigwv2.HttpMethod.POST ],
      integration: createPresignedUploadUrlLambdaIntegration,

      // authorizer examples
      // authorizer, // add this to enforce Cognito auth on a specific endpoint
      // authorizer: new apigwv2.HttpNoneAuthorizer(),  // add this if the whole API is gated, and a particular endpoint needs to be public
    });

    // --- ASSET SYNC FEATURE (Lambda, S3, DynamoDB) — reactive, not client-facing: keeps DynamoDB in sync with S3
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_notifications-readme.html

    const upsertAssetFunction = new NodejsFunction(this, 'UpsertAssetV1', {
      entry: path.join(__dirname, "..", "lambda/UpsertAssetV1/index.ts"),
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler',
      environment: {
        ASSETS_BUCKET: bucket.bucketName,
        TABLE_NAME: table.tableName,
      },
    });

    const deleteAssetFunction = new NodejsFunction(this, 'DeleteAssetV1', {
      entry: path.join(__dirname, "..", "lambda/DeleteAssetV1/index.ts"),
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler',
      environment: {
        ASSETS_BUCKET: bucket.bucketName,
        TABLE_NAME: table.tableName
      },
    });

    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(upsertAssetFunction));
    bucket.addEventNotification(s3.EventType.OBJECT_REMOVED, new s3n.LambdaDestination(deleteAssetFunction));

    table.grantReadWriteData(upsertAssetFunction)
    table.grantReadWriteData(deleteAssetFunction)

    // --- RETRIEVAL FEATURE (Lambda, S3, DynamoDB, API Gateway)
    const getAssetFunction = new NodejsFunction(this, 'GetAssetV1', {
      entry: path.join(__dirname, "..", "lambda/GetAssetV1/index.ts"),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        ASSETS_BUCKET: bucket.bucketName,
        TABLE_NAME: table.tableName,
      },
    });

    bucket.grantRead(getAssetFunction);
    table.grantReadData(getAssetFunction);

    const getAssetLambdaIntegration = new HttpLambdaIntegration('GetAssetFunctionIntegration', getAssetFunction);

    httpApi.addRoutes({
      path: '/assets/{assetKey}',
      methods: [apigwv2.HttpMethod.GET],
      integration: getAssetLambdaIntegration,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
  }
}
