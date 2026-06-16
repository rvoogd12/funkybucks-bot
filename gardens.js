import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
} from 'discord.js';
import { addBalance } from './bank.js';
import { assignCompetitionRanks } from './ranking.js';
import {
  recordWeedCleared,
  recordPerfectDay,
  recordMissedDay,
  recordLongestStreak,
  recordStreakFreezeUsed,
  getStatsForMonthKey,
  monthKeyForTimezone,
} from './stats.js';
import { acquireGardenTickLock } from './gardenLock.js';
import { getMemberMap } from './guildMembers.js';
import {
  spawnFlavorMessage,
  trickleFlavorMessage,
  settleSuccessMessage,
  settleFailMessage,
  settleFreezeUsedMessage,
  welcomeGardenMessage,
  rejoinGardenMessage,
  lockGardenMessage,
  buildWeedContent,
  gardenTopic,
} from './gardenFlavor.js';

const GARDENS_FILE = new URL('./data/gardens.json', import.meta.url);
const gardensFilePath = fileURLToPath(GARDENS_FILE);
const gardensDir = path.dirname(gardensFilePath);

export const CATEGORY_NAME = 'Gardens';
export const TZ_PRESETS = {
  eu: 'Europe/Amsterdam',
  au: 'Australia/Brisbane',
};

export const DEFAULT_GUILD_CONFIG = {
  spawnHour: 8,
  trickleEndHour: 17,
  settleHour: 21,
  minWeeds: 45,
  maxWeeds: 50,
  basePayout: 10,
  defaultTimezone: TZ_PRESETS.eu,
  trickleIntervalMinutes: 30,
  trickleBatchMax: 8,
  useNicknamesForChannels: false,
  streakFreezesPerMonth: 5,
};

const MIN_TRICKLE_GAP_MINUTES = 15;
const MAX_WEEDS_PER_DAY = 100;
const MAX_TRICKLE_BATCH = 8;

const WEED_EMOJIS = ['🌿', '🌱', '🪴', '🍀', '🌵', '☘️'];

const renameDebounce = new Map();

