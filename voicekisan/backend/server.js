/*
 ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗██╗  ██╗██╗███████╗ █████╗ ███╗   ██╗
 ██║   ██║██╔═══██╗██║██╔════╝██╔════╝██║ ██╔╝██║██╔════╝██╔══██╗████╗  ██║
 ██║   ██║██║   ██║██║██║     █████╗  █████╔╝ ██║███████╗███████║██╔██╗ ██║
 ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝  ██╔═██╗ ██║╚════██║██╔══██║██║╚██╗██║
  ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗██║  ██╗██║███████║██║  ██║██║ ╚████║
   ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝
 किसान का AI साथी | Backend v3.0 | Gemini AI + Twilio WhatsApp
*/

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const VERIFY_TOKEN = "voicekisanverify";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("TOKEN =", process.env.WHATSAPP_TOKEN);
console.log("PHONE =", process.env.PHONE_NUMBER_ID);

const app = express();
const PORT = process.env.PORT || 5000;


// IMPORTANT: must parse URL-encoded BEFORE json for Twilio webhooks
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── In-memory per-user conversation history (keyed by WhatsApp number)
// Clears on server restart — fine for demo. Use Redis/DB for production.
const waHistory = {};

// ══════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: '🌾 VoiceKisan API Running',
    version: '3.0.0',
    ai: 'Google Gemini 1.5 Flash',
    whatsapp_webhook: 'POST /api/whatsapp',
    tip: 'Set this URL in Twilio Sandbox Settings → When a message comes in',
    endpoints: [
      'GET  /api/mandi     — Live mandi prices',
      'GET  /api/weather   — Weather + farming advice',
      'GET  /api/msp       — MSP rates 2025-26',
      'GET  /api/schemes   — Government schemes list',
      'POST /api/schemes/check — Eligibility checker',
      'POST /api/chat      — Gemini AI assistant',
      'POST /api/whatsapp  — Twilio WhatsApp webhook ← set this in Twilio console',
    ]
  });
});

