import { formatNumber } from './utils.js';
import {
  registerLeaderboardFonts,
  font,
  fetchUserData,
  fetchGuildName,
  loadAvatarImage,
  loadTwemoji,
  drawCanvasText,
  drawAvatar,
  drawRankBadge,
  createLeaderboardCanvas,
  drawRowDivider,
} from './leaderboardCanvas.js';

const LEAF_EMOJI = '1f33f';

export async function generateGardenLeaderboardImage(entries, guildId, token) {
  registerLeaderboardFonts();

  const guildName = await fetchGuildName(guildId, token) || 'Current Server';
  const usersData = await Promise.all(entries.map((e) => fetchUserData(e.userId, token)));
  const avatars = await Promise.all(usersData.map((u) => (u ? loadAvatarImage(u) : null)));

  let leafEmoji = null;
  try {
    leafEmoji = await loadTwemoji(LEAF_EMOJI);
  } catch (err) {
    console.error('Failed to load leaf emoji for garden leaderboard:', err);
  }

  const { canvas, ctx, entryHeight, headerHeight, height, width } = createLeaderboardCanvas(900, entries.length);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#2d5a27');
  gradient.addColorStop(0.5, '#3d6b34');
  gradient.addColorStop(1, '#1a3d2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (leafEmoji) {
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 6; i++) {
      ctx.drawImage(leafEmoji, 60 + i * 140, 10, 48, 48);
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#e8f5e0';
  ctx.font = font(38, 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('GARDEN LEADERBOARD', 30, 58);

  ctx.fillStyle = '#b8d4a8';
  ctx.font = font(16);
  await drawCanvasText(ctx, guildName, 30, 85, { fontSize: 16, fillStyle: '#b8d4a8', maxWidth: width - 60 });

  for (let idx = 0; idx < entries.length; idx += 1) {
    const entry = entries[idx];
    const y = headerHeight - 10 + idx * entryHeight;
    drawRankBadge(ctx, entry.rank, y, { garden: true });

    drawAvatar(ctx, avatars[idx], 130, y + 30);

    const userData = usersData[idx];
    const displayName = userData?.global_name || userData?.username || `User #${entry.userId.slice(-6)}`;
    await drawCanvasText(ctx, displayName, 170, y + 20, {
      fontSize: 18,
      fillStyle: '#f5f0e1',
      maxWidth: width - 200,
    });

    ctx.fillStyle = '#d4e8c2';
    ctx.font = font(16);
    const statLine = `${formatNumber(entry.perfectDaysThisMonth)} perfect days · ${formatNumber(entry.streak)}-day streak`;
    ctx.fillText(statLine, 170, y + 48);

    drawRowDivider(ctx, y, width);
  }

  return canvas.toBuffer('image/png');
}
