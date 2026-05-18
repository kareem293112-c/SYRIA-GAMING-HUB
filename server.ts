import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

// Load items
const DATA_PATH = path.join(process.cwd(), "src/data.json");
let data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

// --- Helper Functions ---
let userBalance = 0;
let coupons = [
  { code: "GIFT3", value: 3, used: false },
  { code: "SHAM10", value: 10, used: false }
];
let spinCodes: string[] = [];

function saveItems() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function getAutomaticRarity(price: number): string {
    if (price >= 30) return "أسطورية";
    if (price >= 10) return "نادرة";
    if (price >= 2) return "غير شائعة";
    return "شائعة";
}

function getWeightedItem() {
  const items = data.items;
  // Based on user requirements:
  // Legendary (>= 30$): 0.5%
  // Rare (10$-30$): 4.5%
  // Uncommon (2$-10$): 15% (Blue)
  // Common (< 2$): 80%

  const rand = Math.random() * 100;

  if (rand < 0.5) {
    const legendary = items.filter(i => Number(i.price) >= 30);
    return legendary.length ? legendary[Math.floor(Math.random() * legendary.length)] : items[0];
  } else if (rand < 5.0) { // 0.5 + 4.5 = 5.0
    const rare = items.filter(i => Number(i.price) >= 10 && Number(i.price) < 30);
    return rare.length ? rare[Math.floor(Math.random() * rare.length)] : items[0];
  } else if (rand < 20.0) { // 5.0 + 15 = 20.0
    const uncommon = items.filter(i => Number(i.price) >= 2 && Number(i.price) < 10);
    return uncommon.length ? uncommon[Math.floor(Math.random() * uncommon.length)] : items[0];
  } else {
    const common = items.filter(i => Number(i.price) < 2);
    return common.length ? common[Math.floor(Math.random() * common.length)] : items[0];
  }
}

// --- API Routes ---
app.post("/api/case/open", (req, res) => {
    const { code } = req.body;
    if (!code || !spinCodes.includes(code)) {
        return res.status(400).json({ error: "كلمة سر غير صالحة للسحب" });
    }
    spinCodes = spinCodes.filter(c => c !== code); // remove used code

    const item = getWeightedItem();
    // Discord Webhook integration
    if (item.rarity === 'legendary' && process.env.DISCORD_WEBHOOK_URL) {
        fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `🎉 Congratulations! Someone won ${item.name}!` })
        }).catch(err => console.error("Webhook failed", err));
    }
    res.json({ item });
});

const ADMIN_PASSWORD = process.env.ADMIN_SECRET_KEY || "1234";

// Admin Routes
app.post("/api/admin/generate-spin-code", (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(403).send('Unauthorized');
    }
    const newCode = Array.from({length: 6}, () => Math.random().toString(36)[2]).join('').toUpperCase();
    spinCodes.push(newCode);
    res.json({ code: newCode });
});

app.get("/api/admin/spin-codes", (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(403).send('Unauthorized');
    }
    res.json({ codes: spinCodes });
});

app.get("/api/items", (req, res) => {
    res.json(data.items);
});

app.get("/api/admin/items", (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(403).send('Unauthorized');
    }
    res.json(data.items);
});

app.post("/api/admin/items", (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(403).send('Unauthorized');
    }
    const item = req.body;
    item.rarity = getAutomaticRarity(parseFloat(item.price));
    if (!item.imageUrl) item.imageUrl = "https://via.placeholder.com/150";

    if (item.id) {
        // Update existing
        const index = data.items.findIndex(i => i.id === item.id);
        if (index > -1) {
            data.items[index] = item;
        } else {
            data.items.push(item);
        }
    } else {
        // Add new
        item.id = Date.now().toString();
        data.items.push(item);
    }
    saveItems();
    res.status(201).json(item);
});

app.delete("/api/admin/items/:id", (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASSWORD) {
        return res.status(403).send('Unauthorized');
    }
    data.items = data.items.filter(i => i.id !== req.params.id);
    saveItems();
    res.status(204).send();
});

app.get("/api/user/balance", (req, res) => {
    res.json({ balance: userBalance });
});

// Coupon Route
app.post("/api/coupons/use", (req, res) => {
    const { code } = req.body;
    const coupon = coupons.find(c => c.code === code);
    if (!coupon) return res.status(404).json({ error: "Invalid coupon" });
    if (coupon.used) return res.status(400).json({ error: "Coupon already used" });
    coupon.used = true;
    userBalance += coupon.value;
    res.json({ balance: userBalance });
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
