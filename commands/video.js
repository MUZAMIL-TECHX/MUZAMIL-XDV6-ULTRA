const axios = require('axios');

// ═══════════════════════════════════════════════════════════
//                    🎯 CHANNEL INFO (FORWARD OFF)
// ═══════════════════════════════════════════════════════════
const channelInfo = {
    contextInfo: {
        forwardingScore: 0,
        isForwarded: false
    }
};

// Vajira API Base URL
const VAJIRA_API_BASE = 'https://vajiraofc-apis.vercel.app/api/ytmp4?apikey=VajiraOfc&url=';

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

// ⚡ NEW DESIGN FRAME
function box(title, lines = []) {
    let out = `┏━━━━━━━━━━━━━━━━━━━┓\n`;
    out += `┃  ${title}\n`;
    out += `┗━━━━━━━━━━━━━━━━━━━┛\n`;
    for (const l of lines) out += `  ▸ ${l}\n`;
    out += `\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
    out += `   ⚡ 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫 ⚡`;
    return out;
}

function trim(str, n) {
    if (!str) return 'Unknown';
    return str.length > n ? str.slice(0, n) + '...' : str;
}

// ═══════════════════════════════════════════════════════════
//                    🔍 SEARCH (yt-search)
// ═══════════════════════════════════════════════════════════
async function searchVideo(query) {
    const yts = require('yt-search');
    const { videos } = await yts(query);
    if (!videos || videos.length === 0) throw new Error('No results');

    const v = videos[0];
    return {
        title: v.title,
        url: v.url,
        videoId: v.videoId,
        thumbnail: v.thumbnail,
        timestamp: v.timestamp,
        views: v.views,
        author: v.author?.name || 'Unknown'
    };
}

// ═══════════════════════════════════════════════════════════
//                    🎬 VAJIRA API
// ═══════════════════════════════════════════════════════════
async function getVajiraData(youtubeUrl) {
    const apiUrl = `${VAJIRA_API_BASE}${encodeURIComponent(youtubeUrl)}`;
    const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    // Naye JSON structure ke hisaab se check
    if (!response.data.success || !response.data.data) {
        throw new Error('Vajira API failed');
    }

    return {
        title: response.data.data.title,
        downloadUrl: response.data.data.download?.url,
        quality: response.data.data.download?.quality,
        filename: response.data.data.download?.filename
    };
}

// ═══════════════════════════════════════════════════════════
//                    📥 BUFFER DOWNLOAD (ULTRA FAST)
// ═══════════════════════════════════════════════════════════
async function downloadBuffer(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        decompress: false,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'video/mp4,video/*,*/*;q=0.8',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive'
        }
    });

    const buffer = Buffer.from(response.data);
    if (!buffer || buffer.length === 0) throw new Error('Empty buffer');
    return buffer;
}

// ═══════════════════════════════════════════════════════════
//                    🚀 MAIN VIDEO COMMAND
// ═══════════════════════════════════════════════════════════
async function videoCommand(sock, chatId, message) {
    try {
        await addReaction(sock, message, '🎬');

        const text = message.message?.conversation ||
                     message.message?.extendedTextMessage?.text || '';

        const query = text.replace(/^\.(?:video|vid|ytmp4)\b/i, '').trim();

        if (!query) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('🎬 ᴠɪᴅᴇᴏ ᴅʟ', [
                    '📌 ᴜsᴀɢᴇ : .ᴠɪᴅᴇᴏ [ɴᴀᴍᴇ/ʟɪɴᴋ]',
                    '🔍 ᴇxᴀᴍᴘʟᴇ 1 : .ᴠɪᴅᴇᴏ ᴘᴀsᴏᴏʀɪ',
                    '🔍 ᴇxᴀᴍᴘʟᴇ 2 : .ᴠɪᴅᴇᴏ ᴀᴛɪꜰ ᴀsʟᴀᴍ',
                    '━━━━━━━━━━━━━━━━━━',
                    '⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ : ᴠᴀᴊɪʀᴀ ᴀᴘɪ'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ═══════════════════════════════════════
        // STEP 1: SEARCH
        // ═══════════════════════════════════════
        await addReaction(sock, message, '🔍');

        let videoData;
        try {
            videoData = await searchVideo(query);
        } catch (searchError) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('❌ ɴᴏ ʀᴇsᴜʟᴛs', [
                    `🔍 ɴᴏ ᴠɪᴅᴇᴏ ꜰᴏᴜɴᴅ ꜰᴏʀ : ${query}`,
                    '💡 ᴛʀʏ ᴅɪꜰꜰᴇʀᴇɴᴛ ᴋᴇʏᴡᴏʀᴅs'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        await addReaction(sock, message, '⏳');

        // ═══════════════════════════════════════
        // STEP 2: VAJIRA API
        // ═══════════════════════════════════════
        let vajiraData;
        try {
            vajiraData = await getVajiraData(videoData.url);
        } catch (vajiraError) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('❌ ꜰᴀɪʟᴇᴅ', [
                    '🔴 ᴀᴘɪ ꜰᴀɪʟᴇᴅ',
                    '💡 ᴛʀʏ ᴅɪꜰꜰᴇʀᴇɴᴛ ᴠɪᴅᴇᴏ'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ═══════════════════════════════════════
        // STEP 3: THUMBNAIL + START DOWNLOAD
        // ═══════════════════════════════════════
        await addReaction(sock, message, '🖼️');

        if (!vajiraData.downloadUrl) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('❌ ɴᴏ ᴠɪᴅᴇᴏ ᴜʀʟ', [
                    '🔴 ᴠɪᴅᴇᴏ ʟɪɴᴋ ɴᴏᴛ ꜰᴏᴜɴᴅ',
                    '💡 ᴛʀʏ ᴅɪꜰꜰᴇʀᴇɴᴛ ᴠɪᴅᴇᴏ'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // Start buffer download IN PARALLEL with thumbnail send
        const bufferPromise = downloadBuffer(vajiraData.downloadUrl);

        // Send thumbnail
        try {
            await sock.sendMessage(chatId, {
                image: { url: videoData.thumbnail },
                caption: box('🎬 ᴠɪᴅᴇᴏ ꜰᴏᴜɴᴅ', [
                    `📌 ᴛɪᴛʟᴇ : ${trim(vajiraData.title, 38)}`,
                    `⏱️ ᴅᴜʀᴀᴛɪᴏɴ : ${videoData.timestamp || 'N/A'}`,
                    `📺 ᴄʜᴀɴɴᴇʟ : ${trim(videoData.author, 25)}`,
                    `📺 ǫᴜᴀʟɪᴛʏ : ${vajiraData.quality || '360p'}`,
                    '━━━━━━━━━━━━━━━━━━',
                    '⚡ ᴜʟᴛʀᴀ ꜰᴀsᴛ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ...'
                ]),
                ...channelInfo
            }, { quoted: message });
        } catch (thumbError) {
            console.error('Thumbnail error:', thumbError.message);
        }

        // ═══════════════════════════════════════
        // STEP 4: AWAIT BUFFER
        // ═══════════════════════════════════════
        await addReaction(sock, message, '📥');

        let videoBuffer;
        try {
            videoBuffer = await bufferPromise;
        } catch (bufferError) {
            console.error('Buffer failed:', bufferError.message);

            // Fallback: direct URL
            try {
                await sock.sendMessage(chatId, {
                    video: { url: vajiraData.downloadUrl },
                    mimetype: 'video/mp4',
                    fileName: `${vajiraData.title.replace(/[^\w\s-]/g, '')}.mp4`,
                    caption: box('✅ ᴠɪᴅᴇᴏ ʀᴇᴀᴅʏ', [
                        `📌 ᴛɪᴛʟᴇ : ${trim(vajiraData.title, 30)}`,
                        `📺 ǫᴜᴀʟɪᴛʏ : ${vajiraData.quality || '360p'}`,
                        '✅ sᴛᴀᴛᴜs : ᴅᴏᴡɴʟᴏᴀᴅᴇᴅ'
                    ]),
                    ...channelInfo
                }, { quoted: message });

                await addReaction(sock, message, '✅');
                return;
            } catch (urlError) {
                await addReaction(sock, message, '❌');
                return await sock.sendMessage(chatId, {
                    text: box('❌ ꜰᴀɪʟᴇᴅ', [
                        '🔴 ᴄᴏᴜʟᴅ ɴᴏᴛ ᴅᴏᴡɴʟᴏᴀᴅ',
                        '💡 ᴛʀʏ ᴅɪꜰꜰᴇʀᴇɴᴛ ᴠɪᴅᴇᴏ'
                    ]),
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // ═══════════════════════════════════════
        // STEP 5: SEND VIDEO
        // ═══════════════════════════════════════
        await sock.sendMessage(chatId, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            fileName: `${vajiraData.title.replace(/[^\w\s-]/g, '')}.mp4`,
            caption: box('✅ ᴠɪᴅᴇᴏ ʀᴇᴀᴅʏ', [
                `📌 ᴛɪᴛʟᴇ : ${trim(vajiraData.title, 30)}`,
                `📏 sɪᴢᴇ : ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`,
                `📺 ǫᴜᴀʟɪᴛʏ : ${vajiraData.quality || '360p'}`,
                '⚡ ᴍᴏᴅᴇ : ᴜʟᴛʀᴀ ꜰᴀsᴛ'
            ]),
            ...channelInfo
        }, { quoted: message });

        await addReaction(sock, message, '✅');

    } catch (error) {
        console.error('Video error:', error);
        await addReaction(sock, message, '❌');

        let errorMsg = error.message || 'Unknown error';
        if (errorMsg.length > 80) errorMsg = errorMsg.substring(0, 80) + '...';

        await sock.sendMessage(chatId, {
            text: box('❌ ᴇʀʀᴏʀ', [
                `🔴 ${errorMsg}`,
                '💡 ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = videoCommand;