async function loadGardens() {
  try {
    const raw = await fs.readFile(gardensFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveGardens(gardens) {
  await fs.mkdir(gardensDir, { recursive: true });
  await fs.writeFile(gardensFilePath, JSON.stringify(gardens, null, 2) + '\n', 'utf8');
}

function ensureGuild(gardens, guildId) {
  if (!gardens[guildId]) {
    gardens[guildId] = {
      categoryId: null,
      config: { ...DEFAULT_GUILD_CONFIG },
      gardens: {},
    };
  }
  if (!gardens[guildId].config) {
    gardens[guildId].config = { ...DEFAULT_GUILD_CONFIG };
  }
  if (!gardens[guildId].gardens) {
    gardens[guildId].gardens = {};
  }
  if (gardens[guildId].config.trickleEndHour === undefined) {
    gardens[guildId].config.trickleEndHour = DEFAULT_GUILD_CONFIG.trickleEndHour;
  }
  if (gardens[guildId].config.useNicknamesForChannels === undefined) {
    gardens[guildId].config.useNicknamesForChannels = DEFAULT_GUILD_CONFIG.useNicknamesForChannels;
  }
  if (gardens[guildId].config.streakFreezesPerMonth === undefined) {
    gardens[guildId].config.streakFreezesPerMonth = DEFAULT_GUILD_CONFIG.streakFreezesPerMonth;
  }
  return gardens[guildId];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function slugifyDisplayName(displayName) {
  const slug = displayName
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'gardener';
}

export function channelNameFromDisplayName(displayName, userId = null) {
  const base = `${slugifyDisplayName(displayName)}-s-garden`;
  if (!userId) return base.slice(0, 100);
  return `${base}-${userId.slice(-6)}`.slice(0, 100);
}

export function resolveGardenChannelLabel(member, config) {
  if (config?.useNicknamesForChannels) {
    return member.displayName;
  }
  return member.user.username;
}

export function buildChannelSlug(member, config) {
  const label = resolveGardenChannelLabel(member, config);
  let slug = slugifyDisplayName(label);
  if (slug === 'gardener') {
    slug = slugifyDisplayName(member.user.username);
  }
  return slug || 'gardener';
}

export function channelNameFromMember(member, config) {
  const slug = buildChannelSlug(member, config);
  return `${slug}-s-garden-${member.id.slice(-6)}`.slice(0, 100);
}

async function assertBotGardenPermissions(guild) {
  const me = guild.members.me ?? await guild.members.fetchMe();
  const required = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
  ];
  const missing = required.filter((perm) => !me.permissions.has(perm));
  if (missing.length > 0) {
    throw new Error('Bot is missing required permissions: Manage Channels, Manage Roles, View Channels, Send Messages, and Manage Messages.');
  }
  return me;
}

function botChannelPerms(channel, botMember) {
  return channel.permissionsFor(botMember);
}

async function applyGardenPermissions(guild, channel, ownerId) {
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const botPerms = botChannelPerms(channel, botMember);
  if (!botPerms?.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Missing Permissions');
  }

  const overwrites = buildPermissionOverwrites(guild, ownerId, botMember);
  const ownerInGuild = guild.members.cache.has(ownerId)
    || await guild.members.fetch(ownerId).then(() => true).catch(() => false);

  for (const ow of overwrites) {
    if (ow.id === ownerId && !ownerInGuild) continue;
    await channel.permissionOverwrites.edit(ow.id, {
      type: ow.type,
      allow: ow.allow,
      deny: ow.deny,
    });
  }
}

async function repairGardenChannel(guild, guildData, member, channel, category, botMember) {
  const config = guildData.config;
  let changes = 0;

  if (channel.parentId !== category.id) {
    await channel.setParent(category.id, { lockPermissions: false });
    changes += 1;
  }

  const perms = botChannelPerms(channel, botMember);
  if (!perms?.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Missing Permissions');
  }

  await applyGardenPermissions(guild, channel, member.id);

  const expectedName = channelNameFromMember(member, config);
  if (channel.name !== expectedName) {
    await channel.setName(expectedName, 'Sync garden channel name');
    changes += 1;
  }

  const expectedTopic = gardenTopic(member.displayName, config);
  if (channel.topic !== expectedTopic.text) {
    await channel.setTopic(expectedTopic.text, 'Sync garden topic');
    changes += 1;
  }

  return changes;
}

export { gardenTopic } from './gardenFlavor.js';

export function resolveTimezone(input) {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (normalized === 'eu') return TZ_PRESETS.eu;
  if (normalized === 'au') return TZ_PRESETS.au;
  if (DateTime.now().setZone(input).isValid) {
    return input;
  }
  return null;
}

function getGardenRecord(guildData, userId) {
  if (!guildData.gardens[userId]) {
    guildData.gardens[userId] = {
      channelId: null,
      timezone: guildData.config.defaultTimezone,
      lastSpawnDate: null,
      lastSettleDate: null,
      activeWeeds: [],
      trickleRemaining: 0,
      lastTrickleAt: null,
      streak: 0,
      statsMonth: null,
      perfectDaysThisMonth: 0,
      streakFreezesUsedThisMonth: 0,
      locked: false,
    };
  }
  return guildData.gardens[userId];
}

function buildWeedMessage() {
  return buildWeedContent(WEED_EMOJIS, randomInt);
}

function localToday(timezone) {
  return DateTime.now().setZone(timezone).toISODate();
}

function localHour(timezone) {
  return DateTime.now().setZone(timezone).hour;
}

function monthKeyForSpawnDate(spawnDateIso, timezone) {
  return DateTime.fromISO(spawnDateIso, { zone: timezone || 'utc' }).toFormat('yyyy-MM');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function gardenTrickleInterval(garden, config) {
  return garden.trickleIntervalMinutes ?? config.trickleIntervalMinutes ?? DEFAULT_GUILD_CONFIG.trickleIntervalMinutes;
}

function gardenTrickleBatchMax(config) {
  return config.trickleBatchMax ?? DEFAULT_GUILD_CONFIG.trickleBatchMax;
}

function allDeliveredPulled(garden) {
  const active = garden.activeWeeds || [];
  const remaining = active.filter((w) => !w.pulled);
  return active.length > 0
    && remaining.length === 0
    && (garden.trickleRemaining || 0) === 0;
}

function gardenNeedsSettle(garden) {
  return Boolean(
    garden.lastSpawnDate
    && garden.settleCompletedDate !== garden.lastSpawnDate,
  );
}

export function statsMonthKeyForGardenDay(garden, fallbackTz) {
  if (garden.spawnStatsMonthKey) return garden.spawnStatsMonthKey;
  const tz = garden.spawnTimezone || garden.timezone || fallbackTz;
  if (garden.lastSpawnDate) return monthKeyForSpawnDate(garden.lastSpawnDate, tz);
  return monthKeyForTimezone(tz);
}

function canSettleGarden(garden, hour, settleHour) {
  if (!gardenNeedsSettle(garden)) return false;
  if (hour >= settleHour) return true;
  return allDeliveredPulled(garden);
}

/** Calendar rollover only — used while garden is locked (no gameplay). */
function touchGardenCalendar(garden, timezone) {
  const month = monthKeyForTimezone(timezone);
  if (garden.statsMonth === month) return false;
  garden.statsMonth = month;
  garden.perfectDaysThisMonth = 0;
  garden.streakFreezesUsedThisMonth = 0;
  return true;
}

function updateMonthlyStatsForSpawn(garden, spawnDay, timezone) {
  const spawnMonth = monthKeyForSpawnDate(spawnDay, timezone);
  const currentMonth = monthKeyForTimezone(timezone);
  if (spawnMonth === currentMonth) {
    touchGardenCalendar(garden, timezone);
  }
}

function trickleWindowMinutes(spawnHour, trickleEndHour, timezone) {
  const now = DateTime.now().setZone(timezone);
  const start = now.set({ hour: spawnHour, minute: 0, second: 0, millisecond: 0 });
  let end = now.set({ hour: trickleEndHour, minute: 0, second: 0, millisecond: 0 });
  if (end <= start) {
    end = end.plus({ days: 1 });
  }
  return Math.max(60, end.diff(start, 'minutes').minutes);
}

function deriveTrickleIntervalMinutes(trickleRemaining, config, timezone) {
  const spawnHour = config.spawnHour;
  const trickleEnd = config.trickleEndHour ?? DEFAULT_GUILD_CONFIG.trickleEndHour;
  const batchMax = gardenTrickleBatchMax(config);
  const windowMins = trickleWindowMinutes(spawnHour, trickleEnd, timezone);
  const buffer = trickleFinishBufferMinutes(trickleRemaining);
  const batches = Math.max(1, Math.ceil(trickleRemaining / (batchMax * 0.65)));
  const derived = Math.floor((windowMins - buffer) / batches);
  return clamp(derived, MIN_TRICKLE_GAP_MINUTES, 45);
}

function minutesUntilTrickleEnd(timezone, trickleEndHour) {
  const now = DateTime.now().setZone(timezone);
  const end = now.set({ hour: trickleEndHour, minute: 0, second: 0, millisecond: 0 });
  return end.diff(now, 'minutes').minutes;
}

/** Minutes before trickle-end hour by which all weeds should be delivered. */
function trickleFinishBufferMinutes(trickleRemaining) {
  if (trickleRemaining >= 10) return 15;
  if (trickleRemaining >= 4) return 5;
  return 2;
}

function trickleBatchesRemaining(trickleRemaining, trickleBatchMax) {
  return Math.ceil(trickleRemaining / trickleBatchMax);
}

/**
 * True when remaining weeds cannot all be sent at the normal interval before the
 * finish buffer — switch to a spread-out finish schedule instead of one dump.
 */
function shouldEnterFinishWindow(minsLeft, trickleRemaining, trickleBatchMax) {
  const buffer = trickleFinishBufferMinutes(trickleRemaining);
  const batchesLeft = trickleBatchesRemaining(trickleRemaining, trickleBatchMax);
  const minPaceMinutes = batchesLeft > 1
    ? (batchesLeft - 1) * MIN_TRICKLE_GAP_MINUTES + 1
    : 0;
  if (minsLeft <= minPaceMinutes + buffer) return true;
  return false;
}

/** Gap until the next finish-window batch — averaged with jitter, not a fixed cadence. */
function computeFinishTrickleGap(minsLeft, trickleRemaining, trickleBatchMax, trickleIntervalMinutes) {
  const buffer = trickleFinishBufferMinutes(trickleRemaining);
  if (minsLeft <= buffer) return 0;

  const batchesLeft = trickleBatchesRemaining(trickleRemaining, trickleBatchMax);
  if (batchesLeft <= 1) return 0;

  const usable = Math.max(1, minsLeft - buffer);
  const avg = usable / batchesLeft;
  const jitter = 0.65 + Math.random() * 0.7;
  const gap = avg * jitter;
  return Math.max(MIN_TRICKLE_GAP_MINUTES, Math.min(gap, trickleIntervalMinutes));
}

function effectiveTrickleRemaining(garden, timezone, trickleEndHour) {
  const remaining = garden.trickleRemaining || 0;
  if (remaining <= 0) return 0;
  if (localHour(timezone) >= trickleEndHour) return 0;
  return remaining;
}

function updateMonthlyStats(garden) {
  const tz = garden.timezone || DEFAULT_GUILD_CONFIG.defaultTimezone;
  touchGardenCalendar(garden, tz);
}

function buildPermissionOverwrites(guild, ownerId, botMember) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: ownerId,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];
  if (botMember) {
    overwrites.push({
      id: botMember.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

async function ensureCategory(guild, guildData) {
  const botMember = guild.members.me ?? await guild.members.fetchMe();

  if (guildData.categoryId) {
    const existing = guild.channels.cache.get(guildData.categoryId)
      ?? await guild.channels.fetch(guildData.categoryId).catch(() => null);
    if (existing?.type === ChannelType.GuildCategory) {
      const catPerms = existing.permissionsFor(botMember);
      if (!catPerms?.has(PermissionFlagsBits.ManageChannels)) {
        await existing.permissionOverwrites.edit(botMember.id, {
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageMessages,
          ],
        }).catch(() => {});
      }
      return existing;
    }
  }

  const category = await guild.channels.create({
    name: CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    reason: 'Funkybucks garden category',
    permissionOverwrites: [
      {
        id: botMember.id,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });
  guildData.categoryId = category.id;
  return category;
}

export async function createGardenChannel(guild, member, guildData, { save = true, sendWelcome = true } = {}) {
  const gardens = save ? await loadGardens() : { [guild.id]: guildData };
  const data = save ? ensureGuild(gardens, guild.id) : guildData;
  const garden = getGardenRecord(data, member.id);

  if (garden.channelId) {
    const existing = guild.channels.cache.get(garden.channelId)
      ?? await guild.channels.fetch(garden.channelId).catch(() => null);
    if (existing) {
      return { channel: existing, created: false };
    }
    garden.channelId = null;
  }

  const category = await ensureCategory(guild, data);
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const displayName = member.displayName;
  const config = data.config;

  const topic = gardenTopic(displayName, config);

  const channel = await guild.channels.create({
    name: channelNameFromMember(member, config),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: topic.text,
    permissionOverwrites: buildPermissionOverwrites(guild, member.id, botMember),
    reason: `Garden for ${displayName}`,
  });

  garden.channelId = channel.id;
  garden.locked = false;
  if (!garden.timezone) {
    garden.timezone = config.defaultTimezone;
  }

  if (sendWelcome) {
    await channel.send(welcomeGardenMessage());
  }

  if (save) {
    await saveGardens(gardens);
  }

  return { channel, created: true };
}

export async function setupGardens(guild) {
  await assertBotGardenPermissions(guild);

  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guild.id);
  await ensureCategory(guild, guildData);

  const members = await getMemberMap(guild);
  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const member of members.values()) {
    if (member.user.bot) continue;
    try {
      const garden = getGardenRecord(guildData, member.id);
      if (garden.channelId) {
        const ch = guild.channels.cache.get(garden.channelId)
          ?? await guild.channels.fetch(garden.channelId).catch(() => null);
        if (ch) {
          skipped++;
          continue;
        }
        garden.channelId = null;
      }
      await createGardenChannel(guild, member, guildData, { save: false, sendWelcome: true });
      created++;
      if (created % 10 === 0) {
        await saveGardens(gardens);
      }
    } catch (err) {
      errors.push(`${member.displayName}: ${err.message}`);
    }
  }

  await saveGardens(gardens);
  return { created, skipped, errors, total: members.size };
}

export async function syncGardens(guild) {
  const botMember = await assertBotGardenPermissions(guild);

  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guild.id);
  const category = await ensureCategory(guild, guildData);

  const members = await getMemberMap(guild);
  let created = 0;
  let fixed = 0;
  const errors = [];

  for (const member of members.values()) {
    if (member.user.bot) continue;
    try {
      const garden = getGardenRecord(guildData, member.id);
      if (!garden.channelId) {
        await createGardenChannel(guild, member, guildData, { save: false, sendWelcome: false });
        created++;
        continue;
      }

      let channel = guild.channels.cache.get(garden.channelId)
        ?? await guild.channels.fetch(garden.channelId).catch(() => null);

      if (!channel) {
        garden.channelId = null;
        await createGardenChannel(guild, member, guildData, { save: false, sendWelcome: false });
        created++;
        continue;
      }

      fixed += await repairGardenChannel(guild, guildData, member, channel, category, botMember);
    } catch (err) {
      errors.push(`${member.displayName}: ${err.message}`);
    }
  }

  for (const [userId, garden] of Object.entries(guildData.gardens)) {
    if (!garden.channelId || members.has(userId)) continue;
    try {
      const channel = guild.channels.cache.get(garden.channelId)
        ?? await guild.channels.fetch(garden.channelId).catch(() => null);
      if (!channel) {
        garden.channelId = null;
        continue;
      }
      if (channel.parentId !== category.id) {
        await channel.setParent(category.id, { lockPermissions: false });
        fixed += 1;
      }
    } catch (err) {
      errors.push(`Garden ${userId.slice(-6)}: ${err.message}`);
    }
  }

  await saveGardens(gardens);
  return { created, fixed, errors };
}

export async function handleMemberJoin(guild, member) {
  if (member.user.bot) return null;

  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guild.id);
  const garden = getGardenRecord(guildData, member.id);

  if (garden.channelId) {
    const channel = guild.channels.cache.get(garden.channelId)
      ?? await guild.channels.fetch(garden.channelId).catch(() => null);
    if (channel && garden.locked) {
      garden.locked = false;
      await applyGardenPermissions(guild, channel, member.id);
      await channel.send(rejoinGardenMessage());
      await saveGardens(gardens);
      return channel;
    }
    if (channel) return channel;
  }

  const { channel } = await createGardenChannel(guild, member, guildData, { save: false, sendWelcome: true });
  await saveGardens(gardens);
  return channel;
}

export async function handleMemberLeave(guild, userId) {
  const gardens = await loadGardens();
  const guildData = gardens[guild.id];
  if (!guildData?.gardens?.[userId]) return;

  const garden = guildData.gardens[userId];
  if (!garden.channelId) return;

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);
  if (!channel) return;

  garden.locked = true;
  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: false,
    SendMessages: false,
    ManageMessages: false,
  });
  await channel.send(lockGardenMessage()).catch(() => {});
  await saveGardens(gardens);
}

