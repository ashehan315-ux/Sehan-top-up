import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { GameInfo, Order, OrderStatus } from "./src/types";

const PORT = 3000;
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOADS_DIR));

// Set up Gemini SDK
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// File-based persistence for order logs
const ORDERS_FILE = path.join(process.cwd(), "orders.json");
const GAMES_FILE = path.join(process.cwd(), "gamesCatalog.json");
const PAYMENTS_FILE = path.join(process.cwd(), "paymentMethods.json");
const USERS_FILE = path.join(process.cwd(), "users.json");

function loadOrders(): Order[] {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = fs.readFileSync(ORDERS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load orders from file, falling back to memory:", error);
  }
  return [];
}

function saveOrders(orders: Order[]) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save orders to file:", error);
  }
}

// File-based persistence for SMS logs
const SMS_LOGS_FILE = path.join(process.cwd(), "sms_logs.json");

interface SmsLog {
  id: string;
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: "delivered" | "sent" | "failed";
}

function loadSmsLogs(): SmsLog[] {
  try {
    if (fs.existsSync(SMS_LOGS_FILE)) {
      const data = fs.readFileSync(SMS_LOGS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    // If empty or doesn't exist, return empty array
  }
  return [];
}

function saveSmsLogs(logs: SmsLog[]) {
  try {
    fs.writeFileSync(SMS_LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save SMS logs:", error);
  }
}

async function sendNotifyLkSms(to: string, message: string): Promise<boolean> {
  const userId = process.env.NOTIFY_LK_USER_ID;
  const apiKey = process.env.NOTIFY_LK_API_KEY;
  const senderId = process.env.NOTIFY_LK_SENDER_ID || "NotifyDEMO";

  if (!userId || !apiKey) {
    console.warn("[SMS Gateway] Notify.lk is not configured. Missing NOTIFY_LK_USER_ID or NOTIFY_LK_API_KEY.");
    return false;
  }

  let formattedTo = to.trim().replace(/[\s+-]/g, "");
  if (formattedTo.startsWith("0")) {
    formattedTo = "94" + formattedTo.slice(1);
  }

  const url = `https://app.notify.lk/api/v1/send?api_key=${apiKey}&user_id=${userId}&sender_id=${senderId}&to=${formattedTo}&message=${encodeURIComponent(message)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[SMS Gateway] Notify.lk returned error status ${res.status}: ${text}`);
      return false;
    }
    const data: any = await res.json().catch(() => ({}));
    console.log("[SMS Gateway] Notify.lk dispatch success:", data);
    return true;
  } catch (err) {
    console.error("[SMS Gateway] Notify.lk network error:", err);
    return false;
  }
}

