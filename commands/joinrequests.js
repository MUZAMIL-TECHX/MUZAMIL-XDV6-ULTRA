'use strict';

/**
 * .acceptall  — approve ALL pending join requests of the group
 * .rejectall  — reject  ALL pending join requests of the group
 * (also works as ".reject all" / ".accept all")
 */

const isAdmin = require('../lib/isAdmin');

const BOT_NAME = '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫';
const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363426106687970@newsletter',
            newsletterName: BOT_NAME,
            serverMessageId: -1
        }
    }
};

const CHUNK = 30;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function box(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━━━━╮\n┃  ✦ ${title}\n╰━━━━━━━━━━━━━━━━━━╯\n\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `\n━━━━━━━━━━━━━━━━━━━━\n   👑 𝗕𝘆 : ${BOT_NAME}`;
    return out;
}

async function handleJoinRequests(sock, chatId, message, senderId, action) {
    const approve = action === 'approve';
    const react = emoji => sock.sendMessage(chatId, { react: { text: emoji, key: message.key } }).catch(() => {});
    const reply = text => sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

    if (!chatId.endsWith('@g.us')) {
        return reply(box('❌ 𝗚𝗥𝗢𝗨𝗣 𝗢𝗡𝗟𝗬', ['This command only works in groups.']));
    }

    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await react('❌');
            return reply(box('❌ 𝗕𝗢𝗧 𝗡𝗢𝗧 𝗔𝗗𝗠𝗜𝗡', ['Please make the bot an admin first.']));
        }
        if (!isSenderAdmin && !message.key.fromMe) {
            await react('⛔');
            return reply(box('⛔ 𝗔𝗖𝗖𝗘𝗦𝗦 𝗗𝗘𝗡𝗜𝗘𝗗', ['Only group admins can use this command.']));
        }

        await react('⏳');

        const pending = await sock.groupRequestParticipantsList(chatId);
        const jids = (pending || []).map(p => p.jid || p.id || p.phone_number).filter(Boolean);

        if (!jids.length) {
            await react('ℹ️');
            return reply(box('📭 𝗡𝗢 𝗣𝗘𝗡𝗗𝗜𝗡𝗚 𝗥𝗘𝗤𝗨𝗘𝗦𝗧𝗦', ['There are no join requests to ' + (approve ? 'accept' : 'reject') + '.']));
        }

        let done = 0;
        let failed = 0;
        for (let i = 0; i < jids.length; i += CHUNK) {
            const part = jids.slice(i, i + CHUNK);
            try {
                const res = await sock.groupRequestParticipantsUpdate(chatId, part, action);
                if (Array.isArray(res) && res.length) {
                    for (const r of res) (r?.status && String(r.status) !== '200') ? failed++ : done++;
                } else {
                    done += part.length;
                }
            } catch (e) {
                console.error('[JOINREQ] chunk failed:', e?.message || e);
                failed += part.length;
            }
            if (i + CHUNK < jids.length) await sleep(1000);
        }

        await react(failed && !done ? '❌' : '✅');
        return reply(box(approve ? '✅ 𝗔𝗟𝗟 𝗥𝗘𝗤𝗨𝗘𝗦𝗧𝗦 𝗔𝗖𝗖𝗘𝗣𝗧𝗘𝗗' : '🚫 𝗔𝗟𝗟 𝗥𝗘𝗤𝗨𝗘𝗦𝗧𝗦 𝗥𝗘𝗝𝗘𝗖𝗧𝗘𝗗', [
            `📋 Total requests : ${jids.length}`,
            `${approve ? '✅ Accepted' : '🚫 Rejected'} : ${done}`,
            ...(failed ? [`⚠️ Failed : ${failed}`] : [])
        ]));
    } catch (error) {
        console.error('[JOINREQ] error:', error);
        await react('❌');
        return reply(box('❌ 𝗘𝗥𝗥𝗢𝗥', [String(error?.message || error).slice(0, 300)]));
    }
}

const acceptAllCommand = (sock, chatId, message, senderId) => handleJoinRequests(sock, chatId, message, senderId, 'approve');
const rejectAllCommand = (sock, chatId, message, senderId) => handleJoinRequests(sock, chatId, message, senderId, 'reject');

module.exports = { acceptAllCommand, rejectAllCommand };
