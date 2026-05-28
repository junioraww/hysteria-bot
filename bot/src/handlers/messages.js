import { generateRandomString } from '../utils/random.js';
import { generateQrCode } from '../utils/qr-code.js';
import { getHysteriaLink } from '../utils/vpn.js';
import { hysteriaCall } from '../utils/api.js';

const ADMIN_ID = parseInt(process.env.ADMIN_ID);

export const handleMessages = (bot, hysteriaClients) => {
    const hysteria = hysteriaClients.data;

    async function generateAndSendQRCode (chatId, username) {
        if (!username) return bot.sendMessage(chatId, 'Usage: /qr <user>');

        const password = hysteria[username];

        if (!password) {
            return bot.sendMessage(chatId, 'User not found.');
        }

        try {
            await bot.sendMessage(chatId, `Генерирую QR для ${username}...`);

            const link = getHysteriaLink(username, password);

            const caption =
            `⚡️ <b>Личный конфиг</b>\nДля использования VPN, скачайте <a href="https://github.com/MatsuriDayo/nekoray/releases"><b>Nekoray для PC</b></a> или <a href="https://github.com/2dust/v2rayNG/releases"><b>v2rayNG для Android, iOs</b></a>`
            + `\n\n<b>1. Скачайте фото</b>\n2. Запустите приложение\n3. Нажмите плюсик и добавьте конфиг ("импорт из QR-кода").\nЭто достаточно сделать один раз!`
            +`\n\n<b>Если QR-код не работает, добавьте ссылкой:</b>\n<code>${link}</code>`;

            const qrResult = await generateQrCode(link, './logo.png', { scale: 10 });

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

    bot.on('message', async msg => {
        if (msg.from.id !== ADMIN_ID) return;

        const chatId = msg.chat.id;
        const text = msg.text || '';

        if (text.startsWith('/add')) {
            const [ _, username ] = text.split(' ');
            if (!username) return bot.sendMessage(chatId, 'Usage: /add <user>');

            const password = generateRandomString(16)

            users[username] = password;

            hysteriaClients.save();
            bot.sendMessage(chatId, `User ${username} added.`);

            generateAndSendQRCode(chatId, username)
        }
        else if (text.startsWith('/del')) {
            const parts = text.split(' ');
            if (parts.length < 2) return bot.sendMessage(chatId, 'Usage: /del <user>');

            if (hysteria[parts[1]]) {
                delete hysteria[parts[1]];

                hysteriaClients.save();
                bot.sendMessage(chatId, `User ${parts[1]} deleted`);

                await hysteriaCall("/kick", [ parts[1] ])
            } else {
                bot.sendMessage(chatId, 'User not found');
            }
        }

        else if (text === '/list') {
            const list = Object.entries(hysteria)
                .map(([u, p]) => `${u}: ${p.slice(0,2)}...${p.slice(p.length - 2)}`)
                .join('\n');

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
}
