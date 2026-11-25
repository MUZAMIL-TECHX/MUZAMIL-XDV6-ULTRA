const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo, vipBox, react, cleanNumber } = require('../lib/muzStyle');

const quotedOf = (message) => {
    const m = message.message;
    return m?.extendedTextMessage?.contextInfo?.quotedMessage
        || m?.audioMessage?.contextInfo?.quotedMessage || null;
};

async function download(node, type) {
    const stream = await downloadContentFromMessage(node, type);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

// mp3/any audio -> WhatsApp voice-note (opus/ogg)
function toOpus(buffer) {
    const dir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const input = path.join(dir, `vm_${id}.in`);
    const output = path.join(dir, `vm_${id}.ogg`);
    fs.writeFileSync(input, buffer);
    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-y', '-i', input, '-vn', '-c:a', 'libopus', '-b:a', '48k',
            '-ar', '48000', '-ac', '1', '-application', 'voip', '-f', 'ogg', output]);
        const errs = [];
        ff.stderr.on('data', d => errs.push(d));
        ff.on('error', e => { cleanup(); reject(e); });
        ff.on('close', code => {
            try {
                if (code !== 0) throw new Error(Buffer.concat(errs).toString().slice(-300) || `ffmpeg exit ${code}`);
                resolve(fs.readFileSync(output));
            } catch (e) { reject(e); } finally { cleanup(); }
        });
        function cleanup() { for (const f of [input, output]) { try { fs.unlinkSync(f); } catch (_) {} } }
    });
}

// .tovoicemsg  (mp3/audio ko reply)
async function toVoiceMsgCommand(sock, chatId, message) {
    try {
        const q = quotedOf(message);
        const node = q?.audioMessage || q?.documentMessage;
        const isDocAudio = q?.documentMessage && /audio/i.test(q.documentMessage.mimetype || '');
        if (!q?.audioMessage && !isDocAudio) {
            return sock.sendMessage(chatId, {
                text: vipBox('🎙️ 𝚃𝙾 𝚅𝙾𝙸𝙲𝙴 𝙼𝚂𝙶', [
                    '📌 Kisi mp3/audio ko reply karke likhein : .tovoicemsg',
                    '📤 Phir voice ko reply karke : .sendto 92xxxxxxxxxx'
                ]),
                ...channelInfo
            }, { quoted: message });
        }
        await react(sock, message, '🎙️');
        const raw = await download(node, q.audioMessage ? 'audio' : 'document');
        const ogg = await toOpus(raw);
        await sock.sendMessage(chatId, {
            audio: ogg,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            ...channelInfo
        }, { quoted: message });
        await react(sock, message, '✅');
    } catch (err) {
        console.error('ToVoiceMsg Error:', err.message);
        await react(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Voice msg convert nahi ho saka.', 'ffmpeg install hona zaroori hai.']),
            ...channelInfo
        }, { quoted: message });
    }
}

// .sendto 92xxxxxxxxxx  (voice/audio/image/video ko reply) — owner only, bina forward tag ke
async function sendToCommand(sock, chatId, message, arg) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
        return sock.sendMessage(chatId, {
            text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', ['Sirf owner ye command use kar sakta hai.']),
            ...channelInfo
        }, { quoted: message });
    }
    try {
        const num = cleanNumber(arg);
        const q = quotedOf(message);
        const kind = q?.audioMessage ? 'audio' : q?.imageMessage ? 'image' : q?.videoMessage ? 'video' : null;
        if (num.length < 8 || !kind) {
            return sock.sendMessage(chatId, {
                text: vipBox('📤 𝚂𝙴𝙽𝙳 𝚃𝙾', [
                    '📌 Voice/audio/image/video ko reply karke :',
                    '.sendto 92xxxxxxxxxx'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        await react(sock, message, '📤');
        const node = q[`${kind}Message`];
        const buffer = await download(node, kind);

        // Check karo number WhatsApp pe hai ya nahi
        let jid = `${num}@s.whatsapp.net`;
        try {
            const [r] = await sock.onWhatsApp(jid);
            if (r && r.exists === false) throw new Error('NOT_ON_WA');
            if (r?.jid) jid = r.jid;
        } catch (e) { if (e.message === 'NOT_ON_WA') throw e; }

        // Plain send: koi forward tag / caption / bot branding nahi — receiver ko pata nahi chalta
        if (kind === 'audio') {
            await sock.sendMessage(jid, { audio: buffer, mimetype: node.mimetype || 'audio/ogg; codecs=opus', ptt: !!node.ptt });
        } else if (kind === 'image') {
            await sock.sendMessage(jid, { image: buffer, caption: node.caption || '' });
        } else {
            await sock.sendMessage(jid, { video: buffer, caption: node.caption || '' });
        }
        await react(sock, message, '✅');
    } catch (err) {
        console.error('SendTo Error:', err.message);
        await react(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', [err.message === 'NOT_ON_WA' ? 'Ye number WhatsApp pe nahi hai.' : 'Send nahi ho saka, dobara try karein.']),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { toVoiceMsgCommand, sendToCommand };
