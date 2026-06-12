import { EmbedBuilder } from 'discord.js';
import { formatNumber } from './utils.js';

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

const SPAWN_PREFIXES = ['🌅', '🌄', '☀️', '🪻', '🌻', '🌼', '🐦', '🦗'];
const TRICKLE_PREFIXES = ['🌱', '🍃', '🌿', '🪴', '💨', '🐌'];

export const SPAWN_FLAVOR_LINES = [
  'The weeds are back in your garden...',
  'Overnight growth! Your garden needs attention.',
  'Uh oh — weeds have sprouted everywhere!',
  'Morning surprise: weeds as far as the eye can see.',
  'Weeeeeeeds!! Ahhhhhhh!!! HELP!!!!',
  'Hi, I am a weed, and I am here to stay >:3',
  'Weeds are back! Get ready to pull them all!',
  'Some weeds need to be pulled...',
  'Rise and shine — the garden got messy overnight.',
  'Nature called. It left weeds everywhere.',
  'Your garden woke up feral. Good luck.',
  'Plot twist: the weeds won the night.',
  'A gentle breeze... and a rude amount of weeds.',
  'Coffee first? The weeds said no.',
  'The funkybucks fairy did NOT weed this for you.',
];

export const TRICKLE_FLAVOR_LINES = [
  'More weeds just popped up while you were away...',
  'A sneaky patch crept in from the side.',
  'Trickle trickle — fresh weeds incoming.',
  'The garden wasn\'t done with you yet.',
  'You felt that? That was more weeds.',
  'Midday growth spurt. Sorry.',
  'The weeds are social distancing — not from each other.',
  'Just when you thought it was quiet...',
  'Weeds: "We\'re not finished."',
  'Another sprout party in your garden.',
];

export const SETTLE_SUCCESS_LINES = [
  'Garden cleared! You earned **{payout}** funkybucks. Streak: **{streak}** day(s) :0.',
  'Immaculate vibes. **{payout}** funkybucks deposited. Streak: **{streak}**! :0.',
  'Not a weed in sight — take your **{payout}** funkybucks. Streak: **{streak}** :0.',
  'Chef\'s kiss gardening. **{payout}** FB earned. **{streak}**-day streak! :0.',
  'You showed those weeds who\'s boss. **{payout}** funkybucks, streak **{streak}**! :0.',
  'Sparkling clean! **{payout}** funkybucks added. Streak: **{streak}** day(s) :0.',
  'The garden applauds you. **{payout}** FB. Streak: **{streak}** :0.',
  'Good job, **{name}**! Have **{payout}** funkybucks, streak **{streak}** :0.',
  'Well done! You just earned **{payout}** funkybucks. Streak **{streak}** :0.',
];

export const SETTLE_FAIL_LINES = [
  'Day over — **{remaining}** weed(s) left. No funkybucks today. Streak reset.',
  'The weeds survived sunset. **{remaining}** remain. No payout. Streak gone.',
  'So close... **{remaining}** weed(s) outlasted you. Streak reset.',
  'Tomorrow\'s problem became today\'s misery. **{remaining}** weeds left. No FB.',
  'The garden closes with **{remaining}** stragglers. Better luck tomorrow.',
  'The weeds are winning. **{remaining}** left — no funkybucks tonight.',
];

export const FORFEIT_STALE_LINES = [
  'Yesterday\'s weeds withered — streak reset. Fresh chaos arrives this morning!',
  'Old weeds composted themselves. Streak reset — new day soon!',
  'You left weeds out overnight. They wilted. Streak zeroed.',
  'The garden forgives, but the streak does not. Weeds cleared, streak reset.',
  'Stale weeds swept away. Start fresh when morning hits.',
  'The weeds seem to have won yesterday. Streak reset.',
];

export const WELCOME_GARDEN_LINES = [
  'Welcome to your plot! Weeds spawn in the morning — pull all weeds before evening settlement for funkybucks. Others can visit, only you can pull.',
  'This is your garden. Delete weed messages to pull them. Clear the lot before settle time!',
  'Home sweet garden. Set your timezone with `/garden timezone` so spawn times feel right.',
  'Your garden is ready. Morning weeds, evening payout — neighbors can peek in anytime. >:3',
];

export const REJOIN_GARDEN_LINES = [
  'Welcome back! Your garden unlocked — weeds will return on schedule.',
  'The gate\'s open again. Your garden missed you (the weeds definitely did).',
  'You\'re back! Garden access restored. Pull weeds, earn funkybucks.',
  'Reunited with your plot. Settle in — morning weeds are coming.',
];

export const GARDEN_TOPIC_TEMPLATE =
  '{name}\'s Garden — spawn ~{spawnHour}:00, trickle until {trickleEndHour}:00, settle {settleHour}:00 · {payout} FB if cleared';

export const TIMEZONE_INVALID_MESSAGE =
  'Invalid timezone. Use `eu`, `au`, or an IANA name like `Europe/Amsterdam`.';

export const NO_GARDEN_MESSAGE =
  'No garden yet. Ask a mod to run `/garden setup` or `/garden sync`.';

export const LOCKED_GARDEN_MESSAGE =
  'Your garden is locked because you left the server. Rejoin to unlock it.';

export const LEADERBOARD_EMPTY_MESSAGE = 'No gardeners on the server yet.';

export const WEED_WHISPERS = [
  '',
  '',
  '',
  '',
  '*rustle* ',
  '*squish* ',
  '*crunch* ',
  '… ',
  'peek ',
];

export const LOCK_GARDEN_LINES = [
  'Garden locked while you\'re away. The weeds will wait...',
  'Gate closed until you return. Your plot is safe.',
  'See you later — garden access paused until you\'re back.',
];

