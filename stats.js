import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { EmbedBuilder } from 'discord.js';
import { assignCompetitionRanks } from './ranking.js';
import { formatNumber } from './utils.js';

const STATS_FILE = new URL('./data/stats.json', import.meta.url);
const statsFilePath = fileURLToPath(STATS_FILE);
const statsDir = path.dirname(statsFilePath);

export const STAT_PERIODS = ['lifetime', 'month', 'year'];

export const STATS_LEADERBOARD_TOPICS = {
  peak: { label: 'Most FB once held', field: 'peakFunkybucks' },
  earned: { label: 'FB earned', field: 'funkybucksEarned' },
  perfect: { label: 'Perfect days', field: 'perfectDays' },
  weeds: { label: 'Weeds cleared', field: 'weedsCleared' },
};

export const INCREMENT_FIELDS = [
  'weedsCleared',
  'perfectDays',
  'missedDays',
  'funkybucksEarned',
  'funkybucksFromGarden',
  'funkybucksReceived',
  'transfersSent',
  'transfersReceived',
];

function emptyBucket() {
  return {
    weedsCleared: 0,
    perfectDays: 0,
    missedDays: 0,
    peakFunkybucks: 0,
    funkybucksEarned: 0,
    funkybucksFromGarden: 0,
    funkybucksReceived: 0,
    transfersSent: 0,
    transfersReceived: 0,
  };
}

function normalizeBucket(bucket) {
  const base = emptyBucket();
  if (!bucket) return base;

  for (const field of INCREMENT_FIELDS) {
    base[field] = Number(bucket[field] || 0);
  }
  base.peakFunkybucks = Number(bucket.peakFunkybucks || 0);

  if (!base.funkybucksEarned && (bucket.funkybucksFromGarden || bucket.funkybucksReceived)) {
    base.funkybucksEarned = Number(bucket.funkybucksFromGarden || 0) + Number(bucket.funkybucksReceived || 0);
  }

  return base;
}

