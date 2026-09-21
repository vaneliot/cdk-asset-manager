import { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';

import { docClient } from '../shared/dynamoClient';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../shared/s3Client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AssetRecord } from '../shared/asset';

type GetAssetSuccessBody = AssetRecord & {
  downloadUrl: string;
};

type GetAssetErrorBody = {
  message: string;
};

type GetAssetResponseBody = GetAssetSuccessBody | GetAssetErrorBody;

// Single chokepoint every return goes through, so the stringified body's shape
// is always checked against GetAssetResponseBody before it becomes a string.
function respond(statusCode: number, body: GetAssetResponseBody): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body) };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const assetKey = event.pathParameters?.assetKey;

  if (!assetKey) {
    return respond(400, { message: 'assetKey is required' });
  }

  let asset: AssetRecord | undefined;
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { asset_key: assetKey },
    }));

    asset = Item as AssetRecord | undefined;
  } catch (error) {
    console.error('DynamoDB lookup failed:', error);
    return respond(500, { message: 'Internal error' });
  }

  if (!asset) {
    return respond(404, { message: 'Asset not found' });
  }

  // TODO: ownership check once an owner attribute exists on the record

  let downloadUrl: string;
  try {
    downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.ASSETS_BUCKET!,
        Key: assetKey,
      }),
      { expiresIn: 300 },
    );
  } catch (error) {
    console.error('Failed to generate download URL:', error);
    return respond(500, { message: 'Internal error' });
  }

  return respond(200, { ...asset, downloadUrl });
};
