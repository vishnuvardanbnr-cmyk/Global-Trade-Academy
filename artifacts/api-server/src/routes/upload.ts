import { Router } from "express";
import multer from "multer";
import { join, extname } from "path";
import { mkdirSync, createReadStream, unlink, readdirSync, statSync, rmSync } from "fs";
import https from "https";
import { execFile } from "child_process";
import { getAuth } from "../lib/auth";

/* ════════════════════════════════════════════════════
   R2 config  (account / bucket are not secrets)
════════════════════════════════════════════════════ */
const R2_ACCOUNT_ID = "0b38f4d096ce777512f9368f01bba27a";
const R2_BUCKET     = process.env.R2_BUCKET_NAME ?? "bicacademy";
const R2_ENDPOINT   = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_HOST       = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function r2Keys() {
  return {
    id:     process.env.R2_ACCESS_KEY_ID     ?? "",
    secret: process.env.R2_SECRET_ACCESS_KEY ?? "",
  };
}
function r2Ready() { const k = r2Keys(); return !!(k.id && k.secret); }

/* ════════════════════════════════════════════════════
   AWS Sig V4 helpers (pure, no SDK needed)
════════════════════════════════════════════════════ */
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as any, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}
function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as any));
}
async function signingKey(secret: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate    = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion  = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

interface SigV4Headers { [key: string]: string; }

/** Build Authorization header for a signed request (not presigned). */
async function signRequest(opts: {
  method:       string;
  path:         string;       // must start with /
  query?:       string;       // pre-encoded canonical query string
  contentType?: string;       // omit for GET/HEAD
  bodyHash:     string;       // hex SHA-256 of body, or empty-hash for GET
}): Promise<SigV4Headers> {
  const { id, secret } = r2Keys();
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope     = `${dateStamp}/auto/s3/aws4_request`;

  /* Only include content-type in signed headers when actually sending a body */
  const includeContentType = !!(opts.contentType);
  const signedHdrs = includeContentType
    ? "content-type;host;x-amz-content-sha256;x-amz-date"
    : "host;x-amz-content-sha256;x-amz-date";

  const canonicalHdrLines = [
    ...(includeContentType ? [`content-type:${opts.contentType}`] : []),
    `host:${R2_HOST}`,
    `x-amz-content-sha256:${opts.bodyHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const canonicalHdrs = canonicalHdrLines.join("\n") + "\n";

  const canonicalReq = [
    opts.method,
    opts.path,
    opts.query ?? "",
    canonicalHdrs,
    signedHdrs,
    opts.bodyHash,
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256hex(canonicalReq)].join("\n");
  const key = await signingKey(secret, dateStamp);
  const sig = hex(await hmac(key, stringToSign));

  const result: SigV4Headers = {
    "x-amz-date":           amzDate,
    "x-amz-content-sha256": opts.bodyHash,
    "Authorization": `AWS4-HMAC-SHA256 Credential=${id}/${scope},SignedHeaders=${signedHdrs},Signature=${sig}`,
  };
  if (includeContentType) result["Content-Type"] = opts.contentType!;
  return result;
}

/* ════════════════════════════════════════════════════
   R2 operations via native fetch (no SDK)
════════════════════════════════════════════════════ */
async function r2Put(key: string, body: Buffer, contentType: string): Promise<void> {
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", body as any));
  const path     = `/${R2_BUCKET}/${key}`;
  const headers  = await signRequest({ method: "PUT", path, contentType, bodyHash });

  await new Promise<void>((resolve, reject) => {
    const url  = new URL(`${R2_ENDPOINT}${path}`);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   "PUT",
      headers:  { ...headers, "Content-Length": body.length },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const status = res.statusCode ?? 500;
        if (status >= 200 && status < 300) { resolve(); return; }
        const txt = Buffer.concat(chunks).toString("utf8").slice(0, 200);
        reject(new Error(`R2 PUT failed ${status}: ${txt}`));
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Stream an R2 object directly to an Express response.
 * Forwards Range header so browsers can seek video without downloading the whole file.
 */
async function r2Stream(
  key: string,
  rangeHeader: string | undefined,
  res: import("express").Response,
): Promise<void> {
  const objPath  = `/${R2_BUCKET}/${key}`;
  const bodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256("")
  const sigHeaders = await signRequest({ method: "GET", path: objPath, bodyHash });

  const reqHeaders: Record<string, string | number> = { ...sigHeaders };
  if (rangeHeader) reqHeaders["Range"] = rangeHeader;

  await new Promise<void>((resolve, reject) => {
    const url = new URL(`${R2_ENDPOINT}${objPath}`);
    const r2Req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   "GET",
      headers:  reqHeaders,
    }, (r2Res) => {
      const status = r2Res.statusCode ?? 500;

      if (status === 404 || status === 403) {
        res.status(404).json({ error: "File not found" });
        r2Res.resume();
        resolve();
        return;
      }
      if (status < 200 || status >= 300) {
        res.status(502).json({ error: "R2 error" });
        r2Res.resume();
        resolve();
        return;
      }

      // Forward key headers; let browsers know range/seeking is supported
      res.status(status); // 200 or 206 Partial Content
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      const fwd = ["content-type", "content-length", "content-range", "etag", "last-modified"];
      for (const h of fwd) {
        const v = r2Res.headers[h];
        if (v) res.setHeader(h, v);
      }

      // Pipe directly — never buffer the whole file in memory
      r2Res.pipe(res);
      r2Res.on("end",   resolve);
      r2Res.on("error", reject);
    });
    r2Req.on("error", reject);
    r2Req.end();
  });
}

/** Stream a file from disk to R2 using UNSIGNED-PAYLOAD (no need to buffer entire file). */
async function r2PutStream(key: string, filePath: string, fileSize: number, contentType: string): Promise<void> {
  const objPath  = `/${R2_BUCKET}/${key}`;
  const bodyHash = "UNSIGNED-PAYLOAD";
  const headers  = await signRequest({ method: "PUT", path: objPath, contentType, bodyHash });

  await new Promise<void>((resolve, reject) => {
    const url = new URL(`${R2_ENDPOINT}${objPath}`);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   "PUT",
      headers:  { ...headers, "Content-Length": fileSize },
    }, (res) => {
      res.resume(); // drain
      res.on("end", () => {
        const status = res.statusCode ?? 500;
        if (status >= 200 && status < 300) { resolve(); return; }
        reject(new Error(`R2 PUT stream failed: ${status}`));
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    createReadStream(filePath).pipe(req);
  });
}

/* ════════════════════════════════════════════════════
   Local disk fallback (when R2 not configured)
════════════════════════════════════════════════════ */
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads", "images");
mkdirSync(UPLOADS_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file,  cb) => {
    const ext = extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const memStorage = multer.memoryStorage();

const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

const uploadDisk = multer({ storage: diskStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });
const uploadMem  = multer({ storage: memStorage,  limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });

/* ════════════════════════════════════════════════════
   HLS transcoding via FFmpeg
════════════════════════════════════════════════════ */
const HLS_TMP_DIR = join(process.cwd(), "uploads", "tmp-hls");
mkdirSync(HLS_TMP_DIR, { recursive: true });

function transcodeToHls(inputPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(outputDir, { recursive: true });
    execFile(
      "ffmpeg",
      [
        "-i",  inputPath,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-hls_time", "6",
        "-hls_list_size", "0",
        "-hls_segment_filename", join(outputDir, "seg%04d.ts"),
        join(outputDir, "playlist.m3u8"),
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 60 * 60 * 1000 },
      (err) => { if (err) reject(err); else resolve(); },
    );
  });
}

/* Video disk storage (for server-side → R2 streaming) */
const VIDEO_TMP_DIR = join(process.cwd(), "uploads", "tmp-video");
mkdirSync(VIDEO_TMP_DIR, { recursive: true });

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_TMP_DIR),
  filename:    (_req, file,  cb) => {
    const ext = extname(file.originalname).toLowerCase() || ".mp4";
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadVideoMulter = multer({
  storage:    videoStorage,
  limits:     { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

/* ════════════════════════════════════════════════════
   Routes
════════════════════════════════════════════════════ */
const router = Router();

/* POST /upload/image ─────────────────────────────── */
router.post(
  "/upload/image",
  (req, res, next) => (r2Ready() ? uploadMem : uploadDisk).single("image")(req, res, next),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId)    { res.status(401).json({ error: "Unauthorized" });    return; }
    if (!req.file)  { res.status(400).json({ error: "No image provided" }); return; }

    if (r2Ready() && req.file.buffer) {
      const ext = extname(req.file.originalname).toLowerCase() || ".jpg";
      const key = `images/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      try {
        await r2Put(key, req.file.buffer, req.file.mimetype);
        res.json({ url: `/api/r2/${key}` });
      } catch (err) {
        console.error("R2 upload error:", err);
        res.status(502).json({ error: "Failed to upload to R2" });
      }
      return;
    }

    /* Local disk fallback */
    res.json({ url: `/api/uploads/images/${req.file.filename}` });
  },
);

