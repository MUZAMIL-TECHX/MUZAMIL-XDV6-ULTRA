const axios = require('axios');
const yts = require('yt-search');

// ═══════════════════════════════════════════════════════════
//                    🎯 CHANNEL INFO (FORWARD OFF)
// ═══════════════════════════════════════════════════════════
const channelInfo = {
    contextInfo: {
        forwardingScore: 0,
        isForwarded: false
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
async function searchSong(query) {
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
        return {
            title: 'YouTube Audio',
            url: query,
            thumbnail: 'https://i.postimg.cc/y6GV9P3H/file-000000004c307206bc366893b817568c-(1).png',
            timestamp: 'N/A',
            author: 'YouTube'
        };
    }

    const { videos } = await yts(query);
    if (!videos || videos.length === 0) throw new Error('No results');

    const v = videos[0];
    return {
        title: v.title,
        url: v.url,
        thumbnail: v.thumbnail,
        timestamp: v.timestamp,
        author: v.author?.name || 'Unknown'
    };
}

// ═══════════════════════════════════════════════════════════
//                    🎵 VAJIRA API DOWNLOADER
// ═══════════════════════════════════════════════════════════
async function getVajiraData(youtubeUrl) {
    const apiKey = 'VajiraOfc'; 
    const quality = '128kbps';
    const apiUrl = `https://vajiraofc-apis.vercel.app/api/ytmp3?apikey=${apiKey}&url=${encodeURIComponent(youtubeUrl)}&quality=${quality}`;
    
    const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    // Vajira API JSON check
    if (response?.data?.success && response?.data?.data?.download?.url) {
        return {
            audio: response.data.data.download.url,
            title: response.data.data.title
        };
    }
    throw new Error('Vajira API failed');
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
            'Accept': 'audio/mpeg,audio/*,*/*;q=0.8',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive'
        }
    });

    const buffer = Buffer.from(response.data);
    if (!buffer || buffer.length === 0) throw new Error('Empty buffer');
    return buffer;
}

// ═══════════════════════════════════════════════════════════
//                    🚀 MAIN SONG COMMAND (ULTRA FAST)
// ═══════════════════════════════════════════════════════════
async function songCommand(sock, chatId, message) {
    try {
        await addReaction(sock, message, '🎵');

        const text = message.message?.conversation ||
                     message.message?.extendedTextMessage?.text || '';

        const query = text.replace(/^\.(?:song|play|music|mp3|ytmp3)\b/i, '').trim();

        if (!query) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('🎵 ꜱᴏɴɢ ᴅʟ', [
                    '📌 ᴜꜱᴀɢᴇ : .ꜱᴏɴɢ [ɴᴀᴍᴇ/ʟɪɴᴋ]',
                    '🔍 ᴇxᴀᴍᴘʟᴇ : .ꜱᴏɴɢ ᴘᴀꜱᴏᴏʀɪ',
                    '⚡ ᴍᴏᴅᴇ : ᴜʟᴛʀᴀ ꜰᴀꜱᴛ'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ═══════════════════════════════════════
        // STEP 1: SEARCH
        // ═══════════════════════════════════════
        await addReaction(sock, message, '🔍');

        let songData;
        try {
            songData = await searchSong(query);
        } catch (searchError) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('❌ ɴᴏ ʀᴇꜱᴜʟᴛꜱ', [`🔍 ɴᴏ ꜱᴏɴɢ ꜰᴏᴜɴᴅ ꜰᴏʀ : ${query}`]),
                ...channelInfo
            }, { quoted: message });
        }

        await addReaction(sock, message, '⏳');

        // ═══════════════════════════════════════
        // STEP 2: VAJIRA API (Get Audio Link)
        // ═══════════════════════════════════════
        let vajiraData;
        try {
            vajiraData = await getVajiraData(songData.url);
        } catch (apiError) {
            await addReaction(sock, message, '❌');
            return await sock.sendMessage(chatId, {
                text: box('❌ ᴀᴘɪ ꜰᴀɪʟᴇᴅ', [
                    '🔴 ᴀᴜᴅɪᴏ ᴀᴘɪ ꜰᴀɪʟᴇᴅ',
                    '💡 ᴛʀʏ ᴅɪꜰꜰᴇʀᴇɴᴛ ꜱᴏɴɢ'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ═══════════════════════════════════════
        // STEP 3: THUMBNAIL (INSTANT) + START DOWNLOAD (PARALLEL)
        // ═══════════════════════════════════════
        await addReaction(sock, message, '🖼️');

        // Start buffer download in background (Fatak se start)
        const bufferPromise = downloadBuffer(vajiraData.audio);

        // Thumbnail foran bhejo (YouTube search se)
        try {
            await sock.sendMessage(chatId, {
                image: { url: songData.thumbnail },
                caption: box('🎵 ꜱᴏɴɢ ꜰᴏᴜɴᴅ', [
                    `📌 ᴛɪᴛʟᴇ : ${trim(vajiraData.title || songData.title, 38)}`,
                    `⏱️ ᴅᴜʀᴀᴛɪᴏɴ : ${songData.timestamp || 'N/A'}`,
                    `📺 ᴄʜᴀɴɴᴇʟ : ${trim(songData.author, 25)}`,
                    '━━━━━━━━━━━━━━━━━━',
                    '⚡ ᴜʟᴛʀᴀ ꜰᴀꜱᴛ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ...'
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

        let audioBuffer;
        try {
            audioBuffer = await bufferPromise;
        } catch (bufferError) {
            console.error('Buffer failed:', bufferError.message);

            // Fallback: direct URL
            try {
                await sock.sendMessage(chatId, {
                    audio: { url: vajiraData.audio },
                    mimetype: 'audio/mpeg',
                    fileName: `${(vajiraData.title || songData.title).replace(/[^\w\s-]/g, '')}.mp3`,
                    ptt: false,
                    ...channelInfo
                }, { quoted: message });

                await addReaction(sock, message, '✅');
                return;
            } catch (urlError) {
                await addReaction(sock, message, '❌');
                return await sock.sendMessage(chatId, {
                    text: box('❌ ꜰᴀɪʟᴇᴅ', [
                        '🔴 ᴄᴏᴜʟᴅ ɴᴏᴛ ᴅᴏᴡɴʟᴏᴀᴅ',
                        '💡 ᴛʀʏ ᴅɪꜰꜰᴇʀᴇɴᴛ ꜱᴏɴɢ'
                    ]),
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // ═══════════════════════════════════════
        // STEP 5: SEND AUDIO (FAST)
        // ═══════════════════════════════════════
        await sock.sendMessage(chatId, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${(vajiraData.title || songData.title).replace(/[^\w\s-]/g, '')}.mp3`,
            ptt: false,
            ...channelInfo
        }, { quoted: message });

        await addReaction(sock, message, '✅');

    } catch (error) {
        console.error('Song error:', error);
        await addReaction(sock, message, '❌');

        let errorMsg = error.message || 'Unknown error';
        if (errorMsg.length > 80) errorMsg = errorMsg.substring(0, 80) + '...';

        await sock.sendMessage(chatId, {
            text: box('❌ ᴇʀʀᴏʀ', [
                `🔴 ${errorMsg}`,
                '💡 ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = songCommand;
