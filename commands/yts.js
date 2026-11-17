const axios = require('axios');
const yts = require('yt-search');

// ═══════════════════════════════════════════════════════════
//                    ⚙️ CONFIG & STORAGE
// ═══════════════════════════════════════════════════════════
const VAJIRA_MP4_API = 'https://vajiraofc-apis.vercel.app/api/ytmp4?apikey=VajiraOfc&url=';
const VAJIRA_MP3_API = 'https://vajiraofc-apis.vercel.app/api/ytmp3?apikey=VajiraOfc&url=';

const pendingButtons = new Map(); // Button clicks track karne ke liye

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
    } catch (err) {}
}

async function downloadBuffer(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    return Buffer.from(response.data);
}

async function getVajiraData(videoUrl, type) {
    const apiUrl = type === 'audio' ? VAJIRA_MP3_API : VAJIRA_MP4_API;
    const response = await axios.get(`${apiUrl}${encodeURIComponent(videoUrl)}`, { timeout: 30000 });
    if (!response.data.success || !response.data.data) throw new Error('API failed');
    
    return {
        title: response.data.data.title,
        downloadUrl: response.data.data.download?.url,
        quality: response.data.data.download?.quality || (type === 'audio' ? '128kbps' : '360p')
    };
}

// ═══════════════════════════════════════════════════════════
//                    🚀 MAIN COMMAND HANDLER
// ═══════════════════════════════════════════════════════════
async function ytsHandler(sock, chatId, message, text, isButtonClick = false, buttonId = null, quotedMsgId = null) {
    try {
        // ==========================================
        // PART 1: BUTTON CLICK HANDLE KARNA
        // ==========================================
        if (isButtonClick) {
            if (!pendingButtons.has(quotedMsgId)) return;
            
            const data = pendingButtons.get(quotedMsgId);
            const isAudio = buttonId === 'audio_dl';
            const format = isAudio ? 'audio' : 'video';
            const emoji = isAudio ? '🎵' : '🎬';

            // Edit 1: Processing
            await sock.sendMessage(chatId, { 
                text: `⏳ *Your Request Has Been Processed*\n\n${emoji} *Format:* ${format.toUpperCase()}\n📥 *Status:* Downloading...\n\n> By : Muzamil XD`, 
                edit: message.key 
            });
            await addReaction(sock, message, '⏳');

            // Download
            const vajiraData = await getVajiraData(data.videoUrl, format);
            if (!vajiraData.downloadUrl) throw new Error('Link not found');
            
            const fileBuffer = await downloadBuffer(vajiraData.downloadUrl);

            // Edit 2: Success
            await sock.sendMessage(chatId, { 
                text: `✅ *Downloaded Successfully*\n\n📌 *Title:* ${data.title}\n📦 *Size:* ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB\n📺 *Quality:* ${vajiraData.quality}\n\n> Muzamil XD\n> By : Muzamil XD`, 
                edit: message.key 
            });

            // Send File
            if (isAudio) {
                await sock.sendMessage(chatId, {
                    audio: fileBuffer, mimetype: 'audio/mp3',
                    fileName: `${data.title}.mp3`, ptt: false, ...channelInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    video: fileBuffer, mimetype: 'video/mp4',
                    fileName: `${data.title}.mp4`,
                    caption: `✅ *Video Downloaded*\n\n📌 *Title:* ${data.title}\n\n> By : Muzamil XD`,
                    ...channelInfo
                }, { quoted: message });
            }

            await addReaction(sock, message, '✅');
            pendingButtons.delete(quotedMsgId);
            return;
        }

        // ==========================================
        // PART 2: NAYA SEARCH HANDLE KARNA (.yts)
        // ==========================================
        await addReaction(sock, message, '🔍');
        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, { text: `⚠️ *Usage:* .yts [Video Name]\n📌 *Example:* .yts Pasoori` }, { quoted: message });
        }

        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, { text: '❌ No results found!' }, { quoted: message });
        }

        const video = videos[0];
        const captionText = `🎬 *${video.title}*\n\n⏱️ *Duration:* ${video.timestamp}\n📺 *Channel:* ${video.author.name}\n\n👇 *Please select a format below:*\n\n> By : Muzamil XD`;

        const msg = await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption: captionText,
            footer: 'Muzamil XD',
            buttons: [
                { buttonId: 'audio_dl', buttonText: { displayText: '🎵 AUDIO' }, type: 1 },
                { buttonId: 'video_dl', buttonText: { displayText: '🎬 VIDEO' }, type: 1 }
            ],
            headerType: 1,
            ...channelInfo
        }, { quoted: message });

        // Store for buttons
        pendingButtons.set(msg.key.id, {
            videoUrl: video.url,
            title: video.title
        });

        await addReaction(sock, message, '✅');
    } catch (error) {
        console.error('YTS Handler Error:', error);
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, { text: `❌ Error: ${error.message}` }, { quoted: message });
    }
}

module.exports = ytsHandler;