export const HELP_FOOTER_TEXT =
  'Pull all weeds before evening settlement to earn daily funkybucks.';

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export function spawnFlavorMessage() {
  return `${pickRandom(SPAWN_PREFIXES)} ${pickRandom(SPAWN_FLAVOR_LINES)}`;
}

export function trickleFlavorMessage() {
  return `${pickRandom(TRICKLE_PREFIXES)} ${pickRandom(TRICKLE_FLAVOR_LINES)}`;
}

export function settleSuccessMessage({ payout, streak }) {
  return `✅ ${fill(pickRandom(SETTLE_SUCCESS_LINES), {
    payout: formatNumber(payout),
    streak,
  })}`;
}

export function settleFailMessage({ remaining }) {
  return `🌙 ${fill(pickRandom(SETTLE_FAIL_LINES), { remaining })}`;
}

export function forfeitStaleMessage() {
  return `🥀 ${pickRandom(FORFEIT_STALE_LINES)}`;
}

export function welcomeGardenMessage() {
  return `🌿 ${pickRandom(WELCOME_GARDEN_LINES)}`;
}

export function rejoinGardenMessage() {
  return `🔓 ${pickRandom(REJOIN_GARDEN_LINES)}`;
}

export function gardenTopic(displayName, config) {
  const text = fill(GARDEN_TOPIC_TEMPLATE, {
    name: displayName,
    spawnHour: config.spawnHour,
    trickleEndHour: config.trickleEndHour ?? 17,
    settleHour: config.settleHour,
    payout: formatNumber(config.basePayout),
  });
  return { text };
}

export function timezoneSetMessage(tz, userId = null) {
  const line = `Garden timezone set to **${tz}**. Weeds use your local morning spawn and evening settlement.`;
  if (!userId) return line;
  return `<@${userId}> — ${line}`;
}

export function timezoneInvalidMessage() {
  return TIMEZONE_INVALID_MESSAGE;
}

export function noGardenMessage() {
  return NO_GARDEN_MESSAGE;
}

export function lockedGardenMessage() {
  return LOCKED_GARDEN_MESSAGE;
}

function formatProgress(status) {
  if (status.total > 0) {
    let line = `**${status.pulled}/${status.total}** weeds pulled`;
    if (status.trickleRemaining > 0) {
      line += ` · **${status.trickleRemaining}** more trickling in`;
    }
    return line;
  }
  if (status.trickleRemaining > 0) {
    return `Waiting for **${status.trickleRemaining}** weeds to trickle in`;
  }
  return 'No active weeds right now';
}

export function buildStatusEmbed(status, displayName = null) {
  const label = displayName ? `${displayName}'s Garden` : 'Your Garden';
  const channel = status.channelId ? `<#${status.channelId}>` : '—';

  return new EmbedBuilder()
    .setTitle(`🌿 ${label}`)
    .setColor(0x4a7c59)
    .addFields(
      { name: 'Channel', value: channel, inline: true },
      { name: 'Local time', value: `${status.localTime} (${status.timezone})`, inline: true },
      { name: 'Today', value: formatProgress(status), inline: false },
      {
        name: 'Schedule',
        value: [
          `Spawn **${status.spawnHour}:00**`,
          `Trickle until **${status.trickleEndHour}:00**`,
          `Settle **${status.settleHour}:00**`,
        ].join(' · '),
        inline: false,
      },
      {
        name: 'Reward',
        value: `**${formatNumber(status.basePayout)}** funkybucks if all weeds are cleared`,
        inline: true,
      },
      {
        name: 'Streak',
        value: `**${status.streak}** day(s) · **${status.perfectDaysThisMonth}** perfect days this month`,
        inline: true,
      },
    );
}

export function setupCompleteMessage({ created, skipped }, errorText = '') {
  return `Garden setup complete.\nCreated: **${created}** · Skipped: **${skipped}**${errorText}`;
}

export function syncCompleteMessage({ created, fixed }, errorText = '') {
  return `Garden sync complete.\nCreated: **${created}** · Fixed: **${fixed}**${errorText}`;
}

export function leaderboardEmptyMessage() {
  return LEADERBOARD_EMPTY_MESSAGE;
}

export function leaderboardEntryLine(entry) {
  const parts = [`#${entry.rank} <@${entry.userId}>`];
  parts.push(`**${entry.perfectDaysThisMonth}** perfect days`);
  parts.push(`**${entry.streak}**-day streak`);
  return parts.join(' — ');
}

export function configUpdatedMessage(config) {
  return [
    'Garden config updated:',
    `Spawn: **${config.spawnHour}:00** local`,
    `Trickle until: **${config.trickleEndHour}:00** local`,
    `Settle: **${config.settleHour}:00** local`,
    `Weeds/day: **${config.minWeeds}–${config.maxWeeds}**`,
    `Payout: **${formatNumber(config.basePayout)}** funkybucks`,
    `Default timezone: **${config.defaultTimezone}**`,
    `Channel names: **${config.useNicknamesForChannels ? 'nicknames' : 'usernames'}**`,
  ].join('\n');
}

export function helpFooterMessage() {
  return HELP_FOOTER_TEXT;
}

export function lockGardenMessage() {
  return `🔒 ${pickRandom(LOCK_GARDEN_LINES)}`;
}

export function buildWeedContent(emojis, randomInt) {
  const count = randomInt(4, 6);
  let msg = pickRandom(WEED_WHISPERS);
  for (let i = 0; i < count; i++) {
    msg += emojis[randomInt(0, emojis.length - 1)];
  }
  return msg;
}
