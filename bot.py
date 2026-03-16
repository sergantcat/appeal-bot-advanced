import discord
from discord.ext import commands
import config
import database
import transcript
import time

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!",intents=intents)

cooldowns = {}

class AppealModal(discord.ui.Modal,title="Appeal Form"):

    reason = discord.ui.TextInput(label="Why were you banned?")
    explanation = discord.ui.TextInput(label="Why should we unban you?",style=discord.TextStyle.paragraph)

    def __init__(self,type_):
        super().__init__()
        self.type = type_

    async def on_submit(self,interaction):

        user = interaction.user.id

        if user in cooldowns and time.time() - cooldowns[user] < config.COOLDOWN_SECONDS:
            await interaction.response.send_message("You must wait before making another appeal.",ephemeral=True)
            return

        cooldowns[user] = time.time()

        case_id = await database.create_case(user,self.type)

        thread = await interaction.channel.create_thread(
            name=f"case-{case_id}-{self.type}",
            type=discord.ChannelType.private_thread
        )

        await thread.add_user(interaction.user)

        embed = discord.Embed(
            title=f"Case #{case_id}",
            description=f"Type: {self.type}\nUser: {interaction.user}",
            color=discord.Color.orange()
        )

        embed.add_field(name="Ban Reason",value=self.reason)
        embed.add_field(name="Appeal",value=self.explanation)

        await thread.send(embed=embed,view=StaffButtons(case_id))

        log = discord.utils.get(interaction.guild.channels,name=config.LOG_CHANNEL)

        if log:
            await log.send(f"📂 Case #{case_id} opened ({self.type})")

        await interaction.response.send_message("Your appeal has been submitted.",ephemeral=True)

class AppealButtons(discord.ui.View):

    @discord.ui.button(label="Game Appeal")
    async def game(self,interaction,button):
        await interaction.response.send_modal(AppealModal("game"))

    @discord.ui.button(label="Discord Appeal")
    async def discord(self,interaction,button):
        await interaction.response.send_modal(AppealModal("discord"))

    @discord.ui.button(label="Security Appeal")
    async def security(self,interaction,button):
        await interaction.response.send_modal(AppealModal("security"))

    @discord.ui.button(label="Raiders Appeal")
    async def raiders(self,interaction,button):
        await interaction.response.send_modal(AppealModal("raiders"))

class StaffButtons(discord.ui.View):

    def __init__(self,case_id):
        super().__init__(timeout=None)
        self.case_id = case_id

    @discord.ui.button(label="Claim",style=discord.ButtonStyle.secondary)
    async def claim(self,interaction,button):
        await interaction.response.send_message(f"{interaction.user} claimed case #{self.case_id}")

    @discord.ui.button(label="Accept",style=discord.ButtonStyle.success)
    async def accept(self,interaction,button):
        await interaction.response.send_message("Appeal accepted")

    @discord.ui.button(label="Deny",style=discord.ButtonStyle.danger)
    async def deny(self,interaction,button):
        await interaction.response.send_message("Appeal denied")

    @discord.ui.button(label="Close",style=discord.ButtonStyle.red)
    async def close(self,interaction,button):

        file = await transcript.save_transcript(interaction.channel)

        await database.close_case(self.case_id)

        log = discord.utils.get(interaction.guild.channels,name=config.LOG_CHANNEL)

        if log:
            await log.send(f"🔒 Case #{self.case_id} closed")

        await interaction.channel.delete()

@bot.command()
async def setup(ctx):

    embed = discord.Embed(
        title="Appeal Center",
        description="Press a button to submit an appeal."
    )

    await ctx.send(embed=embed,view=AppealButtons())

@bot.event
async def on_ready():
    await database.init()
    print("Appeal bot online")

bot.run(config.TOKEN)
