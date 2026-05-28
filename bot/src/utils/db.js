// Lightweight json-object database

export const launchJsonDb = async (DB_FILE) => {
    const file = Bun.file(DB_FILE);
    const data = await retrieve(file);
    const tmp = `${DB_FILE}.tmp`;
    const hooks = [];

    const save = async () => {
        for (const hook of hooks) await hook(data).catch(console.error);
        await Bun.write(tmp, JSON.stringify(data));
        await Bun.write(DB_FILE, Bun.file(tmp));
    }

    return {
        save, data,
        addSaveHook: h => hooks.push(h),
    }
}

async function retrieve(file) {
    if (!await file.exists()) return {};
    return await file.json();
}
