// @ts-check
import { Router } from "express";
import { randomUUID } from "crypto";
import { authMiddleware, issueUploadToken } from "../../middleware/auth.js";
import { presignStemPutUrl } from "../../s3Presign.js";

export const uploadUrlRouter = Router();

uploadUrlRouter.post("/", authMiddleware, async (req, res) => {
  const bucket = process.env.S3_UPLOAD_BUCKET;
  if (!bucket) {
    return res.status(501).json({ error: "S3 upload not configured on server" });
  }

  const { filename, contentType } = req.body;
  if (!filename || !contentType) {
    return res.status(400).json({ error: "Missing filename or contentType" });
  }

  const jobId = randomUUID();
  const fileExt = filename.split(".").pop() || "bin";
  const s3Key = `uploads/${jobId}/input.${fileExt}`;
  const uploadToken = issueUploadToken(s3Key);
  if (!uploadToken) {
    return res.status(503).json({ error: "S3 upload authentication is not configured" });
  }

  try {
    const url = await presignStemPutUrl(bucket, s3Key, contentType);
    res.json({
      upload_url: url,
      s3_key: s3Key,
      upload_token: uploadToken,
      job_id: jobId,
    });
  } catch (err) {
    console.error("[upload-url] presign failed:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
