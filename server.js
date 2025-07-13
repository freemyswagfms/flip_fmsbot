const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = 'YOUR_BOT_TOKEN';
const CHANNEL_USERNAME = '@yourchannel'; // без t.me/ — именно username канала

app.post('/check-subscription', async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'No userId provided' });

  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
      params: {
        chat_id: CHANNEL_USERNAME,
        user_id: userId
      }
    });

    const status = response.data.result.status;

    // Подписан, если он member, administrator или creator
    const isSubscribed = ['member', 'administrator', 'creator'].includes(status);
    res.json({ subscribed: isSubscribed });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка при проверке подписки' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
