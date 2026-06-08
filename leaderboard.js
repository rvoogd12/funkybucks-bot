import { createCanvas, Image, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatNumber } from './utils.js';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const FONT_FAMILY = 'Noto Sans';
const MONEY_EMOJI_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4b0.png';

let fontsRegistered = false;
let moneyEmojiImage = null;

function registerLeaderboardFonts() {
  if (fontsRegistered) return;

  const fontsDir = path.join(projectDir, 'assets', 'fonts');
  const regular = path.join(fontsDir, 'NotoSans-Regular.ttf');
  const bold = path.join(fontsDir, 'NotoSans-Bold.ttf');

  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    console.warn('Leaderboard fonts missing from assets/fonts — falling back to system fonts.');
    return;
  }

  registerFont(regular, { family: FONT_FAMILY, weight: 'normal', style: 'normal' });
  registerFont(bold, { family: FONT_FAMILY, weight: 'bold', style: 'normal' });
  fontsRegistered = true;
}

function font(size, weight = 'normal') {
  return `${weight} ${size}px "${FONT_FAMILY}", sans-serif`;
}

async function loadMoneyEmoji() {
  if (moneyEmojiImage) return moneyEmojiImage;

  const res = await fetch(MONEY_EMOJI_URL);
  if (!res.ok) throw new Error(`Failed to load money emoji image: HTTP ${res.status}`);

  const image = new Image();
  image.src = Buffer.from(await res.arrayBuffer());
  moneyEmojiImage = image;
  return image;
}

async function fetchUserData(userId, token) {
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error(`Failed to fetch user data for ${userId}:`, err);
    return null;
  }
}

async function fetchGuildName(guildId, token) {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });
    if (!res.ok) return null;
    const guild = await res.json();
    return guild?.name || null;
  } catch (err) {
    console.error(`Failed to fetch guild data for ${guildId}:`, err);
    return null;
  }
}

async function loadAvatarImage(user) {
  if (!user?.avatar) return null;
  try {
    const avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const image = new Image();
    image.src = Buffer.from(buffer);
    return image;
  } catch (err) {
    console.error(`Failed to load avatar for ${user.id}:`, err);
    return null;
  }
}

function drawBalance(ctx, balanceText, x, y, moneyEmoji) {
  ctx.fillText(balanceText, x, y);
  if (!moneyEmoji) return;

  const textWidth = ctx.measureText(`${balanceText} `).width;
  const emojiSize = 20;
  ctx.drawImage(moneyEmoji, x + textWidth, y - emojiSize + 4, emojiSize, emojiSize);
}

export async function generateLeaderboardImage(topBalances, guildId, token) {
  registerLeaderboardFonts();

  const guildName = await fetchGuildName(guildId, token) || 'Current Server';
  const userDataPromises = topBalances.map((entry) => fetchUserData(entry.userId, token));
  const usersData = await Promise.all(userDataPromises);

  const avatarPromises = usersData.map((user) => (user ? loadAvatarImage(user) : Promise.resolve(null)));
  const avatars = await Promise.all(avatarPromises);

  let moneyEmoji = null;
  try {
    moneyEmoji = await loadMoneyEmoji();
  } catch (err) {
    console.error('Failed to load money emoji for leaderboard:', err);
  }

  const width = 900;
  const entryHeight = 80;
  const padding = 20;
  const height = 130 + topBalances.length * entryHeight + padding;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#00d4ff';
  ctx.font = font(40, 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('FUNKYBUCKS LEADERBOARD', 30, 60);

  ctx.fillStyle = '#a0a0a0';
  ctx.font = font(16);
  ctx.fillText(guildName || 'Current Server', 30, 85);

  topBalances.forEach((entry, idx) => {
    const y = 120 + idx * entryHeight;

    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#4169E1'];
    ctx.fillStyle = rankColors[idx] || '#4169E1';
    ctx.fillRect(20, y, 60, 60);

    ctx.fillStyle = '#000000';
    ctx.font = font(32, 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(`#${idx + 1}`, 50, y + 42);

    const avatar = avatars[idx];
    if (avatar) {
      const cx = 130;
      const cy = y + 30;
      const radius = 27;
      const size = radius * 2;
      const dx = Math.round(cx - size / 2);
      const dy = Math.round(cy - size / 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, dx, dy, size, size);
      ctx.restore();
    }

    const userData = usersData[idx];
    const displayName = userData?.global_name || userData?.username || `User #${entry.userId.slice(-6)}`;
    ctx.fillStyle = '#ffffff';
    ctx.font = font(18);
    ctx.textAlign = 'left';
    ctx.fillText(displayName, 170, y + 20);

    ctx.fillStyle = '#00ff00';
    ctx.font = font(22);
    drawBalance(ctx, formatNumber(entry.balance), 170, y + 48, moneyEmoji);

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, y + 65);
    ctx.lineTo(width - 20, y + 65);
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, height - padding, width, padding);

  return canvas.toBuffer('image/png');
}