export function findOwnerByChannelId(guildData, channelId) {
  for (const [userId, garden] of Object.entries(guildData.gardens)) {
    if (garden.channelId === channelId) {
      return userId;
    }
  }
  return null;
}

export async function markWeedPulled(guildId, channelId, messageId) {
  const gardens = await loadGardens();
  const guildData = gardens[guildId];
  if (!guildData) return false;

  const ownerId = findOwnerByChannelId(guildData, channelId);
  if (!ownerId) return false;

  const garden = guildData.gardens[ownerId];
  const weed = garden.activeWeeds.find((w) => w.messageId === messageId && !w.pulled);
  if (!weed) return false;

  weed.pulled = true;
  const tz = garden.timezone || guildData.config.defaultTimezone;
  const monthKey = statsMonthKeyForGardenDay(garden, guildData.config.defaultTimezone);
  await saveGardens(gardens);
  await recordWeedCleared(guildId, ownerId, monthKey);
  return true;
}

async function reconcileWeeds(channel, garden) {
  if (!channel || garden.activeWeeds.length === 0) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  for (const weed of garden.activeWeeds) {
    if (!weed.pulled && !messages.has(weed.messageId)) {
      weed.pulled = true;
    }
  }
}

async function sendWeedMessages(channel, count, garden) {
  const spawned = [];
  for (let i = 0; i < count; i++) {
    const msg = await channel.send(buildWeedMessage());
    spawned.push({ messageId: msg.id, pulled: false, weight: 1 });
    garden.activeWeeds.push(spawned[spawned.length - 1]);
    if (i < count - 1 && (i + 1) % 4 === 0) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return spawned;
}

export async function spawnWeedsForGarden(client, guild, userId, guildData) {
  const garden = guildData.gardens[userId];
  if (!garden?.channelId || garden.locked) return false;

  const today = localToday(garden.timezone);
  if (garden.spawnCompletedDate === today) return false;

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);
  if (!channel) return false;

  const config = guildData.config;
  const spawnTz = garden.timezone || config.defaultTimezone;
  const totalWeeds = randomInt(config.minWeeds, config.maxWeeds);
  const burstCount = Math.ceil(totalWeeds * 0.5);
  garden.trickleRemaining = totalWeeds - burstCount;
  garden.lastTrickleAt = DateTime.now().toISO();
  garden.trickleNextGapMinutes = null;
  garden.trickleIntervalMinutes = deriveTrickleIntervalMinutes(
    garden.trickleRemaining,
    config,
    spawnTz,
  );
  garden.spawnTimezone = spawnTz;
  garden.spawnStatsMonthKey = monthKeyForSpawnDate(today, spawnTz);
  garden.activeWeeds = [];

  await channel.send(spawnFlavorMessage());
  await sendWeedMessages(channel, burstCount, garden);

  garden.lastSpawnDate = today;
  garden.spawnCompletedDate = today;
  return true;
}

