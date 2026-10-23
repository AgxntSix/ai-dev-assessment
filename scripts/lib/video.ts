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

type UploadTarget = { upload_id: string; upload_url: string; headers: Record<string, string> };

function parseTarget(value: unknown): UploadTarget {
  const body = value as { upload_id?: unknown; upload_url?: unknown; headers?: unknown };
  if (typeof body?.upload_id !== "string" || typeof body.upload_url !== "string" || !/^https?:\/\//.test(body.upload_url)) {
    throw new Error("/v1/video/upload-url response is missing upload_id or upload_url");
  }
  const headers = typeof body.headers === "object" && body.headers !== null ? (body.headers as Record<string, string>) : {};
  return { upload_id: body.upload_id, upload_url: body.upload_url, headers };
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
    method: "PUT",
    headers: { ...target.headers, "Content-Type": video.content_type, "Content-Length": String(video.size_bytes) },
    body,
    duplex: "half",
  } as RequestInit);
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
  await postJson(candidate.server_url, "/v1/video/complete", { candidate_token: candidate.candidate_token, upload_id: target.upload_id });
  return target.upload_id;
}
