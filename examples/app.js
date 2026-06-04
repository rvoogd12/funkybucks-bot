import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji } from '../utils.js';

// Minimal example that only responds to the `hi` command.
const app = express();
const PORT = process.env.PORT || 3000;

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) return res.send({ type: InteractionResponseType.PONG });

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    if (name === 'hi') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          content: `Hi! Time to make some funkybucks... ${getRandomEmoji()} \n-# Or spend some...`,
        },
      });
    }
    return res.status(400).json({ error: 'unknown command' });
  }

  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => console.log('Listening on port', PORT));
