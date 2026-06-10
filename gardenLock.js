import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const LOCK_FILE = path.join(
  path.dirname(fileURLToPath(new URL('./data/gardens.json', import.meta.url))),
  '.garden-tick.lock',
);

const STALE_LOCK_MS = 3 * 60 * 1000;

async function isStaleLock() {
  try {
    const stat = await fs.stat(LOCK_FILE);
    return Date.now() - stat.mtimeMs > STALE_LOCK_MS;
  } catch {
    return false;
  }
}

/**
 * Cross-process lock so only one garden tick runs at a time (avoids double settle/payout).
 * @returns {Promise<(() => Promise<void>) | null>} release fn, or null if lock not acquired
 */
export async function acquireGardenTickLock() {
  if (await isStaleLock()) {
    await fs.unlink(LOCK_FILE).catch(() => {});
  }

  try {
    const handle = await fs.open(LOCK_FILE, 'wx');
    await handle.writeFile(`${process.pid}@${Date.now()}`);
    await handle.close();
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }

  return async () => {
    await fs.unlink(LOCK_FILE).catch(() => {});
  };
}
