import { S3Handler } from 'aws-lambda';

import { docClient } from '../shared/dynamoClient';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { AssetRecord } from '../shared/asset';

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    if (record.s3.bucket.name !== process.env.ASSETS_BUCKET) {
      // unexpected bucket — ignore or alarm
      // TODO: Refactor later
      console.warn(`[WARN] Bucket is not ${process.env.ASSETS_BUCKET}; ${record.s3.bucket.name}`)
    }

    const key = record.s3.object.key

    const item: AssetRecord = {
      asset_key: key,
      created_at: new Date().toISOString(),
    }

    const params = {
      TableName: process.env.TABLE_NAME!,
      Item: item,
    }

    try {
      const data = await docClient.send(new PutCommand(params));
      // TODO: Use a custom flag and create logger utils
      // console.log('result : ' + JSON.stringify(data));
    } catch (error) {
      console.error("Error:", error);
    }

  }
};
