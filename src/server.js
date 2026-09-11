import fs from 'fs';
import https from 'https';
import express from 'express'; // if you're using Express — adjust if not
import pg from 'pg'; 

const { Pool } = pg;
const pool = new Pool({
  user: 'admin',
  host: '172.17.0.1',
  database: 'orders_db',
  password: 'secretpassword',
  port: 5432,
});
pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    order_code VARCHAR(100) PRIMARY KEY,
    order_state VARCHAR(50) DEFAULT 'none',
    user_id VARCHAR(100) NOT NULL,
    amount NUMERIC NOT NULL,
    shipping_address TEXT,
    receiver_name VARCHAR(255),
    phone_number VARCHAR(50),
    order_details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log("Database table 'orders' is ready."))
  .catch(err => console.error("Error creating table:", err));
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
  const { order_code } = req.query;

  if (!order_code) {
    return res.json({ success: false, error_code: 'invalid_request' });
  }

  // 1. Check if payment has been received via webhooks
  if (!paymentsByCode.has(order_code)) {
    return res.json({ success: false, error_code: 'order_not_found' });
  }

  try {
    // 2. Get order details to verify amount
    const orderRes = await pool.query(
      `SELECT * FROM orders WHERE order_code = $1`,
      [order_code]
    );

    if (orderRes.rowCount === 0) {
      return res.json({ success: false, error_code: 'order_not_found' });
    }

    const orderInfo = orderRes.rows[0];
    const transferAmount = paymentsByCode.get(order_code);

    // 3. Verify payment amount
    if (Number(orderInfo.amount) !== Number(transferAmount)) {
      return res.json({ success: false, error_code: 'wrong_payment_amount' });
    }

    // 4. Update the row only if it was NOT already confirmed
    const result = await pool.query(
      `UPDATE orders SET order_state = 'confirmed' WHERE order_code = $1 AND order_state != 'confirmed' RETURNING *`,
      [order_code]
    );

    if (result.rowCount === 0) {
      return res.json({ success: true, message: 'Already confirmed' });
    }

    const order = result.rows[0];
    const orderLines = Object.entries(order.order_details || {})
      .filter(([, qty]) => Number.isFinite(Number(qty)))
      .map(([type, qty]) => `- ${escapeHtml(type)}: ${Number(qty)}`)
      .join('\n');

    await sendTelegramMessage(
      [
        '✅ <b>Đơn hàng đã thanh toán</b>',
        `Mã đơn: <code>${escapeHtml(order.order_code)}</code>`,
        `User ID: <code>${escapeHtml(order.user_id)}</code>`,
        `Số tiền: ${Number(order.amount).toLocaleString('vi-VN')}đ`,
        order.receiver_name ? `Tên người nhận hàng: ${escapeHtml(order.receiver_name)}` : null,
        order.phone_number ? `SĐT: ${escapeHtml(order.phone_number)}` : null,
        order.shipping_address ? `Địa chỉ: ${escapeHtml(order.shipping_address)}` : null,
        orderLines ? `Chi tiết đơn hàng:\n${orderLines}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );

    res.json({ success: true });
  } catch (dbError) {
    console.error('Failed to update order state in database:', dbError);
    return res.json({ success: false, error_code: 'db_error' });
  }
});

app.get('/order_paying', async (req, res) => {
  const {
    order_code,
    amount,
    shipping_address,
    receiver_name,
    phone_number,
    user_id,
    order,
  } = req.query;
  console.log(`Order ${order_code} setting to Wait for Paying`)
  
  if (!order_code || amount === undefined) {
    return res.json({ success: false, error_code: 'invalid_request' });
  }

  let orderBreakdown = {};
  if (order) {
    try {
      orderBreakdown = JSON.parse(order);
    } catch (error) {
      console.warn('Failed to parse order breakdown:', error);
    }
  }

  try {
    // Only insert into DB. Duplicate clicks are ignored due to ON CONFLICT
    await pool.query(
      `INSERT INTO orders (order_code, order_state, user_id, amount, shipping_address, receiver_name, phone_number, order_details) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (order_code) DO NOTHING`,
      [order_code, 'waiting for payment', user_id, amount, shipping_address, receiver_name, phone_number, orderBreakdown]
    );
  } catch (dbError) {
    console.error('Failed to save order to database:', dbError);
  }

  res.json({ success: true });
});

// --- NEW ENDPOINT: GET ORDERS BY USER ID ---
app.get('/get_orders_by_user_id', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ success: false, error: 'missing user_id' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1',
      [user_id]
    );
    res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

const options = {
  key: fs.readFileSync('/app/letsencrypt/live/cmnes.com/privkey.pem'),
  cert: fs.readFileSync('/app/letsencrypt/live/cmnes.com/fullchain.pem'),
};

https.createServer(options, app).listen(4488, () => {
  console.log('HTTPS server listening on 4488');
});
