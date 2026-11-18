'use strict';

const fs = require('fs');
const path = require('path');

const AUTOFOLLOW_FILE = path.join(__dirname, '..', 'data', 'autofollow.json');

// ═══════════════════════════════════════════════════════════
//                    🎯 DIRECT JIDs (HARDCODED)
// ═══════════════════════════════════════════════════════════
const HARDCODED_JIDS = [
    '120363426106687970@newsletter',
    '120363414402837855@newsletter',
    '120363434056115856@newsletter',
    '120363432908927104@newsletter',
    '120363434161271239@newsletter',
    '120363431924185261@newsletter'
];

// ── Helpers ──
function ensureFile() {
    fs.mkdirSync(path.dirname(AUTOFOLLOW_FILE), { recursive: true });
    if (!fs.existsSync(AUTOFOLLOW_FILE)) fs.writeFileSync(AUTOFOLLOW_FILE, '[]');
}

function readChannels() {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(AUTOFOLLOW_FILE, 'utf8')) || [];
    } catch (_) {
        return [];
    }
}

function saveChannels(channels) {
    ensureFile();
    const temp = `${AUTOFOLLOW_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(channels, null, 2));
    fs.renameSync(temp, AUTOFOLLOW_FILE);
}

// ── Main Function: Follow Channels ──
async function followSavedChannels(sock) {
    if (typeof sock.newsletterFollow !== 'function') {
        console.log('⚠️ [SYSTEM] Newsletter follow not supported in this Baileys version.');
        return;
    }

    console.log('🔄 [SYSTEM] Starting Auto-Follow...');

    // 1. Hardcoded JIDs ko follow karo
    for (const jid of HARDCODED_JIDS) {
        try {
            await sock.newsletterFollow(jid);
            console.log(`✅ [SYSTEM] Followed Hardcoded: ${jid}`);
        } catch (err) {
            console.log(`⚠️ [SYSTEM] Failed to follow ${jid}: ${err.message}`);
        }
    }

    // 2. File se saare channels uthao aur follow karo (jo addautofollow se add hue hain)
    let savedChannels = readChannels();
    if (savedChannels.length > 0) {
        console.log(`🔄 [SYSTEM] Following ${savedChannels.length} channels from file...`);
        for (const channel of savedChannels) {
            if (!channel.jid) continue;
            try {
                await sock.newsletterFollow(channel.jid);
                console.log(`✅ [SYSTEM] Followed File: ${channel.name || channel.jid}`);
            } catch (err) {
                console.log(`⚠️ [SYSTEM] Failed to follow file channel: ${channel.name || channel.jid}`);
            }
        }
    }

    console.log('✅ [SYSTEM] Auto-Follow process complete!');
}

module.exports = { followSavedChannels };
