import 'dotenv/config';
import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
} from 'discord.js';
import { getRandomEmoji, formatNumber, truncateDiscordContent } from './utils.js';
import { addBalance, getBalance, removeBalance, getTopBalances, transferBalance } from './bank.js';
import { generateLeaderboardImage } from './leaderboard.js';
import {
  setupGardens,
  syncGardens,
  setUserTimezone,
  getGardenStatus,
  updateGuildConfig,
  getGardenLeaderboard,
  markWeedPulled,
  handleMemberJoin,
  handleMemberLeave,
  updateGardenChannelForMember,
  processAllGardenTicks,
  resolveTimezone,
} from './gardens.js';
import { startGardenScheduler } from './gardenScheduler.js';
import {
  timezoneSetMessage,
  timezoneInvalidMessage,
  noGardenMessage,
  lockedGardenMessage,
  formatStatusMessage,
  setupCompleteMessage,
  syncCompleteMessage,
  leaderboardEmptyMessage,
  leaderboardHeader,
  leaderboardEntryLine,
  configUpdatedMessage,
  helpFooterMessage,
} from './gardenFlavor.js';

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

function hasModeratorPermission(interaction) {
  const permissions = interaction.memberPermissions;
  if (!permissions) return false;
  return (
    permissions.has(PermissionFlagsBits.Administrator)
    || permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function cmdLine(command, description) {
  return `- \`${command}\` — ${description}`;
}

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle('Funkybucks Help')
    .setDescription('Server economy + daily garden minigame. Pull weeds in your private channel before evening settlement to earn funkybucks.')
    .setColor(0x00d4ff)
    .addFields(
      {
        name: 'Bank Commands',
        value: [
          cmdLine('/bank balance [user]', 'Show a balance — yours or someone else\'s.'),
          cmdLine('/bank transfer to:<user> amount:<n>', 'Send funkybucks to another user.'),
          cmdLine('/bank transfer from:<user> to:<user> amount:<n>', 'Mods: move money between accounts.'),
          cmdLine('/bank leaderboard [limit]', 'Top funkybucks holders (default 10).'),
          cmdLine('/bank add user:<user> amount:<n>', 'Mods: credit funkybucks.'),
          cmdLine('/bank remove user:<user> amount:<n>', 'Mods: debit funkybucks.'),
        ].join('\n'),
      },
      {
        name: 'Garden Commands',
        value: [
          cmdLine('/garden setup', 'Mods: create Gardens category + channel per member.'),
          cmdLine('/garden sync', 'Mods: create missing gardens and fix permissions.'),
          cmdLine('/garden timezone zone:<eu|au|IANA>', 'Set your local spawn/settle timezone.'),
          cmdLine('/garden status', 'Weeds pulled today, streak, and payout info.'),
          cmdLine('/garden leaderboard [limit]', 'Top streaks and perfect days this month.'),
          cmdLine('/garden config', 'Mods: tune spawn hour, settle hour, weeds, and payout.'),
        ].join('\n'),
      },
      {
        name: 'General',
        value: [
          cmdLine('/hi', 'Say hi.'),
          cmdLine('/help', 'Show this help menu.'),
        ].join('\n'),
      },
    )
    .setFooter({
      text: helpFooterMessage(),
    });
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
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'hi') {
      await interaction.reply({
        content: `Hi! Time to make some funkybucks... ${getRandomEmoji()} \n-# Or spend some... >:3`,
      });
      return;
    }

    if (interaction.commandName === 'help') {
      await interaction.reply({ embeds: [helpEmbed()] });
      return;
    }

    if (interaction.commandName === 'garden') {
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.reply({
          content: 'Gardens are only available inside a server.',
          ephemeral: true,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'setup') {
        if (!hasModeratorPermission(interaction)) {
          await interaction.reply({
            content: 'You must be a moderator to set up gardens.',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ content: 'Setting up gardens…' });
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
          await interaction.reply({
            content: 'You must be a moderator to sync gardens.',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ content: 'Syncing gardens…' });
        const result = await syncGardens(interaction.guild);
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
            await interaction.reply({
              content: timezoneInvalidMessage(),
              ephemeral: true,
            });
            return;
          }
          throw err;
        }
        return;
      }

      if (subcommand === 'status') {
        const status = await getGardenStatus(guildId, interaction.user.id);
        if (!status?.hasGarden) {
          await interaction.reply({
            content: noGardenMessage(),
            ephemeral: true,
          });
          return;
        }

        if (status.locked) {
          await interaction.reply({
            content: lockedGardenMessage(),
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: formatStatusMessage(status, interaction.user.id),
        });
        return;
      }

      if (subcommand === 'leaderboard') {
        const limit = interaction.options.getInteger('limit') ?? 10;
        const top = await getGardenLeaderboard(guildId, limit);
        if (top.length === 0) {
          await interaction.reply({ content: leaderboardEmptyMessage() });
          return;
        }

        const lines = top.map((entry, idx) => leaderboardEntryLine(idx, entry));

        await interaction.reply({
          content: `${leaderboardHeader()}\n${lines.join('\n')}`,
        });
        return;
      }

      if (subcommand === 'config') {
        if (!hasModeratorPermission(interaction)) {
          await interaction.reply({
            content: 'You must be a moderator to configure gardens.',
            ephemeral: true,
          });
          return;
        }

        const defaultTzInput = interaction.options.getString('default_timezone');
        let defaultTimezone;
        if (defaultTzInput) {
          defaultTimezone = resolveTimezone(defaultTzInput);
          if (!defaultTimezone) {
            await interaction.reply({
              content: timezoneInvalidMessage(),
              ephemeral: true,
            });
            return;
          }
        }

        const config = await updateGuildConfig(guildId, {
          spawnHour: interaction.options.getInteger('spawn_hour'),
          settleHour: interaction.options.getInteger('settle_hour'),
          minWeeds: interaction.options.getInteger('min_weeds'),
          maxWeeds: interaction.options.getInteger('max_weeds'),
          basePayout: interaction.options.getInteger('base_payout'),
          defaultTimezone,
        });

        await interaction.reply({
          content: configUpdatedMessage(config),
        });
        return;
      }

      await interaction.reply({ content: 'Unknown garden subcommand.', ephemeral: true });
      return;
    }

    if (interaction.commandName === 'bank') {
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.reply({
          content: 'Bank accounts are only available inside a server.',
          ephemeral: true,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'balance') {
        const user = interaction.options.getUser('user') ?? interaction.user;
        const balance = await getBalance(guildId, user.id);
        await interaction.reply({
          content: `<@${user.id}> has **${formatNumber(balance)}** funkybucks.`,
        });
        return;
      }

      if (subcommand === 'add') {
        if (!hasModeratorPermission(interaction)) {
          await interaction.reply({
            content: 'You must be a moderator to add funkybucks.',
            ephemeral: true,
          });
          return;
        }

        const user = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        const newBalance = await addBalance(guildId, user.id, amount);
        await interaction.reply({
          content: `Added **${formatNumber(amount)}** funkybucks to <@${user.id}>. New balance: **${formatNumber(newBalance)}**.`,
        });
        return;
      }

      if (subcommand === 'leaderboard') {
        const limit = interaction.options.getInteger('limit') ?? 10;
        const top = await getTopBalances(guildId, limit);
        if (!top || top.length === 0) {
          await interaction.reply({ content: 'No accounts yet in this server.' });
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
          const lines = top.map((entry, idx) => `${idx + 1}. <@${entry.userId}> — **${formatNumber(entry.balance)}**`);
          await interaction.editReply({
            content: `Top ${formatNumber(top.length)} funkybucks:\n${lines.join('\n')}`,
          });
        }
        return;
      }

      if (subcommand === 'transfer') {
        const recipient = interaction.options.getUser('to', true);
        const amount = interaction.options.getInteger('amount', true);
        const fromUser = interaction.options.getUser('from');
        const senderId = fromUser?.id ?? interaction.user.id;

        if (senderId !== interaction.user.id && !hasModeratorPermission(interaction)) {
          await interaction.reply({
            content: 'You must be a moderator to transfer from another user.',
            ephemeral: true,
          });
          return;
        }

        if (recipient.id === senderId) {
          await interaction.reply({
            content: 'You cannot transfer funkybucks to the same account.',
            ephemeral: true,
          });
          return;
        }

        try {
          const { fromBalance, toBalance } = await transferBalance(guildId, senderId, recipient.id, amount);
          await interaction.reply({
            content: `Transferred **${formatNumber(amount)}** funkybucks from <@${senderId}> to <@${recipient.id}>.\n<@${senderId}> now has **${formatNumber(fromBalance)}**.\n<@${recipient.id}> now has **${formatNumber(toBalance)}**.`,
          });
        } catch (err) {
          if (err.message === 'insufficient_funds') {
            await interaction.reply({
              content: 'The source account does not have enough funkybucks.',
              ephemeral: true,
            });
            return;
          }
          console.error('Transfer error:', err);
          await interaction.reply({
            content: 'Could not complete the transfer.',
            ephemeral: true,
          });
        }
        return;
      }

      if (subcommand === 'remove') {
        if (!hasModeratorPermission(interaction)) {
          await interaction.reply({
            content: 'You must be a moderator to remove funkybucks.',
            ephemeral: true,
          });
          return;
        }

        const user = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        const newBalance = await removeBalance(guildId, user.id, amount);
        await interaction.reply({
          content: `Removed **${formatNumber(amount)}** funkybucks from <@${user.id}>. New balance: **${formatNumber(newBalance)}**.`,
        });
        return;
      }

      await interaction.reply({ content: 'Unknown bank subcommand.', ephemeral: true });
      return;
    }

    console.error(`unknown command: ${interaction.commandName}`);
  } catch (err) {
    console.error(`Interaction error (${interaction.commandName}):`, err);
    const detail = err?.message ? `\n\`${err.message}\`` : '';
    const payload = {
      content: `Something went wrong handling that command.${detail}`,
      ephemeral: true,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
