import fs from 'fs';
import https from 'https';
import express from 'express'; // if you're using Express — adjust if not
import pg from 'pg'; 
import CryptoJS from 'crypto-js';

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
    note VARCHAR(100),
    order_details JSONB,
    stock_reserved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log("Database table 'orders' is ready."))
  .catch(err => console.error("Error creating table:", err));
pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS note VARCHAR(100);`)
  .catch(err => console.error("Error adding order note column:", err));
pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN DEFAULT FALSE;`)
  .catch(err => console.error("Error adding stock reservation column:", err));
pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_order_id VARCHAR(100) UNIQUE;`)
  .catch(err => console.error("Error adding Checkout order ID column:", err));
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
const TELEGRAM_CHAT_ID = "-5116779293";

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

function getOrderQuantities(orderDetails) {
  return Object.entries(orderDetails || {}).map(([productName, quantity]) => {
    const normalizedQuantity = Number(quantity);
    if (!Number.isSafeInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error(`Invalid quantity for product: ${productName}`);
    }
    return { productName, quantity: normalizedQuantity };
  });
}

async function adjustProductStock(client, orderDetails, direction) {
  const quantities = getOrderQuantities(orderDetails);
  const isIncrease = direction === 'increase';

  for (const { productName, quantity } of quantities) {
    const result = await client.query(
      `UPDATE products
       SET stock = stock ${isIncrease ? '+' : '-'} $1
       WHERE product_name = $2${isIncrease ? '' : ' AND stock >= $1'}
       RETURNING product_name`,
      [quantity, productName]
    );

    if (result.rowCount === 0) {
      const error = new Error(`Unable to ${direction} stock for product: ${productName}`);
      error.code = 'stock_unavailable';
      throw error;
    }
  }
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

async function sendCodOrderNotification(order) {
  const orderLines = Object.entries(order.order_details || {})
    .filter(([, quantity]) => Number.isFinite(Number(quantity)))
    .map(([name, quantity]) => `- ${escapeHtml(name)}: ${Number(quantity)}`)
    .join('\n');

  await sendTelegramMessage(
    [
      '📦 <b>Đơn hàng COD mới</b>',
      `Mã đơn: <code>${escapeHtml(order.order_code)}</code>`,
      `User ID: <code>${escapeHtml(order.user_id)}</code>`,
      `Số tiền: ${Number(order.amount).toLocaleString('vi-VN')}đ`,
      order.receiver_name ? `Tên người nhận hàng: ${escapeHtml(order.receiver_name)}` : null,
      order.phone_number ? `SĐT: ${escapeHtml(order.phone_number)}` : null,
      order.note ? `Ghi chú: ${escapeHtml(order.note)}` : null,
      order.shipping_address ? `Địa chỉ: ${escapeHtml(order.shipping_address)}` : null,
      orderLines ? `Chi tiết đơn hàng:\n${orderLines}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  );
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE order_code = $1 FOR UPDATE`,
      [order_code]
    );

    if (orderRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: false, error_code: 'order_not_found' });
    }

    const orderInfo = orderRes.rows[0];
    if (orderInfo.order_state === 'confirmed') {
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Already confirmed' });
    }
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
      await client.query('ROLLBACK');
      return res.json({ success: false, error_code: 'wrong_payment_amount' });
    }

    // Legacy pending orders were created before stock reservation was added.
    if (!orderInfo.stock_reserved) {
      await adjustProductStock(client, orderInfo.order_details, 'decrease');
    }

    const result = await client.query(
      `UPDATE orders
       SET order_state = 'confirmed', stock_reserved = TRUE
       WHERE order_code = $1
       RETURNING *`,
      [order_code]
    );
    await client.query('COMMIT');
    await updateZaloOrderStatus(orderInfo.checkout_order_id || order_code, 'bank', 1);

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
        order.note ? `Ghi chú: ${escapeHtml(order.note)}` : null,
        order.shipping_address ? `Địa chỉ: ${escapeHtml(order.shipping_address)}` : null,
        orderLines ? `Chi tiết đơn hàng:\n${orderLines}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );

    res.json({ success: true });
  } catch (dbError) {
    await client.query('ROLLBACK');
    console.error('Failed to update order state in database:', dbError);
    if (dbError.code === 'stock_unavailable') {
      return res.json({ success: false, error_code: 'stock_unavailable' });
    }
    return res.json({ success: false, error_code: 'db_error' });
  } finally {
    client.release();
  }
});
// Add New Product endpoint
app.get('/add_product', async (req, res) => {
  const { name, price, originalPrice, stock, categoryId, image, detail } = req.query;

  if (!name || price === undefined) {
    return res.status(400).json({ success: false, error: 'Tên và giá sản phẩm là bắt buộc' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (product_name, discount_price, origin_price, stock, categoryid, image_src, detail, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING id`,
      [
        name,
        price || 0,
        originalPrice || price || 0,
        stock || 0,
        categoryId || null,
        image || '',
        detail || ''
      ]
    );

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Lỗi khi thêm sản phẩm:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
app.get('/order_cod', async (req, res) => {
  const {
    order_code,
    amount,
    shipping_address,
    receiver_name,
    phone_number,
    note,
    user_id,
    order,
    order_state,
  } = req.query;

  if (amount === undefined || !user_id || !order || order_state !== 'cod') {
    return res.json({ success: false, error_code: 'invalid_request' });
  }

  let orderBreakdown;
  try {
    orderBreakdown = JSON.parse(order);
  } catch (error) {
    return res.json({ success: false, error_code: 'invalid_order' });
  }

  if (!orderBreakdown || typeof orderBreakdown !== 'object' || Array.isArray(orderBreakdown)) {
    return res.json({ success: false, error_code: 'invalid_order' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [4488]);

    let targetOrderCode = order_code ? String(order_code) : null;
    if (!targetOrderCode) {
      const nextCodeResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(order_code FROM 3) AS BIGINT)), 0) + 1 AS next_number
        FROM orders
        WHERE order_code ~ '^TT[0-9]+$'
      `);
      targetOrderCode = `TT${String(nextCodeResult.rows[0].next_number).padStart(8, '0')}`;
    }

    const existingOrder = await client.query(
      'SELECT order_state FROM orders WHERE order_code = $1 FOR UPDATE',
      [targetOrderCode]
    );

    if (existingOrder.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.json({ success: false, error_code: 'order_not_available' });
    }

    await client.query(
      `INSERT INTO orders (order_code, order_state, user_id, amount, shipping_address, receiver_name, phone_number, note, order_details, stock_reserved)
       VALUES ($1, 'cod', $2, $3, $4, $5, $6, $7, $8, TRUE)`,
      [targetOrderCode, String(user_id), amount, shipping_address, receiver_name, phone_number, String(note ?? '').slice(0, 100), orderBreakdown]
    );
    await adjustProductStock(client, orderBreakdown, 'decrease');

    await client.query('COMMIT');
    await sendCodOrderNotification({
      order_code: targetOrderCode,
      user_id: String(user_id),
      amount,
      receiver_name,
      phone_number,
      note,
      shipping_address,
      order_details: orderBreakdown,
    });
    res.json({ success: true, order_code: targetOrderCode });
  } catch (dbError) {
    await client.query('ROLLBACK');
    console.error('Failed to save COD order to database:', dbError);
    if (dbError.code === 'stock_unavailable') {
      return res.status(409).json({ success: false, error_code: 'stock_unavailable' });
    }
    res.status(500).json({ success: false, error_code: 'db_error' });
  } finally {
    client.release();
  }
});
app.get('/order_paying', async (req, res) => {
  const {
    order_code,
    amount,
    shipping_address,
    receiver_name,
    phone_number,
    note,
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingOrder = await client.query(
      'SELECT order_state, stock_reserved FROM orders WHERE order_code = $1 FOR UPDATE',
      [String(order_code)]
    );

    if (existingOrder.rowCount === 0) {
      await client.query(
        `INSERT INTO orders (order_code, order_state, user_id, amount, shipping_address, receiver_name, phone_number, note, order_details, stock_reserved)
         VALUES ($1, 'waiting for payment', $2, $3, $4, $5, $6, $7, $8, TRUE)`,
        [order_code, user_id, amount, shipping_address, receiver_name, phone_number, String(note ?? '').slice(0, 100), orderBreakdown]
      );
      await adjustProductStock(client, orderBreakdown, 'decrease');
    } else if (existingOrder.rows[0].order_state === 'reserved') {
      await adjustProductStock(client, orderBreakdown, 'decrease');
      await client.query(
        `UPDATE orders
         SET order_state = 'waiting for payment', user_id = $2, amount = $3,
             shipping_address = $4, receiver_name = $5, phone_number = $6,
             note = $7, order_details = $8, stock_reserved = TRUE
         WHERE order_code = $1`,
        [order_code, user_id, amount, shipping_address, receiver_name, phone_number, String(note ?? '').slice(0, 100), orderBreakdown]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (dbError) {
    await client.query('ROLLBACK');
    console.error('Failed to save order to database:', dbError);
    if (dbError.code === 'stock_unavailable') {
      return res.status(409).json({ success: false, error_code: 'stock_unavailable' });
    }
    res.status(500).json({ success: false, error_code: 'db_error' });
  } finally {
    client.release();
  }
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

// Ensure 'is_hidden' column exists in products table
pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;`)
  .catch(err => console.error("Error adding is_hidden column:", err));

// Update existing /get_product_details query to include is_hidden
app.get('/get_product_details', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        categoryid AS "categoryId",
        product_name AS name,
        stock,
        discount_price AS price,
        origin_price AS "originalPrice",
        image_src AS image,
        detail,
        COALESCE(is_hidden, FALSE) AS "isHidden"
      FROM products
      ORDER BY id;
    `);

    return res.json(result.rows.map((product) => ({
      ...product,
      id: Number(product.id),
      categoryId: Number(product.categoryId),
      stock: Number(product.stock),
      price: Number(product.price),
      originalPrice: Number(product.originalPrice),
      isHidden: Boolean(product.isHidden)
    })));
  } catch (error) {
    console.error('Error get product details:', error);
    return res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Toggle Show / Hide Product endpoint
app.get('/toggle_product_visibility', async (req, res) => {
  const { id, is_hidden } = req.query;
  if (!id || is_hidden === undefined) {
    return res.status(400).json({ success: false, error: 'Missing id or is_hidden state' });
  }

  try {
    const hideBool = is_hidden === 'true';
    await pool.query(`UPDATE products SET is_hidden = $1 WHERE id = $2`, [hideBool, id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling product visibility:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Update Product Details endpoint
app.get('/update_product_details', async (req, res) => {
  const { id, name, price, originalPrice, stock, detail } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing product ID' });
  }

  try {
    await pool.query(
      `UPDATE products 
       SET product_name = COALESCE($1, product_name),
           discount_price = COALESCE($2, discount_price),
           origin_price = COALESCE($3, origin_price),
           stock = COALESCE($4, stock),
           detail = COALESCE($5, detail)
       WHERE id = $6`,
      [name, price, originalPrice, stock, detail, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating product details:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.post('/update_order_delivery', async (req, res) => {
  const {
    order_code,
    user_id,
    shipping_address,
    receiver_name,
    phone_number,
  } = req.body;

  if (!order_code || !user_id || !shipping_address || !receiver_name || !phone_number) {
    return res.status(400).json({ success: false, error: 'missing delivery information' });
  }

  try {
    const result = await pool.query(
      `UPDATE orders
       SET shipping_address = $3, receiver_name = $4, phone_number = $5
       WHERE order_code = $1 AND user_id = $2 AND order_state = 'waiting for payment'
       RETURNING order_code`,
      [
        String(order_code),
        String(user_id),
        String(shipping_address).slice(0, 500),
        String(receiver_name).slice(0, 255),
        String(phone_number).slice(0, 50),
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'order_not_found_or_not_pending' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order delivery:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// Ensure this key matches the one used in your /get_mac endpoint
const ZALO_PRIVATE_KEY = "02734bfb557f0a93d3b741a45292e16f";
const ZALO_APP_ID = "969578349712450924"; // Replace with your Mini App ID

async function updateZaloOrderStatus(orderId, method, resultCode = 1) {
  try {
    // Generate MAC for updateOrderStatus
    const dataStr = `appId=${ZALO_APP_ID}&orderId=${orderId}&resultCode=${resultCode}&privateKey=${ZALO_PRIVATE_KEY}`;
    const mac = CryptoJS.HmacSHA256(dataStr, ZALO_PRIVATE_KEY).toString();

    // Determine correct endpoint based on method
    const endpointType = method === 'cod' ? 'cod-callback-payment' : 'bank-callback-payment';
    const url = `https://payment-mini.zalo.me/api/transaction/${ZALO_APP_ID}/${endpointType}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: ZALO_APP_ID,
        orderId: String(orderId),
        resultCode: Number(resultCode),
        mac: mac
      })
    });
    const responseData = await response.json();
    if (!response.ok || (responseData.err ?? responseData.error) !== 0) {
      throw new Error(responseData.msg || `Zalo returned HTTP ${response.status}`);
    }
    console.log(`Updated Zalo order status for ${orderId}`);
    return true;
  } catch (err) {
    console.error(`Failed to update Zalo order status for ${orderId}:`, err);
    return false;
  }
}
app.post('/checkout_order_link', async (req, res) => {
  const { order_code, checkout_order_id, method } = req.body || {};
  if (!order_code || !checkout_order_id) {
    return res.status(400).json({ success: false, error: 'missing order identifiers' });
  }
  if (method !== undefined && !['BANK', 'COD'].includes(method)) {
    return res.status(400).json({ success: false, error: 'invalid payment method' });
  }

  try {
    const result = await pool.query(
      `WITH target AS (
         SELECT order_code, order_state
         FROM orders
         WHERE order_code = $1
           AND order_state IN ('reserved', 'waiting for payment', 'cod')
           AND (checkout_order_id IS NULL OR checkout_order_id = $2)
         FOR UPDATE
       ), updated AS (
         UPDATE orders AS order_row
         SET checkout_order_id = $2,
             order_state = CASE WHEN $3 = 'COD' THEN 'cod' ELSE order_row.order_state END
         FROM target
         WHERE order_row.order_code = target.order_code
         RETURNING order_row.*, target.order_state AS previous_order_state
       )
       SELECT * FROM updated`,
      [String(order_code), String(checkout_order_id), method ?? null]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ success: false, error: 'order_not_available' });
    }
    const linkedOrder = result.rows[0];
    if (method === 'COD' && linkedOrder.previous_order_state !== 'cod') {
      await sendCodOrderNotification(linkedOrder);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to link Checkout order:', error);
    res.status(500).json({ success: false, error: 'database_error' });
  }
});
// --- Zalo Checkout SDK Webhook: COD ---
app.post('/cod', async (req, res) => {
  
  try {
    const { data, mac } = req.body || {};
    if (!data || !mac) {
      return res.json({ returnCode: 0, returnMessage: 'Missing payload' });
    }

    const { appId, orderId, method } = data;
    
    // 1. Zalo MAC generation logic for Checkout SDK notify webhook
    const dataStr = `appId=${appId}&orderId=${orderId}&method=${method}`;
    const generatedMac = CryptoJS.HmacSHA256(dataStr, ZALO_PRIVATE_KEY).toString();

    // 2. Validate MAC to ensure request is genuinely from Zalo
    if (appId !== ZALO_APP_ID || method !== 'COD' || generatedMac !== mac) {
      return res.json({ returnCode: 0, returnMessage: 'Mac validation failed' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderRes = await client.query(
        `SELECT * FROM orders WHERE checkout_order_id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.json({ returnCode: 0, returnMessage: 'Order not found' });
      }
      await client.query(
        `UPDATE orders SET order_state = 'cod' WHERE order_code = $1`,
        [orderRes.rows[0].order_code]
      );
      await client.query('COMMIT');
      if (orderRes.rows[0].order_state !== 'cod') {
        await sendCodOrderNotification(orderRes.rows[0]);
      }
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

    // 4. Return exact success payload required by Zalo
    return res.json({ returnCode: 1, returnMessage: 'success' });
  } catch (error) {
    console.error('Error in /cod webhook:', error);
    return res.json({ returnCode: 0, returnMessage: 'Server error' });
  }
});


// --- Zalo Checkout SDK Webhook: BANK ---
app.post('/bank', async (req, res) => {
  try {
    const { data, mac } = req.body || {};
    if (!data || !mac) {
      return res.json({ returnCode: 0, returnMessage: 'Missing payload' });
    }

    const { appId, orderId, method } = data;
    
    // 1. Zalo MAC generation logic for Checkout SDK notify webhook
    const dataStr = `appId=${appId}&orderId=${orderId}&method=${method}`;
    const generatedMac = CryptoJS.HmacSHA256(dataStr, ZALO_PRIVATE_KEY).toString();

    // 2. Validate MAC
    if (appId !== ZALO_APP_ID || method !== 'BANK' || generatedMac !== mac) {
      return res.json({ returnCode: 0, returnMessage: 'Mac validation failed' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderRes = await client.query(
        `SELECT order_code, order_state FROM orders WHERE checkout_order_id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.json({ returnCode: 0, returnMessage: 'Order not found' });
      }
      await client.query(
        `UPDATE orders SET order_state = 'waiting for payment' WHERE order_code = $1`,
        [orderRes.rows[0].order_code]
      );
      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

    // 4. Return exact success payload required by Zalo
    return res.json({ returnCode: 1, returnMessage: 'success' });
  } catch (error) {
    console.error('Error in /bank webhook:', error);
    return res.json({ returnCode: 0, returnMessage: 'Server error' });
  }
});
app.get('/get_mac', async (req, res) => {
  const { body } = req.query;

  if (!body) {
    return res.status(400).json({ success: false, error: 'Missing body parameter' });
  }

  // Ensure you paste your actual private key from the Zalo platform here
  
  try {
    // 1. Parse the stringified payload sent from the frontend back into an object
    const params = JSON.parse(body);

    // 2. Sort keys and construct the dataMac string exactly as Zalo requires
    const dataMac = Object.keys(params)
      .sort() // Sort keys alphabetically
      .map(
        (key) =>
          `${key}=${
            typeof params[key] === "object"
              ? JSON.stringify(params[key])
              : params[key]
          }`
      ) // Format as "key=value" (stringifying nested objects/arrays like 'item')
      .join("&"); // Join with "&"

    console.log(`String to hash: ${dataMac}`);

    // 3. Generate the MAC using HmacSHA256
    const mac = CryptoJS.HmacSHA256(
      dataMac,
      ZALO_PRIVATE_KEY
    ).toString();
    
    console.log(`Generated Mac: ${mac}`);
    
    // Serve the MAC back to the frontend as a JSON response
    res.json({ success: true, mac: mac });
  } catch (e) {
    console.error('Error generating MAC:', e);
    res.status(500).json({ success: false, error: 'Failed to generate MAC' });
  }
});

app.get('/delete_order', async (req, res) => {
  const { order_code, user_id } = req.query;

  if (!order_code) {
    return res.status(400).json({ success: false, error: 'missing order_code' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build query depending on whether user_id is passed (admin vs client)
    const selectQuery = user_id
      ? `SELECT * FROM orders
         WHERE order_code = $1 AND user_id = $2 AND order_state IN ('waiting for payment', 'cod')
         FOR UPDATE`
      : `SELECT * FROM orders
         WHERE order_code = $1 AND order_state IN ('waiting for payment', 'cod')
         FOR UPDATE`;
    
    const params = user_id ? [String(order_code), String(user_id)] : [String(order_code)];
    const orderResult = await client.query(selectQuery, params);

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'order_not_found_or_not_pending' });
    }

    // Restore reserved stock if item was reserved
    if (orderResult.rows[0].stock_reserved) {
      await adjustProductStock(client, orderResult.rows[0].order_details, 'increase');
    }

    const deleteQuery = user_id
      ? `DELETE FROM orders
         WHERE order_code = $1 AND user_id = $2 AND order_state IN ('waiting for payment', 'cod')`
      : `DELETE FROM orders
         WHERE order_code = $1 AND order_state IN ('waiting for payment', 'cod')`;

    await client.query(deleteQuery, params);
    await client.query('COMMIT');

    const deletedOrder = orderResult.rows[0];
    const orderLines = Object.entries(deletedOrder.order_details || {})
      .filter(([, quantity]) => Number.isFinite(Number(quantity)))
      .map(([name, quantity]) => `- ${escapeHtml(name)}: ${Number(quantity)}`)
      .join('\n');
    await sendTelegramMessage(
      [
        '❌ <b>Đơn hàng đã bị hủy</b>',
        `Mã đơn: <code>${escapeHtml(deletedOrder.order_code)}</code>`,
        `User ID: <code>${escapeHtml(deletedOrder.user_id)}</code>`,
        `Trạng thái trước khi hủy: ${escapeHtml(deletedOrder.order_state)}`,
        `Số tiền: ${Number(deletedOrder.amount).toLocaleString('vi-VN')}đ`,
        deletedOrder.receiver_name ? `Tên người nhận hàng: ${escapeHtml(deletedOrder.receiver_name)}` : null,
        deletedOrder.phone_number ? `SĐT: ${escapeHtml(deletedOrder.phone_number)}` : null,
        deletedOrder.shipping_address ? `Địa chỉ: ${escapeHtml(deletedOrder.shipping_address)}` : null,
        deletedOrder.note ? `Ghi chú: ${escapeHtml(deletedOrder.note)}` : null,
        orderLines ? `Chi tiết đơn hàng:\n${orderLines}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting order:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    client.release();
  }
});

app.get('/get_phone_num', async (req, res) => {
  const { access_token, code } = req.query;
  const endpoint = 'https://graph.zalo.me/v2.0/me/info';
  const secretKey = "z4ifCKL9X5TXWNg050XB";
  if (!secretKey) {
    return res.status(500).json({ success: false, error: 'missing_zalo_app_secret' });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        access_token: String(access_token ?? ''),
        code: String(code ?? ''),
        secret_key: secretKey,
      },
    });

    const data = await response.json();
    console.log('Response Code:', response.status);
    console.log('Response Body:', data);

    return res.json({ success: response.ok, data });
  } catch (error) {
    console.error('Error fetching Zalo phone info:', error);
    return res.status(500).json({ success: false, error: 'failed_to_fetch_phone_number' });
  }
});

const options = {
  key: fs.readFileSync('/app/letsencrypt/live/cmnes.com/privkey.pem'),
  cert: fs.readFileSync('/app/letsencrypt/live/cmnes.com/fullchain.pem'),
};

async function cleanupExpiredPendingOrders() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and retrieve all pending orders older than 24 hours
    const expiredOrdersResult = await client.query(`
      SELECT order_code, order_details, stock_reserved
      FROM orders
      WHERE order_state = 'waiting for payment'
        AND created_at < NOW() - INTERVAL '30 SECONDS'
      FOR UPDATE
    `);

    if (expiredOrdersResult.rowCount > 0) {
      // 2. Restore stock for each expired order (if stock was reserved)
      for (const order of expiredOrdersResult.rows) {
        if (order.stock_reserved && order.order_details && Object.keys(order.order_details).length > 0) {
          try {
            await adjustProductStock(client, order.order_details, 'increase');
          } catch (stockErr) {
            console.warn(`Failed to restore stock for expired order ${order.order_code}:`, stockErr.message);
          }
        }
      }

      // 3. Delete the expired orders
      const deleteResult = await client.query(`
        DELETE FROM orders
        WHERE order_code = ANY($1::varchar[])
      `, [expiredOrdersResult.rows.map(o => o.order_code)]);

      await client.query('COMMIT');
      console.log(`[Auto-Cleanup] Deleted ${deleteResult.rowCount} expired pending order(s).`);
    } else {
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Auto-Cleanup] Error cleaning up expired orders:', err);
  } finally {
    client.release();
  }
}

// Run cleanup immediately on startup, then every 15 minutes (900,000 ms)
cleanupExpiredPendingOrders();
setInterval(cleanupExpiredPendingOrders, 15 * 60 * 1000);

https.createServer(options, app).listen(4488, () => {
  console.log('HTTPS server listening on 4488');
});

// --- GET ORDERS BY STATE ---
app.get('/get_order_by_state', async (req, res) => {
  const { order_state } = req.query;

  if (!order_state) {
    return res.status(400).json({ success: false, error: 'missing order_state' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE order_state = $1 ORDER BY created_at DESC',
      [order_state]
    );
    res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Error fetching orders by state:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// --- COMPLETE ORDER ---
app.get('/complete_order', async (req, res) => {
  const { order_code } = req.query;

  if (!order_code) {
    return res.status(400).json({ success: false, error: 'missing order_code' });
  }

  try {
    const result = await pool.query(
      `WITH target AS (
         SELECT order_code, order_state
         FROM orders
         WHERE order_code = $1 AND order_state IN ('confirmed', 'cod')
         FOR UPDATE
       ), updated AS (
         UPDATE orders AS order_row
         SET order_state = 'completed', stock_reserved = FALSE
         FROM target
         WHERE order_row.order_code = target.order_code
         RETURNING target.order_state AS previous_state, order_row.checkout_order_id
       )
       SELECT previous_state, checkout_order_id FROM updated`,
      [order_code]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'order_not_found' });
    }
    if (result.rows[0].previous_state === 'cod') {
       await updateZaloOrderStatus(result.rows[0].checkout_order_id || order_code, 'cod', 1);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});
// Restore reserved stock when a paid order cannot be delivered.
app.post('/fail_order_delivery', async (req, res) => {
  const { order_code } = req.body;

  if (!order_code) {
    return res.status(400).json({ success: false, error: 'missing order_code' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT order_details, stock_reserved, checkout_order_id
       FROM orders
       WHERE order_code = $1 AND order_state = 'confirmed'
       FOR UPDATE`,
      [String(order_code)]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'order_not_found_or_not_confirmed' });
    }

    if (orderResult.rows[0].stock_reserved) {
      await adjustProductStock(client, orderResult.rows[0].order_details, 'increase');
    }

    await client.query(
      `UPDATE orders
       SET order_state = 'delivery failed', stock_reserved = FALSE
       WHERE order_code = $1`,
      [String(order_code)]
    );
    await client.query('COMMIT');
    await updateZaloOrderStatus(
      orderResult.rows[0].checkout_order_id || order_code,
      'bank',
      -1
    );
    
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error failing order delivery:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    client.release();
  }
});
