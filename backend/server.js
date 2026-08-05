require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req,res) => res.json({ ok: true }));

// 範例：簡單的登入 stub（實務中請用 bcrypt 與 DB）
app.post('/auth/login', (req,res) => {
  const { username } = req.body;
  if(!username) return res.status(400).json({ error: 'missing username' });
  // 回傳假 token（實作時用 JWT）
  res.json({ token: 'demo-token', user: { username } });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
