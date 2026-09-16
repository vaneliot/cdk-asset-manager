import { S3Handler } from 'aws-lambda';

import { docClient } from '../shared/dynamoClient';
import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    if (record.s3.bucket.name !== process.env.ASSETS_BUCKET) {
      // unexpected bucket — ignore or alarm
      // TODO: Refactor later
      console.warn(`[WARN] Bucket is not ${process.env.ASSETS_BUCKET}`)
    }

    console.log('DeleteAssetV1', JSON.stringify({ record }, null, 2))

    const key = record.s3.object.key;

    try {
      const retrievalResult = await docClient.send(new QueryCommand({
        TableName: process.env.TABLE_NAME!,
        // TODO: Types
        KeyConditionExpression: 'asset_key = :key',
        ExpressionAttributeValues: { ':key': key },
      }));

      const { Items } = retrievalResult

      if (!Items || !Items?.length) {
        console.log('result : ' + JSON.stringify(retrievalResult));
        continue
      }

      for (const item of Items) {
        const deletionResult = await docClient.send(new DeleteCommand({
          TableName: process.env.TABLE_NAME!,
          Key: {
            asset_key: item.asset_key,
            created_at: item.created_at,
          },
        }));

        // TODO: Use a custom flag and create logger utils
        console.log('result : ' + JSON.stringify(deletionResult));
      }

    } catch (error) {
      console.error("Error:", error);
    }

  }

};