async function loadStats() {
  try {
    const raw = await fs.readFile(statsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function saveStats(stats) {
  await fs.mkdir(statsDir, { recursive: true });
  await fs.writeFile(statsFilePath, JSON.stringify(stats, null, 2) + '\n', 'utf8');
}

function ensureGuildStats(stats, guildId) {
  if (!stats[guildId]) stats[guildId] = {};
  return stats[guildId];
}

function ensureUserStats(guildStats, userId) {
  if (!guildStats[userId]) {
    guildStats[userId] = {
      lifetime: emptyBucket(),
      months: {},
    };
  }
  guildStats[userId].lifetime = normalizeBucket(guildStats[userId].lifetime);
  if (!guildStats[userId].months) {
    guildStats[userId].months = {};
  }
  return guildStats[userId];
}

function ensureMonthBucket(userStats, monthKey) {
  userStats.months[monthKey] = normalizeBucket(userStats.months[monthKey]);
  return userStats.months[monthKey];
}

function currentMonthKey() {
  return DateTime.now().toFormat('yyyy-MM');
}

function currentYearKey() {
  return DateTime.now().toFormat('yyyy');
}

function yearPeakFromMonths(userStats, yearKey) {
  let peak = 0;
  for (const [monthKey, bucket] of Object.entries(userStats.months || {})) {
    if (!monthKey.startsWith(`${yearKey}-`)) continue;
    peak = Math.max(peak, normalizeBucket(bucket).peakFunkybucks);
  }
  return peak;
}

function sumYearFromMonths(userStats, yearKey) {
  const total = emptyBucket();
  for (const [monthKey, bucket] of Object.entries(userStats.months || {})) {
    if (!monthKey.startsWith(`${yearKey}-`)) continue;
    const normalized = normalizeBucket(bucket);
    for (const field of INCREMENT_FIELDS) {
      total[field] += normalized[field];
    }
  }
  total.peakFunkybucks = yearPeakFromMonths(userStats, yearKey);
  return total;
}

export function getPeriodStats(userStats, period) {
  if (!userStats) return emptyBucket();
  if (period === 'lifetime') return normalizeBucket(userStats.lifetime);
  if (period === 'month') return normalizeBucket(userStats.months?.[currentMonthKey()]);
  if (period === 'year') return sumYearFromMonths(userStats, currentYearKey());
  return emptyBucket();
}

export function periodLabel(period) {
  if (period === 'lifetime') return 'Lifetime';
  if (period === 'month') return DateTime.now().toFormat('MMMM yyyy');
  if (period === 'year') return currentYearKey();
  return period;
}

async function incrementFields(guildId, userId, deltas) {
  const stats = await loadStats();
  const guildStats = ensureGuildStats(stats, guildId);
  const userStats = ensureUserStats(guildStats, userId);
  const month = ensureMonthBucket(userStats, currentMonthKey());

  for (const [field, delta] of Object.entries(deltas)) {
    const amount = Number(delta || 0);
    if (!INCREMENT_FIELDS.includes(field) || amount === 0) continue;
    userStats.lifetime[field] += amount;
    month[field] += amount;
  }

  await saveStats(stats);
}

export async function recordBalancePeak(guildId, userId, balance) {
  const amount = Number(balance || 0);
  if (amount < 0) return;

  const stats = await loadStats();
  const guildStats = ensureGuildStats(stats, guildId);
  const userStats = ensureUserStats(guildStats, userId);
  const month = ensureMonthBucket(userStats, currentMonthKey());

  let changed = false;
  if (amount > userStats.lifetime.peakFunkybucks) {
    userStats.lifetime.peakFunkybucks = amount;
    changed = true;
  }
  if (amount > month.peakFunkybucks) {
    month.peakFunkybucks = amount;
    changed = true;
  }

  if (changed) await saveStats(stats);
}

export async function recordWeedCleared(guildId, userId) {
  await incrementFields(guildId, userId, { weedsCleared: 1 });
}

export async function recordPerfectDay(guildId, userId, payout = 0) {
  await incrementFields(guildId, userId, {
    perfectDays: 1,
    funkybucksEarned: payout,
    funkybucksFromGarden: payout,
  });
}

export async function recordMissedDay(guildId, userId) {
  await incrementFields(guildId, userId, { missedDays: 1 });
}

export async function recordTransfer(guildId, fromUserId, toUserId, amount) {
  await incrementFields(guildId, fromUserId, { transfersSent: 1 });
  await incrementFields(guildId, toUserId, {
    funkybucksEarned: amount,
    funkybucksReceived: amount,
    transfersReceived: 1,
  });
}

export async function getUserStats(guildId, userId, period = 'lifetime') {
  const stats = await loadStats();
  const guildStats = stats[guildId];
  const userStats = guildStats?.[userId];
  return getPeriodStats(userStats, period);
}

export function buildStatsEmbed(userId, stats, period) {
  return new EmbedBuilder()
    .setTitle(`Stats — ${periodLabel(period)}`)
    .setColor(0x4a7c59)
    .setDescription(`<@${userId}>`)
    .addFields(
      {
        name: 'Garden',
        value: [
          `Weeds cleared: **${formatNumber(stats.weedsCleared)}**`,
          `Perfect days: **${formatNumber(stats.perfectDays)}**`,
          `Missed days: **${formatNumber(stats.missedDays)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Funkybucks',
        value: [
          `Peak once held: **${formatNumber(stats.peakFunkybucks)}**`,
          `FB earned: **${formatNumber(stats.funkybucksEarned)}**`,
          `From gardens: **${formatNumber(stats.funkybucksFromGarden)}**`,
          `From transfers: **${formatNumber(stats.funkybucksReceived)}** (${formatNumber(stats.transfersReceived)}x)`,
        ].join('\n'),
        inline: true,
      },
    );
}

function topicValueLabel(topicKey, value) {
  if (topicKey === 'peak') return `**${formatNumber(value)}** peak`;
  if (topicKey === 'earned') return `**${formatNumber(value)}** FB earned`;
  if (topicKey === 'perfect') return `**${formatNumber(value)}** perfect`;
  if (topicKey === 'weeds') return `**${formatNumber(value)}** weeds`;
  return `**${formatNumber(value)}**`;
}

export function statsLeaderboardLine(entry, topicKey) {
  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  const value = entry[topic?.field ?? 'funkybucksEarned'] ?? 0;
  return `#${entry.rank} <@${entry.userId}> — ${topicValueLabel(topicKey, value)}`;
}

export function buildStatsLeaderboardContent(topicKey, period, entries) {
  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  const title = topic?.label ?? 'Stats';
  const lines = entries.map((entry) => statsLeaderboardLine(entry, topicKey));
  return `**${title} — ${periodLabel(period)}**\n${lines.join('\n')}`;
}

export async function getStatsLeaderboard(guild, topicKey, period = 'lifetime', limit = null, excludeBotId = null) {
  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  if (!topic) return [];

  const stats = await loadStats();
  const guildStats = stats[guild.id] || {};
  const members = await guild.members.fetch();

  const entries = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (excludeBotId && member.id === excludeBotId) continue;

    const periodStats = getPeriodStats(guildStats[member.id], period);
    entries.push({
      userId: member.id,
      ...periodStats,
    });
  }

  const field = topic.field;
  entries.sort((a, b) => b[field] - a[field]);

  const ranked = assignCompetitionRanks(entries, (e) => e[field]);
  if (limit) return ranked.slice(0, limit);
  return ranked;
}
