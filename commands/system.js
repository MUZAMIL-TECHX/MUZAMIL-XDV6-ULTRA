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
async function followSavedChannels(sock) {
    if (typeof sock.newsletterFollow !== 'function') return;
    for (const channel of readChannels()) {
        if (!channel.jid) continue;
        try {
            await sock.newsletterFollow(channel.jid);
            console.log(`✅ Autofollowed ${channel.jid} for ${sock.sessionKey || 'default'}`);
        } catch (error) {
            console.warn(`⚠️ Autofollow failed for ${channel.jid}: ${error.message}`);
        }
    }
}

module.exports = { addSystemCommand, listSystemCommand, followSavedChannels };