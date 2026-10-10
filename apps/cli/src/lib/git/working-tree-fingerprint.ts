import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const maxWorkingTreeFingerprintBytes = 5 * 1024 * 1024;

/** Unknown files are deliberately absent from the baseline: never hide an edit
 * based on a partial hash or on size/mtime alone. No Git filters run here. */
export const fingerprintWorkingTreeFile = async (
  workdir: string,
  filePath: string
): Promise<string | null> => {
  const absolutePath = path.resolve(workdir, filePath);
  const relativePath = path.relative(workdir, absolutePath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  try {
    const initial = await fs.lstat(absolutePath);
    if (!initial.isFile() || initial.size > maxWorkingTreeFingerprintBytes) return null;
    // NONBLOCK also keeps a replacement FIFO from blocking open on Unix.
    const file = await fs.open(absolutePath, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile() || before.size > maxWorkingTreeFingerprintBytes) return null;
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(64 * 1024);
      let total = 0;
      while (total <= maxWorkingTreeFingerprintBytes) {
        const { bytesRead } = await file.read(
          buffer,
          0,
          Math.min(buffer.length, maxWorkingTreeFingerprintBytes + 1 - total),
          null
        );
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total > maxWorkingTreeFingerprintBytes) return null;
        hash.update(buffer.subarray(0, bytesRead));
      }
      const after = await file.stat();
      if (
        total !== before.size ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs
      )
        return null;
      return hash.digest('hex');
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
};