async function sendTrickleBatch(guild, userId, guildData, { finishWindow = false } = {}) {
  const garden = guildData.gardens[userId];
  const config = guildData.config;
  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);
  if (!channel) return false;

  const batchMax = gardenTrickleBatchMax(config);
  const batch = Math.min(
    randomInt(1, batchMax),
    garden.trickleRemaining,
  );
  await channel.send(trickleFlavorMessage());
  await sendWeedMessages(channel, batch, garden);
  garden.trickleRemaining -= batch;
  garden.lastTrickleAt = DateTime.now().toISO();

  if (finishWindow && garden.trickleRemaining > 0) {
    const tz = garden.timezone || config.defaultTimezone;
    const trickleEnd = config.trickleEndHour ?? DEFAULT_GUILD_CONFIG.trickleEndHour;
    const minsLeft = minutesUntilTrickleEnd(tz, trickleEnd);
    garden.trickleNextGapMinutes = computeFinishTrickleGap(
      minsLeft,
      garden.trickleRemaining,
      batchMax,
      gardenTrickleInterval(garden, config),
    );
  } else {
    garden.trickleNextGapMinutes = null;
  }

  return true;
}

export async function trickleWeedsForGarden(guild, userId, guildData) {
  const garden = guildData.gardens[userId];
  if (!garden?.channelId || garden.locked || garden.trickleRemaining <= 0) return false;

  const today = localToday(garden.timezone);
  if (garden.lastSpawnDate !== today) return false;

  const config = guildData.config;
  const trickleEnd = config.trickleEndHour ?? DEFAULT_GUILD_CONFIG.trickleEndHour;
  const hour = localHour(garden.timezone);

  if (hour < config.spawnHour || hour >= trickleEnd) return false;

  const tz = garden.timezone || config.defaultTimezone;
  const batchMax = gardenTrickleBatchMax(config);
  const interval = gardenTrickleInterval(garden, config);
  const minsLeft = minutesUntilTrickleEnd(tz, trickleEnd);
  const finishWindow = shouldEnterFinishWindow(minsLeft, garden.trickleRemaining, batchMax);

  const lastTrickle = garden.lastTrickleAt
    ? DateTime.fromISO(garden.lastTrickleAt)
    : null;
  const minutesSince = lastTrickle
    ? DateTime.now().diff(lastTrickle, 'minutes').minutes
    : interval;

  let requiredGap;
  if (finishWindow) {
    const buffer = trickleFinishBufferMinutes(garden.trickleRemaining);
    if (minsLeft <= buffer) {
      requiredGap = 0;
    } else if (garden.trickleNextGapMinutes != null) {
      requiredGap = garden.trickleNextGapMinutes;
    } else {
      requiredGap = computeFinishTrickleGap(
        minsLeft,
        garden.trickleRemaining,
        batchMax,
        interval,
      );
    }
  } else {
    garden.trickleNextGapMinutes = null;
    requiredGap = interval;
  }

  if (minutesSince < requiredGap) return false;

  return sendTrickleBatch(guild, userId, guildData, { finishWindow });
}

