import 'dotenv/config';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

const commandBuilders = [
  new SlashCommandBuilder()
    .setName('hi')
    .setDescription('Say Hi :D')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show Funkybucks command help')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall),
  new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Manage funkybucks accounts')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addSubcommand((sub) =>
      sub
        .setName('balance')
        .setDescription('Show a user account balance')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to view').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add funkybucks to a user account')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to credit').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('amount').setDescription('Number of funkybucks to add').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Show top funkybucks in the server')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('How many top users to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('transfer')
        .setDescription('Transfer funkybucks to another user')
        .addUserOption((option) =>
          option.setName('to').setDescription('Recipient of the transfer').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('amount').setDescription('Amount of funkybucks to transfer').setRequired(true).setMinValue(1),
        )
        .addUserOption((option) =>
          option.setName('from').setDescription('Source user for transfer (mods only)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove funkybucks from a user account')
        .addUserOption((option) =>
          option.setName('user').setDescription('User to debit').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('amount').setDescription('Number of funkybucks to remove').setRequired(true).setMinValue(1),
        ),
    ),
  new SlashCommandBuilder()
    .setName('garden')
    .setDescription('Manage your garden and pull weeds for funkybucks')
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Mods only: create the Gardens category and channels for all members'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('sync')
        .setDescription('Mods only: create missing gardens and fix permissions'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('timezone')
        .setDescription('Set your garden timezone (eu, au, or IANA name)')
        .addStringOption((option) =>
          option
            .setName('zone')
            .setDescription('eu, au, Europe/Amsterdam, Australia/Sydney, etc.')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Show your garden weed progress and streak'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Show top garden streaks and perfect days this month')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('How many gardeners to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Mods only: configure garden spawn, payout, and weed counts')
        .addIntegerOption((option) =>
          option.setName('spawn_hour').setDescription('Local hour weeds spawn (0-23)').setMinValue(0).setMaxValue(23),
        )
        .addIntegerOption((option) =>
          option.setName('settle_hour').setDescription('Local hour daily settlement (0-23)').setMinValue(0).setMaxValue(23),
        )
        .addIntegerOption((option) =>
          option.setName('min_weeds').setDescription('Minimum weed messages per day').setMinValue(1).setMaxValue(50),
        )
        .addIntegerOption((option) =>
          option.setName('max_weeds').setDescription('Maximum weed messages per day').setMinValue(1).setMaxValue(50),
        )
        .addIntegerOption((option) =>
          option.setName('base_payout').setDescription('Funkybucks for clearing all weeds').setMinValue(1).setMaxValue(10000),
        )
        .addStringOption((option) =>
          option.setName('default_timezone').setDescription('Default TZ for new gardens (eu, au, or IANA)'),
        ),
    ),
];

const commandData = commandBuilders.map((command) => command.toJSON());

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const appId = process.env.APP_ID;
  if (!token || !appId) {
    throw new Error('DISCORD_TOKEN and APP_ID are required to register commands.');
  }

  const rest = new REST().setToken(token);

  if (process.env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(appId, process.env.GUILD_ID), { body: commandData });
    await rest.put(Routes.applicationCommands(appId), { body: [] });
    console.log(`Registered ${commandData.length} guild commands for guild ${process.env.GUILD_ID}.`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commandData });
    console.log(`Registered ${commandData.length} global commands.`);
  }
}

registerCommands().catch((err) => {
  console.error('Command registration failed:', err);
  process.exit(1);
});
