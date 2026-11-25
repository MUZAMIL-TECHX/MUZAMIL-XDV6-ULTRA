const isOwnerOrSudo = require('../lib/isOwner');
const { readSessionJson, writeSessionJson } = require('../lib/session_data');
const { channelInfo, vipBox, react } = require('../lib/muzStyle');

// 👻 GHOST MODE
// ON  : bot ko messages normal receive hote hain, magar sender ko sirf single tick
//       (sent) dikhta hai — delivered / read receipt bhejna band.
// OFF : pehle wali indicator/autoread settings wapas.
const FILE = 'ghostmode.json';

function getGhost(sock) {
    const c = readSessionJson(sock, FILE, {});
    return { enabled: c.enabled === true, prevIndicator: c.prevIndicator || null };
}

function isGhostEnabled(sock) {
    try { return getGhost(sock).enabled; } catch (_) { return false; }
}

// Wraps the socket's receipt senders. Status@broadcast is left alone so
// autostatus keeps working. Safe to call once per socket.
function installGhostGuard(sock) {
    if (!sock || sock.__ghostGuard) return;
    sock.__ghostGuard = true;

    const wrapReceipt = (name) => {
        const original = sock[name];
        if (typeof original !== 'function') return;
        sock[name] = async function (jid, ...rest) {
            if (isGhostEnabled(sock) && jid !== 'status@broadcast') return;
            return original.call(sock, jid, ...rest);
        };
    };
    wrapReceipt('sendReceipt');

    if (typeof sock.sendReceipts === 'function') {
        const original = sock.sendReceipts;
        sock.sendReceipts = async function (keys, ...rest) {
            if (isGhostEnabled(sock)) {
                keys = (keys || []).filter(k => k?.remoteJid === 'status@broadcast');
                if (!keys.length) return;
            }
            return original.call(sock, keys, ...rest);
        };
    }

    if (typeof sock.readMessages === 'function') {
        const original = sock.readMessages;
        sock.readMessages = async function (keys, ...rest) {
            if (isGhostEnabled(sock)) {
                keys = (keys || []).filter(k => k?.remoteJid === 'status@broadcast');
                if (!keys.length) return;
            }
            return original.call(sock, keys, ...rest);
        };
    }
}

async function ghostModeCommand(sock, chatId, message, arg) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (!(message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId))) {
        return sock.sendMessage(chatId, {
            text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', ['Sirf owner ye command use kar sakta hai.']),
            ...channelInfo
        }, { quoted: message });
    }

    const a = String(arg || '').trim().toLowerCase();
    const cfg = getGhost(sock);

    if (a !== 'on' && a !== 'off') {
        return sock.sendMessage(chatId, {
            text: vipBox('👻 𝙶𝙷𝙾𝚂𝚃 𝙼𝙾𝙳𝙴', [
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${cfg.enabled ? '🟢 ON' : '🔴 OFF'}`,
                '• .ghostmode on — msg aayenge, sender ko single tick',
                '• .ghostmode off — normal'
            ]),
            ...channelInfo
        }, { quoted: message });
    }

    const indicator = require('./indicator');
    const turnOn = a === 'on';

    if (turnOn && !cfg.enabled) {
        // Remember the old indicator state, then force "null" (no receipts at all)
        const prev = indicator.getIndicatorConfig(sock);
        writeSessionJson(sock, FILE, { enabled: true, prevIndicator: prev });
        writeSessionJson(sock, 'indicator.json', { enabled: true, mode: 'null' });
    } else if (!turnOn && cfg.enabled) {
        writeSessionJson(sock, FILE, { enabled: false, prevIndicator: null });
        if (cfg.prevIndicator) writeSessionJson(sock, 'indicator.json', cfg.prevIndicator);
    }

    await react(sock, message, turnOn ? '👻' : '✅');
    await sock.sendMessage(chatId, {
        text: vipBox('👻 𝙶𝙷𝙾𝚂𝚃 𝙼𝙾𝙳𝙴', [
            `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${turnOn ? '🟢 ON' : '🔴 OFF'}`,
            turnOn
                ? '✅ Messages receive honge, sender ko sirf single tick dikhega'
                : '✅ Normal receipts wapas on'
        ]),
        ...channelInfo
    }, { quoted: message });
}

module.exports = { ghostModeCommand, isGhostEnabled, installGhostGuard };
