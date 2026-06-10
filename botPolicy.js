export function getBotUserId(client) {
  return client?.user?.id ?? null;
}

export function isBotUserId(userId, client) {
  const botId = getBotUserId(client);
  return Boolean(botId && userId === botId);
}

export function isBotUser(user, client) {
  if (!user) return false;
  if (user.bot) return true;
  return isBotUserId(user.id, client);
}

export function rejectIfBotUser(user, client) {
  if (isBotUser(user, client)) {
    throw new Error('bot_user');
  }
}
