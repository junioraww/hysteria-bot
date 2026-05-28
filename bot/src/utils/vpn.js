const SNI = process.env.CUSTOM_SNI;

const SERVER_CONFIG = {
    host: process.env.SERVER_HOST,
    port: 443,
    ...(SNI && { sni: SNI }),
    insecure: 1
};

export const getHysteriaLink = (username, password) => {
    const params = [];

    if (SERVER_CONFIG.sni) params.push("sni=" + SERVER_CONFIG.sni);
    else if (SERVER_CONFIG.insecure) params.push("insecure=" + SERVER_CONFIG.insecure);

    return `hysteria2://${password}@${SERVER_CONFIG.host}:${SERVER_CONFIG.port}/?`
    + `${params.join('&')}#Config ${username}`;
}
