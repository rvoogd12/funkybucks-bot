import { spawn } from 'child_process';
import { chmodSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const CLOUDFLARED_LINUX_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

async function ensureCloudflaredBinary(bin) {
  if (existsSync(bin)) return true;

  if (process.platform !== 'linux') {
    console.warn(`cloudflared not found at ${bin} (auto-download only runs on Linux).`);
    return false;
  }

  console.log('cloudflared not found — downloading for Linux...');
  try {
    const res = await fetch(CLOUDFLARED_LINUX_URL);
    if (!res.ok) throw new Error(`download failed with HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(bin, buffer);
    chmodSync(bin, 0o755);
    console.log('cloudflared downloaded successfully.');
    return true;
  } catch (err) {
    console.error('Failed to download cloudflared:', err.message);
    return false;
  }
}

export async function startCloudflareTunnel(port) {
  const enabled = process.env.USE_CLOUDFLARE_TUNNEL === '1' || process.env.USE_CLOUDFLARE_TUNNEL === 'true';
  if (!enabled) return;

  const bin = process.env.CLOUDFLARED_PATH || path.join(projectDir, 'cloudflared');
  if (!(await ensureCloudflaredBinary(bin))) return;

  const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logTunnelOutput = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      console.log(`\n>>> Discord Interactions Endpoint URL:\n>>> ${match[0]}/interactions\n`);
    }
  };

  proc.stdout.on('data', logTunnelOutput);
  proc.stderr.on('data', logTunnelOutput);
  proc.on('error', (err) => console.error('cloudflared failed to start:', err.message));
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`cloudflared exited with code ${code}`);
  });

  const cleanup = () => proc.kill();
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
