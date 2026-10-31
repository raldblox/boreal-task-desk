
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { get, put } from "@vercel/blob";

// Submission files live in a private Blob store, or on local disk under `pnpm dev:local`.
// Paths are `submissions/<task id>/<random>.<ext>`; only the API's file route reads them.

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function localDir(): string | null {
  if (process.env.FILE_STORAGE !== "local") return null;
  if (process.env.VERCEL) throw new Error("FILE_STORAGE=local is for local development only");
  const dir = process.env.LOCAL_UPLOAD_DIR;
  if (!dir) throw new Error("LOCAL_UPLOAD_DIR is not set");
  return dir;
}

export class FileRejected extends Error {}

/** File contents as a Response body accepts them. */
export type FileBody = Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array<ArrayBuffer>>;

export async function saveSubmissionFile(taskId: string, file: File): Promise<string> {
  const ext = TYPES[file.type];
  if (!ext) throw new FileRejected("upload a JPEG, PNG, WebP or PDF file");
  if (file.size === 0) throw new FileRejected("the file is empty");
  if (file.size > MAX_BYTES) throw new FileRejected("the file is over 4 MB");

  const path = `submissions/${taskId}/${randomUUID()}.${ext}`;
  const dir = localDir();
  if (dir) {
    const target = join(/* turbopackIgnore: true */ dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));
  } else {
    await put(path, file, { access: "private", contentType: file.type, addRandomSuffix: false });
  }
  return path;
}

export async function readSubmissionFile(path: string): Promise<{ body: FileBody; contentType: string } | null> {
  if (!path.startsWith("submissions/") || normalize(path).includes("..")) return null;
  const ext = path.split(".").pop() ?? "";
  const contentType = Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";

  const dir = localDir();
  if (dir) {
    try {
      return { body: new Uint8Array(await readFile(join(/* turbopackIgnore: true */ dir, path))), contentType };
    } catch {
      return null;
    }
  }
  const result = await get(path, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return { body: result.stream as ReadableStream<Uint8Array<ArrayBuffer>>, contentType: result.blob.contentType };
}

/** Reads a stored file fully, for jobs that need the bytes (like the AI reviewer). */
export async function readSubmissionBytes(path: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const file = await readSubmissionFile(path);
  if (!file) return null;
  return { bytes: Buffer.from(await new Response(file.body).arrayBuffer()), contentType: file.contentType };
}
