import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

export async function getBalance(guildId, userId) {
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  return Number(guildAccounts[userId] || 0);
}

export async function addBalance(guildId, userId, amount) {
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  const current = Number(guildAccounts[userId] || 0);
  guildAccounts[userId] = current + amount;
  await saveAccounts(accounts);
  return guildAccounts[userId];
}

export async function removeBalance(guildId, userId, amount) {
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  const current = Number(guildAccounts[userId] || 0);
  const next = Math.max(0, current - amount);
  guildAccounts[userId] = next;
  await saveAccounts(accounts);
  return guildAccounts[userId];
}

export async function transferBalance(guildId, fromUserId, toUserId, amount) {
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
  return { fromBalance: guildAccounts[fromUserId], toBalance: guildAccounts[toUserId] };
}

export async function getTopBalances(guildId, limit = 10) {
  const accounts = await loadAccounts();
  const guildAccounts = await ensureGuildAccounts(accounts, guildId);
  const entries = Object.entries(guildAccounts).map(([userId, bal]) => [userId, Number(bal || 0)]);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map(([userId, balance]) => ({ userId, balance }));
}
