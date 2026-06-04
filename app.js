import 'dotenv/config';
import express from 'express';
import { randomBytes } from 'crypto';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, formatNumber } from './utils.js';
import { addBalance, getBalance, removeBalance, getTopBalances, transferBalance } from './bank.js';
import { generateLeaderboardImage } from './leaderboard.js';

// Create an express app
const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

function hasModeratorPermission(member) {
  if (!member?.permissions) return false;
  const permissions = typeof member.permissions === 'string' ? BigInt(member.permissions) : BigInt(member.permissions || 0);
  const ADMINISTRATOR = 1n << 3n;
  const MANAGE_GUILD = 1n << 5n;
  return Boolean(permissions & (ADMINISTRATOR | MANAGE_GUILD));
}

function createResponse(content, ephemeral = false) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : undefined,
      content,
    },
  };
}

function sendImageResponse(res, imageBuffer, fileName) {
  const boundary = randomBytes(16).toString('hex');
  const payload = JSON.stringify({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Funkybucks Leaderboard',
      files: [
        {
          id: 0,
          filename: fileName,
        },
      ],
    },
  });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n`),
    Buffer.from(payload),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file0"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  res.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`);
  res.setHeader('Content-Length', body.length);
  res.send(body);
}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data, guild_id: guildId, member } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options = [] } = data;

    if (name === 'hi') {
      return res.send(createResponse(`Hi! Time to make some funkybucks... ${getRandomEmoji()} \n-# Or spend some...`));
    }

    if (name === 'help') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          embeds: [
            {
              title: 'Funkybucks Help',
              description: 'A quick guide to your server economy commands.',
              color: 0x00d4ff,
              fields: [
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
              ],
              footer: {
                text: 'Only authorized mods may add/remove funds. Transfers from others require moderation.',
              },
            },
          ],
        },
      });
    }

    if (name === 'bank') {
      const subcommand = options[0];
      const subOptions = subcommand?.options || [];
      const userOption = subOptions.find((option) => option.name === 'user');
      const amountOption = subOptions.find((option) => option.name === 'amount');
      const targetUserId = userOption?.value || member?.user?.id;

      if (!guildId) {
        return res.send(createResponse('Bank accounts are only available inside a server.', true));
      }

      if (subcommand?.name === 'balance') {
        if (!targetUserId) {
          return res.send(createResponse('Could not determine the target user.', true));
        }

        const balance = await getBalance(guildId, targetUserId);
        const mention = `<@${targetUserId}>`;
        return res.send(createResponse(`${mention} has **${formatNumber(balance)}** funkybucks.`));
      }

      if (subcommand?.name === 'add') {
        if (!hasModeratorPermission(member)) {
          return res.send(createResponse('You must be a moderator to add funkybucks.', true));
        }

        if (!targetUserId || !amountOption?.value) {
          return res.send(createResponse('Please provide a user and amount.', true));
        }

        const amount = Number(amountOption.value);
        if (!Number.isInteger(amount) || amount <= 0) {
          return res.send(createResponse('Please provide a valid positive amount.', true));
        }

        const newBalance = await addBalance(guildId, targetUserId, amount);
        return res.send(createResponse(`Added **${formatNumber(amount)}** funkybucks to <@${targetUserId}>. New balance: **${formatNumber(newBalance)}**.`));
      }

      if (subcommand?.name === 'leaderboard') {
        const limitOption = subOptions.find((o) => o.name === 'limit');
        const limit = Number(limitOption?.value) || 10;
        const top = await getTopBalances(guildId, limit);
        if (!top || top.length === 0) {
          return res.send(createResponse('No accounts yet in this server.'));
        }
        try {
          const imageBuffer = await generateLeaderboardImage(top, guildId, process.env.DISCORD_TOKEN);
          return sendImageResponse(res, imageBuffer, 'leaderboard.png');
        } catch (err) {
          console.error('Error generating leaderboard image:', err);
          const lines = top.map((entry, idx) => `${idx + 1}. <@${entry.userId}> — **${formatNumber(entry.balance)}**`);
          return res.send(createResponse(`Top ${formatNumber(top.length)} funkybucks:\n${lines.join('\n')}`));
        }
      }

      if (subcommand?.name === 'transfer') {
        const toOption = subOptions.find((o) => o.name === 'to');
        const fromOption = subOptions.find((o) => o.name === 'from');
        const amountOption = subOptions.find((o) => o.name === 'amount');
        const recipientId = toOption?.value;
        const senderId = fromOption?.value || member?.user?.id;

        if (!recipientId || !amountOption?.value) {
          return res.send(createResponse('Please provide a recipient and amount.', true));
        }

        if (senderId !== member?.user?.id && !hasModeratorPermission(member)) {
          return res.send(createResponse('You must be a moderator to transfer from another user.', true));
        }

        if (recipientId === senderId) {
          return res.send(createResponse('You cannot transfer funkybucks to the same account.', true));
        }

        const amount = Number(amountOption.value);
        if (!Number.isInteger(amount) || amount <= 0) {
          return res.send(createResponse('Please provide a valid positive amount.', true));
        }

        try {
          const { fromBalance, toBalance } = await transferBalance(guildId, senderId, recipientId, amount);
          return res.send(createResponse(`Transferred **${formatNumber(amount)}** funkybucks from <@${senderId}> to <@${recipientId}>.\n<@${senderId}> now has **${formatNumber(fromBalance)}**.\n<@${recipientId}> now has **${formatNumber(toBalance)}**.`));
        } catch (err) {
          if (err.message === 'insufficient_funds') {
            return res.send(createResponse('The source account does not have enough funkybucks.', true));
          }
          console.error('Transfer error:', err);
          return res.send(createResponse('Could not complete the transfer.', true));
        }
      }

      if (subcommand?.name === 'remove') {
        if (!hasModeratorPermission(member)) {
          return res.send(createResponse('You must be a moderator to remove funkybucks.', true));
        }

        if (!targetUserId || !amountOption?.value) {
          return res.send(createResponse('Please provide a user and amount.', true));
        }

        const amount = Number(amountOption.value);
        if (!Number.isInteger(amount) || amount <= 0) {
          return res.send(createResponse('Please provide a valid positive amount.', true));
        }

        const newBalance = await removeBalance(guildId, targetUserId, amount);
        return res.send(createResponse(`Removed **${formatNumber(amount)}** funkybucks from <@${targetUserId}>. New balance: **${formatNumber(newBalance)}**.`));
      }

      return res.send(createResponse('Unknown bank subcommand.', true));
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
