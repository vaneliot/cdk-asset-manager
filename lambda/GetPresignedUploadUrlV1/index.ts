// https://docs.aws.amazon.com/lambda/latest/dg/lambda-typescript.html
import { APIGatewayProxyHandler } from 'aws-lambda';

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/
import { getPresignedUploadUrl } from './getPresignedUploadUrl';

export const handler: APIGatewayProxyHandler = async (event) => {
  const { body } = event

  const parsedBody = body ? JSON.parse(body) : {};

  const { filename } = parsedBody

  const {
    data,
    error,
  } = await getPresignedUploadUrl({
    bucket: process.env.ASSETS_BUCKET!,
    filename,
  })

  if (error) {
    console.error(error)
  }

  if (!data) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to generate upload URL',
      }),
    };
  }

  const { url, key } = data
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      presignedUrl: url,
      key,
    }),
  };
};

/*
// Sample code for client - for uploading

const { presignedUrl } = await fetch('<your-function-url>', {
  method: 'POST',
  body: JSON.stringify({ filename: file.name }),
}).then(r => r.json());

await fetch(presignedUrl, { method: 'PUT', body: file });

*/
