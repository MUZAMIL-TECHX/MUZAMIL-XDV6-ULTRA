const axios = require('axios');
const { channelInfo, vipBox, react } = require('../lib/muzStyle');

const TYPES = ['hot', 'love', 'happy'];
const API = 'https://api.lolicon.app/setu/v2';

// Safe-mode filter: r18=0 hamesha, aur loli/shota/child tagged images skip hoti hain.
const BLOCKED_TAGS = [/ロリ/, /萝莉/, /loli/i, /ショタ/, /shota/i, /幼女/, /幼[児童]/, /child/i];
const isBlocked = (item) => (item.tags || []).some(t => BLOCKED_TAGS.some(rx => rx.test(String(t))));

async function animeImgCommand(sock, chatId, message, args = []) {
    const type = String(args[0] || '').toLowerCase();

    if (!TYPES.includes(type)) {
        return sock.sendMessage(chatId, {
            text: vipBox('🎌 𝙰𝙽𝙸𝙼𝙴 𝙸𝙼𝙶', [
                '📌 𝚄𝚜𝚊𝚐𝚎 : .animeimg <type>',
                '📋 𝚃𝚢𝚙𝚎𝚜 : hot, love, happy',
                '💡 𝙴𝚡𝚊𝚖𝚙𝚕𝚎 : .animeimg love'
            ]),
            ...channelInfo
        }, { quoted: message });
    }

    try {
        await react(sock, message, '🎌');

        const res = await axios.get(
            `${API}?num=10&r18=0&size=regular&size=original&tag=${encodeURIComponent(type)}`,
            { timeout: 20000 }
        );

        const list = (res.data?.data || []).filter(i => !i.r18 && !isBlocked(i));
        if (!list.length) throw new Error('NO_RESULT');

        // Random pick; agar download fail ho to next try
        const shuffled = list.sort(() => Math.random() - 0.5);
        let sent = false;
        for (const item of shuffled.slice(0, 3)) {
            const url = item.urls?.regular || item.urls?.original;
            if (!url) continue;
            try {
                const img = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    maxContentLength: 25 * 1024 * 1024,
                    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.pixiv.net/' }
                });
                await sock.sendMessage(chatId, {
                    image: Buffer.from(img.data),
                    caption: vipBox('🎌 𝙰𝙽𝙸𝙼𝙴 𝙸𝙼𝙶', [
                        `🏷️ 𝚃𝚢𝚙𝚎 : ${type}`,
                        `🖼️ 𝚃𝚒𝚝𝚕𝚎 : ${item.title || 'N/A'}`,
                        `✍️ 𝙰𝚞𝚝𝚑𝚘𝚛 : ${item.author || 'N/A'}`
                    ]),
                    ...channelInfo
                }, { quoted: message });
                sent = true;
                break;
            } catch (e) {
                console.error('AnimeImg download failed:', e.message);
            }
        }
        if (!sent) throw new Error('DOWNLOAD_FAILED');
        await react(sock, message, '✅');
    } catch (err) {
        console.error('AnimeImg Error:', err.message);
        await react(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', [
                err.message === 'NO_RESULT'
                    ? `"${type}" ke liye image nahi mili, dusra type try karein.`
                    : 'Image fetch nahi ho saki, thodi der baad try karein.'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { animeImgCommand };
