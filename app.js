import 'dotenv/config';
import {
  AttachmentBuilder,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} from 'discord.js';
import { getRandomEmoji, formatNumber, truncateDiscordContent, appendErrorEmote } from './utils.js';
import {
  addBalance,
  getBalance,
  removeBalance,
  getLeaderboardBalances,
  transferBalance,
} from './bank.js';
import { generateLeaderboardImage } from './leaderboard.js';
import { generateGardenLeaderboardImage } from './gardenLeaderboard.js';
import {
  setupGardens,
  syncGardens,
  setUserTimezone,
  getGardenStatus,
  updateGuildConfig,
  getGardenLeaderboard,
  syncAllGardenTopics,
  markWeedPulled,
  handleMemberJoin,
  handleMemberLeave,
  updateGardenChannelForMember,
  processAllGardenTicks,
  resolveTimezone,
} from './gardens.js';
import { startGardenScheduler } from './gardenScheduler.js';
import { isBotUser, rejectIfBotUser, getBotUserId } from './botPolicy.js';
import {
  getUserStats,
  getStatsLeaderboard,
  buildStatsEmbed,
  buildStatsLeaderboardContent,
  recordTransfer,
} from './stats.js';
import {
  timezoneSetMessage,
  timezoneInvalidMessage,
  noGardenMessage,
  lockedGardenMessage,
  buildStatusEmbed,
  setupCompleteMessage,
  syncCompleteMessage,
  leaderboardEmptyMessage,
  leaderboardEntryLine,
  configUpdatedMessage,
} from './gardenFlavor.js';
import {
  HELP_SELECT_ID,
  buildHelpIntroEmbed,
  buildHelpSelectRow,
  HELP_CATEGORIES,
  buildStatsPeriodRow,
  buildStatsTopicRow,
  buildStatsLbPeriodRow,
  STATS_PERIOD_SELECT_ID,
  STATS_LB_TOPIC_SELECT_ID,
  STATS_LB_PERIOD_SELECT_ID,
} from './helpContent.js';

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing required environment variable: DISCORD_TOKEN');
  console.error('Set it in Orihost startup variables or create a .env file in /home/container/.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

function botId() {
  return getBotUserId(client);
}

function hasModeratorPermission(interaction) {
  const permissions = interaction.memberPermissions;
  if (!permissions) return false;
  return (
    permissions.has(PermissionFlagsBits.Administrator)
    || permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function replyError(interaction, message) {
  const payload = { content: appendErrorEmote(message), ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

function botUserMessage() {
  return 'Bots don\'t use funkybucks.';
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startGardenScheduler(client, processAllGardenTicks);
});

client.on('guildMemberAdd', async (member) => {
  try {
    await handleMemberJoin(member.guild, member);
  } catch (err) {
    console.error('guildMemberAdd garden error:', err);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    await handleMemberLeave(member.guild, member.id);
  } catch (err) {
    console.error('guildMemberRemove garden error:', err);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.displayName === newMember.displayName) return;
  try {
    await updateGardenChannelForMember(newMember.guild, newMember);
  } catch (err) {
    console.error('guildMemberUpdate garden rename error:', err);
  }
});

client.on('messageDelete', async (message) => {
  if (!message.guild || !message.channel) return;
  try {
    await markWeedPulled(message.guild.id, message.channel.id, message.id);
  } catch (err) {
    console.error('messageDelete garden error:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === HELP_SELECT_ID) {
        const categoryId = interaction.values[0];
        const category = HELP_CATEGORIES[categoryId];
        if (!category) return;
        await interaction.update({
          embeds: [buildHelpIntroEmbed(), category.build()],
          components: [buildHelpSelectRow(categoryId)],
        });
        return;
      }

      if (interaction.customId.startsWith(`${STATS_PERIOD_SELECT_ID}:`)) {
        const targetUserId = interaction.customId.split(':')[1];
        const period = interaction.values[0];
        const guildId = interaction.guildId;
        if (!guildId) return;
        const stats = await getUserStats(guildId, targetUserId, period);
        await interaction.update({
          embeds: [buildStatsEmbed(targetUserId, stats, period)],
          components: [buildStatsPeriodRow(period, `${STATS_PERIOD_SELECT_ID}:${targetUserId}`)],
        });
        return;
      }

      if (interaction.customId === STATS_LB_TOPIC_SELECT_ID || interaction.customId.startsWith(`${STATS_LB_TOPIC_SELECT_ID}:`)) {
        const guildId = interaction.guildId;
        if (!guildId) return;
        const limitPart = interaction.customId.split(':')[1];
        const limit = limitPart ? Number(limitPart) : null;
        const topicKey = interaction.values[0];
        const period = 'lifetime';
        const top = await getStatsLeaderboard(interaction.guild, topicKey, period, limit, botId());
        await interaction.update({
          content: buildStatsLeaderboardContent(topicKey, period, top),
          components: [buildStatsLbPeriodRow(topicKey, period, limit)],
        });
        return;
      }

      if (interaction.customId.startsWith(`${STATS_LB_PERIOD_SELECT_ID}:`)) {
        const guildId = interaction.guildId;
        if (!guildId) return;
        const parts = interaction.customId.split(':');
        const topicKey = parts[1];
        const limit = parts[2] ? Number(parts[2]) : null;
        const period = interaction.values[0];
        const top = await getStatsLeaderboard(interaction.guild, topicKey, period, limit, botId());
        await interaction.update({
          content: buildStatsLeaderboardContent(topicKey, period, top),
          components: [buildStatsLbPeriodRow(topicKey, period, limit)],
        });
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'hi') {
      await interaction.reply({
        content: `Hi! Time to make some funkybucks... ${getRandomEmoji()} \n-# Or spend some... >:3`,
      });
      return;
    }

    if (interaction.commandName === 'help') {
      await interaction.reply({
        embeds: [buildHelpIntroEmbed(), HELP_CATEGORIES.commands.build()],
        components: [buildHelpSelectRow('commands')],
      });
      return;
    }

    if (interaction.commandName === 'stats') {
      const guildId = interaction.guildId;
      if (!guildId) {
        await replyError(interaction, 'Stats are only available inside a server.');
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'view') {
        const user = interaction.options.getUser('user') ?? interaction.user;
        if (isBotUser(user, client)) {
          await replyError(interaction, botUserMessage());
          return;
        }

        const period = 'lifetime';
        const stats = await getUserStats(guildId, user.id, period);
        await interaction.reply({
          embeds: [buildStatsEmbed(user.id, stats, period)],
          components: [buildStatsPeriodRow(period, `${STATS_PERIOD_SELECT_ID}:${user.id}`)],
        });
        return;
      }

      if (subcommand === 'leaderboard') {
        const limit = interaction.options.getInteger('limit');
        await interaction.reply({
          content: 'Choose a leaderboard topic:',
          components: [buildStatsTopicRow('peak', limit)],
        });
        return;
      }
    }

    if (interaction.commandName === 'garden') {
      const guildId = interaction.guildId;
      if (!guildId) {
        await replyError(interaction, 'Gardens are only available inside a server.');
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'setup') {
        if (!hasModeratorPermission(interaction)) {
          await replyError(interaction, 'You must be a moderator to set up gardens.');
          return;
        }

        await interaction.deferReply();
        const result = await setupGardens(interaction.guild);
        const errorText = result.errors.length > 0
          ? `\nErrors (${result.errors.length}):\n${result.errors.slice(0, 5).join('\n')}`
          : '';
        await interaction.editReply({
          content: truncateDiscordContent(setupCompleteMessage(result, errorText)),
        });
        return;
      }

      if (subcommand === 'sync') {
        if (!hasModeratorPermission(interaction)) {
          await replyError(interaction, 'You must be a moderator to sync gardens.');
          return;
        }

        await interaction.deferReply();
        const result = await syncGardens(interaction.guild);
        await syncAllGardenTopics(interaction.guild);
        const errorText = result.errors.length > 0
          ? `\nErrors (${result.errors.length}):\n${result.errors.slice(0, 5).join('\n')}`
          : '';
        await interaction.editReply({
          content: truncateDiscordContent(syncCompleteMessage(result, errorText)),
        });
        return;
      }

      if (subcommand === 'timezone') {
        const zoneInput = interaction.options.getString('zone', true);
        try {
          const tz = await setUserTimezone(guildId, interaction.user.id, zoneInput);
          await interaction.reply({
            content: timezoneSetMessage(tz, interaction.user.id),
          });
        } catch (err) {
          if (err.message === 'invalid_timezone') {
            await replyError(interaction, timezoneInvalidMessage());
            return;
          }
          throw err;
        }
        return;
      }

      if (subcommand === 'status') {
        const status = await getGardenStatus(guildId, interaction.user.id);
        if (!status?.hasGarden) {
          await replyError(interaction, noGardenMessage());
          return;
        }

        if (status.locked) {
          await replyError(interaction, lockedGardenMessage());
          return;
        }

        await interaction.reply({
          embeds: [buildStatusEmbed(status, interaction.user.id)],
        });
        return;
      }

      if (subcommand === 'leaderboard') {
        const limit = interaction.options.getInteger('limit');
        const top = await getGardenLeaderboard(interaction.guild, { limit, excludeBotId: botId() });

        if (top.length === 0) {
          await interaction.reply({ content: leaderboardEmptyMessage() });
          return;
        }

        await interaction.deferReply();
        try {
          const imageBuffer = await generateGardenLeaderboardImage(top, guildId, process.env.DISCORD_TOKEN);
          const attachment = new AttachmentBuilder(imageBuffer, { name: 'garden-leaderboard.png' });
          await interaction.editReply({
            content: 'Garden Leaderboard',
            files: [attachment],
          });
        } catch (err) {
          console.error('Error generating garden leaderboard image:', err);
          const lines = top.map((entry) => leaderboardEntryLine(entry));
          await interaction.editReply({
            content: `**Garden Leaderboard**\n${lines.join('\n')}`,
          });
        }
        return;
      }

      if (subcommand === 'config') {
        if (!hasModeratorPermission(interaction)) {
          await replyError(interaction, 'You must be a moderator to configure gardens.');
          return;
        }

        const defaultTzInput = interaction.options.getString('default_timezone');
        let defaultTimezone;
        if (defaultTzInput) {
          defaultTimezone = resolveTimezone(defaultTzInput);
          if (!defaultTimezone) {
            await replyError(interaction, timezoneInvalidMessage());
            return;
          }
        }

        const config = await updateGuildConfig(guildId, {
          spawnHour: interaction.options.getInteger('spawn_hour'),
          trickleEndHour: interaction.options.getInteger('trickle_end_hour'),
          settleHour: interaction.options.getInteger('settle_hour'),
          minWeeds: interaction.options.getInteger('min_weeds'),
          maxWeeds: interaction.options.getInteger('max_weeds'),
          basePayout: interaction.options.getInteger('base_payout'),
          defaultTimezone,
        });

        await syncAllGardenTopics(interaction.guild);

        await interaction.reply({
          content: configUpdatedMessage(config),
        });
        return;
      }

      await replyError(interaction, 'Unknown garden subcommand.');
      return;
    }

    if (interaction.commandName === 'bank') {
      const guildId = interaction.guildId;
      if (!guildId) {
        await replyError(interaction, 'Bank accounts are only available inside a server.');
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'balance') {
        const user = interaction.options.getUser('user') ?? interaction.user;
        if (isBotUser(user, client)) {
          await replyError(interaction, botUserMessage());
          return;
        }

        const balance = await getBalance(guildId, user.id, botId());
        await interaction.reply({
          content: `<@${user.id}> has **${formatNumber(balance)}** funkybucks.`,
        });
        return;
      }

      if (subcommand === 'add') {
        if (!hasModeratorPermission(interaction)) {
          await replyError(interaction, 'You must be a moderator to add funkybucks.');
          return;
        }

        const user = interaction.options.getUser('user', true);
        try {
          rejectIfBotUser(user, client);
        } catch {
          await replyError(interaction, botUserMessage());
          return;
        }

        const amount = interaction.options.getInteger('amount', true);
        const newBalance = await addBalance(guildId, user.id, amount, botId());
        await interaction.reply({
          content: `Added **${formatNumber(amount)}** funkybucks to <@${user.id}>. New balance: **${formatNumber(newBalance)}**.`,
        });
        return;
      }

      if (subcommand === 'leaderboard') {
        const limit = interaction.options.getInteger('limit');
        const top = await getLeaderboardBalances(interaction.guild, { limit, excludeBotId: botId() });

        if (!top || top.length === 0) {
          await interaction.reply({ content: 'No members found in this server.' });
          return;
        }

        await interaction.deferReply();
        try {
          const imageBuffer = await generateLeaderboardImage(top, guildId, process.env.DISCORD_TOKEN);
          const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });
          await interaction.editReply({
            content: 'Funkybucks Leaderboard',
            files: [attachment],
          });
        } catch (err) {
          console.error('Error generating leaderboard image:', err);
          const lines = top.map((entry) => `#${entry.rank} <@${entry.userId}> — **${formatNumber(entry.balance)}**`);
          await interaction.editReply({
            content: `**Funkybucks Leaderboard**\n${lines.join('\n')}`,
          });
        }
        return;
      }

      if (subcommand === 'transfer') {
        const recipient = interaction.options.getUser('to', true);
        const amount = interaction.options.getInteger('amount', true);
        const fromUser = interaction.options.getUser('from');
        const senderId = fromUser?.id ?? interaction.user.id;

        if (isBotUser(recipient, client) || (fromUser && isBotUser(fromUser, client))) {
          await replyError(interaction, botUserMessage());
          return;
        }

        if (senderId !== interaction.user.id && !hasModeratorPermission(interaction)) {
          await replyError(interaction, 'You must be a moderator to transfer from another user.');
          return;
        }

        if (recipient.id === senderId) {
          await replyError(interaction, 'You cannot transfer funkybucks to the same account.');
          return;
        }

        try {
          const { fromBalance, toBalance } = await transferBalance(
            guildId, senderId, recipient.id, amount, botId(),
          );
          await recordTransfer(guildId, senderId, recipient.id, amount);
          await interaction.reply({
            content: `Transferred **${formatNumber(amount)}** funkybucks from <@${senderId}> to <@${recipient.id}>.\n<@${senderId}> now has **${formatNumber(fromBalance)}**.\n<@${recipient.id}> now has **${formatNumber(toBalance)}**.`,
          });
        } catch (err) {
          if (err.message === 'insufficient_funds') {
            await replyError(interaction, 'The source account does not have enough funkybucks.');
            return;
          }
          if (err.message === 'bot_user') {
            await replyError(interaction, botUserMessage());
            return;
          }
          console.error('Transfer error:', err);
          await replyError(interaction, 'Could not complete the transfer.');
        }
        return;
      }

      if (subcommand === 'remove') {
        if (!hasModeratorPermission(interaction)) {
          await replyError(interaction, 'You must be a moderator to remove funkybucks.');
          return;
        }

        const user = interaction.options.getUser('user', true);
        try {
          rejectIfBotUser(user, client);
        } catch {
          await replyError(interaction, botUserMessage());
          return;
        }

        const amount = interaction.options.getInteger('amount', true);
        const newBalance = await removeBalance(guildId, user.id, amount, botId());
        await interaction.reply({
          content: `Removed **${formatNumber(amount)}** funkybucks from <@${user.id}>. New balance: **${formatNumber(newBalance)}**.`,
        });
        return;
      }

      await replyError(interaction, 'Unknown bank subcommand.');
      return;
    }

    console.error(`unknown command: ${interaction.commandName}`);
  } catch (err) {
    console.error(`Interaction error (${interaction.commandName}):`, err);
    const detail = err?.message ? ` ${err.message}` : '';
    await replyError(interaction, `Something went wrong handling that command.${detail}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
