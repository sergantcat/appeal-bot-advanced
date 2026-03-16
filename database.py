import aiosqlite

DB = "cases.db"

async def init():
    async with aiosqlite.connect(DB) as db:
        await db.execute("""
        CREATE TABLE IF NOT EXISTS cases(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user INTEGER,
            type TEXT,
            status TEXT
        )
        """)
        await db.commit()

async def create_case(user,type_):
    async with aiosqlite.connect(DB) as db:
        cur = await db.execute(
            "INSERT INTO cases(user,type,status) VALUES(?,?,?)",
            (user,type_,"open")
        )
        await db.commit()
        return cur.lastrowid

async def close_case(case_id):
    async with aiosqlite.connect(DB) as db:
        await db.execute(
            "UPDATE cases SET status='closed' WHERE id=?",
            (case_id,)
        )
        await db.commit()
