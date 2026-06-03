import { Router } from "express";
import { getAuth } from "@clerk/express";

const router = Router();

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

function isR2Configured() {
  const c = getR2Config();
  return !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucketName);
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(secretKey: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secretKey), date);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

router.get("/api/upload/presign", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isR2Configured()) {
    return res.status(503).json({ error: "R2 not configured", notConfigured: true });
  }

  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = getR2Config();
  const filename = (req.query.filename as string) || "video.mp4";
  const contentType = (req.query.contentType as string) || "video/mp4";

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `videos/${userId}/${Date.now()}_${safeFilename}`;

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");
  const region = "auto";
  const service = "s3";
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const host = `${accountId}.r2.cloudflarestorage.com`;

  const expiresSeconds = 3600;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const queryParams = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ].sort(([a], [b]) => a.localeCompare(b));

  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";

  const canonicalRequest = [
    "PUT",
    `/${bucketName}/${key}`,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const hashedRequest = toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest))
  );

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashedRequest,
  ].join("\n");

  const signingKey = await getSigningKey(secretAccessKey!, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const presignedUrl =
    `${endpoint}/${bucketName}/${key}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

  const finalPublicUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${key}`
    : `${endpoint}/${bucketName}/${key}`;

  res.json({ presignedUrl, publicUrl: finalPublicUrl, key });
});

export default router;
