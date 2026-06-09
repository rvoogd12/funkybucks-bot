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
import {
  spawnFlavorMessage,
  trickleFlavorMessage,
  settleSuccessMessage,
  settleFailMessage,
  forfeitStaleMessage,
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
  au: 'Australia/Sydney',
};

export const DEFAULT_GUILD_CONFIG = {
  spawnHour: 8,
  settleHour: 20,
  minWeeds: 15,
  maxWeeds: 20,
  basePayout: 10,
  defaultTimezone: TZ_PRESETS.eu,
  trickleIntervalMinutes: 45,
  trickleBatchMax: 3,
};

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

async function assertBotGardenPermissions(guild) {
  const me = guild.members.me ?? await guild.members.fetchMe();
  const required = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
  ];
  const missing = required.filter((perm) => !me.permissions.has(perm));
  if (missing.length > 0) {
    throw new Error('Bot is missing required permissions: Manage Channels, View Channels, Send Messages, and Manage Messages.');
  }
  return me;
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
      locked: false,
      topicVariant: null,
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

function updateMonthlyStats(garden) {
  const month = DateTime.now().setZone(garden.timezone || DEFAULT_GUILD_CONFIG.defaultTimezone).toFormat('yyyy-MM');
  if (garden.statsMonth !== month) {
    garden.statsMonth = month;
    garden.perfectDaysThisMonth = 0;
  }
}

