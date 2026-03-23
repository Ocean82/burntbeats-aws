// @ts-check
/**
 * Presigned GET URLs so the browser can load stems from S3 after GET /api/stems/file redirects.
 * Requires the same AWS credentials as uploads (IAM role or S3_ACCESS_KEY / S3_SECRET_KEY).
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * @param {string} bucket
 * @param {string} key
 * @param {string} [region]
 * @returns {Promise<string>}
 */
export async function presignStemGetUrl(bucket, key, region) {
  const r = region || process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
  const client = new S3Client({ region: r });
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const expires = Number(process.env.S3_PRESIGN_EXPIRES_SECONDS);
  const expiresIn = Number.isFinite(expires) && expires > 0 ? expires : 3600;
  return getSignedUrl(client, cmd, { expiresIn });
}
