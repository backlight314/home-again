// Where photos and voice recordings live: an S3-compatible bucket (Cloudflare R2,
// Amazon S3, ...) when S3_BUCKET is set, otherwise data/media on this computer.
// Either way the album refers to a file as /media/<name>, and the server streams
// it from wherever it is, so the page stays same-origin (face crops and portrait
// cropping draw photos onto a canvas, which a cross-origin bucket URL would block).
import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export function createLocalMedia(dir) {
  const file = name => path.join(dir, path.basename(name));
  return {
    kind: `local folder (${dir})`,
    async put(name, bytes) { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(file(name), bytes); },
    async get(name) { return fs.readFile(file(name)); },
    async remove(name) { await fs.rm(file(name), { force: true }); },
    async exists(name) { return fs.access(file(name)).then(() => true, () => false); }
  };
}

// env: S3_BUCKET, S3_REGION (default "auto", right for R2), S3_ENDPOINT (R2 or any
// non-AWS service), S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (else the usual AWS
// credential chain). Files are kept under <familyId>/media/ in the bucket.
export function createBucketMedia({ familyId, types }) {
  const bucket = process.env.S3_BUCKET;
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(process.env.S3_ACCESS_KEY_ID ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } } : {})
  });
  const key = name => `${familyId}/media/${path.basename(name)}`;
  return {
    kind: `bucket ${bucket}${process.env.S3_ENDPOINT ? ' at ' + new URL(process.env.S3_ENDPOINT).host : ''}`,
    async put(name, bytes) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key(name), Body: bytes, ContentType: types[path.extname(name)] || 'application/octet-stream' }));
    },
    async get(name) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(name) }));
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async remove(name) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key(name) })); },
    async exists(name) {
      return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key(name) })).then(() => true, err => {
        if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return false;
        throw err;
      });
    }
  };
}
