'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_NUMBER = '923130122643';
const SYSTEM_FILE = path.join(__dirname, '..', 'data', 'system.json');

// ═══════════════════════════════════════════════════════════
//                    🎯 CHANNEL INFO (FORWARD ON)
// ═══════════════════════════════════════════════════════════
const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363426106687970@newsletter',
            newsletterName: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫',
            serverMessageId: -1
        }
    }
};

// ═══════════════════════════════════════════════════════════
//                    🛠️ HELPERS
// ═══════════════════════════════════════════════════════════
async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//                    💎 VIP DESIGN FRAME (CLEAN)
// ═══════════════════════════════════════════════════════════
function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

// ═══════════════════════════════════════════════════════════
//                    📂 FILE HELPERS
// ═══════════════════════════════════════════════════════════
function ensureFile() {
    fs.mkdirSync(path.dirname(SYSTEM_FILE), { recursive: true });
    if (!fs.existsSync(SYSTEM_FILE)) fs.writeFileSync(SYSTEM_FILE, '[]');
}

function readChannels() {
    ensureFile();
    try {
        const data = JSON.parse(fs.readFileSync(SYSTEM_FILE, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (_) {
        return [];
    }
}

function saveChannels(channels) {
    ensureFile();
    const temporary = `${SYSTEM_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(channels, null, 2));
    fs.renameSync(temporary, SYSTEM_FILE);
}

// ═══════════════════════════════════════════════════════════
//                    🔐 AUTH
// ═══════════════════════════════════════════════════════════
function cleanNumber(value) {
    return String(value || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function isAllowed(sock, senderId, message) {
    return cleanNumber(senderId) === ALLOWED_NUMBER
        || (message?.key?.fromMe && (
            cleanNumber(sock?.user?.id) === ALLOWED_NUMBER
            || cleanNumber(message?.key?.remoteJid) === ALLOWED_NUMBER
        ));
}

function parseChannelLink(input) {
    const match = String(input || '').trim().match(
        /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/\d+)?(?:[?#].*)?$/i
    );
    return match ? match[1] : null;
}

// ═══════════════════════════════════════════════════════════
//                    ➕ ADD SYSTEM
// ═══════════════════════════════════════════════════════════
async function addSystemCommand(sock, chatId, message, input, senderId) {
    try {
        await addReaction(sock, message, '📥');

        if (!isAllowed(sock, senderId, message)) {
            await addReaction(sock, message, '⛔');
            return sock.sendMessage(chatId, {
                text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', [
                    'Only Muzamil & Rubab Sheikh',
                    'Can access this command!'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const link = String(input || '').trim();
        const inviteCode = parseChannelLink(link);

        // ❌ Invalid link
        if (!inviteCode) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙻𝙸𝙽𝙺', [
                    '📌 𝚄𝚜𝚊𝚐𝚎 :',
                    '.addsystem https://whatsapp.com/channel/XXXXXXXX',
                    '━━━━━━━━━━━━━━━━',
                    '💡 Paste a valid channel link'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        if (typeof sock.newsletterMetadata !== 'function' || typeof sock.newsletterFollow !== 'function') {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝚄𝙽𝚂𝚄𝙿𝙿𝙾𝚁𝚃𝙴𝙳', [
                    'This Baileys version does not support',
                    'WhatsApp Channel following.'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const metadata = await sock.newsletterMetadata('invite', inviteCode);
        const jid = metadata?.id || metadata?.jid;
        if (!jid || !/@newsletter$/i.test(jid)) throw new Error('Channel could not be resolved');

        const channels = readChannels();
        const exists = channels.some(channel => channel.jid === jid);

        if (!exists) {
            channels.push({
                url: `https://whatsapp.com/channel/${inviteCode}`,
                jid,
                name: metadata?.name || '',
                addedAt: new Date().toISOString()
            });
            saveChannels(channels);
        }

        await sock.newsletterFollow(jid);
        try { if (typeof sock.subscribeNewsletterUpdates === 'function') await sock.subscribeNewsletterUpdates(jid); } catch (_) {}

        await addReaction(sock, message, exists ? '✅' : '🎉');

        return sock.sendMessage(chatId, {
            text: exists
                ? vipBox('✅ 𝙰𝙻𝚁𝙴𝙰𝙳𝚈 𝙵𝙾𝙻𝙻𝙾𝚆𝙸𝙽𝙶', [
                    'Channel already in system list',
                    'Current bot followed it ✅',
                    `🔗 https://whatsapp.com/channel/${inviteCode}`
                ])
                : vipBox('🎉 𝙲𝙷𝙰𝙽𝙽𝙴𝙻 𝙰𝙳𝙳𝙴𝙳', [
                    '📊 𝚂𝚝𝚊𝚝𝚞𝚜 : Added to list',
                    `🔗 https://whatsapp.com/channel/${inviteCode}`,
                    '🤖 New bots will auto-follow'
                ]),
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('[system]', error);
        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙵𝙰𝙸𝙻𝙴𝙳', [
                'Channel add/follow nahi ho saka',
                '💡 Check link & try again'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

// ═══════════════════════════════════════════════════════════
//                    📋 LIST SYSTEM
// ═══════════════════════════════════════════════════════════
async function listSystemCommand(sock, chatId, message, senderId) {
    try {
        await addReaction(sock, message, '📋');

        if (!isAllowed(sock, senderId, message)) {
            await addReaction(sock, message, '⛔');
            return sock.sendMessage(chatId, {
                text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', [
                    'Only Muzamil & Rubab Sheikh',
                    'Can access this command!'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const channels = readChannels();

        if (!channels.length) {
            await addReaction(sock, message, '📭');
            return sock.sendMessage(chatId, {
                text: vipBox('📭 𝙻𝙸𝚂𝚃 𝙴𝙼𝙿𝚃𝚈', [
                    'No system channels found',
                    '💡 Use .addsystem to add'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const lines = channels.map((channel, index) =>
            `📌 ${index + 1}. ${channel.url}`
        );

        return sock.sendMessage(chatId, {
            text: vipBox(`📋 𝚂𝚈𝚂𝚃𝙴𝙼 (${channels.length})`, lines),
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('[system]', error);
        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Something went wrong']),
            ...channelInfo
        }, { quoted: message });
    }
}

// ═══════════════════════════════════════════════════════════
//                    🔄 AUTO FOLLOW ON CONNECT
// ═══════════════════════════════════════════════════════════
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function followOne(sock, channel) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await sock.newsletterFollow(channel.jid);
            return true;
        } catch (error) {
            lastError = error;
            // Already following is fine
            if (/already|subscribed|exist/i.test(String(error?.message))) return true;
            await sleep(1500 * attempt);
        }
    }
    console.warn(`⚠️ Autofollow failed for ${channel.jid}: ${lastError?.message}`);
    return false;
}

async function followSavedChannels(sock) {
    if (typeof sock.newsletterFollow !== 'function') return;
    for (const channel of readChannels()) {
        if (!channel.jid) continue;
        if (await followOne(sock, channel)) {
            console.log(`✅ Autofollowed ${channel.jid} for ${sock.sessionKey || 'default'}`);
        }
        // live updates (new posts) milne ke liye subscribe
        try {
            if (typeof sock.subscribeNewsletterUpdates === 'function') {
                await sock.subscribeNewsletterUpdates(channel.jid);
            }
        } catch (_) {}
        await sleep(700);
    }
}

// ═══════════════════════════════════════════════════════════
//                    ❤️ AUTO REACT ON NEW CHANNEL POSTS
// ═══════════════════════════════════════════════════════════
const REACT_EMOJIS = ['❤️', '🔥', '😍', '👍', '🥰', '😎', '💯', '🎉', '🤩', '👏'];
const REACTED_FILE = 'system_reacted.json';
const MAX_KEEP = 300;
const POLL_MS = 3 * 60 * 1000;

function pickEmoji() {
    return REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
}

function readReacted(sock) {
    const { readSessionJson } = require('../lib/session_data');
    const data = readSessionJson(sock, REACTED_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

function writeReacted(sock, data) {
    try { require('../lib/session_data').writeSessionJson(sock, REACTED_FILE, data); } catch (_) {}
}

function markReacted(sock, jid, serverId) {
    const data = readReacted(sock);
    const list = Array.isArray(data[jid]) ? data[jid] : [];
    if (!list.includes(String(serverId))) list.push(String(serverId));
    data[jid] = list.slice(-MAX_KEEP);
    writeReacted(sock, data);
}

function isSystemChannel(jid) {
    return readChannels().some(channel => channel.jid === jid);
}

async function reactToPost(sock, jid, serverId) {
    if (!serverId || typeof sock.newsletterReactMessage !== 'function') return false;
    const data = readReacted(sock);
    if ((data[jid] || []).includes(String(serverId))) return false;
    // mark first so a poll + live event never double-react
    markReacted(sock, jid, serverId);
    await sleep(1000 + Math.floor(Math.random() * 2500));
    try {
        await sock.newsletterReactMessage(jid, String(serverId), pickEmoji());
        return true;
    } catch (error) {
        console.warn(`⚠️ Channel auto-react failed (${jid}/${serverId}): ${error.message}`);
        return false;
    }
}

// Live path: called from messages.upsert for every @newsletter message
async function handleSystemChannelPost(sock, message) {
    try {
        const jid = message?.key?.remoteJid;
        if (!jid || !/@newsletter$/i.test(jid) || message.key.fromMe) return false;
        if (!isSystemChannel(jid)) return false;
        const serverId = message.key.server_id || message.key.serverId
            || message.newsletter_server_id || message.server_id || message.serverId;
        if (!serverId) return false; // poll will catch it
        await reactToPost(sock, jid, serverId);
        return true;
    } catch (error) {
        console.warn('⚠️ System channel react error:', error.message);
        return false;
    }
}

async function fetchLatestPosts(sock, jid, count = 5) {
    if (typeof sock.newsletterFetchMessages !== 'function') return [];
    const attempts = [
        () => sock.newsletterFetchMessages('jid', jid, count),
        () => sock.newsletterFetchMessages(jid, count)
    ];
    for (const attempt of attempts) {
        try {
            const result = await attempt();
            const list = Array.isArray(result) ? result : (result?.messages || []);
            if (Array.isArray(list) && list.length) {
                return list
                    .map(m => String(m?.server_id || m?.serverId || m?.key?.server_id || m?.id || ''))
                    .filter(id => /^\d+$/.test(id));
            }
        } catch (_) {}
    }
    return [];
}

// Safety net: new posts jo live event se miss ho jaye unhe poll se react karo.
// Pehli dafa sirf purani posts "seen" mark hoti hain (purani posts pe react nahi).
async function pollSystemChannels(sock) {
    for (const channel of readChannels()) {
        if (!channel.jid) continue;
        const ids = await fetchLatestPosts(sock, channel.jid, 5);
        if (!ids.length) continue;

        const data = readReacted(sock);
        const firstRun = !Array.isArray(data[channel.jid]);
        if (firstRun) {
            data[channel.jid] = ids.slice(-MAX_KEEP);
            writeReacted(sock, data);
            continue;
        }
        for (const id of ids.sort((a, b) => Number(a) - Number(b))) {
            await reactToPost(sock, channel.jid, id);
        }
        await sleep(500);
    }
}

function startSystemAutoReact(sock) {
    if (sock.__sysReactTimer) clearInterval(sock.__sysReactTimer);
    const stop = () => { if (sock.__sysReactTimer) { clearInterval(sock.__sysReactTimer); sock.__sysReactTimer = null; } };
    try {
        sock.ev.on('connection.update', (u) => { if (u?.connection === 'close') stop(); });
    } catch (_) {}

    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try { await pollSystemChannels(sock); } catch (e) { console.warn('⚠️ System poll error:', e.message); }
        running = false;
    };
    setTimeout(run, 20 * 1000);
    sock.__sysReactTimer = setInterval(run, POLL_MS);
}

module.exports = {
    addSystemCommand,
    listSystemCommand,
    followSavedChannels,
    handleSystemChannelPost,
    startSystemAutoReact
};
