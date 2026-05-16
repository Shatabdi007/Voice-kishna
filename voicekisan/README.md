# 🌾 VoiceKisan — किसान का AI साथी
### Full-Stack AI App | Gemini 1.5 Flash + Real APIs | Copy-Paste Ready

---

## ⚡ RUN IN 5 MINUTES — EXACT STEPS

### STEP 1 — Get Your FREE API Keys

| API | Link | Free Limit | Time |
|-----|------|-----------|------|
| **Google Gemini** | https://aistudio.google.com/app/apikey | 1M tokens/day | 30 sec |
| **OpenWeatherMap** | https://openweathermap.org/api | 1000 calls/day | 2 min |
| **Agmarknet** | Already included (default key) | Unlimited | — |

---

### STEP 2 — Setup Backend

```bash
# 1. Go into backend folder
cd backend

# 2. Install packages
npm install

# 3. Create .env file  (copy from .env.example)
cp .env.example .env

# 4. Open .env and paste your keys:
#    GEMINI_API_KEY=AIza...........          ← from aistudio.google.com
#    OPENWEATHER_API_KEY=abc123.......      ← from openweathermap.org
#    (Agmarknet key is already there, don't change it)

# 5. Start backend
node server.js

# You should see:
# 🌾 VoiceKisan API  →  http://localhost:5000
```

---

### STEP 3 — Open Frontend

```bash
# Just open this file in Chrome:
frontend/index.html

# Double-click it OR drag into Chrome browser
# That's it! The app is fully running.
```

---

### STEP 4 — Test It

1. Open `frontend/index.html` in **Chrome**
2. Click **शुरू करें** on splash screen
3. Mandi prices load automatically from Agmarknet
4. Weather loads from OpenWeatherMap
5. Click **🎙️ बोलें** tab → type a question → get Gemini AI answer
6. Click **📜 योजनाएँ** → fill form → click **पात्रता जाँचें**

---

## 📁 PROJECT STRUCTURE

```
voicekisan/
├── backend/
│   ├── server.js          ← Express + all API routes
│   ├── package.json       ← npm dependencies
│   ├── .env.example       ← copy to .env and add keys
│   └── .env               ← YOUR keys go here (create this)
│
└── frontend/
    └── index.html         ← Complete app (single file, no framework)
```

---

## 🔌 ALL API ENDPOINTS

| Method | Endpoint | What it does |
|--------|----------|-------------|
| GET | `/api/mandi` | Live mandi prices (Agmarknet data.gov.in) |
| GET | `/api/weather` | Weather + farming advice (OpenWeatherMap) |
| GET | `/api/msp` | MSP 2025-26 all crops |
| GET | `/api/schemes` | All government schemes |
| POST | `/api/schemes/check` | Check eligibility |
| POST | `/api/chat` | Gemini AI chat |

### Test in browser:
```
http://localhost:5000/api/mandi
http://localhost:5000/api/weather
http://localhost:5000/api/msp
http://localhost:5000/api/schemes
```

---

## 💻 APP SCREENS

| Screen | What's there |
|--------|-------------|
| **Splash** | Language select (Hindi/Bhojpuri/Awadhi/English) |
| **Home** | Live weather, farming advice, quick actions, mandi ticker |
| **Mandi** | Full crop prices with search + filter, MSP comparison |
| **AI Chat** | Gemini 1.5 Flash — voice + text input, Hindi TTS output |
| **Schemes** | PM-KISAN, KCC, Fasal Bima, Soil Card + eligibility checker |
| **MSP** | All 12 crops MSP 2025-26 with Rabi/Kharif labels |
| **Profile** | Farmer profile, PM-KISAN status, all helpline numbers |

---

## 🎙️ VOICE FEATURES
- **Chrome only** — uses Web Speech API (free, no key needed)
- Click mic button in AI Chat screen → speak in Hindi
- Auto-transcribes + sends to Gemini → speaks answer back
- Works in Hindi and English

---

## 🚀 DEPLOY TO INTERNET (Free)

### Backend → Render.com (Free)
```bash
# 1. Push to GitHub
# 2. Go to render.com → New Web Service → Connect GitHub repo
# 3. Set Root Directory: backend
# 4. Build Command: npm install
# 5. Start Command: node server.js
# 6. Add Environment Variables (same as .env)
# Done! You get a URL like: https://voicekisan-api.onrender.com
```

### Frontend → Netlify/GitHub Pages (Free)
```bash
# In frontend/index.html — change line:
const API_BASE = 'http://localhost:5000';
# TO:
const API_BASE = 'https://voicekisan-api.onrender.com';

# Then drag frontend/ folder to netlify.com/drop
# Done! Live URL in 30 seconds.
```

---

## 📊 WHAT MAKES THIS UNIQUE

| Feature | VoiceKisan | Other apps |
|---------|-----------|-----------|
| Hindi voice input | ✅ | ❌ |
| Real mandi prices (Agmarknet) | ✅ | ❌ |
| Gemini AI in Hindi | ✅ | ❌ |
| Scheme eligibility checker | ✅ | ❌ |
| MSP vs market price comparison | ✅ | ❌ |
| Works offline (fallback data) | ✅ | ❌ |
| Free to run | ✅ | ❌ |

---

## 📝 FOR COLLEGE SUBMISSION

**Project Title:** VoiceKisan — AI-Powered Multilingual Agricultural Assistant

**Problem Statement:** 86% of Indian farmers are small/marginal. They cannot access government schemes, mandi prices, and expert advice due to language barriers and lack of digital literacy.

**Solution:** A voice-first AI app in Hindi/Bhojpuri that provides real-time mandi prices, weather-based farming advice, government scheme eligibility, and Gemini AI-powered Q&A — completely free.

**Tech Stack:** Node.js (Express), Google Gemini 1.5 Flash, Agmarknet API, OpenWeatherMap API, Web Speech API, HTML/CSS/JavaScript

**Impact:** Can serve 14 crore farmer families in India. Works on any smartphone with a browser. Zero cost to farmer.

---

*Made with ❤️ for Indian Farmers*
