require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

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