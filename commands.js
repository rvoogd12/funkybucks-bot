import 'dotenv/config';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';

const HI_COMMAND = {
  name: 'hi',
  description: 'Say Hi :D',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const HELP_COMMAND = {
  name: 'help',
  description: 'Show Funkybucks command help',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const BANK_COMMAND = {
  name: 'bank',
  description: 'Manage funkybucks accounts',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      type: 1,
      name: 'balance',
      description: 'Show a user account balance',
      options: [
        {
          type: 6,
          name: 'user',
          description: 'User to view',
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: 'add',
      description: 'Add funkybucks to a user account',
      options: [
        {
          type: 6,
          name: 'user',
          description: 'User to credit',
          required: true,
        },
        {
          type: 4,
          name: 'amount',
          description: 'Number of funkybucks to add',
          required: true,
          min_value: 1,
        },
      ],
    },
    {
      type: 1,
      name: 'leaderboard',
      description: 'Show top funkybucks in the server',
      options: [
        {
          type: 4,
          name: 'limit',
          description: 'How many top users to show',
          required: false,
          min_value: 1,
          max_value: 25,
        },
      ],
    },
    {
      type: 1,
      name: 'transfer',
      description: 'Transfer funkybucks to another user',
      options: [
        {
          type: 6,
          name: 'to',
          description: 'Recipient of the transfer',
          required: true,
        },
        {
          type: 4,
          name: 'amount',
          description: 'Amount of funkybucks to transfer',
          required: true,
          min_value: 1,
        },
        {
          type: 6,
          name: 'from',
          description: 'Source user for transfer (mods only)',
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: 'remove',
      description: 'Remove funkybucks from a user account',
      options: [
        {
          type: 6,
          name: 'user',
          description: 'User to debit',
          required: true,
        },
        {
          type: 4,
          name: 'amount',
          description: 'Number of funkybucks to remove',
          required: true,
          min_value: 1,
        },
      ],
    },
  ],
};

const ALL_COMMANDS = [HI_COMMAND, HELP_COMMAND, BANK_COMMAND];

if (process.env.GUILD_ID) {
  // Dev guild: register guild commands only, clear global commands
  InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, ALL_COMMANDS);
  InstallGlobalCommands(process.env.APP_ID, []);
} else {
  // Production: register global commands only
  InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
}
