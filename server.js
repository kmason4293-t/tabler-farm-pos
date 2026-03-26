// ════════════════════════════════════════════════
//  Tabler Farm — POS Backend Server
//  Node.js + Express + Stripe
// ════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');
const LOG_FILE   = path.join(__dirname, 'cash-sales.log');
const SHIFT_FILE = path.join(__dirname, 'shifts.log');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// Serve the POS HTML file at the root URL
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════
//  SERVER-DRIVEN INTEGRATION
//  No JS SDK on the client. The S710 talks directly
//  to Stripe over the internet. We just send commands.
// ════════════════════════════════════════════════

//  1. VERIFY READER — confirm reader ID is valid
app.post('/stripe/verify-reader', async (req, res) => {
  try {
    const { reader_id } = req.body;
    if (!reader_id || !reader_id.startsWith('tmr_')) {
      return res.status(400).json({ error: 'Invalid reader ID' });
    }
    const reader = await stripe.terminal.readers.retrieve(reader_id);
    res.json({ ok: true, label: reader.label, status: reader.status });
  } catch (err) {
    console.error('Verify reader error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

//  2. CREATE PAYMENT INTENT
app.post('/stripe/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', feeAmount = 0, items = [] } = req.body;
    if (!amount || amount < 50) {
      return res.status(400).json({ error: 'Amount must be at least $0.50' });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: {
        source:     'Tabler Farm POS',
        fee_amount: String(feeAmount),
        items:      JSON.stringify(items.slice(0, 10)),
      },
    });
    res.json({ payment_intent_id: paymentIntent.id });
  } catch (err) {
    console.error('Create PaymentIntent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

//  3. COLLECT PAYMENT — send PaymentIntent to reader
app.post('/stripe/collect-payment', async (req, res) => {
  try {
    const { reader_id, payment_intent_id } = req.body;
    if (!reader_id || !payment_intent_id) {
      return res.status(400).json({ error: 'reader_id and payment_intent_id required' });
    }
    const action = await stripe.terminal.readers.processPaymentIntent(reader_id, {
      payment_intent: payment_intent_id,
    });
    res.json({ ok: true, status: action.action?.status });
  } catch (err) {
    console.error('Collect payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

//  4. CANCEL PAYMENT — cancel any in-progress reader action
app.post('/stripe/cancel-payment', async (req, res) => {
  try {
    const { reader_id } = req.body;
    if (!reader_id) return res.status(400).json({ error: 'reader_id required' });
    await stripe.terminal.readers.cancelAction(reader_id);
    res.json({ ok: true });
  } catch (err) {
    // Not an error if nothing was in progress
    res.json({ ok: true, note: err.message });
  }
});

// ════════════════════════════════════════════════
//  3. LOOK UP PAYMENT INTENT
//  Used by the Refunds tab to find a charge.
// ════════════════════════════════════════════════
app.get('/stripe/payment-intent', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id || !id.startsWith('pi_')) {
      return res.status(400).json({ error: 'Invalid payment intent ID' });
    }
    const pi = await stripe.paymentIntents.retrieve(id);
    res.json(pi);
  } catch (err) {
    console.error('Lookup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  4. PROCESS REFUND
//  Issues a full refund for a payment intent.
//  To do a PARTIAL refund, add an "amount" field
//  to the request body (in cents).
// ════════════════════════════════════════════════
app.post('/stripe/refund', async (req, res) => {
  try {
    const { payment_intent, amount } = req.body;
    if (!payment_intent) {
      return res.status(400).json({ error: 'payment_intent is required' });
    }

    const refundParams = { payment_intent };
    if (amount) refundParams.amount = amount; // partial refund if specified

    const refund = await stripe.refunds.create(refundParams);
    res.json({ id: refund.id, status: refund.status, amount: refund.amount });
  } catch (err) {
    console.error('Refund error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  5. LIST RECENT PAYMENTS (bonus — for records)
// ════════════════════════════════════════════════
app.get('/stripe/payments', async (req, res) => {
  try {
    const charges = await stripe.paymentIntents.list({ limit: 50 });
    res.json(charges.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
//  CASH SALE LOG
//  Appends each cash sale to cash-sales.log
//  Read the log at /log/cash-sales
// ════════════════════════════════════════════════
app.post('/log/cash-sale', (req, res) => {
  try {
    const { student, items, total, tendered, change, type, time } = req.body;
    const line = JSON.stringify({
      time:     time || new Date().toISOString(),
      student:  student || 'Unknown',
      type:     type || 'cash',
      items:    items || '',
      total:    parseFloat(total   || 0).toFixed(2),
      tendered: parseFloat(tendered|| 0).toFixed(2),
      change:   parseFloat(change  || 0).toFixed(2),
    }) + '\n';
    fs.appendFileSync(LOG_FILE, line);
    res.json({ ok: true });
  } catch (err) {
    console.error('Log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// View the log as plain text (open in browser or curl)
app.get('/log/cash-sales', (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return res.send('No cash sales logged yet.');
    }
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return res.send('No cash sales logged yet.');

    // Format as a readable table
    const rows = lines.map(l => JSON.parse(l));
    const total = rows.reduce((s, r) => s + parseFloat(r.total), 0);
    let out = '=== Tabler Farm — Cash Sales Log ===\n\n';
    rows.forEach((r, i) => {
      out += `#${i+1}  ${r.time}\n`;
      out += `    Student : ${r.student}\n`;
      out += `    Items   : ${r.items}\n`;
      out += `    Total   : $${r.total}  |  Tendered: $${r.tendered}  |  Change: $${r.change}\n\n`;
    });
    out += `─────────────────────────────\n`;
    out += `Total cash taken: $${total.toFixed(2)} across ${rows.length} sale(s)\n`;
    res.type('text/plain').send(out);
  } catch (err) {
    res.status(500).send('Error reading log: ' + err.message);
  }
});

// ════════════════════════════════════════════════
//  SHIFT LOG
//  Records who opened/closed the market and when.
//  View at /log/shifts
// ════════════════════════════════════════════════
app.post('/log/shift', (req, res) => {
  try {
    const { student, event, start, end } = req.body;
    const line = JSON.stringify({
      student: student || 'Unknown',
      event,
      start: start || null,
      end:   end   || null,
      logged: new Date().toISOString(),
    }) + '\n';
    fs.appendFileSync(SHIFT_FILE, line);
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/log/shifts', (req, res) => {
  try {
    if (!fs.existsSync(SHIFT_FILE)) return res.send('No shifts logged yet.');
    const lines = fs.readFileSync(SHIFT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return res.send('No shifts logged yet.');
    const rows = lines.map(l => JSON.parse(l));
    let out = '=== Tabler Farm — Shift Log ===\n\n';
    rows.forEach(r => {
      const start = r.start ? new Date(r.start).toLocaleString() : '—';
      const end   = r.end   ? new Date(r.end).toLocaleString()   : '—';
      if (r.event === 'open') {
        out += `OPEN   ${start.padEnd(28)} ${r.student}\n`;
      } else if (r.event === 'close') {
        // Calculate duration if both times exist
        let dur = '';
        if (r.start && r.end) {
          const mins = Math.round((new Date(r.end) - new Date(r.start)) / 60000);
          dur = ` (${mins} min)`;
        }
        out += `CLOSE  ${end.padEnd(28)} ${r.student}${dur}\n\n`;
      }
    });
    res.type('text/plain').send(out);
  } catch(err) {
    res.status(500).send('Error reading log: ' + err.message);
  }
});

// ════════════════════════════════════════════════
//  EXCEL REPORT
//  POST /report/excel
//  Builds and streams a .xlsx with two sheets:
//    1. Transactions — every sale in order
//    2. Summary — items sold + totals by type
// ════════════════════════════════════════════════
app.post('/report/excel', (req, res) => {
  try {
    const { student, date, cardSales = [], cashSales = [] } = req.body;
    const wb = XLSX.utils.book_new();

    // ── helper: currency format ──
    const fmt = (n) => parseFloat((n||0).toFixed(2));

    // ── SHEET 1: Transactions ──────────────────────
    const txnRows = [
      ['Time', 'Type', 'Student', 'Items', 'Subtotal', 'Fee/Change', 'Total', 'Payment ID'],
    ];

    cardSales.forEach(t => {
      const itemStr = Array.isArray(t.items)
        ? t.items.map(i => `${i.qty}x ${i.name}`).join(', ')
        : (t.itemStr || '');
      txnRows.push([
        new Date(t.time).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'}),
        'Card',
        t.student || '',
        itemStr,
        fmt(t.total),
        '',
        fmt(t.total),
        t.paymentIntentId || '',
      ]);
    });

    cashSales.forEach(t => {
      const itemStr = typeof t.items === 'string' ? t.items : (t.itemStr || '');
      txnRows.push([
        new Date(t.time).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'}),
        'Cash',
        t.student || '',
        itemStr,
        fmt(t.total),
        `Change: $${fmt(t.change)}`,
        fmt(t.total),
        '',
      ]);
    });

    // totals row
    const cardTotal = cardSales.reduce((s, t) => s + (t.total||0), 0);
    const cashTotal = cashSales.reduce((s, t) => s + (t.total||0), 0);
    txnRows.push([]);
    txnRows.push(['', '', '', 'TOTALS', '', '', fmt(cardTotal + cashTotal), '']);

    const wsTxn = XLSX.utils.aoa_to_sheet(txnRows);

    // column widths
    wsTxn['!cols'] = [
      {wch:10}, {wch:6}, {wch:14}, {wch:40},
      {wch:10}, {wch:14}, {wch:10}, {wch:28},
    ];

    XLSX.utils.book_append_sheet(wb, wsTxn, 'Transactions');

    // ── SHEET 2: Item Summary ──────────────────────
    // Tally each item across all sales
    const itemMap = {};

    const tallyItems = (items, type) => {
      if (!Array.isArray(items)) return;
      items.forEach(i => {
        if (!i.name) return;
        if (!itemMap[i.name]) itemMap[i.name] = { name:i.name, qty:0, revenue:0, card:0, cash:0 };
        itemMap[i.name].qty     += parseInt(i.qty) || 1;
        itemMap[i.name].revenue += fmt((i.price||0) * (parseInt(i.qty)||1));
        itemMap[i.name][type]   += parseInt(i.qty) || 1;
      });
    };

    cardSales.forEach(t => tallyItems(t.items, 'card'));
    cashSales.forEach(t => {
      // parse string items for cash sales
      const raw = typeof t.items === 'string' ? t.items : (t.itemStr||'');
      const parsed = raw.split(', ').map(s => {
        const m = s.match(/^(\d+)x (.+)$/);
        return m ? { qty: parseInt(m[1]), name: m[2], price: 0 } : null;
      }).filter(Boolean);
      tallyItems(parsed, 'cash');
    });

    const summaryRows = [
      ['Item', 'Total sold', 'Via card', 'Via cash', 'Revenue'],
    ];

    Object.values(itemMap)
      .sort((a,b) => b.qty - a.qty)
      .forEach(i => summaryRows.push([i.name, i.qty, i.card, i.cash, fmt(i.revenue)]));

    summaryRows.push([]);
    summaryRows.push(['TOTALS',
      Object.values(itemMap).reduce((s,i) => s+i.qty, 0),
      cardSales.length + ' transactions',
      cashSales.length + ' transactions',
      fmt(cardTotal + cashTotal),
    ]);

    // market info block at bottom
    summaryRows.push([]);
    summaryRows.push(['Market', date || new Date().toDateString()]);
    summaryRows.push(['Student', student || '']);
    summaryRows.push(['Card total', fmt(cardTotal)]);
    summaryRows.push(['Cash total', fmt(cashTotal)]);
    summaryRows.push(['Grand total', fmt(cardTotal + cashTotal)]);

    const wsSumm = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSumm['!cols'] = [{wch:28},{wch:12},{wch:12},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, wsSumm, 'Summary');

    // Stream as .xlsx
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    const dateStr = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tabler-farm-${dateStr}.xlsx"`);
    res.send(buf);

  } catch(err) {
    console.error('Excel report error:', err.message);
    res.status(500).send('Failed to generate report: ' + err.message);
  }
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n🌿 Tabler Farm POS server running on http://localhost:${PORT}`);
  console.log(`   Open this URL in your browser to use the POS\n`);
});
