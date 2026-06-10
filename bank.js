import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { assignCompetitionRanks } from './ranking.js';
import { recordBalancePeak } from './stats.js';

const ACCOUNTS_FILE = new URL('./data/accounts.json', import.meta.url);
const accountsFilePath = fileURLToPath(ACCOUNTS_FILE);
const accountsDir = path.dirname(accountsFilePath);

async function loadAccounts() {
  try {
    const raw = await fs.readFile(accountsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveAccounts(accounts) {
  await fs.mkdir(accountsDir, { recursive: true });
  await fs.writeFile(accountsFilePath, JSON.stringify(accounts, null, 2) + '\n', 'utf8');
}

async function ensureGuildAccounts(accounts, guildId) {
  if (!accounts[guildId]) {
    accounts[guildId] = {};
  }
  return accounts[guildId];
}

function assertNotBot(userId, excludeBotId) {
  if (excludeBotId && userId === excludeBotId) {
    throw new Error('bot_user');
  }
}

export async function getBalance(guildId, userId, excludeBotId = null) {
  assertNotBot(userId, excludeBotId);
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  return Number(guildAccounts[userId] || 0);
}

export async function addBalance(guildId, userId, amount, excludeBotId = null) {
  assertNotBot(userId, excludeBotId);
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  const current = Number(guildAccounts[userId] || 0);
  guildAccounts[userId] = current + amount;
  await saveAccounts(accounts);
  await recordBalancePeak(guildId, userId, guildAccounts[userId]);
  return guildAccounts[userId];
}

export async function removeBalance(guildId, userId, amount, excludeBotId = null) {
  assertNotBot(userId, excludeBotId);
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  const current = Number(guildAccounts[userId] || 0);
  const next = Math.max(0, current - amount);
  guildAccounts[userId] = next;
  await saveAccounts(accounts);
  await recordBalancePeak(guildId, userId, guildAccounts[userId]);
  return guildAccounts[userId];
}

export async function transferBalance(guildId, fromUserId, toUserId, amount, excludeBotId = null) {
  assertNotBot(fromUserId, excludeBotId);
  assertNotBot(toUserId, excludeBotId);
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  const fromBalance = Number(guildAccounts[fromUserId] || 0);
  if (amount > fromBalance) {
    throw new Error('insufficient_funds');
  }
  if (fromUserId === toUserId) {
    return { fromBalance, toBalance: fromBalance };
  }
  const toBalance = Number(guildAccounts[toUserId] || 0);
  guildAccounts[fromUserId] = fromBalance - amount;
  guildAccounts[toUserId] = toBalance + amount;
  await saveAccounts(accounts);
  await recordBalancePeak(guildId, fromUserId, guildAccounts[fromUserId]);
  await recordBalancePeak(guildId, toUserId, guildAccounts[toUserId]);
  return { fromBalance: guildAccounts[fromUserId], toBalance: guildAccounts[toUserId] };
}

export async function getLeaderboardBalances(guild, { limit = null, excludeBotId = null } = {}) {
  const accounts = await loadAccounts();
  const guildAccounts = accounts[guild.id] || {};
  const members = await guild.members.fetch();

  const entries = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (excludeBotId && member.id === excludeBotId) continue;
    entries.push({
      userId: member.id,
      balance: Number(guildAccounts[member.id] || 0),
    });
  }

  entries.sort((a, b) => b.balance - a.balance);
  const ranked = assignCompetitionRanks(entries, (e) => e.balance);
  if (limit) return ranked.slice(0, limit);
  return ranked;
}

/** @deprecated use getLeaderboardBalances */
export async function getTopBalances(guildId, limit = 10) {
  throw new Error('getTopBalances requires guild — use getLeaderboardBalances(guild, { limit })');
}
