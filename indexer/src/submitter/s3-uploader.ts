/**
 * S3 Uploader — uploads tree data to S3-compatible storage.
 *
 * - Balances tree: `balances-trees/{block}.json`
 * - Ownership tree: `ownership-trees/latest.json` (overwritten on each update)
 *
 * Non-fatal: logs a warning and continues if upload fails.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { gzipSync } from "zlib";
import { config } from "../config";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    };

    if (config.s3Endpoint) {
      clientConfig.endpoint = config.s3Endpoint;
      clientConfig.forcePathStyle = true;
    }

    s3Client = new S3Client(clientConfig);
  }
  return s3Client;
}

/**
 * Upload balances tree data to S3.
 *
 * @param block - The snapshot block number
 * @param treeData - The tree data object to serialize as JSON
 * @returns The S3 key on success, or null on failure
 */
export async function uploadBalancesTree(
  block: number,
  treeData: object
): Promise<string | null> {
  const key = `balances-trees/${block}.json`;

  try {
    const client = getS3Client();
    const body = gzipSync(Buffer.from(JSON.stringify(treeData)));

    await client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ContentEncoding: "gzip",
      })
    );

    console.log(`[s3-uploader] Uploaded ${key} (${body.length} bytes gzipped)`);
    return key;
  } catch (err) {
    console.warn(`[s3-uploader] Failed to upload ${key}:`, err);
    return null;
  }
}

/**
 * Upload ownership tree data to S3.
 *
 * Overwrites `ownership-trees/latest.json` on each call.
 *
 * @param treeData - The tree data object to serialize as JSON
 * @returns The S3 key on success, or null on failure
 */
export async function uploadOwnershipTree(
  treeData: object
): Promise<string | null> {
  const key = "ownership-trees/latest.json";

  try {
    const client = getS3Client();
    const body = gzipSync(Buffer.from(JSON.stringify(treeData)));

    await client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ContentEncoding: "gzip",
      })
    );

    console.log(`[s3-uploader] Uploaded ${key} (${body.length} bytes gzipped)`);
    return key;
  } catch (err) {
    console.warn(`[s3-uploader] Failed to upload ${key}:`, err);
    return null;
  }
}