export async function settleGarden(client, guild, userId, guildData, excludeBotId = null) {
  const garden = guildData.gardens[userId];
  if (!garden?.channelId) return null;

  const spawnDay = garden.lastSpawnDate;
  if (!spawnDay || garden.settleCompletedDate === spawnDay) return null;

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);

  await reconcileWeeds(channel, garden);

  const remaining = garden.activeWeeds.filter((w) => !w.pulled);
  const deliveredPulled = allDeliveredPulled(garden);
  const config = guildData.config;
  let payout = 0;

  const tz = garden.timezone || config.defaultTimezone;
  const statsMonthKey = statsMonthKeyForGardenDay(garden, config.defaultTimezone);
  const currentMonth = monthKeyForTimezone(tz);
  const spawnMonthMatchesNow = statsMonthKey === currentMonth;

  updateMonthlyStatsForSpawn(garden, spawnDay, garden.spawnTimezone || tz);

  let freezeUsed = false;

  if (deliveredPulled) {
    payout = config.basePayout;
    garden.streak = (garden.streak || 0) + 1;
    if (spawnMonthMatchesNow) {
      garden.perfectDaysThisMonth = (garden.perfectDaysThisMonth || 0) + 1;
    }
    if (!garden.locked && !(excludeBotId && userId === excludeBotId)) {
      await addBalance(guild.id, userId, payout, excludeBotId);
      await recordPerfectDay(guild.id, userId, payout, statsMonthKey);
      await recordLongestStreak(guild.id, userId, garden.streak, statsMonthKey);
    }
  } else if (garden.activeWeeds.length > 0) {
    const total = config.streakFreezesPerMonth ?? DEFAULT_GUILD_CONFIG.streakFreezesPerMonth;
    const spawnMonthStats = await getStatsForMonthKey(guild.id, userId, statsMonthKey);
    const freezesUsedInSpawnMonth = spawnMonthStats.streakFreezesUsed || 0;
    if (freezesUsedInSpawnMonth < total) {
      freezeUsed = true;
      if (spawnMonthMatchesNow) {
        garden.streakFreezesUsedThisMonth = freezesUsedInSpawnMonth + 1;
      }
      if (!garden.locked && !(excludeBotId && userId === excludeBotId)) {
        await recordStreakFreezeUsed(guild.id, userId, statsMonthKey);
        await recordMissedDay(guild.id, userId, statsMonthKey);
      }
    } else {
      garden.streak = 0;
      if (!garden.locked && !(excludeBotId && userId === excludeBotId)) {
        await recordMissedDay(guild.id, userId, statsMonthKey);
      }
    }
  }

  if (channel && remaining.length > 0) {
    for (const weed of remaining) {
      await channel.messages.delete(weed.messageId).catch(() => {});
    }
  }

  if (channel && !garden.locked) {
    if (deliveredPulled) {
      await channel.send(settleSuccessMessage({ payout, streak: garden.streak }));
    } else if (garden.activeWeeds.length > 0) {
      if (freezeUsed) {
        const total = config.streakFreezesPerMonth ?? DEFAULT_GUILD_CONFIG.streakFreezesPerMonth;
        const usedDisplay = spawnMonthMatchesNow
          ? garden.streakFreezesUsedThisMonth
          : (await getStatsForMonthKey(guild.id, userId, statsMonthKey)).streakFreezesUsed;
        await channel.send(settleFreezeUsedMessage({
          streak: garden.streak,
          remaining: total - usedDisplay,
        }));
      } else {
        await channel.send(settleFailMessage({ remaining: remaining.length }));
      }
    }
  }

  garden.activeWeeds = [];
  garden.trickleRemaining = 0;
  garden.lastTrickleAt = null;
  garden.trickleNextGapMinutes = null;
  garden.trickleIntervalMinutes = null;
  garden.spawnStatsMonthKey = null;
  garden.spawnTimezone = null;
  garden.lastSettleDate = spawnDay;
  garden.settleCompletedDate = spawnDay;

  return { allPulled: deliveredPulled, payout, remaining: remaining.length, streak: garden.streak };
}

