require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors()); // 🔐 если хочешь ограничить — укажи origin
app.use(express.json());

// Токен бота и ID канала
const BOT_TOKEN = process.env.BOT_TOKEN || '7810652179:AAGJyyA6I6FA2IgY1aTJy8SF2BnIENj6XKI';
const CHANNEL_ID = process.env.CHANNEL_ID || '-1002694715737'; // ⚠️ именно ID, не username

app.post('/check-subscription', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`;
    const response = await axios.get(telegramUrl, {
      params: {
        chat_id: CHANNEL_ID,
        user_id: userId
      }
    });

    const status = response.data.result.status;
    const subscribed = ['member', 'administrator', 'creator'].includes(status);

    res.json({ subscribed });
  } catch (error) {
    console.error('Ошибка при проверке подписки:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка при проверке подписки' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});
