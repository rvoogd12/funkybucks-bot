const CACHE_TTL_MS = 5 * 60 * 1000;
const WARM_STAGGER_MS = 5000;

const guildLocks = new Map();
const lastFetchAt = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheComplete(guild) {
  if (!guild.memberCount) return guild.members.cache.size > 0;
  return guild.members.cache.size >= guild.memberCount * 0.95;
}

async function withGuildLock(guildId, fn) {
  while (guildLocks.get(guildId)) {
    await guildLocks.get(guildId);
  }
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  guildLocks.set(guildId, wait);
  try {
    return await fn();
  } finally {
    guildLocks.delete(guildId);
    release();
  }
}

async function fetchAllMembersWithRetry(guild) {
  try {
    await guild.members.fetch();
  } catch (error) {
    const retryAfter = error?.data?.retry_after ?? error?.retryAfter;
    if (retryAfter && (error.name === 'GatewayRateLimitError' || error.code === 429)) {
      await sleep(retryAfter * 1000);
      await guild.members.fetch();
      return;
    }
    throw error;
  }
}

export async function ensureGuildMembersCached(guild, { force = false } = {}) {
  const guildId = guild.id;
  const lastFetch = lastFetchAt.get(guildId) || 0;
  const fresh = Date.now() - lastFetch < CACHE_TTL_MS;

  if (!force && fresh && cacheComplete(guild)) {
    return guild.members.cache;
  }

  return withGuildLock(guildId, async () => {
    const lastFetchInner = lastFetchAt.get(guildId) || 0;
    if (!force && Date.now() - lastFetchInner < CACHE_TTL_MS && cacheComplete(guild)) {
      return guild.members.cache;
    }

    if (!cacheComplete(guild)) {
      await fetchAllMembersWithRetry(guild);
    }
    lastFetchAt.set(guildId, Date.now());
    return guild.members.cache;
  });
}

export async function getMemberMap(guild) {
  return ensureGuildMembersCached(guild);
}

export async function getDisplayName(guild, userId) {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached.displayName;

  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return `User #${userId.slice(-6)}`;
  }
}

export async function warmGuildMemberCaches(client) {
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += 1) {
    const guild = guilds[i];
    try {
      await ensureGuildMembersCached(guild);
    } catch (err) {
      console.error(`Member cache warm failed for guild ${guild.id}:`, err.message);
    }
    if (i < guilds.length - 1) {
      await sleep(WARM_STAGGER_MS);
    }
  }
}