async function sendTwilioSms(to: string, message: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[SMS Gateway] Twilio is not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER.");
    return false;
  }

  let formattedTo = to.trim().replace(/[\s-]/g, "");
  if (formattedTo.startsWith("0")) {
    formattedTo = "+94" + formattedTo.slice(1);
  } else if (!formattedTo.startsWith("+")) {
    formattedTo = "+" + formattedTo;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const body = new URLSearchParams({
    To: formattedTo,
    From: fromNumber,
    Body: message
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[SMS Gateway] Twilio error status ${res.status}: ${text}`);
      return false;
    }

    const data: any = await res.json().catch(() => ({}));
    console.log("[SMS Gateway] Twilio dispatch success SID:", data.sid);
    return true;
  } catch (err) {
    console.error("[SMS Gateway] Twilio network error:", err);
    return false;
  }
}

async function sendOwnerSMS(order: Order, type: "created" | "payment_submitted") {
  const ownerPhone = "0721367605";
  let message = "";

  if (type === "created") {
    message = `Sehan Topup Store 🔔 NEW ORDER!\nID: ${order.id}\nGame: ${order.gameName}\nPackage: ${order.packageName}\nPrice: LKR ${order.price.toFixed(2)}\nPlayer ID: ${order.playerId}${order.playerZoneId ? ` (${order.playerZoneId})` : ""}\nStatus: Awaiting Payment Proof.`;
  } else if (type === "payment_submitted") {
    message = `Sehan Topup Store 💰 PAYMENT SUBMITTED!\nID: ${order.id}\nPrice: LKR ${order.price.toFixed(2)}\nSender: ${order.senderNumber || "N/A"}\nTxn ID: ${order.transactionId || "None"}\nPlease check bank/wallet and verify order.`;
  }

  let dispatchSuccess = false;
  let usedGateway = "None";

  // Try Notify.lk first (Sri Lankan standard)
  if (process.env.NOTIFY_LK_USER_ID && process.env.NOTIFY_LK_API_KEY) {
    usedGateway = "Notify.lk";
    dispatchSuccess = await sendNotifyLkSms(ownerPhone, message);
  } 
  // Then try Twilio
  else if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    usedGateway = "Twilio";
    dispatchSuccess = await sendTwilioSms(ownerPhone, message);
  }

  const logs = loadSmsLogs();
  const newLog: SmsLog = {
    id: `SMS-${Math.floor(100000 + Math.random() * 900000)}`,
    phoneNumber: ownerPhone,
    message,
    timestamp: new Date().toISOString(),
    status: dispatchSuccess ? "delivered" : (usedGateway === "None" ? "failed" : "failed")
  };

  // If failed due to no keys, let's append feedback directly to message log so they see it in the simulator!
  if (usedGateway === "None") {
    newLog.message = `⚠️ [SMS GATEWAY OFFLINE - CONFIG REQUIRED]\nTo receive real SMS alerts on your mobile phone 0721367605, you MUST configure Notify.lk or Twilio credentials in the AI Studio Settings Panel.\n\n[DRAFT MESSAGE FOR YOU]:\n${message}`;
  } else if (!dispatchSuccess) {
    newLog.message = `❌ [SMS DISPATCH FAILED USING ${usedGateway.toUpperCase()}]\nCheck your API limits, credentials, or network connection on ${usedGateway}.\n\n[DRAFT MESSAGE]:\n${message}`;
  }

  logs.unshift(newLog);
  saveSmsLogs(logs);

  console.log("==========================================================");
  console.log(`[REAL-TIME SMS GATEWAY DISPATCH]`);
  console.log(`To: ${ownerPhone}`);
  console.log(`Gateway: ${usedGateway}`);
  console.log(`Status: ${dispatchSuccess ? "SUCCESS" : "FAILED (Requires API keys configuration)"}`);
  console.log(`Message:\n${message}`);
  console.log("==========================================================");
}



// Global in-memory list of orders initialized from file
let ordersRegistry: Order[] = loadOrders();

// Default Game Catalog
const gamesCatalogDefaults: GameInfo[] = [
  {
    id: "mlbb",
    name: "Mobile Legends: Bang Bang",
    category: "Mobile Games",
    iconUrl: "https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?w=150&auto=format&fit=crop&q=80", // Games placeholder icon
    bannerUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80",
    idLabel: "User ID",
    zoneLabel: "Zone ID",
    idPlaceholder: "e.g., 12345678",
    zonePlaceholder: "e.g., 1234",
    packages: [
      { id: "ml-86", name: "86 Diamonds", price: 1.25, originalPrice: 1.5, value: 86, unit: "Diamonds", popular: false },
      { id: "ml-172", name: "172 Diamonds", price: 2.4, originalPrice: 3.0, value: 172, unit: "Diamonds", popular: false },
      { id: "ml-257", name: "257 Diamonds (236 + 21 Bonus)", price: 3.6, originalPrice: 4.5, value: 257, unit: "Diamonds", popular: true },
      { id: "ml-706", name: "706 Diamonds (643 + 63 Bonus)", price: 9.8, originalPrice: 12.0, value: 706, unit: "Diamonds", popular: false },
      { id: "ml-2195", name: "2195 Diamonds (2010 + 185 Bonus)", price: 29.5, originalPrice: 38.0, value: 2195, unit: "Diamonds", popular: true },
      { id: "ml-5580", name: "5580 Diamonds (5050 + 530 Bonus)", price: 74.0, originalPrice: 95.0, value: 5580, unit: "Diamonds", popular: false },
      { id: "ml-twilight", name: "Twilight Pass", price: 9.99, value: 1, unit: "Pass", popular: false },
      { id: "ml-weekly", name: "Weekly Diamond Pass", price: 1.99, value: 1, unit: "Pass", popular: true },
    ],
  },
  {
    id: "pubgm",
    name: "PUBG Mobile",
    category: "Mobile Games",
    iconUrl: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=150&auto=format&fit=crop&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80",
    idLabel: "Character ID",
    idPlaceholder: "e.g., 5123456789",
    packages: [
      { id: "pubg-60", name: "60 UC", price: 0.99, value: 60, unit: "UC", popular: false },
      { id: "pubg-325", name: "325 UC (300 + 25 Bonus)", price: 4.9, originalPrice: 5.9, value: 325, unit: "UC", popular: true },
      { id: "pubg-660", name: "660 UC (600 + 60 Bonus)", price: 9.5, originalPrice: 11.5, value: 660, unit: "UC", popular: false },
      { id: "pubg-1800", name: "1800 UC (1500 + 300 Bonus)", price: 24.0, originalPrice: 29.0, value: 1800, unit: "UC", popular: true },
      { id: "pubg-3850", name: "3850 UC (3000 + 850 Bonus)", price: 48.0, originalPrice: 59.0, value: 3850, unit: "UC", popular: false },
      { id: "pubg-8100", name: "8100 UC (6000 + 2100 Bonus)", price: 95.0, originalPrice: 119.0, value: 8100, unit: "UC", popular: false },
    ],
  },
  {
    id: "freefire",
    name: "Free Fire",
    category: "Mobile Games",
    iconUrl: "https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=150&auto=format&fit=crop&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop&q=80",
    idLabel: "Player ID",
    idPlaceholder: "e.g., 482910482",
    packages: [
      { id: "ff-100", name: "100 Diamonds", price: 0.95, value: 100, unit: "Diamonds", popular: false },
      { id: "ff-210", name: "210 Diamonds", price: 1.9, value: 210, unit: "Diamonds", popular: false },
      { id: "ff-530", name: "530 Diamonds", price: 4.7, originalPrice: 5.5, value: 530, unit: "Diamonds", popular: true },
      { id: "ff-1080", name: "1080 Diamonds", price: 9.3, originalPrice: 11.0, value: 1080, unit: "Diamonds", popular: true },
      { id: "ff-2200", name: "2200 Diamonds", price: 18.5, originalPrice: 22.0, value: 2200, unit: "Diamonds", popular: false },
    ],
  },
  {
    id: "valorant",
    name: "Valorant",
    category: "PC Games",
    iconUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=150&auto=format&fit=crop&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1553481187-be93c21490a9?w=800&auto=format&fit=crop&q=80",
    idLabel: "Riot ID + Tagline",
    idPlaceholder: "e.g., Jett#NA1",
    packages: [
      { id: "val-475", name: "475 Points", price: 4.99, value: 475, unit: "VP", popular: false },
      { id: "val-1000", name: "1000 Points", price: 9.99, value: 1000, unit: "VP", popular: true },
      { id: "val-2050", name: "2050 Points", price: 19.99, value: 2050, unit: "VP", popular: false },
      { id: "val-3650", name: "3650 Points", price: 34.99, value: 3650, unit: "VP", popular: true },
      { id: "val-5350", name: "5350 Points", price: 49.99, value: 5350, unit: "VP", popular: false },
      { id: "val-11000", name: "11000 Points", price: 99.99, value: 11000, unit: "VP", popular: false },
    ],
  },
  {
    id: "genshin",
    name: "Genshin Impact",
    category: "PC Games",
    iconUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=150&auto=format&fit=crop&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
    idLabel: "UID",
    zoneLabel: "Server",
    idPlaceholder: "e.g., 812345678",
    zonePlaceholder: "Select Server",
    packages: [
      { id: "genshin-60", name: "60 Genesis Crystals", price: 0.99, value: 60, unit: "Crystals", popular: false },
      { id: "genshin-300", name: "300 Genesis Crystals", price: 4.9, value: 300, unit: "Crystals", popular: false },
      { id: "genshin-980", name: "980 Genesis Crystals", price: 14.5, value: 980, unit: "Crystals", popular: true },
      { id: "genshin-1980", name: "1980 Genesis Crystals", price: 29.0, value: 1980, unit: "Crystals", popular: false },
      { id: "genshin-3280", name: "3280 Genesis Crystals", price: 47.5, value: 3280, unit: "Crystals", popular: true },
      { id: "genshin-6480", name: "6480 Genesis Crystals", price: 94.0, value: 6480, unit: "Crystals", popular: false },
      { id: "genshin-welkin", name: "Blessing of the Welkin Moon", price: 4.99, value: 300, unit: "Crystals + Daily Rewards", popular: true },
    ],
  },
  {
    id: "roblox",
    name: "Roblox",
    category: "PC Games",
    iconUrl: "https://images.unsplash.com/photo-1627856013091-fed6e4e30025?w=150&auto=format&fit=crop&q=80",
    bannerUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80",
    idLabel: "Roblox Username",
    idPlaceholder: "e.g., Builderman",
    packages: [
      { id: "robux-400", name: "400 Robux", price: 4.99, value: 400, unit: "Robux", popular: false },
      { id: "robux-800", name: "800 Robux", price: 9.99, value: 800, unit: "Robux", popular: true },
      { id: "robux-1700", name: "1700 Robux", price: 19.99, value: 1700, unit: "Robux", popular: false },
      { id: "robux-4500", name: "4500 Robux", price: 49.99, value: 4500, unit: "Robux", popular: true },
    ],
  },
];

const paymentMethodsDefaults = [
  {
    id: "bkash",
    name: "bKash Mobile",
    type: "wallet",
    logo: "https://images.unsplash.com/photo-1598257006458-087169a1f08d?w=100&auto=format&fit=crop&q=80",
    instructions: "Transfer to our bKash merchant wallet account. Make a Send Money or Cash Out transaction of the total amount, then copy-paste the Transaction ID from the SMS.",
    accountNumber: "+880 1799 482910",
    feePercentage: 1.5,
  },
  {
    id: "nagad",
    name: "Nagad Wallet",
    type: "wallet",
    logo: "https://images.unsplash.com/photo-1563013544-824ae1d704d3?w=100&auto=format&fit=crop&q=80",
    instructions: "Transfer money to our Nagad wallet. Make a Send Money of the exact total amount, then input your sender mobile account number and the transaction reference.",
    accountNumber: "+880 1928 382948",
    feePercentage: 1.0,
  },
  {
    id: "bank_of_ceylon",
    name: "Local Bank Transfer",
    type: "bank",
    logo: "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?w=100&auto=format&fit=crop&q=80",
    instructions: "Please make a direct online wire or bank deposit to our Bank account. Verification takes about 5 minutes. Enter the reference number from your bank app.",
    accountNumber: "8492048209210-A",
    accountName: "Sehan Topup Retail Ltd.",
    feePercentage: 0,
  },
  {
    id: "visa_mastercard",
    name: "Visa / Mastercard Secure",
    type: "card",
    logo: "https://images.unsplash.com/photo-1589758438368-0ad531db3366?w=100&auto=format&fit=crop&q=80",
    feePercentage: 2.0,
  },
  {
    id: "qr_instant",
    name: "QR Scan & Pay",
    type: "qr",
    logo: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?w=100&auto=format&fit=crop&q=80",
    instructions: "Scan the QR below with any mobile wallet app to send the total payment, then input the reference number.",
    feePercentage: 0.5,
  },
];

function loadGames(): GameInfo[] {
  try {
    if (fs.existsSync(GAMES_FILE)) {
      const data = fs.readFileSync(GAMES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load games catalog:", error);
  }
  saveGames(gamesCatalogDefaults);
  return gamesCatalogDefaults;
}

function saveGames(games: GameInfo[]) {
  try {
    fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save games catalog:", error);
  }
}

function loadPayments(): any[] {
  try {
    if (fs.existsSync(PAYMENTS_FILE)) {
      const data = fs.readFileSync(PAYMENTS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load payment methods:", error);
  }
  savePayments(paymentMethodsDefaults);
  return paymentMethodsDefaults;
}

function savePayments(payments: any[]) {
  try {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save payment methods:", error);
  }
}

function loadUsers(): any[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load users:", error);
  }
  return [];
}

function saveUsers(users: any[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save users:", error);
  }
}

// File-based persistence for Carousel slider (photo and video changing navigation)
const CAROUSEL_FILE = path.join(process.cwd(), "carouselCatalog.json");

interface CarouselItem {
  id: string;
  type: "image" | "video";
  url: string;
  title?: string;
  subtitle?: string;
  linkUrl?: string;
  active: boolean;
  order: number;
}

const defaultCarousel: CarouselItem[] = [
  {
    id: "slide-1",
    type: "video",
    url: "https://assets.mixkit.co/videos/preview/mixkit-gaming-setup-with-neon-lights-42526-large.mp4",
    title: "⚡ SEHAN TOPUP STORE ⚡",
    subtitle: "Sri Lanka's #1 Most Trusted & Faster Gaming Top-Up Platform.",
    linkUrl: "",
    active: true,
    order: 1
  },
  {
    id: "slide-2",
    type: "image",
    url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80",
    title: "🔥 PUBG Mobile UC Hot Deals 🔥",
    subtitle: "Super cheap UC packages. Fully automatic, safe & secure in 1-5 minutes.",
    linkUrl: "",
    active: true,
    order: 2
  },
  {
    id: "slide-3",
    type: "image",
    url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80",
    title: "💎 Free Fire Diamonds Instant 💎",
    subtitle: "Get Free Fire Diamonds immediately using Player ID. Start playing now!",
    linkUrl: "",
    active: true,
    order: 3
  }
];

function loadCarousel(): CarouselItem[] {
  try {
    if (fs.existsSync(CAROUSEL_FILE)) {
      const data = fs.readFileSync(CAROUSEL_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load carousel:", error);
  }
  saveCarousel(defaultCarousel);
  return defaultCarousel;
}

function saveCarousel(carousel: CarouselItem[]) {
  try {
    fs.writeFileSync(CAROUSEL_FILE, JSON.stringify(carousel, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save carousel:", error);
  }
}


// System Settings Persistence
const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

interface SystemSettings {
  theme: string;
}

const defaultSettings: SystemSettings = {
  theme: "cyberpunk"
};

function loadSettings(): SystemSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load settings from file:", error);
  }
  saveSettings(defaultSettings);
  return defaultSettings;
}

function saveSettings(settings: SystemSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

let systemSettings: SystemSettings = loadSettings();

// Configurable SMTP settings for Sehan Topup Store email notifications
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "587");
const smtpUser = process.env.SMTP_USER || "sehantopupstore@gmail.com";
const smtpPass = process.env.SMTP_PASS || ""; // App password should be declared in environmental variables

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465, // True for 465, false for 587
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

// Helper to send email notification to client upon order placement or completion
async function sendOrderEmail(order: Order, type: "placed" | "completed") {
  const usersList = loadUsers();
  const user = usersList.find((u) => u.id === order.userId || u.username === order.username);
  
  const recipientEmail = user?.email;
  if (!recipientEmail) {
    console.warn(`[Email Notification] Skipped email sending for order ${order.id}. No registered email found for user "${order.username}" (ID: ${order.userId}).`);
    return;
  }

  const siteName = "Sehan Topup";
  const siteUrl = "https://sehantopup.com";
  const supportEmail = "sehantopupstore@gmail.com";

  let subject = "";
  let htmlBody = "";

  if (type === "placed") {
    subject = `🎮 Order Placed Successfully - ${order.id} | ${siteName}`;
    htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #020617; color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 30px; text-align: center; border-bottom: 2px solid #06b6d4; }
          .logo { font-size: 24px; font-weight: bold; letter-spacing: -0.05em; color: #ffffff; text-transform: uppercase; }
          .logo-highlight { color: #22d3ee; }
          .content { padding: 30px; line-height: 1.6; }
          .title { font-size: 20px; font-weight: bold; margin-top: 0; margin-bottom: 15px; color: #ffffff; text-align: center; }
          .greeting { font-size: 16px; margin-bottom: 20px; color: #cbd5e1; }
          .badge { display: inline-block; padding: 6px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 9999px; background-color: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); margin-bottom: 20px; }
          .order-card { background-color: #030712; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
          .order-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; }
          .order-row:last-child { border-bottom: none; }
          .label { color: #94a3b8; font-size: 13px; font-weight: 500; }
          .value { color: #f1f5f9; font-size: 13px; font-weight: bold; text-align: right; }
          .value-price { color: #22d3ee; }
          .footer { background-color: #0c0a09; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
          .footer a { color: #06b6d4; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SEHAN<span class="logo-highlight">TOPUP</span></div>
          </div>
          <div class="content">
            <h2 class="title">🎮 Order Received Successfully!</h2>
            <p class="greeting">Hello <strong>${order.username}</strong>,</p>
            <p style="color: #cbd5e1; font-size: 14px;">
              Thank you for purchasing with us! We have received your top-up request. Our administration team is verifying your payment. Your top-up will be processed shortly.
            </p>
            
            <div style="text-align: center;">
              <span class="badge">⌛ Awaiting Verification</span>
            </div>

            <div class="order-card">
              <div class="order-row">
                <span class="label">Order ID:</span>
                <span class="value" style="font-family: monospace; color: #22d3ee;">${order.id}</span>
              </div>
              <div class="order-row">
                <span class="label">Game Name:</span>
                <span class="value">${order.gameName}</span>
              </div>
              <div class="order-row">
                <span class="label">Package:</span>
                <span class="value">${order.packageName}</span>
              </div>
              <div class="order-row">
                <span class="label">Player ID:</span>
                <span class="value" style="font-family: monospace;">${order.playerId}${order.playerZoneId ? ` (${order.playerZoneId})` : ""}</span>
              </div>
              <div class="order-row">
                <span class="label">Price:</span>
                <span class="value value-price">$${order.price.toFixed(2)}</span>
              </div>
              <div class="order-row">
                <span class="label">Payment Via:</span>
                <span class="value">${order.paymentMethodName}</span>
              </div>
            </div>

            <p style="color: #94a3b8; font-size: 13px; text-align: center;">
              Estimated delivery time is usually 3-5 minutes once verified. Feel free to monitor the order status in your profile history tab.
            </p>
          </div>
          <div class="footer">
            <p>You received this email because you signed up on <a href="${siteUrl}">${siteName}</a>.</p>
            <p>Need support? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            <p style="margin-top: 10px; color: #475569;">&copy; 2026 Sehan Topup Retail Ltd. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (type === "completed") {
    subject = `⚡ Order Completed & Delivered! - ${order.id} | ${siteName}`;
    htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #020617; color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #0c0a09 0%, #064e3b 100%); padding: 30px; text-align: center; border-bottom: 2px solid #10b981; }
          .logo { font-size: 24px; font-weight: bold; letter-spacing: -0.05em; color: #ffffff; text-transform: uppercase; }
          .logo-highlight { color: #10b981; }
          .content { padding: 30px; line-height: 1.6; }
          .title { font-size: 20px; font-weight: bold; margin-top: 0; margin-bottom: 15px; color: #ffffff; text-align: center; }
          .greeting { font-size: 16px; margin-bottom: 20px; color: #cbd5e1; }
          .badge { display: inline-block; padding: 6px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 9999px; background-color: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); margin-bottom: 20px; }
          .order-card { background-color: #030712; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
          .order-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; }
          .order-row:last-child { border-bottom: none; }
          .label { color: #94a3b8; font-size: 13px; font-weight: 500; }
          .value { color: #f1f5f9; font-size: 13px; font-weight: bold; text-align: right; }
          .value-price { color: #10b981; }
          .footer { background-color: #0c0a09; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
          .footer a { color: #10b981; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SEHAN<span class="logo-highlight">TOPUP</span></div>
          </div>
          <div class="content">
            <h2 class="title" style="color: #34d399;">⚡ Top-Up Order Delivered!</h2>
            <p class="greeting">Hello <strong>${order.username}</strong>,</p>
            <p style="color: #cbd5e1; font-size: 14px;">
              Great news! Your top-up has been successfully verified, processed, and credited to your gaming account. Open your game now to enjoy your items!
            </p>
            
            <div style="text-align: center;">
              <span class="badge">✅ Completed & Delivered</span>
            </div>

            <div class="order-card">
              <div class="order-row">
                <span class="label">Order ID:</span>
                <span class="value" style="font-family: monospace; color: #34d399;">${order.id}</span>
              </div>
              <div class="order-row">
                <span class="label">Game Name:</span>
                <span class="value">${order.gameName}</span>
              </div>
              <div class="order-row">
                <span class="label">Package Name:</span>
                <span class="value">${order.packageName}</span>
              </div>
              <div class="order-row">
                <span class="label">Player ID:</span>
                <span class="value" style="font-family: monospace;">${order.playerId}${order.playerZoneId ? ` (${order.playerZoneId})` : ""}</span>
              </div>
              <div class="order-row">
                <span class="label">Delivered Amount:</span>
                <span class="value value-price">$${order.price.toFixed(2)}</span>
              </div>
              <div class="order-row">
                <span class="label">Delivery Time:</span>
                <span class="value" style="color: #34d399;">Instant</span>
              </div>
            </div>

            <p style="color: #94a3b8; font-size: 13px; text-align: center;">
              Thank you for trusting Sehan Topup for your gaming reloads. We look forward to serving you again!
            </p>
          </div>
          <div class="footer">
            <p>You received this email because you placed a top-up on <a href="${siteUrl}">${siteName}</a>.</p>
            <p>Need support? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
            <p style="margin-top: 10px; color: #475569;">&copy; 2026 Sehan Topup Retail Ltd. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Fallback check if SMTP password is empty
  if (!smtpPass) {
    console.log("==========================================================");
    console.log(`[SIMULATED EMAIL NOTIFICATION]`);
    console.log(`To: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body Snippet: ${htmlBody.substring(0, 300).replace(/\\s+/g, " ")}...`);
    console.log(`[SMTP CONFIGURATION NOTICE]: Declare SMTP_PASS in environmental variables to send real emails via Gmail!`);
    console.log("==========================================================");
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${siteName}" <${smtpUser}>`,
      to: recipientEmail,
      subject: subject,
      html: htmlBody,
    });
    console.log(`[Email Notification] Real email sent to ${recipientEmail}: ID = ${info.messageId}`);
  } catch (err) {
    console.error(`[Email Notification Error] Failed to send email to ${recipientEmail}:`, err);
  }
}

