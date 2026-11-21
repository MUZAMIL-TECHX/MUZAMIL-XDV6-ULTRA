const settings = {
  packname: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫',
  author: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫',
  botName: "𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫",
  botOwner: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫', // Your name
  ownerNumber: process.env.OWNER_NUMBER || '923130122643', // Country code + number, without + or spaces
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "public",
  maxStoreMessages: 20, 
  storeWriteInterval: 10000,
  description: "𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗕𝘆 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫",
  version: "3.0.7",
  // 👁️ No-prefix view-once triggers: owner replies with one of these words to a
  // view-once photo/video/voice note and it is sent to the bot's own chat.
  // (Extra keywords can also be added with .vv add <word>)
  VV_TRIGGERS: ['vv', 'wah'],
  updateZipUrl: "https://github.com/MUZAMIL-TECHX/rubabmuzamil",
};

module.exports = settings;