function buildPermissionOverwrites(guild, ownerId, botMember) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [
        PermissionFlagsBits.ViewChannel,
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
  if (guildData.categoryId) {
    const existing = guild.channels.cache.get(guildData.categoryId)
      ?? await guild.channels.fetch(guildData.categoryId).catch(() => null);
    if (existing?.type === ChannelType.GuildCategory) {
      return existing;
    }
  }

  const category = await guild.channels.create({
    name: CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    reason: 'Funkybucks garden category',
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

  const topic = gardenTopic(displayName, config.settleHour, config.basePayout, garden.topicVariant);
  garden.topicVariant = topic.variant;

  const channel = await guild.channels.create({
    name: channelNameFromDisplayName(displayName, member.id),
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

async function applyGardenPermissions(guild, channel, ownerId) {
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  await channel.permissionOverwrites.set(buildPermissionOverwrites(guild, ownerId, botMember));
}

export async function setupGardens(guild) {
  await assertBotGardenPermissions(guild);

  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guild.id);
  await ensureCategory(guild, guildData);

  const members = await guild.members.fetch();
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
      await createGardenChannel(guild, member, guildData, { save: false, sendWelcome = true });
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
  await assertBotGardenPermissions(guild);

  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guild.id);
  await ensureCategory(guild, guildData);

  const members = await guild.members.fetch();
  let created = 0;
  let fixed = 0;
  const errors = [];

  for (const member of members.values()) {
    if (member.user.bot) continue;
    try {
      const garden = getGardenRecord(guildData, member.id);
      if (!garden.channelId) {
        await createGardenChannel(guild, member, guildData, { save: false, sendWelcome = true });
        created++;
        continue;
      }

      const channel = guild.channels.cache.get(garden.channelId)
        ?? await guild.channels.fetch(garden.channelId).catch(() => null);

      if (!channel) {
        garden.channelId = null;
        await createGardenChannel(guild, member, guildData, { save: false, sendWelcome = true });
        created++;
        continue;
      }

      await applyGardenPermissions(guild, channel, member.id);
      const config = guildData.config;
      const expectedTopic = gardenTopic(
        member.displayName,
        config.settleHour,
        config.basePayout,
        garden.topicVariant,
      );
      garden.topicVariant = expectedTopic.variant;
      if (channel.topic !== expectedTopic.text) {
        await channel.setTopic(expectedTopic.text, 'Sync garden topic');
      }
      fixed++;
    } catch (err) {
      errors.push(`${member.displayName}: ${err.message}`);
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

  const { channel } = await createGardenChannel(guild, member, guildData, { save: false, sendWelcome = true });
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
  await saveGardens(gardens);
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

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);
  if (!channel) return false;

  const config = guildData.config;
  const totalWeeds = randomInt(config.minWeeds, config.maxWeeds);
  const burstCount = Math.ceil(totalWeeds * 0.5);
  garden.trickleRemaining = totalWeeds - burstCount;
  garden.lastTrickleAt = DateTime.now().toISO();
  garden.activeWeeds = [];

  await channel.send(spawnFlavorMessage());
  await sendWeedMessages(channel, burstCount, garden);

  const today = localToday(garden.timezone);
  garden.lastSpawnDate = today;
  return true;
}

export async function trickleWeedsForGarden(guild, userId, guildData) {
  const garden = guildData.gardens[userId];
  if (!garden?.channelId || garden.locked || garden.trickleRemaining <= 0) return false;

  const today = localToday(garden.timezone);
  if (garden.lastSpawnDate !== today) return false;

  const hour = localHour(garden.timezone);
  const config = guildData.config;
  if (hour < config.spawnHour || hour >= config.settleHour) return false;

  const lastTrickle = garden.lastTrickleAt
    ? DateTime.fromISO(garden.lastTrickleAt)
    : null;
  const minutesSince = lastTrickle
    ? DateTime.now().diff(lastTrickle, 'minutes').minutes
    : config.trickleIntervalMinutes;

  if (minutesSince < config.trickleIntervalMinutes) return false;

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);
  if (!channel) return false;

  const batch = Math.min(
    randomInt(1, config.trickleBatchMax),
    garden.trickleRemaining,
  );
  await channel.send(trickleFlavorMessage());
  await sendWeedMessages(channel, batch, garden);
  garden.trickleRemaining -= batch;
  garden.lastTrickleAt = DateTime.now().toISO();
  return true;
}

async function forfeitStaleGarden(guild, userId, guildData) {
  const garden = guildData.gardens[userId];
  if (!garden?.channelId || garden.activeWeeds.length === 0) return;

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);

  const remaining = garden.activeWeeds.filter((w) => !w.pulled);
  garden.streak = 0;

  if (channel && remaining.length > 0) {
    for (const weed of remaining) {
      await channel.messages.delete(weed.messageId).catch(() => {});
    }
    await channel.send(forfeitStaleMessage());
  }

  garden.activeWeeds = [];
  garden.trickleRemaining = 0;
  garden.lastTrickleAt = null;
  if (garden.lastSpawnDate) {
    garden.lastSettleDate = garden.lastSpawnDate;
  }
}

export async function settleGarden(client, guild, userId, guildData) {
  const garden = guildData.gardens[userId];
  if (!garden?.channelId) return null;

  const channel = guild.channels.cache.get(garden.channelId)
    ?? await guild.channels.fetch(garden.channelId).catch(() => null);

  await reconcileWeeds(channel, garden);

  const remaining = garden.activeWeeds.filter((w) => !w.pulled);
  const allPulled = garden.activeWeeds.length > 0 && remaining.length === 0;
  const config = guildData.config;
  let payout = 0;

  updateMonthlyStats(garden);

  if (allPulled) {
    payout = config.basePayout;
    garden.streak = (garden.streak || 0) + 1;
    garden.perfectDaysThisMonth = (garden.perfectDaysThisMonth || 0) + 1;
    if (!garden.locked) {
      await addBalance(guild.id, userId, payout);
    }
  } else {
    garden.streak = 0;
  }

  if (channel && remaining.length > 0) {
    for (const weed of remaining) {
      await channel.messages.delete(weed.messageId).catch(() => {});
    }
  }

  if (channel && !garden.locked) {
    if (allPulled) {
      await channel.send(settleSuccessMessage({ payout, streak: garden.streak }));
    } else if (garden.activeWeeds.length > 0) {
      await channel.send(settleFailMessage({ remaining: remaining.length }));
    }
  }

  garden.activeWeeds = [];
  garden.trickleRemaining = 0;
  garden.lastTrickleAt = null;
  garden.lastSettleDate = localToday(garden.timezone);

  return { allPulled, payout, remaining: remaining.length, streak: garden.streak };
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
    if (garden.locked || !garden.channelId) continue;

    const tz = garden.timezone || guildData.config.defaultTimezone;
    const today = localToday(tz);
    const hour = localHour(tz);
    const config = guildData.config;

    if (
      garden.lastSpawnDate
      && garden.lastSpawnDate !== today
      && garden.activeWeeds.length > 0
    ) {
      await forfeitStaleGarden(guild, userId, guildData);
      changed = true;
    }

    if (
      hour >= config.settleHour
      && garden.lastSettleDate !== today
      && garden.lastSpawnDate === today
    ) {
      await settleGarden(client, guild, userId, guildData);
      changed = true;
      continue;
    }

    if (
      hour >= config.spawnHour
      && hour < config.settleHour
      && garden.lastSpawnDate !== today
    ) {
      await spawnWeedsForGarden(client, guild, userId, guildData);
      changed = true;
      continue;
    }

    if (
      hour >= config.spawnHour
      && hour < config.settleHour
      && garden.lastSpawnDate === today
      && garden.trickleRemaining > 0
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
  const gardens = await loadGardens();
  for (const guildId of Object.keys(gardens)) {
    try {
      await processGardenTick(client, guildId);
    } catch (err) {
      console.error(`Garden tick error for guild ${guildId}:`, err);
    }
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
  const trickle = garden.trickleRemaining || 0;

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
    lastSpawnDate: garden.lastSpawnDate,
    lastSettleDate: garden.lastSettleDate,
    spawnHour: config.spawnHour,
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
    'spawnHour', 'settleHour', 'minWeeds', 'maxWeeds',
    'basePayout', 'defaultTimezone', 'trickleIntervalMinutes', 'trickleBatchMax',
  ];

  for (const key of allowed) {
    if (updates[key] !== undefined && updates[key] !== null) {
      guildData.config[key] = updates[key];
    }
  }

  if (guildData.config.minWeeds > guildData.config.maxWeeds) {
    guildData.config.maxWeeds = guildData.config.minWeeds;
  }

  await saveGardens(gardens);
  return guildData.config;
}

export async function getGuildConfig(guildId) {
  const gardens = await loadGardens();
  const guildData = ensureGuild(gardens, guildId);
  return { ...guildData.config };
}

export async function getGardenLeaderboard(guildId, limit = 10) {
  const gardens = await loadGardens();
  const guildData = gardens[guildId];
  if (!guildData?.gardens) return [];

  const currentMonth = DateTime.now().toFormat('yyyy-MM');
  const entries = Object.entries(guildData.gardens)
    .map(([userId, garden]) => ({
      userId,
      streak: garden.streak || 0,
      perfectDaysThisMonth: garden.statsMonth === currentMonth
        ? (garden.perfectDaysThisMonth || 0)
        : 0,
    }))
    .filter((e) => e.streak > 0 || e.perfectDaysThisMonth > 0)
    .sort((a, b) => {
      if (b.perfectDaysThisMonth !== a.perfectDaysThisMonth) {
        return b.perfectDaysThisMonth - a.perfectDaysThisMonth;
      }
      return b.streak - a.streak;
    })
    .slice(0, limit);

  return entries;
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
  const newName = channelNameFromDisplayName(member.displayName, member.id);
  const newTopic = gardenTopic(
    member.displayName,
    config.settleHour,
    config.basePayout,
    garden.topicVariant,
  );
  garden.topicVariant = newTopic.variant;

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
