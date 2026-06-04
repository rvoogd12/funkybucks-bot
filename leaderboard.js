import { createCanvas, Image } from 'canvas';
import { formatNumber } from './utils.js';

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

export async function generateLeaderboardImage(topBalances, guildId, token) {
  const guildName = await fetchGuildName(guildId, token) || 'Current Server';
  // Fetch user data for all entries
  const userDataPromises = topBalances.map((entry) => fetchUserData(entry.userId, token));
  const usersData = await Promise.all(userDataPromises);

  // Load avatars in parallel
  const avatarPromises = usersData.map((user) => (user ? loadAvatarImage(user) : Promise.resolve(null)));
  const avatars = await Promise.all(avatarPromises);

  const width = 900;
  const entryHeight = 80;
  const padding = 20;
  const height = 130 + topBalances.length * entryHeight + padding;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = '#00d4ff';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('FUNKYBUCKS LEADERBOARD', 30, 60);

  // Guild name
  ctx.fillStyle = '#a0a0a0';
  ctx.font = '16px Arial';
  ctx.fillText(guildName || 'Current Server', 30, 85);

  // Draw rankings
  topBalances.forEach((entry, idx) => {
    const y = 120 + idx * entryHeight;

    // Rank badge background
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#4169E1'];
    ctx.fillStyle = rankColors[idx] || '#4169E1';
    ctx.fillRect(20, y, 60, 60);

    // Rank number
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`#${idx + 1}`, 50, y + 42);

    // Draw avatar if available
    const avatar = avatars[idx];
    if (avatar) {
    const cx = 130;             // fixed circle center x
    const cy = y + 30;          // fixed circle center y
    const radius = 27;          // change this to tweak circle
    const size = radius * 2;    // drawImage size to fill circle
    const dx = Math.round(cx - size / 2); // top-left x for drawImage
    const dy = Math.round(cy - size / 2); // top-left y for drawImage

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, dx, dy, size, size);
    ctx.restore();
    }

    // User display name
    const userData = usersData[idx];
    const displayName = userData?.global_name || userData?.username || `User #${entry.userId.slice(-6)}`;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(displayName, 170, y + 20);

    // Balance
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${formatNumber(entry.balance)} 💰`, 170, y + 48);

    // Separator line
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, y + 65);
    ctx.lineTo(width - 20, y + 65);
    ctx.stroke();
  });

  // Add bottom padding
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, height - padding, width, padding);

  return canvas.toBuffer('image/png');
}
