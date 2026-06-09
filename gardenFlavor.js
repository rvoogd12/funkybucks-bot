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
  'Welcome to your garden! Weeds spawn in the morning — pull them all before evening for funkybucks.',
  'This is your plot. Delete weed messages to pull them. Clear the lot before settle time!',
  'Your private garden is ready. Morning weeds, evening payout — if you\'re quick enough.',
  'Home sweet garden. Set your timezone with `/garden timezone` so spawn times feel right.',
  'Keys to the garden: yours. Weeds: also yours. Funkybucks: yours if you hustle.',
];

export const REJOIN_GARDEN_LINES = [
  'Welcome back! Your garden unlocked — weeds will return on schedule.',
  'The gate\'s open again. Your garden missed you (the weeds definitely did).',
  'You\'re back! Garden access restored. Pull weeds, earn funkybucks.',
  'Reunited with your plot. Settle in — morning weeds are coming.',
];

export const GARDEN_TOPIC_LINES = [
  '{name}\'s Garden — Pull all weeds before {hour}:00 for {payout} funkybucks!',
  '{name}\'s plot — weed purge by {hour}:00 local = {payout} FB',
  'Garden of {name} · Clear weeds before {hour}:00 · Reward: {payout} funkybucks',
  '{name} · daily weed duty · deadline {hour}:00 · payout {payout} FB',
  '{name}\'s Garden — morning weeds, evening settle, {payout} funkybucks if spotless',
];

export const TIMEZONE_SET_LINES = [
  'Your garden timezone is now **{tz}**. Weeds spawn in the morning and settle in the evening — on your clock.',
  'Clock set to **{tz}**. Morning weeds, evening payout — all local time.',
  'Timezone locked: **{tz}**. Your garden runs on your schedule now.',
  'Got it — **{tz}**. Sunrise weeds, sunset settle. Happy pulling!',
];

export const TIMEZONE_INVALID_LINES = [
  'That timezone didn\'t parse. Try `eu`, `au`, or an IANA name like `Europe/Amsterdam`.',
  'Hmm, unknown timezone. Use `eu`, `au`, or something like `Australia/Sydney`.',
  'Nope — invalid zone. Examples: `eu`, `au`, `Europe/Berlin`, `Australia/Melbourne`.',
];

export const NO_GARDEN_LINES = [
  'No garden yet! Ask a mod to run `/garden setup` or `/garden sync`.',
  'You don\'t have a plot yet — mods can `/garden setup` the server.',
  'Garden not found. A mod needs to `/garden sync` you in.',
];

export const LOCKED_GARDEN_LINES = [
  'Your garden is locked because you left the server. Rejoin to unlock it.',
  'Plot sealed while you\'re away. Come back to reopen your garden.',
  'Garden on pause — rejoin the server to tend it again.',
];

export const STATUS_HEADERS = ['🌿', '🪴', '🌻', '🌼', '🍀', '🌱'];
export const STATUS_PROGRESS_ACTIVE = [
  '**{pulled}/{total}** weeds pulled — keep going!',
  'Progress: **{pulled}/{total}** weeds yanked.',
  '**{pulled}/{total}** down. The rest are judging you. >:3',
  'You\'ve pulled **{pulled}/{total}**. Finish the job!',
  '**{pulled}/{total}** weeds done. Get the rest!',
];
export const STATUS_PROGRESS_TRICKLE_WAIT = [
  'Waiting for **{remaining}** more weeds to trickle in...',
  '**{remaining}** weeds still sprouting throughout the day.',
  'Hold on — **{remaining}** more weeds are on their way... >:3',
];
export const STATUS_PROGRESS_IDLE = [
  'No active weeds right now. Enjoy the peace.',
  'Garden\'s quiet — no weeds at the moment.',
  'Weed-free for now. Don\'t get comfortable.',
  'All calm... for now. :0',
  'It seems the weeds are having a break!'
];
export const STATUS_TRICKLE_EXTRA = [
  '+ **{remaining}** still sprouting today... >:3',
  '**{remaining}** more on the way later',
  'Another **{remaining}** weeds expected today',
  'Stay tuned... **{remaining}** to trickle in :0',
];
export const STATUS_PAYOUT_LINES = [
  'Payout: **{payout}** funkybucks if every weed is cleared',
  'Clear the lot for **{payout}** funkybucks',
  'Reward today: **{payout}** FB — all weeds must go',
  'Enjoy **{payout}** funkybucks if the weeds don\'t win! :0',
  'Pull those weeds and earn **{payout}** funkybucks while you can.',
  'Get those weeds before the weeds get you! **{payout}** funkybucks if you\'re quick enough. >:3',
];
export const STATUS_STREAK_LINES = [
  'Streak: **{streak}** day(s) · Perfect days this month: **{perfect}**',
  '🔥 **{streak}**-day streak · **{perfect}** perfect days this month :0',
  'On a **{streak}**-day run · **{perfect}** flawless days so far this month',
  'Keep that **{streak}**-day streak going! **{perfect}** perfect days so far this month!',
];

export const SETUP_COMPLETE_LINES = [
  'Gardens planted!\nCreated: **{created}** · Skipped: **{skipped}**{errors}',
  'Setup done — **{created}** new gardens, **{skipped}** already existed.{errors}',
  'The neighborhood\'s ready. **{created}** gardens created, **{skipped}** untouched.{errors}',
  'Garden setup complete.\n**{created}** freshly planted gardens, **{skipped}** already had one.{errors}',
];

export const SYNC_COMPLETE_LINES = [
  'Garden sync complete.\nCreated: **{created}** · Fixed: **{fixed}**{errors}',
  'Synced! **{created}** new plots, **{fixed}** gardens patched.{errors}',
  'All tidy. **{created}** created, **{fixed}** repaired.{errors}',
];

