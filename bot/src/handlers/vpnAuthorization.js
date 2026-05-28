// Hysteria auth (password checks)

export const createServer = (hysteriaClients, PORT = 3000) => {
    let cache = getPasswordMapping(hysteriaClients.data);

    hysteriaClients.addSaveHook(users => {
        cache = getPasswordMapping(users)
    });

    const fetch = async req => {
        const body = await req.json().catch(() => null);

        const username = cache.get(body?.auth);

        console.log('Connection', body?.addr, ', valid client =', username); // TODO better logging

        if (!username) return respond("Unauthorized"); // TODO ban IP

        return respond({ ok: true, id: username }, 200);
    }

    const server = Bun.serve({ port: PORT, fetch });

    console.log(`Authorization server running on port ${PORT}`);

    return server;
}

const getPasswordMapping = users => new Map(
    Object.entries(users).map(([u, p]) => [p, u])
);

const respond = (object, status = 401) =>
    new Response(JSON.stringify(object), { status });
