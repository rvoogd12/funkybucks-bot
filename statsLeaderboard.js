import { formatNumber } from './utils.js';
import { STATS_LEADERBOARD_TOPICS, periodLabel, topicValueLabel } from './stats.js';
import {
  registerLeaderboardFonts,
  font,
  fetchUserData,
  fetchGuildName,
  loadAvatarImage,
  drawCanvasText,
  drawAvatar,
  createLeaderboardCanvas,
  drawRowDivider,
} from './leaderboardCanvas.js';
import { rankBadgeColorStats } from './ranking.js';

function drawStatsRankBadge(ctx, rank, y) {
  ctx.fillStyle = rankBadgeColorStats(rank);
  ctx.fillRect(20, y, 60, 60);
  ctx.fillStyle = rank > 3 ? '#f0e8ff' : '#1a1028';
  ctx.font = font(32, 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(`#${rank}`, 50, y + 42);
}

export async function generateStatsLeaderboardImage(entries, topicKey, period, guildId, token, timezone = null) {
  registerLeaderboardFonts();

  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  const guildName = await fetchGuildName(guildId, token) || 'Current Server';
  const usersData = await Promise.all(entries.map((e) => fetchUserData(e.userId, token)));
  const avatars = await Promise.all(usersData.map((u) => (u ? loadAvatarImage(u) : null)));

  const { canvas, ctx, entryHeight, headerHeight, height, width } = createLeaderboardCanvas(900, entries.length);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#2d1b4e');
  gradient.addColorStop(0.5, '#4a2d7a');
  gradient.addColorStop(1, '#1a1028');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e8b923';
  ctx.font = font(36, 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('STATS LEADERBOARD', 30, 52);

  ctx.fillStyle = '#c9b8e8';
  ctx.font = font(15);
  const subtitle = `${topic?.label ?? 'Stats'} — ${periodLabel(period, timezone)}`;
  ctx.fillText(subtitle, 30, 78);

  ctx.fillStyle = '#9b8ab8';
  ctx.font = font(14);
  await drawCanvasText(ctx, guildName, 30, 100, { fontSize: 14, fillStyle: '#9b8ab8', maxWidth: width - 60 });

  for (let idx = 0; idx < entries.length; idx += 1) {
    const entry = entries[idx];
    const y = headerHeight - 10 + idx * entryHeight;
    drawStatsRankBadge(ctx, entry.rank, y);

    drawAvatar(ctx, avatars[idx], 130, y + 30);

    const userData = usersData[idx];
    const displayName = userData?.global_name || userData?.username || `User #${entry.userId.slice(-6)}`;
    await drawCanvasText(ctx, displayName, 170, y + 20, {
      fontSize: 18,
      fillStyle: '#f0e8ff',
      maxWidth: width - 200,
    });

    const field = topic?.field ?? 'funkybucksEarned';
    const value = entry[field] ?? 0;
    const statText = topicValueLabel(topicKey, value).replace(/\*\*/g, '');
    ctx.fillStyle = '#e8b923';
    ctx.font = font(16);
    ctx.fillText(statText, 170, y + 48);

    drawRowDivider(ctx, y, width);
  }

  return canvas.toBuffer('image/png');
}
