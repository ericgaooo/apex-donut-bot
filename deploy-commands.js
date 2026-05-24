require("dotenv").config();
const { ChannelType, REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("adddonut")
    .setDescription("Add donuts to a user")
    .addUserOption(option =>
      option.setName("user").setDescription("User to update").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("Amount to add").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setdonut")
    .setDescription("Set a user's donut count")
    .addUserOption(option =>
      option.setName("user").setDescription("User to update").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("New donut total").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removedonutuser")
    .setDescription("Remove a user from donut tracking")
    .addUserOption(option =>
      option.setName("user").setDescription("User to remove").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("donutcleanup")
    .setDescription("Preview or run donut leaderboard cleanup")
    .addStringOption(option =>
      option
        .setName("target")
        .setDescription("What to clean up")
        .setRequired(true)
        .addChoices(
          { name: "Zero-count users", value: "zero" },
          { name: "Users no longer in this server", value: "missing" }
        )
    )
    .addBooleanOption(option =>
      option
        .setName("run")
        .setDescription("Actually remove the matched users instead of previewing")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("donutcount")
    .setDescription("Show a user's donut count")
    .addUserOption(option =>
      option.setName("user").setDescription("User to check").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("donutleaderboard")
    .setDescription("Show the donut leaderboard"),

  new SlashCommandBuilder()
    .setName("donutleaderboardanimated")
    .setDescription("Show the animated donut leaderboard with falling sprinkles"),

  new SlashCommandBuilder()
    .setName("donutranks")
    .setDescription("Show the full donut ranking system"),

  new SlashCommandBuilder()
    .setName("donutflex")
    .setDescription("Show off a user's donut status with maximum pastry drama")
    .addUserOption(option =>
      option.setName("user").setDescription("User to flex").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("donutprofile")
    .setDescription("Show a user's donut profile card with a history graph")
    .addUserOption(option =>
      option.setName("user").setDescription("User to profile").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("donuthistoryscan")
    .setDescription("Scan a channel for a user's old donut totals and build profile history")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to scan")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName("user").setDescription("User to build history for").setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("limit")
        .setDescription("Messages to scan, newest first. Default 1000, max 3000")
        .setMinValue(100)
        .setMaxValue(3000)
        .setRequired(false)
    ),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Deploying global slash commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Global slash commands deployed.");
  } catch (error) {
    console.error(error);
  }
})();
