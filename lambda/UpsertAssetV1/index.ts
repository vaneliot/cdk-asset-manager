import { S3Handler } from 'aws-lambda';

import { s3Client } from '../shared/s3Client';

import { docClient } from '../shared/dynamoClient';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
      if (record.s3.bucket.name !== process.env.ASSETS_BUCKET) {
      // unexpected bucket — ignore or alarm
      // TODO: Refactor later
      console.warn(`[WARN] Bucket is not ${process.env.ASSETS_BUCKET}; ${record.s3.bucket.name}`)
    }

    const key = record.s3.object.key

    const params = {
      TableName: process.env.TABLE_NAME!,
      // TODO: Types
      Item: {
        asset_key: key,
        created_at: new Date().toISOString(),
      }
    }

    try {
      const data = await docClient.send(new PutCommand(params));
      console.log('result : ' + JSON.stringify(data));
    } catch (error) {
      console.error("Error:", error);
    }

  }
};