export const LEADERBOARD_EMPTY_LINES = [
  'No garden streaks yet. Clear your weeds daily! >:3',
  'Leaderboard\'s empty — someone pull a perfect garden day first.',
  'No green thumbs on the board yet. Get weeding!',
  'Streaks might be missing. Get those gardeners to pull some weeds! :0',
];

export const LEADERBOARD_HEADERS = [
  '🌻 **Garden Leaderboard**',
  '🏆 **Top Gardeners**',
  '🪴 **Weed Whackers Hall of Fame**',
  '🌿 **Garden Legends**',
];

export const LEADERBOARD_ENTRY_PERFECT = [
  '**{days}** perfect days this month',
  '**{days}** flawless days this month',
  '**{days}** spotless garden days',
];
export const LEADERBOARD_ENTRY_STREAK = [
  '**{streak}**-day streak',
  '**{streak}** days in a row',
  'on fire: **{streak}** days',
];

export const CONFIG_UPDATED_LINES = [
  'Garden config updated:',
  'Settings tilled and replanted:',
  'Garden rules adjusted:',
];

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

export const HELP_FOOTER_LINES = [
  'Pull all weeds in your garden before evening settlement to earn daily funkybucks.',
  'Morning weeds, evening settle — clear your garden for the daily payout.',
  'Your garden, your timezone, your funkybucks — if the weeds don\'t win.',
];

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

export function gardenTopic(displayName, settleHour, basePayout, variant = null) {
  const index = variant === null
    ? Math.floor(Math.random() * GARDEN_TOPIC_LINES.length)
    : ((variant % GARDEN_TOPIC_LINES.length) + GARDEN_TOPIC_LINES.length) % GARDEN_TOPIC_LINES.length;
  return {
    text: fill(GARDEN_TOPIC_LINES[index], {
      name: displayName,
      hour: settleHour,
      payout: formatNumber(basePayout),
    }),
    variant: index,
  };
}

export function timezoneSetMessage(tz) {
  return pickRandom(TIMEZONE_SET_LINES).replace('{tz}', tz);
}

export function timezoneInvalidMessage() {
  return pickRandom(TIMEZONE_INVALID_LINES);
}

export function noGardenMessage() {
  return pickRandom(NO_GARDEN_LINES);
}

export function lockedGardenMessage() {
  return pickRandom(LOCKED_GARDEN_LINES);
}

export function formatStatusMessage(status) {
  const channelMention = status.channelId ? `<#${status.channelId}>` : 'unknown';
  const header = `${pickRandom(STATUS_HEADERS)} **Your Garden** ${channelMention}`;

  let progress;
  if (status.total > 0) {
    progress = fill(pickRandom(STATUS_PROGRESS_ACTIVE), {
      pulled: status.pulled,
      total: status.total,
    });
  } else if (status.trickleRemaining > 0) {
    progress = fill(pickRandom(STATUS_PROGRESS_TRICKLE_WAIT), {
      remaining: status.trickleRemaining,
    });
  } else {
    progress = pickRandom(STATUS_PROGRESS_IDLE);
  }

  const lines = [
    header,
    progress,
    status.trickleRemaining > 0 && status.total > 0
      ? fill(pickRandom(STATUS_TRICKLE_EXTRA), { remaining: status.trickleRemaining })
      : null,
    `Timezone: **${status.timezone}** (local ${status.localTime})`,
    `Spawn: **${status.spawnHour}:00** · Settle: **${status.settleHour}:00**`,
    fill(pickRandom(STATUS_PAYOUT_LINES), { payout: formatNumber(status.basePayout) }),
    fill(pickRandom(STATUS_STREAK_LINES), {
      streak: status.streak,
      perfect: status.perfectDaysThisMonth,
    }),
  ];

  return lines.filter(Boolean).join('\n');
}

export function setupCompleteMessage({ created, skipped }, errorText = '') {
  return fill(pickRandom(SETUP_COMPLETE_LINES), {
    created,
    skipped,
    errors: errorText,
  });
}

export function syncCompleteMessage({ created, fixed }, errorText = '') {
  return fill(pickRandom(SYNC_COMPLETE_LINES), {
    created,
    fixed,
    errors: errorText,
  });
}

export function leaderboardEmptyMessage() {
  return pickRandom(LEADERBOARD_EMPTY_LINES);
}

export function leaderboardHeader() {
  return pickRandom(LEADERBOARD_HEADERS);
}

export function leaderboardEntryLine(idx, entry) {
  const parts = [`${idx + 1}. <@${entry.userId}>`];
  if (entry.perfectDaysThisMonth > 0) {
    parts.push(fill(pickRandom(LEADERBOARD_ENTRY_PERFECT), {
      days: entry.perfectDaysThisMonth,
    }));
  }
  if (entry.streak > 0) {
    parts.push(fill(pickRandom(LEADERBOARD_ENTRY_STREAK), {
      streak: entry.streak,
    }));
  }
  return parts.join(' — ');
}

export function configUpdatedMessage(config) {
  return [
    pickRandom(CONFIG_UPDATED_LINES),
    `Spawn: **${config.spawnHour}:00** local`,
    `Settle: **${config.settleHour}:00** local`,
    `Weeds/day: **${config.minWeeds}–${config.maxWeeds}**`,
    `Payout: **${formatNumber(config.basePayout)}** funkybucks`,
    `Default timezone: **${config.defaultTimezone}**`,
  ].join('\n');
}

export function helpFooterMessage() {
  return pickRandom(HELP_FOOTER_LINES);
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