/* POST /upload/video — transcode to HLS → R2 (falls back to direct MP4 if ffmpeg missing) */
router.post(
  "/upload/video",
  uploadVideoMulter.single("video"),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!req.file) { res.status(400).json({ error: "No video provided" }); return; }

    const { path: filePath, filename, size, mimetype } = req.file;
    const cleanup = () => unlink(filePath, () => {});

    if (!r2Ready()) {
      cleanup();
      res.status(503).json({ error: "R2 not configured", notConfigured: true });
      return;
    }

    const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const hlsOutputDir = join(HLS_TMP_DIR, uid);
    const hlsCleanup = () => rmSync(hlsOutputDir, { recursive: true, force: true });

    try {
      // HLS transcoding path
      await transcodeToHls(filePath, hlsOutputDir);
      const hlsBase = `hls/${userId}/${uid}`;
      const hlsFiles = readdirSync(hlsOutputDir);
      for (const fname of hlsFiles) {
        const fpath = join(hlsOutputDir, fname);
        const fsize = statSync(fpath).size;
        const ct = fname.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
        await r2PutStream(`${hlsBase}/${fname}`, fpath, fsize, ct);
      }
      res.json({ url: `/api/r2/${hlsBase}/playlist.m3u8` });
    } catch (ffmpegErr) {
      // Fallback: upload original MP4 if ffmpeg is unavailable
      console.warn("FFmpeg HLS failed, falling back to direct MP4 upload:", (ffmpegErr as Error).message);
      try {
        const ext = extname(filename).toLowerCase() || ".mp4";
        const key = `videos/${userId}/${uid}${ext}`;
        await r2PutStream(key, filePath, size, mimetype);
        res.json({ url: `/api/r2/${key}` });
      } catch (uploadErr) {
        console.error("R2 video upload error:", uploadErr);
        if (!res.headersSent) res.status(502).json({ error: "Failed to upload video to R2" });
      }
    } finally {
      cleanup();
      hlsCleanup();
    }
  },
);