// ══════════════════════════════════════════════
// 1. MANDI PRICES
// ══════════════════════════════════════════════
app.get('/api/mandi', async (req, res) => {
  const { state = 'Uttar Pradesh', district = 'Lucknow', commodity = '' } = req.query;
  try {
    const params = new URLSearchParams({
      'api-key': process.env.AGMARKNET_API_KEY || '579b464db66ec23d945f0042d4f0a8b4',
      format: 'json',
      limit: 40,
      'filters[state]': state,
    });
    if (district)  params.append('filters[district]',  district);
    if (commodity) params.append('filters[commodity]', commodity);

    const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?${params}`;
    const { data } = await axios.get(url, { timeout: 9000 });

    const records = (data.records || []).map(r => ({
      crop: r.commodity, crop_hi: CROP_HINDI[r.commodity] || r.commodity,
      market: r.market, district: r.district, state: r.state,
      min_price: +r.min_price, max_price: +r.max_price, modal_price: +r.modal_price,
      date: r.arrival_date,
    }));
    res.json({ success: true, count: records.length, data: records });
  } catch (e) {
    console.error('[Mandi]', e.message);
    res.json({ success: true, count: MOCK_MANDI.length, data: MOCK_MANDI, source: 'mock' });
  }
});

// ══════════════════════════════════════════════
// 2. WEATHER
// ══════════════════════════════════════════════
app.get('/api/weather', async (req, res) => {
  const { lat = '26.8467', lon = '80.9462', city = 'Lucknow' } = req.query;
  try {
    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) throw new Error('No API key');

    const [cur, fore] = await Promise.all([
      axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=hi`),
      axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=hi&cnt=16`),
    ]);

    const current = {
      temp: Math.round(cur.data.main.temp),
      feels_like: Math.round(cur.data.main.feels_like),
      humidity: cur.data.main.humidity,
      description: cur.data.weather[0].description,
      wind_kmh: Math.round(cur.data.wind.speed * 3.6),
      rain_chance: 0,
      city: cur.data.name,
    };
    const forecast = fore.data.list.slice(0, 8).map(f => ({
      time: f.dt_txt,
      temp: Math.round(f.main.temp),
      humidity: f.main.humidity,
      description: f.weather[0].description,
      rain_chance: Math.round((f.pop || 0) * 100),
      wind_kmh: Math.round(f.wind.speed * 3.6),
    }));
    const advice = farmingAdvice(current, forecast);
    res.json({ success: true, current, forecast, farming_advice: advice });
  } catch (e) {
    console.error('[Weather]', e.message);
    res.json({ success: true, ...MOCK_WEATHER, source: 'mock' });
  }
});

// ══════════════════════════════════════════════
// 3. MSP
// ══════════════════════════════════════════════
app.get('/api/msp', (req, res) => {
  res.json({ success: true, year: '2025-26', data: MSP_DATA });
});

// ══════════════════════════════════════════════
// 4. SCHEMES
// ══════════════════════════════════════════════
app.get('/api/schemes', (req, res) => {
  res.json({ success: true, data: SCHEMES });
});

app.post('/api/schemes/check', (req, res) => {
  const {
    land_area = 1, annual_income = 100000,
    has_bank_account = true, is_govt_employee = false, aadhar_linked = true,
  } = req.body;

  const result = SCHEMES.map(s => {
    let eligible = true;
    const notes = [];
    if (s.id === 'pm_kisan') {
      if (is_govt_employee)       { eligible = false; notes.push('❌ सरकारी कर्मचारी पात्र नहीं'); }
      if (annual_income > 200000) { eligible = false; notes.push('❌ आय सीमा ₹2 लाख से अधिक'); }
      if (!aadhar_linked)           notes.push('⚠️ आधार-बैंक लिंक ज़रूरी');
    }
    if (s.id === 'kcc')       { if (land_area <= 0) { eligible = false; notes.push('❌ कृषि भूमि होना ज़रूरी'); } }
    if (s.id === 'fasal_bima'){ if (land_area <= 0) { eligible = false; notes.push('❌ कृषि भूमि होना ज़रूरी'); } }
    if (!has_bank_account)    { eligible = false; notes.push('❌ बैंक खाता ज़रूरी'); }
    if (eligible && notes.length === 0) notes.push('✅ आप पूरी तरह पात्र हैं!');
    return { ...s, eligible, notes };
  });

  res.json({ success: true, eligible_count: result.filter(s => s.eligible).length, data: result });
});

// ======================================================
// WEBHOOK VERIFICATION
// ======================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook Verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ======================================================
// RECEIVE WHATSAPP MESSAGE
// ======================================================

app.post("/webhook", async (req, res) => {
  try {

    const body = req.body;

    const message =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;

    const msg = message.text?.body || "";

    console.log("📩 Message:", msg);

    let reply = "";

    const lower = msg.toLowerCase();

    // ==================================================
    // SIMPLE FARMING LOGIC
    // ==================================================

    if (
      lower.includes("rain") ||
      lower.includes("बारिश")
    ) {

      reply =
        "🌧 बारिश आने की संभावना है। आज दवाई छिड़काव न करें।";

    }

    else if (
      lower.includes("heat") ||
      lower.includes("गर्मी")
    ) {

      reply =
        "☀ गर्मी अधिक है। शाम में सिंचाई करें और दोपहर में खेत में काम कम करें।";

    }

    else if (
      lower.includes("pest") ||
      lower.includes("कीट")
    ) {

      reply =
        "🐛 कीट हमला संभव है। नीम तेल या उचित दवा का प्रयोग करें।";

    }

    else if (
      lower.includes("mandi") ||
      lower.includes("भाव")
    ) {

      reply =
        "📊 आज मंडी भाव:\n🌾 गेहूं ₹2275\n🌾 धान ₹3850\n🌻 सरसों ₹5650";

    }

    else {

      // ==================================================
      // GEMINI AI
      // ==================================================

      reply = await askGemini(msg);

    }

    // ==================================================
    // SEND WHATSAPP MESSAGE
    // ==================================================

    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",

        to: from,

        text: {
          body: reply,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Reply Sent");

    res.sendStatus(200);

  } catch (error) {

    console.log(
      "❌ Error:",
      error.response?.data || error.message
    );

    res.sendStatus(500);

  }
});

// ======================================================
// GEMINI FUNCTION
// ======================================================
async function askGemini(question) {

  try {

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const prompt = `
तुम VoiceKisan AI हो।

तुम भारतीय किसानों की मदद करते हो।

हमेशा सरल हिन्दी में जवाब दो।

Question:
${question}
`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const answer =
      response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    return answer || "🙏 अभी जवाब उपलब्ध नहीं है।";

  } catch (err) {

    console.log(
      "Gemini Error:",
      err.response?.data || err.message
    );

    return "⚠ AI सेवा अभी उपलब्ध नहीं है।";
  }
}
// ══════════════════════════════════════════════════════════════
//  GEMINI AI
// ══════════════════════════════════════════════════════════════
async function callGemini(message, language = 'hindi', history = []) {
  const key = process.env.GEMINI_API_KEY;
 
  const systemPrompt =
    `तुम VoiceKisan हो — भारत के किसानों का AI साथी। हमेशा शुद्ध हिन्दी में जवाब दो।
सरल शब्द इस्तेमाल करो जो अनपढ़ किसान भी समझें।
 
तुम्हारे पास ये जानकारी है:
📊 मंडी भाव: गेहूँ ₹2,275 | धान ₹3,850 | सरसों ₹5,650 | मक्का ₹1,890 | चना ₹5,440 | प्याज ₹1,450
🌤️ आज लखनऊ में 34°C, आंशिक बादल, बारिश 20%
💰 PM-KISAN: ₹6,000/वर्ष | KCC: 4% ब्याज पर ₹1.6 लाख | फसल बीमा: रबी 1.5% प्रीमियम
📞 हेल्पलाइन: 1800-180-1551
 
नियम:
- 3-5 वाक्यों में जवाब दो
- *bold* और इमोजी का सही इस्तेमाल करो (WhatsApp पर हो)
- किसान को "भाई" या "जी" बुलाओ
- ज़रूरी हो तो helpline नंबर बताओ`;
 
  const contents = [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'समझ गया। मैं VoiceKisan AI हूँ। बताइए क्या मदद चाहिए?' }] },
    ...history
      .filter(h => h.role && h.content)
      .map(h => ({
        role:  h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      })),
    { role: 'user', parts: [{ text: message }] },
  ];
 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const { data } = await axios.post(url, {
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 400, topP: 0.9 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }, { timeout: 15000 });
 
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Empty Gemini response');
  return reply;
}
 
// ══════════════════════════════════════════════════════════════
//  QUICK DATA FORMATTERS
// ══════════════════════════════════════════════════════════════
function getMockMandi() {
  return (
    `📊 *आज के मंडी भाव — लखनऊ*\n` +
    `_(${new Date().toLocaleDateString('hi-IN')})_\n\n` +
    `🌾 *गेहूँ* — ₹2,275/क्विंटल\n` +
    `🌾 *धान* — ₹3,850/क्विंटल\n` +
    `🌻 *सरसों* — ₹5,650/क्विंटल\n` +
    `🌽 *मक्का* — ₹1,890/क्विंटल\n` +
    `🧅 *प्याज* — ₹1,450/क्विंटल\n` +
    `🫘 *चना* — ₹5,440/क्विंटल\n` +
    `🥔 *आलू* — ₹980/क्विंटल\n\n` +
    `🏷️ MSP: गेहूँ ₹2,275 | धान ₹2,183\n` +
    `📱 eNAM पर बेचें: enam.gov.in`
  );
}
 
function getMockWeather() {
  return (
    `🌤️ *आज का मौसम — लखनऊ*\n\n` +
    `🌡️ तापमान: 34°C (महसूस: 38°C)\n` +
    `💧 नमी: 68%\n` +
    `💨 हवा: 14 km/h\n` +
    `🌧️ बारिश की संभावना: 20%\n\n` +
    `🌾 *किसान सलाह:*\n` +
    `• आज कटाई का अच्छा समय है\n` +
    `• शाम को सिंचाई करें\n` +
    `• दोपहर 12-4 बजे खेत में काम न करें`
  );
}
 
function getMockMSP() {
  return (
    `💰 *MSP 2025-26 — सरकारी समर्थन मूल्य*\n\n` +
    `• *गेहूँ* — ₹2,275/क्विंटल (रबी)\n` +
    `• *धान* — ₹2,183/क्विंटल (खरीफ)\n` +
    `• *मक्का* — ₹1,962/क्विंटल\n` +
    `• *सरसों* — ₹5,650/क्विंटल\n` +
    `• *चना* — ₹5,440/क्विंटल\n` +
    `• *अरहर* — ₹7,550/क्विंटल\n` +
    `• *मूँग* — ₹8,682/क्विंटल\n\n` +
    `📌 MSP से कम पर कोई खरीद नहीं कर सकता।\n` +
    `📞 हेल्पलाइन: 1800-180-1551`
  );
}
 
function smartFallback(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('गेहूँ') || m.includes('wheat'))
    return '🌾 लखनऊ मंडी में आज गेहूँ का भाव ₹2,275 प्रति क्विंटल है — MSP के बराबर।';
  if (m.includes('धान') || m.includes('paddy'))
    return '🌾 बासमती धान ₹3,850/क्विंटल। e-NAM पर ₹3,900+ मिल सकता है।';
  if (m.includes('सरसों') || m.includes('mustard'))
    return '🌻 सरसों का भाव ₹5,650/क्विंटल — MSP के बराबर।';
  if (m.includes('बारिश') || m.includes('मौसम'))
    return '🌤️ अगले 3 दिन लखनऊ में हल्की धूप। कल बारिश 30% संभावना।';
  if (m.includes('pm') || m.includes('किसान'))
    return '💰 PM-KISAN की अगली किस्त ₹2,000 जुलाई 2026 में। pmkisan.gov.in पर चेक करें।';
  if (m.includes('kcc') || m.includes('लोन'))
    return '🏦 KCC के लिए नज़दीकी SBI/PNB जाएँ। खतौनी + आधार लेकर जाएँ। 4% ब्याज पर ₹1.6 लाख।';
  if (m.includes('बीमा') || m.includes('fasal'))
    return '🌧️ PM फसल बीमा: pmfby.gov.in या हेल्पलाइन 14447।';
  return (
    `🙏 नमस्ते किसान जी!\n\n` +
    `मैं मंडी भाव, मौसम, सरकारी योजनाएँ और खेती की सलाह दे सकता हूँ।\n\n` +
    `"मेनू" लिखें सभी विकल्प देखने के लिए।\n` +
    `📞 हेल्पलाइन: 1800-180-1551`
  );
}
 
// ══════════════════════════════════════════════
// STATIC DATA
// ══════════════════════════════════════════════
const CROP_HINDI = {
  'Wheat':'गेहूँ','Paddy':'धान','Maize':'मक्का','Mustard':'सरसों',
  'Onion':'प्याज','Potato':'आलू','Chickpea':'चना','Tomato':'टमाटर',
  'Soybean':'सोयाबीन','Cotton':'कपास','Sugarcane':'गन्ना','Garlic':'लहसुन',
  'Moong':'मूँग','Arhar/Tur':'अरहर','Groundnut':'मूँगफली',
};

const MOCK_MANDI = [
  { crop:'Wheat',    crop_hi:'गेहूँ',  market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:2200, max_price:2310, modal_price:2275, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Paddy',    crop_hi:'धान',    market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:3700, max_price:3950, modal_price:3850, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Mustard',  crop_hi:'सरसों',  market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:5580, max_price:5720, modal_price:5650, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Maize',    crop_hi:'मक्का',  market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:1840, max_price:1920, modal_price:1890, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Onion',    crop_hi:'प्याज',  market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:1380, max_price:1510, modal_price:1450, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Chickpea', crop_hi:'चना',    market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:5400, max_price:5500, modal_price:5440, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Potato',   crop_hi:'आलू',    market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:900,  max_price:1050, modal_price:980,  date:new Date().toLocaleDateString('en-IN') },
  { crop:'Tomato',   crop_hi:'टमाटर',  market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:1200, max_price:1600, modal_price:1400, date:new Date().toLocaleDateString('en-IN') },
];

const MOCK_WEATHER = {
  current:  { temp:34, feels_like:38, humidity:68, description:'आंशिक बादल', wind_kmh:14, rain_chance:20, city:'Lucknow' },
  forecast: [
    { time:'आज शाम',  temp:36, humidity:60, description:'धूप',        rain_chance:10, wind_kmh:12 },
    { time:'कल सुबह', temp:28, humidity:75, description:'साफ़',        rain_chance:15, wind_kmh:10 },
    { time:'कल दोपहर',temp:35, humidity:65, description:'हल्के बादल', rain_chance:30, wind_kmh:18 },
  ],
  farming_advice: ['☀️ अच्छा मौसम — कटाई का सही समय', '💧 शाम को सिंचाई करें'],
};

const MSP_DATA = [
  { crop_hi:'गेहूँ',        crop_en:'Wheat',       msp:2275, unit:'₹/क्विंटल', season:'रबी'   },
  { crop_hi:'धान (सामान्य)',crop_en:'Paddy',        msp:2183, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'मक्का',        crop_en:'Maize',        msp:1962, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'सरसों',        crop_en:'Mustard',      msp:5650, unit:'₹/क्विंटल', season:'रबी'   },
  { crop_hi:'चना',          crop_en:'Chickpea',     msp:5440, unit:'₹/क्विंटल', season:'रबी'   },
  { crop_hi:'अरहर',         crop_en:'Arhar/Tur',    msp:7550, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'मूँग',         crop_en:'Moong',        msp:8682, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'सोयाबीन',      crop_en:'Soybean',      msp:4892, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'कपास (लंबा)',  crop_en:'Cotton Long',  msp:7121, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'गन्ना (FRP)',  crop_en:'Sugarcane',    msp:340,  unit:'₹/क्विंटल', season:'वार्षिक'},
  { crop_hi:'मूँगफली',      crop_en:'Groundnut',    msp:6783, unit:'₹/क्विंटल', season:'खरीफ'  },
  { crop_hi:'बाजरा',        crop_en:'Bajra',        msp:2625, unit:'₹/क्विंटल', season:'खरीफ'  },
];

const SCHEMES = [
  {
    id:'pm_kisan', icon:'💰',
    name_hi:'PM-KISAN सम्मान निधि', name_en:'PM Kisan Samman Nidhi',
    amount:'₹6,000/वर्ष', color:'#2e7d32',
    description_hi:'तीन किस्तों में सीधे बैंक खाते में। छोटे व सीमांत किसानों के लिए।',
    eligibility:['कृषि भूमि का स्वामित्व','आधार-बैंक लिंक','सरकारी कर्मचारी नहीं'],
    apply_url:'https://pmkisan.gov.in', helpline:'155261',
  },
  {
    id:'kcc', icon:'🏦',
    name_hi:'किसान क्रेडिट कार्ड (KCC)', name_en:'Kisan Credit Card',
    amount:'₹1.6 लाख तक @ 4%', color:'#1565c0',
    description_hi:'बीज, खाद, उपकरण के लिए 4% ब्याज पर कृषि ऋण।',
    eligibility:['कृषि भूमि हो','18-75 वर्ष आयु','खसरा-खतौनी और आधार'],
    apply_url:'https://www.nabard.org/kisan-credit-card.aspx', helpline:'1800-200-3333',
  },
  {
    id:'fasal_bima', icon:'🌧️',
    name_hi:'PM फसल बीमा योजना', name_en:'PM Fasal Bima Yojana',
    amount:'₹2 लाख तक', color:'#e65100',
    description_hi:'बाढ़, सूखा, ओला, तूफान से नुकसान पर मुआवज़ा। रबी केवल 1.5% प्रीमियम।',
    eligibility:['कृषि भूमि हो','बुवाई से 2 हफ्ते पहले आवेदन','e-KYC ज़रूरी'],
    apply_url:'https://pmfby.gov.in', helpline:'14447',
  },
  {
    id:'soil_health', icon:'🧪',
    name_hi:'मृदा स्वास्थ्य कार्ड', name_en:'Soil Health Card',
    amount:'बिल्कुल मुफ्त', color:'#6a1b9a',
    description_hi:'मिट्टी की जाँच — सही खाद, सही मात्रा, सही फसल।',
    eligibility:['सभी किसान पात्र','नज़दीकी कृषि केंद्र जाएँ'],
    apply_url:'https://soilhealth.dac.gov.in', helpline:'1800-180-1551',
  },
  {
    id:'e_nam', icon:'📱',
    name_hi:'e-NAM ऑनलाइन मंडी', name_en:'e-NAM Electronic Market',
    amount:'बेहतर दाम पाएँ', color:'#00695c',
    description_hi:'देश भर की मंडियों में ऑनलाइन बेचें। बिचौलिए नहीं, सीधा व्यापारी से।',
    eligibility:['enam.gov.in पर रजिस्टर करें','बैंक खाता ज़रूरी','मोबाइल नंबर चाहिए'],
    apply_url:'https://enam.gov.in', helpline:'1800-270-0224',
  },
];

// ======================================================
// CHAT API
// ======================================================

app.post("/api/chat", async (req, res) => {

  try {

    const { message } = req.body;

    if(!message){
      return res.status(400).json({
        reply:"Message required"
      });
    }

    const reply = await askGemini(message);

    res.json({
      success:true,
      reply
    });

  } catch(err){

    console.log(err.message);

    res.status(500).json({
      success:false,
      reply:"⚠ AI service unavailable"
    });
  }
});
// ══════════════════════════════════════════════
// START
// ══════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🌾 ═══════════════════════════════════════════`);
  console.log(`   VoiceKisan API  →  http://localhost:${PORT}`);
  console.log(`   AI Engine       →  Google Gemini 1.5 Flash`);
  console.log(`   WhatsApp        →  POST /api/whatsapp`);
  console.log(`   Mandi Data      →  Agmarknet (data.gov.in)`);
  console.log(`   Weather         →  OpenWeatherMap`);
  console.log(`🌾 ═══════════════════════════════════════════\n`);
  console.log(`   ⚙️  .env keys needed:`);
  console.log(`   GEMINI_API_KEY, OPENWEATHER_API_KEY`);
  console.log(`   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN`);
  console.log(`   TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886)\n`);
});
