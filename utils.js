export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function getRandomEmoji() {
  const emojiList = ['😄', '😌', '🤓', '😎', '😤', '🤖', '🌏', '💰', '💸', '💵', '🪙', '⏰', '👋', '✨', '<:Hi:1511421371526152272>'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncateDiscordContent(content, maxLength = 2000) {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength - 3)}...`;
}

export function appendErrorEmote(message) {
  const emote = Math.random() < 0.5 ? ':[' : ':c';
  return `${message} ${emote}`;
}
