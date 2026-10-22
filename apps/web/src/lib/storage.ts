import "server-only";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

/** Files anyone may see (logos, artist photos), served through /files/<key>. */
export const PUBLIC_BUCKET = process.env.S3_BUCKET_PUBLIC ?? "stagedesk-public";

const ensured = new Set<string>();

async function ensureBucket(bucket: string) {
  if (ensured.has(bucket)) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  ensured.add(bucket);
}

const imageTypes = {
  png: { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  webp: { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
} as const;

/**
 * Identifies an image by its first bytes rather than the browser-supplied type,
 * so a renamed HTML or SVG file can't be stored as a "logo".
 */
export function detectImage(bytes: Uint8Array): { ext: keyof typeof imageTypes; mime: string } | null {
  for (const [ext, { mime, magic }] of Object.entries(imageTypes)) {
    if (magic.every((b, i) => bytes[i] === b)) {
      if (ext === "webp" && String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") continue;
      return { ext: ext as keyof typeof imageTypes, mime };
    }
  }
  return null;
}

export async function putPublicFile(key: string, body: Uint8Array, contentType: string) {
  await ensureBucket(PUBLIC_BUCKET);
  await s3.send(
    new PutObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
  return `/files/${key}`;
}

export async function getPublicFile(key: string) {
  return s3.send(new GetObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key }));
}

export async function deletePublicFile(url: string | null | undefined) {
  if (!url?.startsWith("/files/")) return;
  await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: url.slice("/files/".length) })).catch(() => {});
}
