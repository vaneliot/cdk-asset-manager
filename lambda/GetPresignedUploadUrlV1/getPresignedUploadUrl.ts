// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html#actions

// https://docs.aws.amazon.com/lambda/latest/dg/typescript-handler.html
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from "../shared/s3Client";

export const VALIDITY_SECONDS = 60 * 60

type S3PresignedUrlResult = {
  data: {
    url: string
    key: string
  } | null
  error: unknown
}

export async function getPresignedUploadUrl({
  bucket,
  filename = 'file',
  withTimestamp = true,
}: {
  bucket: string;
  filename?: string;
  withTimestamp?: boolean
}): Promise<S3PresignedUrlResult> {
  if (!bucket) {
    const errorText = 'getPresignedUploadUrl(): Invalid params'

    console.warn(errorText, { bucket });
    return {
      data: null,
      error: new Error(errorText)
    };
  }

  const prefix = withTimestamp ? `${Date.now()}-${crypto.randomUUID()}-` : ''

  const key = `${prefix}${filename}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: VALIDITY_SECONDS });

  console.log(url);

  return {
    data: {
      url,
      key,
    },
    error: null
  };
}
