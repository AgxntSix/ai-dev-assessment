import { existsSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { ApiError, postJson } from "./api.ts";
import type { Candidate } from "./state.ts";

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };
const PUT_ATTEMPTS = 2;
const PROGRESS_STEP = 10;

export type VideoFile = Readonly<{ path: string; filename: string; content_type: string; size_bytes: number }>;

export function checkVideoFile(path: string): VideoFile {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`--video: no file at ${path}`);
  const content_type = CONTENT_TYPES[extname(path).toLowerCase()];
  if (!content_type) throw new Error(`--video: ${basename(path)} must be .mp4, .mov or .webm`);
  const size_bytes = statSync(path).size;
  if (size_bytes === 0) throw new Error(`--video: ${basename(path)} is empty`);
  if (size_bytes > MAX_VIDEO_BYTES) {
    throw new Error(`--video: ${basename(path)} is ${(size_bytes / 1024 / 1024).toFixed(0)} MB; the limit is 500 MB. Export a smaller file or use a Video: link in WRITEUP.md.`);
  }
  return { path, filename: basename(path), content_type, size_bytes };
}

type UploadTarget = { upload_id: string; upload_url: string; method: string; headers: Record<string, string> };

function parseTarget(value: unknown): UploadTarget {
  const body = value as { upload_id?: unknown; upload_url?: unknown; method?: unknown; headers?: unknown };
  if (typeof body?.upload_id !== "string" || typeof body.upload_url !== "string" || !/^https?:\/\//.test(body.upload_url)) {
    throw new Error("/v1/video/upload-url response is missing upload_id or upload_url");
  }
  const headers = typeof body.headers === "object" && body.headers !== null ? (body.headers as Record<string, string>) : {};
  if (!Object.values(headers).every((v) => typeof v === "string")) throw new Error("/v1/video/upload-url sent non-string headers");
  const method = typeof body.method === "string" ? body.method.toUpperCase() : "PUT";
  return { upload_id: body.upload_id, upload_url: body.upload_url, method, headers };
}

// The signed URL covers the returned headers, so they are sent exactly as given.
function uploadHeaders(video: VideoFile, target: UploadTarget): Record<string, string> {
  const hasContentType = Object.keys(target.headers).some((name) => name.toLowerCase() === "content-type");
  return {
    ...(hasContentType ? {} : { "Content-Type": video.content_type }),
    ...target.headers,
    "Content-Length": String(video.size_bytes),
  };
}

function progressStream(total: number, report: (line: string) => void): TransformStream<Uint8Array, Uint8Array> {
  let sent = 0;
  let nextMark = PROGRESS_STEP;
  return new TransformStream({
    transform(chunk, controller) {
      sent += chunk.byteLength;
      const pct = Math.floor((sent / total) * 100);
      if (pct >= nextMark) {
        report(`  uploading video: ${pct}%`);
        nextMark = pct - (pct % PROGRESS_STEP) + PROGRESS_STEP;
      }
      controller.enqueue(chunk);
    },
  });
}

async function putOnce(video: VideoFile, target: UploadTarget, report: (line: string) => void): Promise<void> {
  const body = Bun.file(video.path).stream().pipeThrough(progressStream(video.size_bytes, report));
  const res = await fetch(target.upload_url, {
    method: target.method,
    headers: uploadHeaders(video, target),
    body,
    duplex: "half",
  } as RequestInit);
  if (res.status === 403) {
    throw new ApiError("video upload was refused (HTTP 403). The upload link lasts 30 minutes; run bun run submit --video again for a fresh one.", 403);
  }
  if (!res.ok) throw new ApiError(`video upload returned HTTP ${res.status}`, res.status);
}

const retryable = (err: unknown) => !(err instanceof ApiError) || err.status === null || err.status >= 500;

export async function uploadVideo(candidate: Candidate, video: VideoFile, report: (line: string) => void): Promise<string> {
  const target = parseTarget(
    await postJson(candidate.server_url, "/v1/video/upload-url", {
      candidate_token: candidate.candidate_token,
      filename: video.filename,
      content_type: video.content_type,
      size_bytes: video.size_bytes,
    }),
  );
  for (let attempt = 1; ; attempt++) {
    try {
      await putOnce(video, target, report);
      break;
    } catch (err) {
      if (attempt >= PUT_ATTEMPTS || !retryable(err)) throw err;
      report(`  upload failed (${(err as Error).message}); retrying once`);
    }
  }
  const complete = () =>
    postJson(candidate.server_url, "/v1/video/complete", { candidate_token: candidate.candidate_token, upload_id: target.upload_id });
  await complete().catch((err: unknown) => {
    if (!retryable(err)) throw err;
    report(`  confirming the upload failed (${(err as Error).message}); retrying once`);
    return complete();
  });
  return target.upload_id;
}
