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

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing required environment variable: DISCORD_TOKEN');
  console.error('Set it in Orihost startup variables or create a .env file in /home/container/.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
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
    .setDescription('A quick guide to your server economy commands.')
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
    )
    .setFooter({
      text: 'Only authorized mods may add/remove funds. Transfers from others require moderation.',
    });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
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
