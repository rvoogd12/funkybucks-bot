import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export function startCloudflareTunnel(port) {
  const enabled = process.env.USE_CLOUDFLARE_TUNNEL === '1' || process.env.USE_CLOUDFLARE_TUNNEL === 'true';
  if (!enabled) return;

  const bin = process.env.CLOUDFLARED_PATH || path.join(projectDir, 'cloudflared');
  if (!existsSync(bin)) {
    console.warn(`USE_CLOUDFLARE_TUNNEL is set but cloudflared was not found at ${bin}`);
    console.warn('On the server, download it with:');
    console.warn('curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared');
    return;
  }

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
