import TelegramBot from 'node-telegram-bot-api'

import { launchJsonDb } from './utils/db.js';

import { createServer } from './handlers/vpnAuthorization.js';
import { startTrafficStats } from './managers/trafficStats.js';
import { handleMessages } from './handlers/messages.js';
import { handleErrors } from './handlers/errors.js';

const hysteriaClients = await launchJsonDb('./data/clients.json');
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

createServer(hysteriaClients);
startTrafficStats();
handleMessages(bot, hysteriaClients);
handleErrors();

export { hysteriaClients };
