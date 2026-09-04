import fs from 'fs';
import https from 'https';
import express from 'express'; // if you're using Express — adjust if not

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const paymentsByCode = new Map();

const TELEGRAM_BOT_TOKEN = "8860000011:AAGQVstc7vHo734tIQ35Ipb0Fa1hxGybEbc";
const TELEGRAM_CHAT_ID = "8426531789";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram bot not configured, skipping notification');
    return;
  }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
        }),
      }
    );
    if (!response.ok) {
      console.warn('Failed to send Telegram notification:', await response.text());
    }
  } catch (error) {
    console.warn('Failed to send Telegram notification:', error);
  }
}

app.post('/webhooks', (req, res) => {
  console.log(req.body);
  const { code, transferAmount } = req.body;
  paymentsByCode.set(code, transferAmount);
  res.json({ success: true });
});

app.get('/order_confirm', async (req, res) => {
  const {
    order_code,
    amount,
    shipping_address,
    receiver_name,
    phone_number,
    order,
  } = req.query;

  if (!order_code || amount === undefined) {
    return res.json({ success: false, error_code: 'invalid_request' });
  }

  if (!paymentsByCode.has(order_code)) {
    return res.json({ success: false, error_code: 'order_not_found' });
  }

  const transferAmount = paymentsByCode.get(order_code);
  if (Number(amount) !== Number(transferAmount)) {
    return res.json({ success: false, error_code: 'wrong_payment_amount' });
  }

  let orderBreakdown = {};
  if (order) {
    try {
      orderBreakdown = JSON.parse(order);
    } catch (error) {
      console.warn('Failed to parse order breakdown:', error);
    }
  }

  const orderLines = Object.entries(orderBreakdown)
    .filter(([, qty]) => Number.isFinite(Number(qty)))
    .map(([type, qty]) => `- ${escapeHtml(type)}: ${Number(qty)}`)
    .join('\n');

  await sendTelegramMessage(
    [
      '✅ <b>Đơn hàng đã thanh toán</b>',
      `Mã đơn: <code>${escapeHtml(order_code)}</code>`,
      `Số tiền: ${Number(amount).toLocaleString('vi-VN')}đ`,
      receiver_name ? `Người nhận: ${escapeHtml(receiver_name)}` : null,
      phone_number ? `SĐT: ${escapeHtml(phone_number)}` : null,
      shipping_address ? `Địa chỉ: ${escapeHtml(shipping_address)}` : null,
      orderLines ? `Chi tiết đơn hàng:\n${orderLines}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  );

  res.json({ success: true });
});

const options = {
  key: fs.readFileSync('/app/letsencrypt/live/cmnes.com/privkey.pem'),
  cert: fs.readFileSync('/app/letsencrypt/live/cmnes.com/fullchain.pem'),
};

https.createServer(options, app).listen(4488, () => {
  console.log('HTTPS server listening on 4488');
});
