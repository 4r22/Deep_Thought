/**
 * Crash-safe atomic file write.
 *
 * MIT License. Copyright (c) 2026 Garry Tan.
 * Adapted from gbrain src/core/schema-pack/mutate.ts:261-283 (MIT).
 *
 * Take [gsig-065]: the atomic file-write idiom used for every schema-pack
 * mutation — write to `${path}.tmp.${pid}.${Date.now()}`, fsync (tolerating a
 * filesystem without fsync, "since rename is still atomic per POSIX"), then
 * rename; on any failure unlink the tmp file. Directly copyable for crash-safe
 * flat-JSON writes of the owned memory store (founder / signal records).
 *
 * Deviations from the original:
 *   - Uses `node:fs` (the runtime-neutral specifier; gbrain imports bare
 *     `node:fs` too). This take is inherently I/O; node:fs is a node/bun
 *     builtin, not a third-party dependency.
 *   - The gbrain original throws a `SchemaPackMutationError('IO_ERROR', ...)`;
 *     that class does not exist here, so this throws a plain Error carrying a
 *     `code = 'IO_ERROR'` property and the offending path. The tmp/fsync/rename/
 *     unlink control flow is verbatim.
 */

import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';

export interface AtomicWriteError extends Error {
  code: 'IO_ERROR';
  path: string;
}

/** Write `body` to `path` atomically via .tmp + fsync + rename. */
export function writeAtomic(path: string, body: string): void {
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  let fd = -1;
  try {
    fd = openSync(tmpPath, 'w');
    writeSync(fd, body);
    try {
      fsyncSync(fd);
    } catch {
      /* not all FS support fsync; rename is still atomic per POSIX */
    }
    closeSync(fd);
    fd = -1;
    renameSync(tmpPath, path);
  } catch (e) {
    if (fd !== -1) {
      try {
        closeSync(fd);
      } catch {
        /* swallow */
      }
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      /* swallow */
    }
    const err = new Error(
      `atomic write failed for ${path}: ${(e as Error).message}`,
    ) as AtomicWriteError;
    err.code = 'IO_ERROR';
    err.path = path;
    throw err;
  }
}
