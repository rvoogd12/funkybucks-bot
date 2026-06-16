import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { EmbedBuilder } from 'discord.js';
import { assignCompetitionRanks } from './ranking.js';
import { formatNumber } from './utils.js';
import { getMemberMap } from './guildMembers.js';

const STATS_FILE = new URL('./data/stats.json', import.meta.url);
const statsFilePath = fileURLToPath(STATS_FILE);
const statsDir = path.dirname(statsFilePath);

export const STAT_PERIODS = ['lifetime', 'month', 'year'];

export const STATS_LEADERBOARD_TOPICS = {
  peak: { label: 'Most FB once held', field: 'peakFunkybucks' },
  earned: { label: 'FB earned', field: 'funkybucksEarned' },
  perfect: { label: 'Perfect days', field: 'perfectDays' },
  weeds: { label: 'Weeds cleared', field: 'weedsCleared' },
  longest: { label: 'Longest streak', field: 'longestStreak' },
  freezes: { label: 'Streak freezes used', field: 'streakFreezesUsed', ascending: true },
};

export const INCREMENT_FIELDS = [
  'weedsCleared',
  'perfectDays',
  'missedDays',
  'streakFreezesUsed',
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
    streakFreezesUsed: 0,
    peakFunkybucks: 0,
    longestStreak: 0,
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
  base.longestStreak = Number(bucket.longestStreak || 0);

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

export function monthKeyForTimezone(timezone) {
  return DateTime.now().setZone(timezone || 'utc').toFormat('yyyy-MM');
}

export function monthKeyForDate(isoDate, timezone) {
  return DateTime.fromISO(isoDate, { zone: timezone || 'utc' }).toFormat('yyyy-MM');
}

function monthKeyForPeriod(timezone) {
  return monthKeyForTimezone(timezone || 'utc');
}

function yearKeyForPeriod(timezone) {
  return DateTime.now().setZone(timezone || 'utc').toFormat('yyyy');
}

function yearMaxFromMonths(userStats, yearKey, field) {
  let max = 0;
  for (const [monthKey, bucket] of Object.entries(userStats.months || {})) {
    if (!monthKey.startsWith(`${yearKey}-`)) continue;
    max = Math.max(max, normalizeBucket(bucket)[field]);
  }
  return max;
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
  total.peakFunkybucks = yearMaxFromMonths(userStats, yearKey, 'peakFunkybucks');
  total.longestStreak = yearMaxFromMonths(userStats, yearKey, 'longestStreak');
  return total;
}

export function getPeriodStats(userStats, period, timezone = null) {
  if (!userStats) return emptyBucket();
  if (period === 'lifetime') return normalizeBucket(userStats.lifetime);
  if (period === 'month') {
    return normalizeBucket(userStats.months?.[monthKeyForPeriod(timezone)]);
  }
  if (period === 'year') {
    return sumYearFromMonths(userStats, yearKeyForPeriod(timezone));
  }
  return emptyBucket();
}

export function periodLabel(period, timezone = null) {
  if (period === 'lifetime') return 'Lifetime';
  const now = DateTime.now().setZone(timezone || 'utc');
  if (period === 'month') return now.toFormat('MMMM yyyy');
  if (period === 'year') return now.toFormat('yyyy');
  return period;
}

export function getStatsForMonth(userStats, monthKey) {
  if (!userStats || !monthKey) return emptyBucket();
  return normalizeBucket(userStats.months?.[monthKey]);
}

async function incrementFields(guildId, userId, deltas, monthKey = null) {
  const stats = await loadStats();
  const guildStats = ensureGuildStats(stats, guildId);
  const userStats = ensureUserStats(guildStats, userId);
  const month = ensureMonthBucket(userStats, monthKey ?? monthKeyForTimezone('utc'));

  for (const [field, delta] of Object.entries(deltas)) {
    const amount = Number(delta || 0);
    if (!INCREMENT_FIELDS.includes(field) || amount === 0) continue;
    userStats.lifetime[field] += amount;
    month[field] += amount;
  }

  await saveStats(stats);
}

async function monthKeyForUser(guildId, userId) {
  const { getGardenerTimezoneMap } = await import('./gardens.js');
  const { timezones, defaultTimezone } = await getGardenerTimezoneMap(guildId);
  return monthKeyForTimezone(timezones[userId] ?? defaultTimezone);
}

export async function recordBalancePeak(guildId, userId, balance) {
  const amount = Number(balance || 0);
  if (amount < 0) return;

  const stats = await loadStats();
  const guildStats = ensureGuildStats(stats, guildId);
  const userStats = ensureUserStats(guildStats, userId);
  const month = ensureMonthBucket(userStats, await monthKeyForUser(guildId, userId));

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

/**
 * Records the best streak reached on a perfect day. Only updates when currentStreak
 * exceeds the stored longest for that month (and lifetime). Never called on missed days.
 */
export async function recordLongestStreak(guildId, userId, currentStreak, monthKey = null) {
  const streak = Number(currentStreak || 0);
  if (streak <= 0) return;

  const stats = await loadStats();
  const guildStats = ensureGuildStats(stats, guildId);
  const userStats = ensureUserStats(guildStats, userId);
  const month = ensureMonthBucket(userStats, monthKey ?? monthKeyForTimezone('utc'));

  let changed = false;
  if (streak > month.longestStreak) {
    month.longestStreak = streak;
    changed = true;
  }
  if (streak > userStats.lifetime.longestStreak) {
    userStats.lifetime.longestStreak = streak;
    changed = true;
  }

  if (changed) await saveStats(stats);
}

export async function recordWeedCleared(guildId, userId, monthKey = null) {
  await incrementFields(guildId, userId, { weedsCleared: 1 }, monthKey);
}

export async function recordPerfectDay(guildId, userId, payout = 0, monthKey = null) {
  await incrementFields(guildId, userId, {
    perfectDays: 1,
    funkybucksEarned: payout,
    funkybucksFromGarden: payout,
  }, monthKey);
}

export async function recordMissedDay(guildId, userId, monthKey = null) {
  await incrementFields(guildId, userId, { missedDays: 1 }, monthKey);
}

export async function recordStreakFreezeUsed(guildId, userId, monthKey = null) {
  await incrementFields(guildId, userId, { streakFreezesUsed: 1 }, monthKey);
}

export async function recordTransfer(guildId, fromUserId, toUserId, amount) {
  const fromMonth = await monthKeyForUser(guildId, fromUserId);
  const toMonth = await monthKeyForUser(guildId, toUserId);
  await incrementFields(guildId, fromUserId, { transfersSent: 1 }, fromMonth);
  await incrementFields(guildId, toUserId, {
    funkybucksEarned: amount,
    funkybucksReceived: amount,
    transfersReceived: 1,
  }, toMonth);
}

export async function getUserStats(guildId, userId, period = 'lifetime', timezone = null) {
  const stats = await loadStats();
  const guildStats = stats[guildId];
  const userStats = guildStats?.[userId];
  return getPeriodStats(userStats, period, timezone);
}

export async function getStatsForMonthKey(guildId, userId, monthKey) {
  const stats = await loadStats();
  const guildStats = stats[guildId];
  const userStats = guildStats?.[userId];
  return getStatsForMonth(userStats, monthKey);
}

export function buildStatsEmbed(displayName, stats, period, timezone = null) {
  return new EmbedBuilder()
    .setTitle(`Stats — ${periodLabel(period, timezone)}`)
    .setColor(0x4a7c59)
    .setDescription(displayName)
    .addFields(
      {
        name: 'Garden',
        value: [
          `Weeds cleared: **${formatNumber(stats.weedsCleared)}**`,
          `Perfect days: **${formatNumber(stats.perfectDays)}**`,
          `Missed days: **${formatNumber(stats.missedDays)}**`,
          `Streak freezes used: **${formatNumber(stats.streakFreezesUsed)}**`,
          `Longest streak: **${formatNumber(stats.longestStreak)}** day(s)`,
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

export function topicValueLabel(topicKey, value) {
  if (topicKey === 'peak') return `**${formatNumber(value)}** peak`;
  if (topicKey === 'earned') return `**${formatNumber(value)}** FB earned`;
  if (topicKey === 'perfect') return `**${formatNumber(value)}** perfect`;
  if (topicKey === 'weeds') return `**${formatNumber(value)}** weeds`;
  if (topicKey === 'longest') return `**${formatNumber(value)}**-day streak`;
  if (topicKey === 'freezes') return `**${formatNumber(value)}** freeze(s)`;
  return `**${formatNumber(value)}**`;
}

export function statsLeaderboardLine(entry, topicKey) {
  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  const value = entry[topic?.field ?? 'funkybucksEarned'] ?? 0;
  return `#${entry.rank} <@${entry.userId}> — ${topicValueLabel(topicKey, value)}`;
}

export function buildStatsLeaderboardContent(topicKey, period, entries, timezone = null) {
  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  const title = topic?.label ?? 'Stats';
  const lines = entries.map((entry) => statsLeaderboardLine(entry, topicKey));
  return `**${title} — ${periodLabel(period, timezone)}**\n${lines.join('\n')}`;
}

export async function getStatsLeaderboard(
  guild,
  topicKey,
  period = 'lifetime',
  limit = null,
  excludeBotId = null,
  timezoneForPeriod = null,
  memberTimezones = null,
) {
  const topic = STATS_LEADERBOARD_TOPICS[topicKey];
  if (!topic) return [];

  const stats = await loadStats();
  const guildStats = stats[guild.id] || {};
  const members = await getMemberMap(guild);

  const entries = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (excludeBotId && member.id === excludeBotId) continue;

    const tz = memberTimezones?.[member.id] ?? timezoneForPeriod;
    const periodStats = getPeriodStats(guildStats[member.id], period, tz);
    entries.push({
      userId: member.id,
      ...periodStats,
    });
  }

  const field = topic.field;
  entries.sort((a, b) => (topic.ascending ? a[field] - b[field] : b[field] - a[field]));

  const ranked = assignCompetitionRanks(entries, (e) => e[field]);
  if (limit) return ranked.slice(0, limit);
  return ranked;
}