export async function processGardenTick(client, guildId) {
  const gardens = await loadGardens();
  const guildData = gardens[guildId];
  if (!guildData?.gardens) return;

  const guild = client.guilds.cache.get(guildId)
    ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  let changed = false;

  for (const [userId, garden] of Object.entries(guildData.gardens)) {
    if (!garden.channelId) continue;

    const tz = garden.timezone || guildData.config.defaultTimezone;
    const today = localToday(tz);
    const hour = localHour(tz);
    const config = guildData.config;

    if (garden.locked) {
      if (touchGardenCalendar(garden, tz)) changed = true;
      continue;
    }

    if (canSettleGarden(garden, hour, config.settleHour)) {
      await settleGarden(client, guild, userId, guildData, client.user?.id);
      changed = true;
      continue;
    }

    if (
      hour >= config.spawnHour
      && hour < config.settleHour
      && garden.spawnCompletedDate !== today
      && !gardenNeedsSettle(garden)
    ) {
      const spawned = await spawnWeedsForGarden(client, guild, userId, guildData);
      if (spawned) changed = true;
      continue;
    }

    const trickleEnd = config.trickleEndHour ?? DEFAULT_GUILD_CONFIG.trickleEndHour;
    if (
      hour >= trickleEnd
      && garden.lastSpawnDate === today
      && garden.trickleRemaining > 0
    ) {
      garden.trickleRemaining = 0;
      garden.trickleNextGapMinutes = null;
      changed = true;
    }

    if (
      hour >= config.spawnHour
      && hour < config.settleHour
      && garden.lastSpawnDate === today
      && garden.trickleRemaining > 0
      && hour < trickleEnd
    ) {
      const trickled = await trickleWeedsForGarden(guild, userId, guildData);
      if (trickled) changed = true;
    }
  }

  if (changed) {
    await saveGardens(gardens);
  }
}

