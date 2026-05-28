import { hysteriaCall } from '../utils/api.js';
import { launchJsonDb } from '../utils/db.js';

const db = await launchJsonDb('./data/stats.json');

const SAVE_INTERVAL = 30000;
const POLL_INTERVAL = 5000;
const TEN_GB = 10 * 1024 * 1024 * 1024;

const HOUR = 3600000;
const DAY = 86400000;

const nowHour = () => (Date.now() / HOUR) | 0;
const nowDay = () => (Date.now() / DAY) | 0;

const KB = 1000;
const MB = KB * 1000;
const GB = MB * 1000;
const TB = GB * 1000;

const ADMIN_ID = parseInt(process.env.ADMIN_ID);

export const startTrafficStats = (bot) => {
    const t = db.data.traffic ||= {};
    const hysteria = t.hysteria ||= {};

    setInterval(async () => {
        try {
            const res = await hysteriaCall('/traffic?clear=1').then(x => x.json());
            processTraffic(res, hysteria, bot);
        } catch (e) {
            console.error('Traffic poll error:', e);
        }
    }, POLL_INTERVAL);

    setInterval(async () => {
        try {
            cleanupOldBuckets(hysteria);
            await db.save();
        } catch (e) {
            console.error('Traffic save error:', e);
        }
    }, SAVE_INTERVAL);

    console.log('Traffic stats started');
};

function processTraffic(response, hysteria, bot) {
    const h = nowHour();
    const d = nowDay();

    for (const client in response) {
        const { tx = 0, rx = 0 } = response[client];
        if (!tx && !rx) continue;

        const stat = hysteria[client] ||= createClient();

        stat.total[0] += tx;
        stat.total[1] += rx;

        addBucket(stat.buckets.hours, h, tx, rx);
        addBucket(stat.buckets.days, d, tx, rx);

        process10GbNotify(bot, client, stat);
    }

    processDailyAnomalyAlerts(bot, hysteria, d);
}

function cleanupOldBuckets(hysteria) {
    const h = nowHour();
    const d = nowDay();

    for (const stat of Object.values(hysteria)) {
        for (const k in stat.buckets.hours)
            if (h - k > 744) delete stat.buckets.hours[k];

        for (const k in stat.buckets.days)
            if (d - k > 365) delete stat.buckets.days[k];
    }
}

const createClient = () => ({
    total: [0, 0],
    notify: { last10GbMark: 0, lastAnomalyDay: 0 },
    buckets: { hours: {}, days: {} }
});

function addBucket(storage, bucket, tx, rx) {
    (storage[bucket] ||= [0, 0])[0] += tx;
    storage[bucket][1] += rx;
}

function process10GbNotify(bot, client, stat) {
    const total = stat.total[0] + stat.total[1];
    const mark = (total / TEN_GB) | 0;

    if (mark > stat.notify.last10GbMark) {
        stat.notify.last10GbMark = mark;
        on10GbReached(bot, { client, total, mark });
    }
}

function processDailyAnomalyAlerts(bot, hysteria, dayBucket) {
    const list = [];

    for (const client in hysteria) {
        const day = hysteria[client].buckets.days[dayBucket];
        if (day) list.push([client, day[0] + day[1]]);
    }

    if (list.length < 5) return;

    const avg = list.reduce((a, b) => a + b[1], 0) / list.length;

    for (const [client, total] of list) {
        const ratio = total / avg;
        if (ratio < 1.5) continue;

        const stat = hysteria[client];

        if (stat.notify.lastAnomalyDay === dayBucket) continue;

        stat.notify.lastAnomalyDay = dayBucket;

        onAnomalyDetected(bot, {
            client,
            total,
            avg,
            ratio,
            clients: list.length
        });
    }
}

function on10GbReached(bot, { client, total }) {
    const alert = `Использовано 10 ГБ.\n${client}: ${(total / 1024 / 1024 / 1024).toFixed(2)} GB`;
    bot.sendMessage(ADMIN_ID, alert);
}

function onAnomalyDetected(bot, { client, total, avg, ratio, clients }) {
    const alert = `Аномальное использование.\n${client}: ${(ratio * 100).toFixed(0)}% of avg, ` +
        `${formatBytes(total)} today, ${clients} clients`;
    bot.sendMessage(ADMIN_ID, alert);
}

export function getClientStats(client) {
    const stat = db.data.traffic?.hysteria?.[client];
    if (!stat) return null;

    const h = nowHour();
    const d = nowDay();

    return {
        hour: sumRange(stat.buckets.hours, h - 1),
        day: sumRange(stat.buckets.hours, h - 24),
        week: sumRange(stat.buckets.days, d - 7),
        month: sumRange(stat.buckets.days, d - 31),
        total: stat.total
    };
}

function sumRange(storage, min) {
    let tx = 0, rx = 0;

    for (const k in storage) {
        if (+k < min) continue;
        const v = storage[k];
        tx += v[0];
        rx += v[1];
    }

    return [tx, rx];
}

function formatBytes(bytes) {
    const usage = bytes || 0;

    if (usage > TB) return (usage / TB).toFixed(1) + ' ТБ';
    if (usage > GB) return (usage / GB).toFixed(1) + ' ГБ';
    if (usage > MB) return (usage / MB).toFixed(1) + ' МБ';
    return                 (usage / KB).toFixed(1) + ' КБ';
}

export function getTopClients({ period = 'day', metric = 'total', limit = 10 } = {}) {
    const hysteria = db.data.traffic?.hysteria || {};
    const h = nowHour();
    const d = nowDay();

    const cfg =
        period === 'hour' ? ['hours', h - 1] :
        period === 'day'  ? ['hours', h - 24] :
        period === 'week' ? ['days',  d - 7] :
        period === 'month'? ['days',  d - 31] :
        (() => { throw new Error('Unknown period') })();

    const [store, min] = cfg;
    const res = [];

    for (const client in hysteria) {
        const buckets = hysteria[client].buckets?.[store];
        if (!buckets) continue;

        let tx = 0, rx = 0;

        for (const k in buckets) {
            if (+k < min) continue;
            tx += buckets[k][0];
            rx += buckets[k][1];
        }

        const total = tx + rx;

        const score =
            metric === 'tx' ? tx :
            metric === 'rx' ? rx :
            total;

        if (score > 0) {
            res.push({ client, tx, rx, total, score });
        }
    }

    return res.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function formatTopClients(list) {
    if (!list.length) {
        return 'No traffic data';
    }

    return list.map((x, i) => {
        return (
            `<b>${i + 1}. ${x.client}</b>\n` +
            `🔎 ${formatBytes(x.total)} ` +
            `⬆️ ${formatBytes(x.tx)} ` +
            `⬇️ ${formatBytes(x.rx)}`
        );
    }).join('\n\n');
}
