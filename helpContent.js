import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

import { STATS_LEADERBOARD_TOPICS } from './stats.js';

export const HELP_SELECT_ID = 'help_category';
export const STATS_PERIOD_SELECT_ID = 'stats_period';
export const STATS_LB_TOPIC_SELECT_ID = 'stats_lb_topic';
export const STATS_LB_PERIOD_SELECT_ID = 'stats_lb_period';

function cmdLine(command, description) {
  return `- \`${command}\` — ${description}`;
}

export function buildCommandsEmbed() {
  return new EmbedBuilder()
    .setTitle('Commands')
    .setColor(0x00d4ff)
    .addFields(
      {
        name: 'Bank',
        value: [
          cmdLine('/bank balance [user]', 'Show a balance — yours or someone else\'s.'),
          cmdLine('/bank transfer to:<user> amount:<n>', 'Send funkybucks to another user.'),
          cmdLine('/bank transfer from:<user> to:<user> amount:<n>', 'Mods: move money between accounts.'),
          cmdLine('/bank leaderboard [limit]', 'All members ranked (omit limit for everyone).'),
          cmdLine('/bank add / remove', 'Mods: credit or debit funkybucks.'),
        ].join('\n'),
      },
      {
        name: 'Garden',
        value: [
          cmdLine('/garden setup / sync', 'Mods: create or fix garden channels.'),
          cmdLine('/timezone zone:<eu|au|IANA>', 'Set your local timezone for gardens and stats.'),
          cmdLine('/garden status', 'Today\'s weed progress and schedule.'),
          cmdLine('/garden leaderboard [limit]', 'All gardeners ranked (omit limit for everyone).'),
          cmdLine('/garden config', 'Mods: tune spawn, trickle end, settle, weeds, payout, channel names.'),
        ].join('\n'),
      },
      {
        name: 'Stats & General',
        value: [
          cmdLine('/stats view [user]', 'Funkybucks + garden stats (dropdown: lifetime/month/year).'),
          cmdLine('/stats leaderboard [limit]', 'Image LB — pick topic, then period (peak FB, earned, streak, weeds, etc.).'),
          cmdLine('/hi', 'Say hi! :D'),
          cmdLine('/help', 'Show this menu.'),
        ].join('\n'),
      },
    );
}

export function buildGardensEmbed() {
  return new EmbedBuilder()
    .setTitle('Gardens')
    .setColor(0x4a7c59)
    .setDescription('Daily weed-pulling minigame in your own channel.')
    .addFields(
      {
        name: 'What to delete',
        value: 'Only the **emoji weed messages** count. Flavor lines are optional cleanup.',
      },
      {
        name: 'Schedule',
        value: 'Weeds spawn in the **morning** (burst + trickle until trickle-end hour — no new weeds after that). Pull all weeds before **settlement** in the evening to earn funkybucks.',
      },
      {
        name: 'Away from the server',
        value: 'If you leave the server, your garden **pauses** (no weeds, no settlement, streak unchanged). Rejoin to pick up where you left off. Calendar months still roll over.',
      },
      {
        name: 'Streaks & freezes',
        value: 'Clear all weeds before settlement to grow your streak and earn funkybucks. Miss a day and you can spend a **streak freeze** to keep your streak (no payout that day). Everyone gets a set number of freezes per month (resets each month). Run out and your streak resets.',
      },
      {
        name: 'Visiting',
        value: 'Everyone can **view** other gardens. Only the owner can delete weeds in their plot.',
      },
      {
        name: 'Timezone',
        value: 'Run `/timezone zone:eu` (Europe/Amsterdam) or `zone:au` (Australia/Brisbane) so spawn/settle and stats match your local day.\n(Or something like Australia/Sydney for more specific timezones)',
      },
      {
        name: '',
        value: '-# **PROTIP**: Clear 500 weeds in one day to earn 1,000,000 funkybucks! :3',
      },
    );
}

