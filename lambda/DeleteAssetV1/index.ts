import { S3Handler } from 'aws-lambda';

import { s3Client } from '../shared/s3Client';

import { docClient } from '../shared/dynamoClient';

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
      if (record.s3.bucket.name !== process.env.ASSETS_BUCKET) {
      // unexpected bucket — ignore or alarm
      // TODO: Refactor later
      console.warn(`[WARN] Bucket is not ${process.env.ASSETS_BUCKET}`)
    }

    // TODO: Continue
  }
};
