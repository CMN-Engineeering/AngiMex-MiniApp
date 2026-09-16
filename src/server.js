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

function normalizePaymentAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  const numericValue = Number(text);
  if (Number.isFinite(numericValue)) return numericValue;

  const digitsOnly = text.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  return Number(digitsOnly);
}

app.get('/new_order_code', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.json({ success: false, error_code: 'invalid_request' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [4488]);

    const result = await client.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(order_code FROM 3) AS BIGINT)), 0) + 1 AS next_number
      FROM orders
      WHERE order_code ~ '^TT[0-9]+$'
    `);
    const orderCode = `TT${String(result.rows[0].next_number).padStart(8, '0')}`;

    await client.query(
      `INSERT INTO orders (order_code, order_state, user_id, amount)
       VALUES ($1, 'reserved', $2, 0)`,
      [orderCode, String(user_id)]
    );
    await client.query('COMMIT');

    res.json({ success: true, order_code: orderCode });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reserve order code:', error);
    res.status(500).json({ success: false, error_code: 'db_error' });
  } finally {
    client.release();
  }
});

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
  const code = String(req.body.code ?? req.body.order_code ?? '').trim();
  const transferAmount = normalizePaymentAmount(
    req.body.transferAmount ?? req.body.transfer_amount ?? req.body.amount
  );

  if (!code || transferAmount === null) {
    return res.status(400).json({ success: false, error_code: 'invalid_request' });
  }

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
    const expectedAmount = normalizePaymentAmount(orderInfo.amount);
    const transferAmount = normalizePaymentAmount(paymentsByCode.get(order_code));

    // 3. Verify payment amount
    if (
      expectedAmount === null ||
      transferAmount === null ||
      expectedAmount !== transferAmount
    ) {
      console.warn('Payment amount mismatch:', {
        orderCode: order_code,
        expectedAmount,
        transferAmount,
      });
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
    const updateResult = await pool.query(
      `UPDATE orders
       SET order_state = 'waiting for payment', user_id = $2, amount = $3,
           shipping_address = $4, receiver_name = $5, phone_number = $6,
           order_details = $7
       WHERE order_code = $1 AND order_state = 'reserved'`,
      [order_code, user_id, amount, shipping_address, receiver_name, phone_number, orderBreakdown]
    );

    if (updateResult.rowCount === 0) {
      // Keep compatibility with clients that have not reserved a code yet.
      await pool.query(
        `INSERT INTO orders (order_code, order_state, user_id, amount, shipping_address, receiver_name, phone_number, order_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (order_code) DO NOTHING`,
        [order_code, 'waiting for payment', user_id, amount, shipping_address, receiver_name, phone_number, orderBreakdown]
      );
    }
  } catch (dbError) {
    console.error('Failed to save order to database:', dbError);
  }

  res.json({ success: true });
});

app.get('/download_qr', async (req, res) => {
  const { amount, order_code } = req.query;

  if (!amount || !order_code) {
    return res.status(400).json({ success: false, error: 'missing amount or order_code' });
  }

  try {
    const qrUrl = new URL('https://vietqr.app/img');
    qrUrl.searchParams.set('acc', '0766992331');
    qrUrl.searchParams.set('bank', 'MBBank');
    qrUrl.searchParams.set('amount', String(amount));
    qrUrl.searchParams.set('des', `Thanh toan don hang ${order_code}`);
    qrUrl.searchParams.set('template', 'compact');

    const response = await fetch(qrUrl);
    if (!response.ok) {
      return res.status(502).json({ success: false, error: 'qr_provider_failed' });
    }

    const image = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', response.headers.get('content-type') || 'image/png');
    res.set('Content-Disposition', `attachment; filename="ma-qr-${String(order_code).replace(/[^a-zA-Z0-9_-]/g, '_')}.png"`);
    res.send(image);
  } catch (error) {
    console.error('Error downloading QR:', error);
    res.status(502).json({ success: false, error: 'qr_download_failed' });
  }
});

// --- NEW ENDPOINT: GET ORDERS BY USER ID ---
app.get('/get_orders_by_user_id', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ success: false, error: 'missing user_id' });
  }

  try {
    const legacyDemoUserIds = ['DEMO_ID', 'unknown', 'undefined'];
    const userIds = legacyDemoUserIds.includes(String(user_id))
      ? legacyDemoUserIds
      : [String(user_id)];
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id = ANY($1::text[]) ORDER BY created_at DESC',
      [userIds]
    );
    res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/delete_order', async (req, res) => {
  const { order_code, user_id } = req.query;

  if (!order_code || !user_id) {
    return res.status(400).json({ success: false, error: 'missing order_code or user_id' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM orders
       WHERE order_code = $1 AND user_id = $2 AND order_state = 'waiting for payment'
       RETURNING order_code`,
      [String(order_code), String(user_id)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'order_not_found_or_not_pending' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
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
