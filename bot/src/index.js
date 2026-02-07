import TelegramBot from 'node-telegram-bot-api'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { generate } from './utils/qr-code.js'
import crypto from 'node:crypto'

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const DB_FILE = './data/clients.json';
const PORT = 3000;

const SNI = process.env.CUSTOM_SNI

const SERVER_CONFIG = {
    host: process.env.SERVER_HOST,
    port: 443,
    ...(SNI && { sni: SNI }),
    insecure: 1
};

const DOCKER_ADDR = "172.17.0.1"
const HYSTERIA_API = "http://" + DOCKER_ADDR + ":9999"

let users = {};

if (existsSync(DB_FILE)) {
    try {
        users = JSON.parse(readFileSync(DB_FILE, 'utf8'));
    } catch (e) {}
}

const saveUsers = () => {
    writeFileSync(DB_FILE, JSON.stringify(users, null, 2));

    Cache.passwordToName = {}
    Object.entries(users).map(entry => { Cache.passwordToName[ entry[1] ] = entry[0] })

    console.log('PasswordToName size =', Object.values(Cache.passwordToName).length)
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot.on('message', async msg => {
    if (msg.from.id !== ADMIN_ID) return;

    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (text.startsWith('/add')) {
        const [ _, username ] = text.split(' ');
        if (!username) return bot.sendMessage(chatId, 'Usage: /add <user>');

        const password = generateRandomString(16)

        users[username] = password;

        saveUsers();
        bot.sendMessage(chatId, `User ${username} added.`);

        generateAndSendQRCode(chatId, username)
    }
    else if (text.startsWith('/del')) {
        const parts = text.split(' ');
        if (parts.length < 2) return bot.sendMessage(chatId, 'Usage: /del <user>');

        if (users[parts[1]]) {
            delete users[parts[1]];

            saveUsers();
            bot.sendMessage(chatId, `User ${parts[1]} deleted`);

            await hysteriaCall("/kick", [ parts[1] ])
        } else {
            bot.sendMessage(chatId, 'User not found');
        }
    }

    else if (text === '/list') {
        const list = Object.entries(users).map(([u, p]) => `${u}: ${p.slice(0,2)}...${p.slice(p.length - 2)}`).join('\n');
        bot.sendMessage(chatId, list || 'No users');
    }

    else if (text.startsWith('/qr')) {
        const parts = text.split(' ');
        const username = parts[1];
        generateAndSendQRCode(chatId, username)
    }

    else if (text.startsWith('/clients')) {
        const req = await hysteriaCall("/online")
        const data = await req.json()
        bot.sendMessage(chatId, JSON.stringify(data || {}, null, 1).slice(0,1000))
    }
});

function hysteriaCall(route, body = null) {
    return fetch(HYSTERIA_API + route, {
        headers: {
            "Authorization": process.env.TRAFFIC_STATS_SECRET,
        },
        ...(body && JSON.stringify(body))
    })
}

function generateRandomString(length) {
    let charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%^";

    let result = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
        const randomIndex = randomBytes[i] % charset.length;
        result += charset.charAt(randomIndex);
    }

    return result;
}

const generateAndSendQRCode = async (chatId, username) => {
    if (!username) return bot.sendMessage(chatId, 'Usage: /qr <user>');

    const password = users[username];

    if (!password) {
        return bot.sendMessage(chatId, 'User not found.');
    }

    try {
        await bot.sendMessage(chatId, `Генерирую QR для ${username}...`);

        const params = []
        if (SERVER_CONFIG.sni) params.push("sni=" + SERVER_CONFIG.sni)
        else if (SERVER_CONFIG.insecure) params.push("insecure=" + SERVER_CONFIG.insecure)

        const link = `hysteria2://${password}@${SERVER_CONFIG.host}:${SERVER_CONFIG.port}/?`
        + `${params.join('&')}#Config ${username}`

        const caption =
        `⚡️ <b>Личный конфиг</b>\nДля использования VPN, скачайте <a href="https://github.com/MatsuriDayo/nekoray/releases"><b>Nekoray для PC</b></a> или <a href="https://github.com/2dust/v2rayNG/releases"><b>v2rayNG для Android, iOs</b></a>`
        + `\n\n<b>1. Скачайте фото</b>\n2. Запустите приложение\n3. Нажмите плюсик и добавьте конфиг ("импорт из QR-кода").\nЭто достаточно сделать один раз!`
        +`\n\n<b>Если QR-код не работает, добавьте ссылкой:</b>\n<code>${link}</code>`;

        const qrResult = await generate(link, './logo.png', { scale: 10 });

        await bot.sendPhoto(chatId, qrResult.buf, {
            caption,
            parse_mode: 'HTML'
        }, {
            contentType: 'application/octet-stream',
            filename: 'qrcode.png',
        });

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Ошибка при генерации QR (проверь наличие logo.png).');
    }
}

const Cache = {
    //passwords: [],
    passwordToName: {}
}

Object.entries(users).map(entry => { Cache.passwordToName[ entry[1] ] = entry[0] })

Bun.serve({
    port: PORT,
    async fetch(req) {
        if (req.method === 'POST') {
            try {
                const body = await req.json();
                const username = Cache.passwordToName[body.auth]

                console.log('Connection', body.addr, ', valid client =', username)

                if (username) return new Response(JSON.stringify({
                    ok: true,
                    id: username
                }), { status: 200 });
                return new Response('Unauthorized', { status: 401 });
            } catch (e) {
                return new Response('Error', { status: 400 });
            }
        }
        return new Response('Not Found', { status: 404 });
    }
});

process.on('uncaughtException', (err, origin) => {
    console.error(`Caught exception: ${err}\nException origin: ${origin}`);
});

process.on('unhandledRejection', (err, origin) => {
    console.error(`Caught exception: ${err}\nException origin: ${origin}`);
});

console.log(`Server running on port ${PORT}`);