export async function processAllGardenTicks(client) {
  const releaseLock = await acquireGardenTickLock();
  if (!releaseLock) {
    console.warn('Garden tick skipped — another bot instance holds the lock.');
    return;
  }

  try {
    const gardens = await loadGardens();
    for (const guildId of Object.keys(gardens)) {
      try {
        await processGardenTick(client, guildId);
      } catch (err) {
        console.error(`Garden tick error for guild ${guildId}:`, err);
      }
    }
  } finally {
    await releaseLock();
  }
}

export async function setUserTimezone(guildId, userId, timezoneInput) {
  const tz = resolveTimezone(timezoneInput);
  if (!tz) {
    throw new Error('invalid_timezone');
  }

  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guildId);
  const garden = getGardenRecord(guildData, userId);
  garden.timezone = tz;
  await saveGardens(gardens);
  return tz;
}

export async function getGardenStatus(guildId, userId) {
  const gardens = await loadGardens();
  const guildData = gardens[guildId];
  if (!guildData) {
    return null;
  }

  const garden = guildData.gardens?.[userId];
  if (!garden) {
    return { hasGarden: false };
  }

  const config = guildData.config;
  const tz = garden.timezone || config.defaultTimezone;
  const now = DateTime.now().setZone(tz);
  const active = garden.activeWeeds || [];
  const pulled = active.filter((w) => w.pulled).length;
  const total = active.length;
  const trickleEndHour = config.trickleEndHour ?? DEFAULT_GUILD_CONFIG.trickleEndHour;
  const trickle = effectiveTrickleRemaining(garden, tz, trickleEndHour);
  const streakFreezesPerMonth = config.streakFreezesPerMonth ?? DEFAULT_GUILD_CONFIG.streakFreezesPerMonth;

  return {
    hasGarden: true,
    channelId: garden.channelId,
    timezone: tz,
    pulled,
    total,
    trickleRemaining: trickle,
    estimatedTotal: total + trickle,
    streak: garden.streak || 0,
    perfectDaysThisMonth: garden.perfectDaysThisMonth || 0,
    streakFreezesUsed: garden.streakFreezesUsedThisMonth || 0,
    streakFreezesPerMonth,
    lastSpawnDate: garden.lastSpawnDate,
    lastSettleDate: garden.lastSettleDate,
    spawnHour: config.spawnHour,
    trickleEndHour: config.trickleEndHour ?? DEFAULT_GUILD_CONFIG.trickleEndHour,
    settleHour: config.settleHour,
    basePayout: config.basePayout,
    localTime: now.toFormat('HH:mm'),
    localDate: now.toISODate(),
    locked: garden.locked,
  };
}

export async function updateGuildConfig(guildId, updates) {
  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guildId);
  const allowed = [
    'spawnHour', 'trickleEndHour', 'settleHour', 'minWeeds', 'maxWeeds',
    'basePayout', 'defaultTimezone', 'trickleIntervalMinutes', 'trickleBatchMax',
    'useNicknamesForChannels', 'streakFreezesPerMonth',
  ];

  for (const key of allowed) {
    if (updates[key] !== undefined && updates[key] !== null) {
      guildData.config[key] = updates[key];
    }
  }

  if (guildData.config.minWeeds > guildData.config.maxWeeds) {
    guildData.config.maxWeeds = guildData.config.minWeeds;
  }

  const notes = validateGuildConfig(guildData.config);

  await saveGardens(gardens);
  return { config: guildData.config, notes };
}

export async function getGuildConfig(guildId) {
  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guildId);
  return { ...guildData.config };
}

