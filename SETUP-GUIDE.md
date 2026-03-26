# Tabler Farm POS — Complete Setup Guide

Everything you need to go from zero to taking payments on Sunday.

---

## What you have

```
tabler-farm/
├── server.js          ← the backend (talks to Stripe securely)
├── package.json       ← lists the software dependencies
├── .env.example       ← template for your secret keys
└── public/
    └── index.html     ← the POS app (open this in a browser)
```

---

## STEP 1 — Install Node.js

Node.js is the engine that runs the server.

1. Go to https://nodejs.org
2. Download the **LTS** version (the green button)
3. Run the installer — click Next through everything
4. Open **Terminal** (Mac) or **Command Prompt** (Windows) and type:
   ```
   node --version
   ```
   You should see something like `v20.x.x`. If you do, Node is installed.

---

## STEP 2 — Put the project on your computer

1. Move the `tabler-farm` folder somewhere easy to find, like your Desktop
2. Open Terminal / Command Prompt
3. Navigate to the folder:
   ```
   cd Desktop/tabler-farm
   ```
4. Install the dependencies (only needed once):
   ```
   npm install
   ```
   Wait for it to finish. You'll see a `node_modules` folder appear.

---

## STEP 3 — Add your Stripe secret key

1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Secret key** — it starts with `sk_live_`
   (Use `sk_test_` first for testing — see Step 6)
3. In the `tabler-farm` folder, find `.env.example`
4. Make a copy of it and rename the copy to exactly `.env` (no ".example")
5. Open `.env` in any text editor (Notepad, TextEdit, VS Code)
6. Replace `sk_live_YOUR_SECRET_KEY_HERE` with your actual key:
   ```
   STRIPE_SECRET_KEY=sk_live_AbCdEfG...
   PORT=3000
   ```
7. Save the file. **Never share this file or upload it anywhere.**

---

## STEP 4 — Start the server

In Terminal, inside the `tabler-farm` folder, run:
```
npm start
```

You should see:
```
🌿 Tabler Farm POS server running on http://localhost:3000
```

Open your browser and go to **http://localhost:3000** — you'll see the POS.

To stop the server, press `Ctrl + C` in the Terminal window.

---

## STEP 5 — Connect your S710 reader

1. In the POS app, click **⚙ Reader** in the top right
2. Enter your **publishable key** — starts with `pk_live_`
   (Find it at https://dashboard.stripe.com/apikeys — it's safe to use in the browser)
3. Click Connect
4. Your S710 will appear automatically — it connects over your Stripe account

The dot in the top bar will turn green when connected.

---

## STEP 6 — Test before going live

Always test with fake money first.

1. In your Stripe Dashboard, toggle **Test mode** on (top right of Dashboard)
2. Get your **test** keys: `sk_test_...` and `pk_test_...`
3. Use those in your `.env` and in the ⚙ Reader screen
4. Use the Stripe simulated reader (or test card number `4242 4242 4242 4242`)
5. When everything works, switch back to your live keys

---

## STEP 7 — Run it at the market

On market day:
1. Open Terminal → `cd Desktop/tabler-farm` → `npm start`
2. Open http://localhost:3000 in your browser
3. Click ⚙ Reader → connect your S710
4. Start selling!

The server needs to stay running while you use the POS.
Keep the Terminal window open in the background.

---

## HOW TO EDIT PRODUCTS

Open `public/index.html` in any text editor. Find the `PRODUCTS` section — it looks like this:

```javascript
const PRODUCTS = [
  { id: 'v1', name: 'Tomatoes', price: 4.00, category: 'Vegetables', emoji: '🍅' },
  { id: 'v2', name: 'Sweet Corn', price: 5.00, category: 'Vegetables', emoji: '🌽' },
  ...
];
```

### Change a price
Find the product and change the number after `price:`:
```javascript
{ id: 'v1', name: 'Tomatoes', price: 5.00, ... },  // was 4.00
```

### Change a name
Edit the text after `name:`:
```javascript
{ id: 'v1', name: 'Heirloom Tomatoes', price: 4.00, ... },
```

### Add a new product
Copy any line and paste it below. Give it a unique `id`:
```javascript
{ id: 'v7', name: 'Cucumbers', price: 2.50, category: 'Vegetables', emoji: '🥒' },
```
If you use a new category name, a new tab appears automatically.

### Remove a product
Delete its entire line (including the comma at the end).

### Change an emoji
Go to https://emojipedia.org, find your emoji, copy and paste it.

---

## HOW TO CHANGE THE CREDIT CARD FEE

Find this line in `public/index.html`:
```javascript
const CC_FEE_RATE = 0.03;  // 3%
```
Change `0.03` to whatever percentage you want:
- `0.03` = 3%
- `0.025` = 2.5%
- `0` = no fee (toggle still appears but adds nothing)

The toggle in the cart lets you turn the fee on or off per transaction.

---

## HOW TO CHANGE THE TAX RATE

Find:
```javascript
const TAX_RATE = 0;  // no tax
```
Change to your rate, e.g. `0.06` for 6% West Virginia sales tax.

---

## PROCESSING REFUNDS

1. Click **Refunds** tab in the POS
2. Find the Payment Intent ID in your Stripe Dashboard:
   - Go to https://dashboard.stripe.com/payments
   - Click the payment
   - Copy the ID starting with `pi_`
3. Paste it in the Refunds tab and click Look up
4. Click Refund and confirm

Refunds take 5–10 business days to appear on the customer's card.

---

## RUNNING ON THE S710 ITSELF (optional)

The S710 has a built-in browser. You can open the POS directly on the device:
1. Make sure your laptop (running the server) and the S710 are on the same WiFi
2. Find your laptop's local IP: run `ipconfig` (Windows) or `ifconfig` (Mac)
   Look for something like `192.168.1.42`
3. On the S710, open the browser and go to `http://192.168.1.42:3000`

---

## TROUBLESHOOTING

**"Cannot find module" error when starting server**
→ Run `npm install` again in the tabler-farm folder

**Reader won't connect**
→ Make sure the S710 is on the same WiFi as your computer
→ Check that you entered the publishable key correctly (pk_live_ or pk_test_)
→ Try restarting the reader (hold power button → restart)

**Payment fails with "no reader connected"**
→ Click ⚙ Reader again and reconnect

**Server stops when I close Terminal**
→ That's normal. Restart with `npm start`.
→ For always-on: look into running it on a cheap server like Railway.app

**"Port 3000 already in use"**
→ Change PORT=3001 in your .env file and restart

---

## KEEPING YOUR KEYS SAFE

- NEVER put your secret key (sk_live_...) in the HTML file
- NEVER share your .env file
- NEVER commit .env to GitHub (add it to .gitignore)
- Your publishable key (pk_live_...) is safe to use in the browser

---

Questions? The Stripe Dashboard has all your transaction history at
https://dashboard.stripe.com/payments