// Helper to send automated email notifications to the store owner
async function sendOwnerNotification(order: Order, type: "created" | "payment_submitted") {
  // Fire owner SMS alert in background
  sendOwnerSMS(order, type).catch((err) => {
    console.error("Failed to send owner SMS alert:", err);
  });

  const ownerEmail = "sehantopupstore@gmail.com";
  const ownerPhone = "0721367605";
  const siteName = "Sehan Topup Store";
  const siteUrl = "https://sehantopup.com";

  let subject = "";
  let htmlBody = "";

  if (type === "created") {
    subject = `🔔 [NEW ORDER] Order Created - ${order.id} | Sehan Topup`;
    htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #04040a; color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #0c0c14; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #0c0c14 0%, #1e1b4b 100%); padding: 30px; text-align: center; border-bottom: 2px solid #06b6d4; }
          .logo { font-size: 24px; font-weight: bold; letter-spacing: -0.05em; color: #ffffff; text-transform: uppercase; }
          .logo-highlight { color: #22d3ee; }
          .content { padding: 30px; line-height: 1.6; }
          .title { font-size: 20px; font-weight: bold; margin-top: 0; margin-bottom: 15px; color: #22d3ee; text-align: center; }
          .badge { display: inline-block; padding: 6px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 9999px; background-color: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); margin-bottom: 20px; }
          .order-card { background-color: #020205; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
          .order-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; }
          .order-row:last-child { border-bottom: none; }
          .label { color: #94a3b8; font-size: 13px; font-weight: 500; }
          .value { color: #f1f5f9; font-size: 13px; font-weight: bold; text-align: right; }
          .value-price { color: #22d3ee; }
          .footer { background-color: #050508; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
          .footer a { color: #06b6d4; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SEHAN<span class="logo-highlight">TOPUP</span></div>
          </div>
          <div class="content">
            <h2 class="title">🔔 New Order Created!</h2>
            <p style="color: #cbd5e1; font-size: 14px;">
              Hi Sehan, a new top-up order has been placed on your store. Please prepare the package and wait for payment verification.
            </p>
            
            <div style="text-align: center;">
              <span class="badge">Awaiting Payment Proof</span>
            </div>
 
            <div class="order-card">
              <div class="order-row">
                <span class="label">Order ID:</span>
                <span class="value" style="font-family: monospace; color: #22d3ee;">${order.id}</span>
              </div>
              <div class="order-row">
                <span class="label">Customer Username:</span>
                <span class="value">${order.username} (ID: ${order.userId})</span>
              </div>
              <div class="order-row">
                <span class="label">Game:</span>
                <span class="value">${order.gameName}</span>
              </div>
              <div class="order-row">
                <span class="label">Package:</span>
                <span class="value">${order.packageName}</span>
              </div>
              <div class="order-row">
                <span class="label">Player ID / Account:</span>
                <span class="value" style="font-family: monospace; color: #f1f5f9; font-weight: bold;">${order.playerId}${order.playerZoneId ? ` (${order.playerZoneId})` : ""}</span>
              </div>
              <div class="order-row">
                <span class="label">Price:</span>
                <span class="value value-price">LKR ${order.price.toFixed(2)}</span>
              </div>
              <div class="order-row">
                <span class="label">Payment Method Selected:</span>
                <span class="value">${order.paymentMethodName}</span>
              </div>
            </div>
          </div>
          <div class="footer">
            <p>Sehan Topup Store Automated Notifications</p>
            <p>Owner Contact: <strong>${ownerPhone}</strong> | Support: <a href="mailto:${ownerEmail}">${ownerEmail}</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (type === "payment_submitted") {
    subject = `💰 [PAYMENT SUBMITTED] Verification Required - ${order.id} | Sehan Topup`;
    htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #04040a; color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #0c0c14; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #0c0c14 0%, #1e3a8a 100%); padding: 30px; text-align: center; border-bottom: 2px solid #3b82f6; }
          .logo { font-size: 24px; font-weight: bold; letter-spacing: -0.05em; color: #ffffff; text-transform: uppercase; }
          .logo-highlight { color: #60a5fa; }
          .content { padding: 30px; line-height: 1.6; }
          .title { font-size: 20px; font-weight: bold; margin-top: 0; margin-bottom: 15px; color: #60a5fa; text-align: center; }
          .badge { display: inline-block; padding: 6px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 9999px; background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); margin-bottom: 20px; }
          .order-card { background-color: #020205; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
          .order-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; }
          .order-row:last-child { border-bottom: none; }
          .label { color: #94a3b8; font-size: 13px; font-weight: 500; }
          .value { color: #f1f5f9; font-size: 13px; font-weight: bold; text-align: right; }
          .value-price { color: #60a5fa; }
          .receipt-btn { display: inline-block; padding: 10px 20px; font-size: 12px; font-weight: bold; color: #ffffff; background-color: #3b82f6; border-radius: 8px; text-decoration: none; margin-top: 15px; text-align: center; }
          .footer { background-color: #050508; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
          .footer a { color: #3b82f6; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SEHAN<span class="logo-highlight">TOPUP</span></div>
          </div>
          <div class="content">
            <h2 class="title">💰 Payment Proof Submitted!</h2>
            <p style="color: #cbd5e1; font-size: 14px;">
              Hi Sehan, the customer <strong>${order.username}</strong> has submitted payment verification for Order <strong>${order.id}</strong>. Please check your account/wallet and complete the delivery.
            </p>
            
            <div style="text-align: center;">
              <span class="badge">🔍 Verification Required</span>
            </div>
 
            <div class="order-card">
              <div class="order-row">
                <span class="label">Order ID:</span>
                <span class="value" style="font-family: monospace; color: #60a5fa;">${order.id}</span>
              </div>
              <div class="order-row">
                <span class="label">Game:</span>
                <span class="value">${order.gameName}</span>
              </div>
              <div class="order-row">
                <span class="label">Package:</span>
                <span class="value">${order.packageName}</span>
              </div>
              <div class="order-row">
                <span class="label">Player ID:</span>
                <span class="value" style="font-family: monospace;">${order.playerId}${order.playerZoneId ? ` (${order.playerZoneId})` : ""}</span>
              </div>
              <div class="order-row">
                <span class="label">Price to Verify:</span>
                <span class="value value-price">LKR ${order.price.toFixed(2)}</span>
              </div>
              <div class="order-row">
                <span class="label">Payment Method:</span>
                <span class="value">${order.paymentMethodName}</span>
              </div>
              <div class="order-row">
                <span class="label">Sender/Account Number:</span>
                <span class="value" style="color: #60a5fa;">${order.senderNumber || "Not Provided"}</span>
              </div>
              <div class="order-row">
                <span class="label">Submitted Txn ID:</span>
                <span class="value" style="font-family: monospace; color: #34d399;">${order.transactionId || "None"}</span>
              </div>
            </div>
 
            ${order.receiptUrl ? `
            <div style="text-align: center;">
              <p style="color: #cbd5e1; font-size: 13px;">Customer uploaded a payment receipt image:</p>
              <a href="${siteUrl}${order.receiptUrl}" class="receipt-btn" target="_blank">🖼️ View Payment Receipt</a>
            </div>
            ` : ""}
          </div>
          <div class="footer">
            <p>Sehan Topup Store Automated Notifications</p>
            <p>Owner Contact: <strong>${ownerPhone}</strong> | Support: <a href="mailto:${ownerEmail}">${ownerEmail}</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Fallback check if SMTP password is empty
  if (!smtpPass) {
    console.log("==========================================================");
    console.log(`[SIMULATED STORE OWNER EMAIL NOTIFICATION]`);
    console.log(`To: ${ownerEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body Snippet: ${htmlBody.substring(0, 350).replace(/\s+/g, " ")}...`);
    console.log(`[SMTP CONFIGURATION NOTICE]: Declare SMTP_PASS in environmental variables to send real emails to owner!`);
    console.log("==========================================================");
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${siteName}" <${smtpUser}>`,
      to: ownerEmail,
      subject: subject,
      html: htmlBody,
    });
    console.log(`[Owner Email Notification] Real email sent to store owner ${ownerEmail}: ID = ${info.messageId}`);
  } catch (err) {
    console.error(`[Owner Email Notification Error] Failed to send email to store owner ${ownerEmail}:`, err);
  }
}

// Global in-memory lists loaded from persistent files
let gamesCatalog: GameInfo[] = loadGames();
let paymentMethodsRegistry: any[] = loadPayments();
let carouselRegistry: CarouselItem[] = loadCarousel();


// Helper to update state transitions automatically for realism
function updatePendingTransactions(order: Order): boolean {
  let changed = false;
  const now = new Date();
  const createdTime = new Date(order.createdAt);
  const updatedTime = new Date(order.updatedAt);
  const diffFromCreatedSec = (now.getTime() - createdTime.getTime()) / 1000;
  const diffFromUpdatedSec = (now.getTime() - updatedTime.getTime()) / 1000;

  // Real-time tracking logic:
  // 1. If order is "awaiting_payment" and has a transaction ID submitted, transition to "verifying".
  if (order.status === "awaiting_payment" && order.transactionId) {
    order.status = "verifying";
    order.updatedAt = now.toISOString();
    changed = true;
  }
  // Disabled automatic transitions as requested by the admin.
  // The admin will manually verify the payment and perform the top-up before marking the order as completed.
  return changed;
}

// REST API Endpoints
app.get("/api/games", (req, res) => {
  res.json(gamesCatalog);
});

app.get("/api/carousel", (req, res) => {
  res.json(carouselRegistry);
});

app.get("/api/payment-methods", (req, res) => {
  res.json(paymentMethodsRegistry);
});

// Create new top-up order
app.post("/api/orders", (req, res) => {
  const {
    gameId,
    playerId,
    playerZoneId,
    packageId,
    paymentMethodId,
    paymentMethodName,
    senderNumber,
    userId,
    username,
  } = req.body;

  if (!userId || !username) {
    res.status(401).json({ error: "Authentication required. Please sign up or log in to place top-ups." });
    return;
  }

  const game = gamesCatalog.find((g) => g.id === gameId);
  const pckg = game?.packages.find((p) => p.id === packageId);

  if (!game || !pckg) {
    res.status(404).json({ error: "Game or package not found." });
    return;
  }

  const orderId = `DAN-${Math.floor(100000 + Math.random() * 900000)}`;
  const now = new Date().toISOString();

  let finalStatus: OrderStatus = "awaiting_payment";
  let finalTxnId: string | undefined = undefined;
  let updatedWalletBalance: number | undefined = undefined;

  if (paymentMethodId === "user_wallet") {
    const users = loadUsers();
    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) {
      res.status(404).json({ error: "User profile not found." });
      return;
    }
    const currentBalance = users[userIndex].walletBalance || 0;
    if (currentBalance < pckg.price) {
      res.status(400).json({ error: "Insufficient wallet balance to place this order." });
      return;
    }

    // Deduct
    users[userIndex].walletBalance = currentBalance - pckg.price;
    saveUsers(users);
    updatedWalletBalance = users[userIndex].walletBalance;

    finalStatus = "verifying"; // Bypasses client gateway, verified on server
    finalTxnId = `WALLET-DEDUCT-${Math.floor(100000000 + Math.random() * 900000000)}`;
  }

  const newOrder: Order = {
    id: orderId,
    gameId: game.id,
    gameName: game.name,
    playerId,
    playerZoneId,
    packageId: pckg.id,
    packageName: pckg.name,
    price: pckg.price,
    paymentMethodId,
    paymentMethodName,
    status: finalStatus,
    transactionId: finalTxnId,
    createdAt: now,
    updatedAt: now,
    senderNumber: senderNumber || undefined,
    recipientNumber: "+880 1799 482910", // Mock retail agent number for simulation instructions
    estimatedDelivery: "3-5 Minutes",
    userId,
    username,
  };

  ordersRegistry.unshift(newOrder);
  saveOrders(ordersRegistry);

  // Send order placement confirmation email in the background
  sendOrderEmail(newOrder, "placed").catch((err) => {
    console.error("Failed to send order placement email:", err);
  });

  // Notify store owner about the new transaction
  sendOwnerNotification(newOrder, "created").catch((err) => {
    console.error("Failed to send owner order placement email:", err);
  });

  res.json({
    ...newOrder,
    userWalletBalance: updatedWalletBalance
  });
});

// Submit payment verification proof
app.post("/api/orders/:id/verify-payment", (req, res) => {
  const { id } = req.params;
  const { transactionId, senderNumber, cardLast4, receiptUrl } = req.body;

  const orderIndex = ordersRegistry.findIndex((o) => o.id === id);
  if (orderIndex === -1) {
    res.status(404).json({ error: "Order not found." });
    return;
  }

  const now = new Date().toISOString();
  ordersRegistry[orderIndex].transactionId = transactionId || `TXN${Math.floor(100000000 + Math.random() * 900000000)}`;
  if (senderNumber) ordersRegistry[orderIndex].senderNumber = senderNumber;
  if (cardLast4) ordersRegistry[orderIndex].cardLast4 = cardLast4;
  if (receiptUrl) ordersRegistry[orderIndex].receiptUrl = receiptUrl;

  ordersRegistry[orderIndex].status = "verifying";
  ordersRegistry[orderIndex].updatedAt = now;

  saveOrders(ordersRegistry);

  // Notify store owner that payment proof has been submitted for verification
  sendOwnerNotification(ordersRegistry[orderIndex], "payment_submitted").catch((err) => {
    console.error("Failed to send owner payment verification email:", err);
  });

  res.json(ordersRegistry[orderIndex]);
});

// Fetch Order Status with Real-time simulation checks
app.get("/api/orders/:id", (req, res) => {
  const { id } = req.params;
  const orderIndex = ordersRegistry.findIndex((o) => o.id === id);

  if (orderIndex === -1) {
    res.status(404).json({ error: "Order not found." });
    return;
  }

  const order = ordersRegistry[orderIndex];
  const didChange = updatePendingTransactions(order);

  if (didChange) {
    saveOrders(ordersRegistry);
  }

  res.json(order);
});

// Global orders tracker lookup (allows searching by order ID or Player/Account ID or Sender Number)
app.get("/api/orders-lookup", (req, res) => {
  const { query } = req.query;
  if (!query || typeof query !== "string") {
    res.json([]);
    return;
  }

  const cleanQuery = query.trim().toLowerCase();

  // Run dynamic status progress on all matching orders before returning them
  let updatedAny = false;
  const matches = ordersRegistry.filter((o) => {
    const match =
      o.id.toLowerCase().includes(cleanQuery) ||
      o.playerId.toLowerCase().includes(cleanQuery) ||
      (o.transactionId && o.transactionId.toLowerCase().includes(cleanQuery)) ||
      (o.senderNumber && o.senderNumber.includes(cleanQuery));

    if (match) {
      if (updatePendingTransactions(o)) {
        updatedAny = true;
      }
    }
    return match;
  });

  if (updatedAny) {
    saveOrders(ordersRegistry);
  }

  res.json(matches);
});

// Sandbox Admin Trigger to manually speed up/change state for testing
app.post("/api/orders/:id/update-status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses: OrderStatus[] = [
    "awaiting_payment",
    "verifying",
    "processing",
    "completed",
    "failed",
  ];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status state." });
    return;
  }

  const orderIndex = ordersRegistry.findIndex((o) => o.id === id);
  if (orderIndex === -1) {
    res.status(404).json({ error: "Order not found." });
    return;
  }

  const previousStatus = ordersRegistry[orderIndex].status;
  ordersRegistry[orderIndex].status = status;
  ordersRegistry[orderIndex].updatedAt = new Date().toISOString();

  saveOrders(ordersRegistry);

  if (status === "completed" && previousStatus !== "completed") {
    sendOrderEmail(ordersRegistry[orderIndex], "completed").catch((err) => {
      console.error("Failed to send manual order completion email:", err);
    });
  }

  res.json(ordersRegistry[orderIndex]);
});

// User Auth - Registration
app.post("/api/auth/register", (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    res.status(400).json({ error: "All fields (username, email, password) are required." });
    return;
  }

  const users = loadUsers();
  if (users.some((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
    res.status(400).json({ error: "Username is already registered." });
    return;
  }
  if (users.some((u: any) => u.email.toLowerCase() === email.toLowerCase())) {
    res.status(400).json({ error: "Email is already registered." });
    return;
  }

  const newUser = {
    id: `usr-${Math.floor(100000 + Math.random() * 900000)}`,
    username: username.trim(),
    email: email.trim(),
    password: password.trim(),
    isAdmin: false,
    walletBalance: 0
  };

  users.push(newUser);
  saveUsers(users);

  res.json({ id: newUser.id, username: newUser.username, email: newUser.email, isAdmin: false, walletBalance: 0 });
});

// User Auth - Login (checks Sehan 123 credentials too!)
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  // Hardcoded Admin login as per requirements:
  // Username: "Sehan 123", Password: "Sehan1234@"
  if (username === "Sehan 123" && password === "Sehan1234@") {
    res.json({
      id: "admin-sehan",
      username: "Sehan 123",
      email: "admin@sehantopup.com",
      isAdmin: true,
      walletBalance: 9999999
    });
    return;
  }

  const users = loadUsers();
  const user = users.find(
    (u: any) =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password
  );

  if (!user) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    isAdmin: false,
    walletBalance: user.walletBalance || 0
  });
});

// Fetch a user's wallet balance
app.get("/api/users/:id/balance", (req, res) => {
  const { id } = req.params;
  const users = loadUsers();
  const user = users.find((u: any) => u.id === id);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json({ walletBalance: user.walletBalance || 0 });
});

// Get all orders (for admin)
app.get("/api/admin/orders", (req, res) => {
  // Run verification updates
  ordersRegistry.forEach((o) => {
    updatePendingTransactions(o);
  });
  saveOrders(ordersRegistry);
  res.json(ordersRegistry);
});

// Get all users (for admin)
app.get("/api/admin/users", (req, res) => {
  const users = loadUsers();
  const safeUsers = users.map((u: any) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    walletBalance: u.walletBalance || 0,
    isAdmin: u.isAdmin || false
  }));
  res.json(safeUsers);
});

// Adjust a user's wallet balance (for admin)
app.post("/api/admin/users/:id/adjust-wallet", (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  const users = loadUsers();
  const userIndex = users.findIndex((u) => u.id === id);
  if (userIndex === -1) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const currentBalance = users[userIndex].walletBalance || 0;
  const newBalance = currentBalance + amount;
  users[userIndex].walletBalance = Math.max(0, newBalance); // Prevent negative balance
  saveUsers(users);

  res.json({
    id: users[userIndex].id,
    username: users[userIndex].username,
    email: users[userIndex].email,
    walletBalance: users[userIndex].walletBalance,
    isAdmin: users[userIndex].isAdmin || false
  });
});

// Fetch all SMS notifications (for admin console)
app.get("/api/admin/sms-logs", (req, res) => {
  const logs = loadSmsLogs();
  res.json(logs);
});

// Get SMS configuration status
app.get("/api/admin/sms-config-status", (req, res) => {
  const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
  const hasNotifyLk = !!(process.env.NOTIFY_LK_USER_ID && process.env.NOTIFY_LK_API_KEY);
  
  res.json({
    hasTwilio,
    hasNotifyLk,
    activeGateway: hasNotifyLk ? "Notify.lk (Sri Lanka)" : (hasTwilio ? "Twilio" : "None"),
    twilioConfigured: hasTwilio,
    notifyLkConfigured: hasNotifyLk,
  });
});


// Send a test SMS to the store owner's phone number
app.post("/api/admin/send-test-sms", async (req, res) => {
  const ownerPhone = "0721367605";
  const testMessage = `Sehan Topup Store 📱 TEST ALERT!\nSent at: ${new Date().toLocaleTimeString()}\nGateway status: ONLINE (100% Active)\nIf you see this, your server-to-phone SMS notification dispatcher is working perfectly.`;

  let dispatchSuccess = false;
  let usedGateway = "None";

  // Try Notify.lk first
  if (process.env.NOTIFY_LK_USER_ID && process.env.NOTIFY_LK_API_KEY) {
    usedGateway = "Notify.lk";
    dispatchSuccess = await sendNotifyLkSms(ownerPhone, testMessage);
  } 
  // Then try Twilio
  else if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    usedGateway = "Twilio";
    dispatchSuccess = await sendTwilioSms(ownerPhone, testMessage);
  }

  const logs = loadSmsLogs();
  const newLog: SmsLog = {
    id: `SMS-${Math.floor(100000 + Math.random() * 900000)}`,
    phoneNumber: ownerPhone,
    message: testMessage,
    timestamp: new Date().toISOString(),
    status: dispatchSuccess ? "delivered" : "failed"
  };

  if (usedGateway === "None") {
    newLog.message = `⚠️ [TEST SMS DISPATCH OFFLINE]\nYou must add NOTIFY_LK_API_KEY + NOTIFY_LK_USER_ID, or Twilio keys to the Settings panel of AI Studio. Once added, real SMS messages will flow to your phone 0721367605!`;
  } else if (!dispatchSuccess) {
    newLog.message = `❌ [TEST SMS DISPATCH FAILED USING ${usedGateway.toUpperCase()}]\nCheck your API limits, credentials, or connection details.`;
  }

  logs.unshift(newLog);
  saveSmsLogs(logs);

  console.log("==========================================================");
  console.log(`[TEST SMS DISPATCH]`);
  console.log(`To: ${ownerPhone}`);
  console.log(`Gateway: ${usedGateway}`);
  console.log(`Status: ${dispatchSuccess ? "SUCCESS" : "FAILED (Requires API keys configuration)"}`);
  console.log(`Message:\n${testMessage}`);
  console.log("==========================================================");

  res.json({ 
    success: dispatchSuccess, 
    usedGateway, 
    error: !dispatchSuccess && usedGateway === "None" ? "Configuration missing" : undefined,
    logs 
  });
});




// Save/Update the games catalog
app.post("/api/admin/games", (req, res) => {
  const { games } = req.body;
  if (!games || !Array.isArray(games)) {
    res.status(400).json({ error: "Games array is required." });
    return;
  }
  gamesCatalog = games;
  saveGames(gamesCatalog);
  res.json({ success: true, games: gamesCatalog });
});

// Save/Update the carousel slider
app.post("/api/admin/carousel", (req, res) => {
  const { carousel } = req.body;
  if (!carousel || !Array.isArray(carousel)) {
    res.status(400).json({ error: "Carousel array is required." });
    return;
  }
  carouselRegistry = carousel;
  saveCarousel(carouselRegistry);
  res.json({ success: true, carousel: carouselRegistry });
});

// Endpoint to upload base64 image (photo) for Game Directory (Icon or Banner)
app.post("/api/admin/upload", (req, res) => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      res.status(400).json({ error: "Filename and base64Data are required." });
      return;
    }

    // Clean base64 string
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    if (matches && matches.length === 3) {
      buffer = Buffer.from(matches[2], "base64");
    } else {
      buffer = Buffer.from(base64Data, "base64");
    }

    // Sanitize filename to prevent security directory traversal attacks
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(safeName) || ".png";
    const nameWithoutExt = path.basename(safeName, ext);
    const savedName = `${nameWithoutExt}-${uniqueSuffix}${ext}`;

    const filePath = path.join(UPLOADS_DIR, savedName);
    fs.writeFileSync(filePath, buffer);

    res.json({ url: `/uploads/${savedName}` });
  } catch (error: any) {
    console.error("File upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload image." });
  }
});

// Save/Update the payment methods
app.post("/api/admin/payment-methods", (req, res) => {
  const { paymentMethods } = req.body;
  if (!paymentMethods || !Array.isArray(paymentMethods)) {
    res.status(400).json({ error: "Payment methods array is required." });
    return;
  }
  paymentMethodsRegistry = paymentMethods;
  savePayments(paymentMethodsRegistry);
  res.json({ success: true, paymentMethods: paymentMethodsRegistry });
});

// Get global system settings
app.get("/api/settings", (req, res) => {
  const settings = loadSettings();
  res.json(settings);
});

// Update global system settings
app.post("/api/admin/settings", (req, res) => {
  const { theme } = req.body;
  if (!theme) {
    res.status(400).json({ error: "theme field is required." });
    return;
  }
  const settings = loadSettings();
  settings.theme = theme;
  saveSettings(settings);
  systemSettings = settings;
  res.json({ success: true, settings });
});

// Gemini-powered chatbot for transaction support and queries
app.post("/api/gemini/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "Messages array is required." });
    return;
  }

  // Format orders registry for the chatbot's immediate context so it can actually answer questions about orders!
  // Limit to last 8 orders so context token size is tiny, efficient, and fits the simple model.
  const shortHistory = ordersRegistry.slice(0, 8).map((o) => ({
    id: o.id,
    game: o.gameName,
    package: o.packageName,
    playerId: o.playerId,
    price: `LKR ${o.price.toFixed(2)}`,
    status: o.status,
    paymentMethod: o.paymentMethodName,
    date: o.createdAt,
  }));

  const supportedGames = gamesCatalog.map((g) => g.name).join(", ");

  const systemPrompt = `You are "Sehan Agent," the expert, highly professional, and friendly AI support representative for Sehan Topup (sehantopup.com), the premier gaming store in Sri Lanka.

COMMUNICATION LANGUAGES & STYLE:
- You are fully multi-lingual! You can confidently understand and communicate in English, Sinhala (සිංහල), Tamil (தமிழ்), and Singlish (Sinhala written with the English/Latin alphabet, e.g., "machan mage order eka thama awe na", "order eka check karala kiyanna").
- When a user chats in Sinhala, Tamil, or Singlish, reply warmly in their chosen style! Be friendly and supportive. Use polite Sri Lankan phrases like "Ayubowan!" (ආයුබෝවන්), "Oyata kohomada help karanna puluwan?", or "Obata kohomada udau kala hakke?".
- Speak with humble, literal, human labels. Avoid sounding like a machine. Avoid technical jargon or raw JSON variables.

CURRENCY & FIELDS CONFIGURATION:
- ALL prices are listed in LKR (Sri Lankan Rupees). Do not refer to USD ($) or any other currency.
- Note that the "Zone ID" input field has been completely removed from Sehan Topup! We now only use "Game ID" (your in-game account ID) and "Game Name" (your in-game nickname/server name). Correct any users who refer to Zone ID and guide them to use "Game ID" and "Game Name" instead.

CURRENT SUPPORTED GAMES:
- We support top-ups for: ${supportedGames} (and more!).

ORDER ACCESS & DATABASE STATUS:
- You have immediate access to our server's active orders database. Here are the last 8 transactions:
${JSON.stringify(shortHistory, null, 2)}

If a user asks about their order status (e.g. they give an Order Number like "DAN-123456" or a Game ID/Player ID):
- Check the list above.
- If found: Report its exact status and details (LKR price, payment method, date). Convert the technical status into clear, friendly guidance:
  - 'awaiting_payment': Let them know we are waiting for their payment proof (slip/screenshot). They can upload it securely in the 'Order Tracker' tab.
  - 'verifying': An administrator is checking the payment receipt right now. This usually takes 1-5 minutes!
  - 'processing': The payment is verified! We are pushing the diamonds/credits to their Game ID right now.
  - 'completed': The top-up was successfully delivered! Ask them to check their in-game account.
  - 'failed': The transaction failed. Ask them to contact support with the receipt or try again.
- If the order number is not in the list, ask them to make sure they wrote the correct "DAN-" number or lookup their order in the 'Order Tracker' page.

GOOGLE SEARCH GROUNDING:
- You have Google Search grounding enabled! If the user asks about general gaming news, release dates, patch notes, specific character strategies, current standard prices of diamonds/UC in Sri Lanka, or general info not in your immediate database, use your search capability to find the latest real-time web info and provide an accurate answer!`;

  // Fallback system in case GEMINI_API_KEY is not defined
  if (!ai) {
    const lastUserMessage = messages[messages.length - 1]?.text || "";
    let botReply = "I am currently running in offline demo mode. ";

    // Simple keyword analyzer
    const queryLower = lastUserMessage.toLowerCase();
    const foundOrder = ordersRegistry.find(
      (o) =>
        queryLower.includes(o.id.toLowerCase()) ||
        queryLower.includes(o.playerId.toLowerCase())
    );

    if (foundOrder) {
      botReply += `I located your order **${foundOrder.id}** for ${foundOrder.gameName} (${foundOrder.packageName}). Its current status is **${foundOrder.status.toUpperCase().replace("_", " ")}**. Payment method used: ${foundOrder.paymentMethodName}. Price: LKR ${foundOrder.price.toFixed(2)}.`;
    } else if (queryLower.includes("dan-")) {
      botReply += "I couldn't find that specific Order ID in my recent logs. Please make sure the order number is correct, or check the 'Order Tracker' page.";
    } else if (queryLower.includes("game") || queryLower.includes("support")) {
      botReply += `We support game top-ups for: ${supportedGames}. Top-ups are delivered automatically within minutes of payment verification!`;
    } else {
      botReply += "Hello! How can I help you with your game top-ups or order tracking today? You can ask me to search for your order by providing your Order ID (starts with DAN-).";
    }

    res.json({ text: botReply });
    return;
  }

  try {
    let responseText = "";
    let geminiSucceeded = false;

    // Compile prompt and conversation history
    const historyContext = messages.slice(0, -1).map(m => 
      `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`
    ).join("\n");

    const activeUserMessage = messages[messages.length - 1].text;
    const finalPrompt = historyContext 
      ? `Here is our conversation history:\n${historyContext}\n\nUser's latest message: ${activeUserMessage}`
      : activeUserMessage;

    // 1. Try with Google Search grounding enabled (requires paid tier / appropriate billing)
    try {
      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
        },
      });

      const response = await chat.sendMessage({
        message: finalPrompt,
      });

      responseText = response.text;
      geminiSucceeded = true;
    } catch (searchError: any) {
      console.warn("Gemini execution with Google Search tool failed (falling back to standard flash chat):", searchError.message || searchError);
      
      // 2. Retry without Google Search grounding (highly compatible with Free Tier keys)
      const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
          systemInstruction: systemPrompt,
        },
      });

      const response = await chat.sendMessage({
        message: finalPrompt,
      });

      responseText = response.text;
      geminiSucceeded = true;
    }

    if (geminiSucceeded) {
      res.json({ text: responseText });
    } else {
      throw new Error("Unable to obtain Gemini response under either profile.");
    }
  } catch (error: any) {
    console.error("Gemini API error (falling back to Sehan Agent Local Rule Engine):", error);
    
    const lastUserMessage = messages[messages.length - 1]?.text || "";
    let botReply = "Hi! I am **Sehan Agent**, your support assistant. *(My AI cloud core is currently under high load, so I am running in a local backup mode to assist you instantly).* 🇱🇰\n\n";

    // Simple keyword analyzer
    const queryLower = lastUserMessage.toLowerCase();
    const foundOrder = ordersRegistry.find(
      (o) =>
        queryLower.includes(o.id.toLowerCase()) ||
        queryLower.includes(o.playerId.toLowerCase())
    );

    if (foundOrder) {
      let statusSinhala = "";
      if (foundOrder.status === "awaiting_payment") statusSinhala = "ගෙවීම් තහවුරු කිරීම බලාපොරොත්තුවෙන් (Awaiting Payment proof). කරුණාකර ඔබගේ ගෙවීම් රිසිට්පත (Receipt/Slip photo) 'Order Tracker' හරහා upload කරන්න.";
      else if (foundOrder.status === "verifying") statusSinhala = "පරිපාලක විසින් ඔබගේ ගෙවීම් රිසිට්පත පරීක්ෂා කරමින් පවතී (Verifying - 1-5 minutes).";
      else if (foundOrder.status === "processing") statusSinhala = "ඔබගේ ගිණුමට top-up එක එකතු කරමින් පවතී (Processing).";
      else if (foundOrder.status === "completed") statusSinhala = "සාර්ථකව සම්පූර්ණ කර ඇත (Completed!). කරුණාකර ඔබගේ ක්‍රීඩා ගිණුම පරීක්ෂා කරන්න.";
      else statusSinhala = "අසාර්ථක වී ඇත (Failed). කරුණාකර support අපව සම්බන්ධ කරගන්න.";

      botReply += `මම ඔබගේ ඇණවුම සොයාගත්තා! \n- **Order ID**: \`${foundOrder.id}\`\n- **Game**: ${foundOrder.gameName} (${foundOrder.packageName})\n- **Price**: LKR ${foundOrder.price.toFixed(2)}\n- **Status**: ${statusSinhala}`;
    } else if (queryLower.includes("dan-")) {
      botReply += "ඔබ ඇතුළත් කළ Order ID (DAN-) එක අපගේ පද්ධතියේ මෑතකදී සිදුකළ ගනුදෙනු අතර සොයා ගැනීමට නොහැකි වුණා. කරුණාකර අංකය නිවැරදිදැයි නැවත පරීක්ෂා කර බලන්න, නැතහොත් 'Order Tracker' පිටුව හරහා පරීක්ෂා කරන්න.";
    } else if (queryLower.includes("game") || queryLower.includes("support") || queryLower.includes("price") || queryLower.includes("gana")) {
      botReply += `අපි දැනට **Mobile Legends, PUBG Mobile, Free Fire, Valorant, Genshin Impact, සහ Roblox** සඳහා top-up පහසුකම් සපයනවා! සියලුම ගෙවීම් LKR වලින් සිදුකළ හැක. ගෙවීම් තහවුරු වූ සැනින් විනාඩි 1-5ක් ඇතුළත top-up එක ස්වයංක්‍රීයව ලැබේ.`;
    } else if (queryLower.includes("na") || queryLower.includes("awe na") || queryLower.includes("thama") || queryLower.includes("ko") || queryLower.includes("koheda")) {
      botReply += "ඔබගේ top-up එක ලැබීමට ප්‍රමාද නම්, කරුණාකර ඔබගේ Order Tracker එක පරීක්ෂා කර, එහි ඔබගේ නිවැරදි ගෙවීම් රිසිට්පත (Receipt photo) එක upload කර ඇති දැයි තහවුරු කරගන්න. අපගේ පරිපාලකවරුන් විනාඩි 1-5ක් ඇතුළත එය පරීක්ෂා කර ඇණවුම සම්පූර්ණ කරනු ඇත.";
    } else {
      botReply += "ආයුබෝවන්! Sehan Topup (sehantopup.com) වෙත සාදරයෙන් පිළිගනිමු. මම ඔබට කෙසේද සහය විය යුත්තේ?\n\n- ඔබගේ ඇණවුමේ තත්ත්වය දැනගැනීමට **DAN-** වලින් ආරම්භ වන Order ID එක ඇතුළත් කරන්න (උදා: `DAN-123456`).\n- නැතහොත් ඔබගේ Game ID එක ඇතුළත් කරන්න.";
    }

    res.json({ text: botReply });
  }
});

// Vite Middleware & SPA serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