function validateGuildConfig(config) {
  const notes = [];
  config.minWeeds = clamp(Number(config.minWeeds) || DEFAULT_GUILD_CONFIG.minWeeds, 1, MAX_WEEDS_PER_DAY);
  config.maxWeeds = clamp(Number(config.maxWeeds) || DEFAULT_GUILD_CONFIG.maxWeeds, 1, MAX_WEEDS_PER_DAY);
  if (config.minWeeds > config.maxWeeds) {
    config.maxWeeds = config.minWeeds;
    notes.push('max weeds raised to match min');
  }
  config.trickleBatchMax = clamp(
    Number(config.trickleBatchMax) || DEFAULT_GUILD_CONFIG.trickleBatchMax,
    1,
    MAX_TRICKLE_BATCH,
  );
  config.trickleIntervalMinutes = clamp(
    Number(config.trickleIntervalMinutes) || DEFAULT_GUILD_CONFIG.trickleIntervalMinutes,
    MIN_TRICKLE_GAP_MINUTES,
    45,
  );

  if (config.spawnHour >= config.settleHour) {
    config.settleHour = Math.min(23, config.spawnHour + 1);
    notes.push('settle hour adjusted above spawn hour');
  }
  if (config.trickleEndHour <= config.spawnHour) {
    config.trickleEndHour = Math.min(config.settleHour, config.spawnHour + 1);
    notes.push('trickle end hour adjusted above spawn hour');
  }
  if (config.trickleEndHour > config.settleHour) {
    config.trickleEndHour = config.settleHour;
    notes.push('trickle end hour capped at settle hour');
  }

  return notes;
}

export async function getGardenerTimezoneMap(guildId) {
  const gardens = await loadGardens();
  const guildData = gardens[guildId];
  const defaultTimezone = guildData?.config?.defaultTimezone ?? DEFAULT_GUILD_CONFIG.defaultTimezone;
  const timezones = {};
  for (const [userId, garden] of Object.entries(guildData?.gardens ?? {})) {
    timezones[userId] = garden.timezone || defaultTimezone;
  }
  return { defaultTimezone, timezones };
}

export async function getGardenLeaderboard(guild, { limit = null, excludeBotId = null } = {}) {
  const gardens = await loadGardens();
  const guildData = gardens[guild.id];
  const gardenMap = guildData?.gardens || {};
  const members = await getMemberMap(guild);
  const defaultTz = guildData?.config?.defaultTimezone ?? DEFAULT_GUILD_CONFIG.defaultTimezone;

  const entries = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (excludeBotId && member.id === excludeBotId) continue;

    const garden = gardenMap[member.id];
    const tz = garden?.timezone || defaultTz;
    const currentMonth = monthKeyForTimezone(tz);
    entries.push({
      userId: member.id,
      streak: garden?.streak || 0,
      perfectDaysThisMonth: garden?.statsMonth === currentMonth
        ? (garden?.perfectDaysThisMonth || 0)
        : 0,
    });
  }

  entries.sort((a, b) => {
    if (b.perfectDaysThisMonth !== a.perfectDaysThisMonth) {
      return b.perfectDaysThisMonth - a.perfectDaysThisMonth;
    }
    return b.streak - a.streak;
  });

  const ranked = assignCompetitionRanks(
    entries,
    (e) => e.perfectDaysThisMonth * 10_000 + e.streak,
  );
  if (limit) return ranked.slice(0, limit);
  return ranked;
}

export async function syncAllGardenTopics(guild, membersInput = null) {
  const gardens = await loadGardens();
  const guildData = gardens[guild.id];
  if (!guildData?.gardens) return 0;

  const config = guildData.config;
  const members = membersInput ?? await getMemberMap(guild);
  let updated = 0;

  for (const [userId, garden] of Object.entries(guildData.gardens)) {
    if (!garden.channelId) continue;
    const channel = guild.channels.cache.get(garden.channelId)
      ?? await guild.channels.fetch(garden.channelId).catch(() => null);
    if (!channel) continue;

    const member = members.get(userId);
    const displayName = member?.displayName || `Gardener ${userId.slice(-4)}`;
    const expectedTopic = gardenTopic(displayName, config);
    if (channel.topic !== expectedTopic.text) {
      await channel.setTopic(expectedTopic.text, 'Sync garden schedule');
      updated += 1;
    }
  }

  return updated;
}

export async function updateGardenChannelForMember(guild, member) {
  const gardens = await loadGardens();
  const guildData = gardens[guild.id];
  if (!guildData?.gardens?.[member.id]) return false;

  const garden = guildData.gardens[member.id];
  if (!garden.channelId) return false;

  const debounceKey = `${guild.id}:${member.id}`;
  const lastRename = renameDebounce.get(debounceKey) || 0;
  if (Date.now() - lastRename < 10 * 60 * 1000) {
    return false;
  }

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);
  if (!channel) return false;

  const config = guildData.config;
  const newName = channelNameFromMember(member, config);
  const newTopic = gardenTopic(member.displayName, config);

  if (channel.name !== newName) {
    await channel.setName(newName, 'Display name changed');
    renameDebounce.set(debounceKey, Date.now());
  }
  if (channel.topic !== newTopic.text) {
    await channel.setTopic(newTopic.text);
  }

  await saveGardens(gardens);

  return true;
}
