import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib/core';
import * as cdk from 'aws-cdk-lib/core';
// import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

import { Construct } from 'constructs';

export class AssetManagerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const queue = new sqs.Queue(this, 'AssetManagerQueue', {
      visibilityTimeout: Duration.seconds(300)
    });

    const topic = new sns.Topic(this, 'AssetManagerTopic');

    topic.addSubscription(new subs.SqsSubscription(queue));

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

    const s3PresignFunction = new NodejsFunction(this, "S3PresignedUpload", {
      entry: path.join(__dirname, "..", "lambda", "s3PresignedUrl", "index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        ASSETS_BUCKET: bucket.bucketName
      },
    });

    bucket.grantPut(s3PresignFunction);
    // NOTE: Use grantWrite if `delete` permission is needed

    // TODO: Migrate to API Gateway
    const s3PresignFunctionUrl = s3PresignFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, "authedFunctionUrlOutput", {
      value: s3PresignFunctionUrl.url,
    })

    // TODO: Add Lambda function that handles the actual upload operation

    // TODO
    // --- DynamoDB

    // const table = new dynamodb.TableV2(this, 'AssetsTable', {
    //   partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
    //   billing: dynamodb.Billing.onDemand(), // Serverless pay-per-request
    //   // removalPolicy: cdk.RemovalPolicy.RETAIN,
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    // });
    
  }
}
