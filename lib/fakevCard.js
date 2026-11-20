// Fake vCard quote (ported from Mishu-MD) — used for elegant quoted replies
module.exports = {
    fakevCard: {
        key: {
            fromMe: false,
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast"
        },
        message: {
            contactMessage: {
                displayName: "© 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫",
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Meta\nORG:META AI;\nTEL;type=CELL;type=VOICE;waid=923130122643:+923130122643\nEND:VCARD`
            }
        }
    }
};
