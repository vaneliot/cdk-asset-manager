import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib/core';

import * as cdk from 'aws-cdk-lib/core';

// APIGW v2
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';  // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2-readme.html
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';  // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2_integrations-readme.html

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

import { Construct } from 'constructs';

// NOTE: Conventional sequence in declaring constructs
// - Data/storage first — S3, DynamoDB (things other resources will reference)
// - Compute next — Lambdas that read those storage resources' names/ARNs
// - Wiring/permissions — event notifications, grantX calls that connect compute to storage
// - Entry points last — API Gateway (or CloudFront, etc.) — since it's the "front door" that ties together compute you've already declared

export class AssetManagerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'AssetManagerQueue', {
      visibilityTimeout: Duration.seconds(300)
    });

    const topic = new sns.Topic(this, 'AssetManagerTopic');

    topic.addSubscription(new subs.SqsSubscription(queue));

    // DynamoDB
    const table = new dynamodb.TableV2(this, 'AssetsTableV2', {
      partitionKey: { name: 'asset_key', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(), // Serverless pay-per-request
      // removalPolicy: cdk.RemovalPolicy.RETAIN,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- S3
    // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html

    const bucket = new s3.Bucket(this, 'AssetsBucket', {
      // accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      // encryption: s3.BucketEncryption.S3_MANAGED,
      // blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // removalPolicy: RemovalPolicy.DESTROY,
      // autoDeleteObjects: true,
    });

    // --- Lambda functions for S3 uploads

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

    // API Gateway
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi');

    httpApi.addRoutes({
      path: '/create-upload-url',
      methods: [ apigwv2.HttpMethod.POST ],
      integration: createPresignedUploadUrlLambdaIntegration,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
  }
}
