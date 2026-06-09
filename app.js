import 'dotenv/config';
import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
} from 'discord.js';
import { getRandomEmoji, formatNumber } from './utils.js';
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

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle('Funkybucks Help')
    .setDescription('A quick guide to your server economy and garden commands.')
    .setColor(0x00d4ff)
    .addFields(
      {
        name: '/bank balance [user]',
        value: 'Show a user account balance, or your own if no user is provided.',
      },
      {
        name: '/bank transfer to <user> amount <number>',
        value: 'Send funkybucks to another user.',
      },
      {
        name: '/bank transfer from <user> to <user> amount <number>',
        value: 'Moderators can move money between accounts.',
      },
      {
        name: '/bank leaderboard [limit]',
        value: 'Show the top funkybucks leaderboard in the server. Or all accounts if no limit is provided.',
      },
      {
        name: '/bank add <user> amount <number>',
        value: 'Mods only: credit funkybucks to a user.',
      },
      {
        name: '/bank remove <user> amount <number>',
        value: 'Mods only: debit funkybucks from a user.',
      },
      {
        name: '/garden setup',
        value: 'Mods only: create the Gardens category and a private channel for every member.',
      },
      {
        name: '/garden sync',
        value: 'Mods only: create missing gardens and fix permissions.',
      },
      {
        name: '/garden timezone <eu|au|IANA>',
        value: 'Set your local timezone for weed spawn (morning) and settlement (evening).',
      },
      {
        name: '/garden status',
        value: 'Weeds pulled today, streak, and payout info for your garden.',
      },
      {
        name: '/garden leaderboard [limit]',
        value: 'Top garden streaks and perfect days this month.',
      },
      {
        name: '/garden config',
        value: 'Mods only: tune spawn hour, settle hour, weed counts, and payout.',
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

        await interaction.deferReply({ ephemeral: true });
        const result = await setupGardens(interaction.guild);
        const errorText = result.errors.length > 0
          ? `\nErrors (${result.errors.length}):\n${result.errors.slice(0, 5).join('\n')}`
          : '';
        await interaction.editReply({
          content: setupCompleteMessage(result, errorText),
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

        await interaction.deferReply({ ephemeral: true });
        const result = await syncGardens(interaction.guild);
        const errorText = result.errors.length > 0
          ? `\nErrors (${result.errors.length}):\n${result.errors.slice(0, 5).join('\n')}`
          : '';
        await interaction.editReply({
          content: syncCompleteMessage(result, errorText),
        });
        return;
      }

      if (subcommand === 'timezone') {
        const zoneInput = interaction.options.getString('zone', true);
        try {
          const tz = await setUserTimezone(guildId, interaction.user.id, zoneInput);
          await interaction.reply({
            content: timezoneSetMessage(tz),
            ephemeral: true,
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
          content: formatStatusMessage(status),
          ephemeral: true,
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
          ephemeral: true,
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
    console.error('Interaction error:', err);
    const payload = { content: 'Something went wrong handling that command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