export function buildEconomyEmbed() {
  return new EmbedBuilder()
    .setTitle('Funkybucks')
    .setColor(0xffd700)
    .setDescription('Server virtual currency.')
    .addFields(
      {
        name: 'Earning',
        value: 'Clear **all** weeds in your garden before evening settlement for the daily payout. More jobs coming soon!',
      },
      {
        name: 'Spending & sending',
        value: 'Use `/bank transfer` to send funkybucks to friends, or spend them in the shop.',
      },
      {
        name: 'Leaderboards & stats',
        value: '`/bank leaderboard` ranks by balance. See peak FB once held, FB earned (gardens earnings + transfers), plus more with `/stats view`.',
      },
      {
        name: 'Bots',
        value: 'Bots do not participate in the economy.',
      },
    );
}

export function buildTipsEmbed() {
  return new EmbedBuilder()
    .setTitle('Tips')
    .setColor(0x9b59b6)
    .addFields(
      {
        name: 'Check gardening status',
        value: '`/garden status` shows weeds pulled, trickle remaining, streak, plus more.',
      },
      {
        name: 'Visit neighbors',
        value: 'Browse the Gardens category — cheer friends on, but don\'t pull their weeds.',
      },
      {
        name: 'Track stats',
        value: '`/stats view` tracks peak FB once held, FB earned, weeds pulled, perfect/missed weed days, plus more! — per month, year, or lifetime.\n`/stats leaderboard` shows a leaderboard of the top users for a chosen topic.',
      },
    );
}

export const HELP_CATEGORIES = {
  commands: { label: 'Commands', emoji: '📋', build: buildCommandsEmbed },
  gardens: { label: 'Gardens', emoji: '🌿', build: buildGardensEmbed },
  economy: { label: 'Funkybucks', emoji: '💰', build: buildEconomyEmbed },
  tips: { label: 'Tips', emoji: '💡', build: buildTipsEmbed },
};

export function buildHelpIntroEmbed() {
  return new EmbedBuilder()
    .setTitle('Funkybucks Help')
    .setDescription('Pick a category below.')
    .setColor(0x00d4ff);
}

export function buildHelpSelectRow(selectedId = 'commands') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(HELP_SELECT_ID)
    .setPlaceholder('Choose a help category…')
    .addOptions(
      Object.entries(HELP_CATEGORIES).map(([id, cat]) => ({
        label: cat.label,
        value: id,
        emoji: cat.emoji,
        default: id === selectedId,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function buildStatsPeriodRow(selectedPeriod = 'lifetime', customId = STATS_PERIOD_SELECT_ID) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Stats period…')
    .addOptions(
      { label: 'Lifetime', value: 'lifetime', default: selectedPeriod === 'lifetime' },
      { label: 'This month', value: 'month', default: selectedPeriod === 'month' },
      { label: 'This year', value: 'year', default: selectedPeriod === 'year' },
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function buildStatsTopicRow(selectedTopic = 'peak', limit = null) {
  const customId = limit ? `${STATS_LB_TOPIC_SELECT_ID}:${limit}` : STATS_LB_TOPIC_SELECT_ID;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Choose a leaderboard topic…')
    .addOptions(
      Object.entries(STATS_LEADERBOARD_TOPICS).map(([id, topic]) => ({
        label: topic.label,
        value: id,
        default: id === selectedTopic,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function buildStatsLbPeriodRow(topicKey, selectedPeriod = 'lifetime', limit = null) {
  const limitSuffix = limit ? `:${limit}` : '';
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${STATS_LB_PERIOD_SELECT_ID}:${topicKey}${limitSuffix}`)
    .setPlaceholder('Stats period…')
    .addOptions(
      { label: 'Lifetime', value: 'lifetime', default: selectedPeriod === 'lifetime' },
      { label: 'This month', value: 'month', default: selectedPeriod === 'month' },
      { label: 'This year', value: 'year', default: selectedPeriod === 'year' },
    );
  return new ActionRowBuilder().addComponents(menu);
}
