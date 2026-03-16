async def save_transcript(channel):

    messages = []
    async for msg in channel.history(limit=None):
        messages.append(f"{msg.author}: {msg.content}")

    text = "\n".join(messages)

    with open(f"{channel.name}.txt","w",encoding="utf8") as f:
        f.write(text)

    return f"{channel.name}.txt"