/* GET /r2/* — streaming proxy for R2 objects (supports Range for video seeking) */
router.get("/r2/*key", async (req, res): Promise<void> => {
  if (!r2Ready()) { res.status(503).json({ error: "R2 not configured" }); return; }

  const rawKey = (req.params as Record<string, string | string[]>).key;
  const key = Array.isArray(rawKey) ? rawKey.join("/") : (rawKey ?? "");
  try {
    await r2Stream(key, req.headers.range, res);
  } catch (err) {
    console.error("R2 proxy error:", err);
    if (!res.headersSent) res.status(502).json({ error: "Failed to fetch from R2" });
  }
});

/* GET /upload/presign — presigned PUT URL for large files ─── */
router.get("/upload/presign", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId)      { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!r2Ready())   { res.status(503).json({ error: "R2 not configured", notConfigured: true }); return; }

  const filename    = ((req.query.filename as string) || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = (req.query.contentType as string) || "video/mp4";
  const key         = `videos/${userId}/${Date.now()}_${filename}`;

  const { id: accessKeyId, secret: secretAccessKey } = r2Keys();
  const now             = new Date();
  const amzDate         = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");
  const dateStamp       = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const credential      = `${accessKeyId}/${credentialScope}`;

  const qp = [
    ["X-Amz-Algorithm",    "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential",   credential],
    ["X-Amz-Date",         amzDate],
    ["X-Amz-Expires",      "3600"],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ].sort(([a], [b]) => a.localeCompare(b));

  const canonicalQS  = qp.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const canonicalReq = ["PUT", `/${R2_BUCKET}/${key}`, canonicalQS, `content-type:${contentType}\nhost:${R2_HOST}\n`, "content-type;host", "UNSIGNED-PAYLOAD"].join("\n");
  const hashedReq    = await sha256hex(canonicalReq);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedReq].join("\n");
  const key_          = await signingKey(secretAccessKey, dateStamp);
  const signature    = hex(await hmac(key_, stringToSign));

  const presignedUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${key}?${canonicalQS}&X-Amz-Signature=${signature}`;
  res.json({ presignedUrl, publicUrl: `/api/r2/${key}`, key });
});

export default router;
