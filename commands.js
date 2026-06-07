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
