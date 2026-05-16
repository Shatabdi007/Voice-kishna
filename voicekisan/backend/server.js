/*
 ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗██╗  ██╗██╗███████╗ █████╗ ███╗   ██╗
 ██║   ██║██╔═══██╗██║██╔════╝██╔════╝██║ ██╔╝██║██╔════╝██╔══██╗████╗  ██║
 ██║   ██║██║   ██║██║██║     █████╗  █████╔╝ ██║███████╗███████║██╔██╗ ██║
 ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝  ██╔═██╗ ██║╚════██║██╔══██║██║╚██╗██║
  ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗██║  ██╗██║███████║██║  ██║██║ ╚████║
   ╚═══╝   ╚═════╝ ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝
 किसान का AI साथी | Backend v2.0 | Gemini AI + Real APIs
*/

const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ══════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: '🌾 VoiceKisan API Running',
    version: '2.0.0',
    ai: 'Google Gemini 1.5 Flash',
    endpoints: [
      'GET  /api/mandi     — Live mandi prices (Agmarknet)',
      'GET  /api/weather   — Weather + farming advice (OpenWeatherMap)',
      'GET  /api/msp       — MSP rates 2025-26',
      'GET  /api/schemes   — Government schemes list',
      'POST /api/schemes/check — Eligibility checker',
      'POST /api/chat      — Gemini AI assistant',
    ]
  });
});

// ══════════════════════════════════════════════
// 1. MANDI PRICES  — data.gov.in Agmarknet API
//    GET /api/mandi?state=Uttar+Pradesh&district=Lucknow&commodity=Wheat
// ══════════════════════════════════════════════
app.get('/api/mandi', async (req, res) => {
  const { state = 'Uttar Pradesh', district = 'Lucknow', commodity = '' } = req.query;
  try {
    const params = new URLSearchParams({
      'api-key'          : process.env.AGMARKNET_API_KEY || '579b464db66ec23d945f0042d4f0a8b4',
      format             : 'json',
      limit              : 40,
      'filters[state]'   : state,
    });
    if (district)  params.append('filters[district]',  district);
    if (commodity) params.append('filters[commodity]', commodity);

    const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?${params}`;
    const { data } = await axios.get(url, { timeout: 9000 });

    const records = (data.records || []).map(r => ({
      crop       : r.commodity,
      crop_hi    : CROP_HINDI[r.commodity] || r.commodity,
      market     : r.market,
      district   : r.district,
      state      : r.state,
      min_price  : +r.min_price,
      max_price  : +r.max_price,
      modal_price: +r.modal_price,
      date       : r.arrival_date,
    }));

    res.json({ success: true, count: records.length, data: records });
  } catch (e) {
    console.error('[Mandi]', e.message);
    res.json({ success: true, count: MOCK_MANDI.length, data: MOCK_MANDI, source: 'mock' });
  }
});

// ══════════════════════════════════════════════
// 2. WEATHER  — OpenWeatherMap Free API
//    GET /api/weather?lat=26.85&lon=80.95&city=Lucknow
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
      temp       : Math.round(cur.data.main.temp),
      feels_like : Math.round(cur.data.main.feels_like),
      humidity   : cur.data.main.humidity,
      description: cur.data.weather[0].description,
      wind_kmh   : Math.round(cur.data.wind.speed * 3.6),
      rain_chance: 0,
      city       : cur.data.name,
    };

    const forecast = fore.data.list.slice(0, 8).map(f => ({
      time       : f.dt_txt,
      temp       : Math.round(f.main.temp),
      humidity   : f.main.humidity,
      description: f.weather[0].description,
      rain_chance: Math.round((f.pop || 0) * 100),
      wind_kmh   : Math.round(f.wind.speed * 3.6),
    }));

    const advice = farmingAdvice(current, forecast);
    res.json({ success: true, current, forecast, farming_advice: advice });
  } catch (e) {
    console.error('[Weather]', e.message);
    res.json({ success: true, ...MOCK_WEATHER, source: 'mock' });
  }
});

// ══════════════════════════════════════════════
// 3. MSP 2025-26
//    GET /api/msp
// ══════════════════════════════════════════════
app.get('/api/msp', (req, res) => {
  res.json({ success: true, year: '2025-26', data: MSP_DATA });
});

// ══════════════════════════════════════════════
// 4. GOVERNMENT SCHEMES
//    GET /api/schemes
//    POST /api/schemes/check  body: { land_area, annual_income, has_bank_account, is_govt_employee }
// ══════════════════════════════════════════════
app.get('/api/schemes', (req, res) => {
  res.json({ success: true, data: SCHEMES });
});

app.post('/api/schemes/check', (req, res) => {
  const {
    land_area       = 1,
    annual_income   = 100000,
    has_bank_account= true,
    is_govt_employee= false,
    aadhar_linked   = true,
  } = req.body;

  const result = SCHEMES.map(s => {
    let eligible = true;
    const notes  = [];

    if (s.id === 'pm_kisan') {
      if (is_govt_employee)    { eligible = false; notes.push('❌ सरकारी कर्मचारी पात्र नहीं'); }
      if (annual_income > 200000) { eligible = false; notes.push('❌ आय सीमा ₹2 लाख से अधिक'); }
      if (!aadhar_linked)      notes.push('⚠️ आधार-बैंक लिंक ज़रूरी');
    }
    if (s.id === 'kcc') {
      if (land_area <= 0)      { eligible = false; notes.push('❌ कृषि भूमि होना ज़रूरी'); }
    }
    if (s.id === 'fasal_bima') {
      if (land_area <= 0)      { eligible = false; notes.push('❌ कृषि भूमि होना ज़रूरी'); }
    }
    if (!has_bank_account)     { eligible = false; notes.push('❌ बैंक खाता ज़रूरी'); }

    if (eligible && notes.length === 0) notes.push('✅ आप पूरी तरह पात्र हैं!');
    return { ...s, eligible, notes };
  });

  res.json({
    success: true,
    eligible_count: result.filter(s => s.eligible).length,
    data: result,
  });
});

// ══════════════════════════════════════════════
// 5. GEMINI AI CHAT
//    POST /api/chat  body: { message, language, history }
// ══════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  const { message, language = 'hindi', history = [] } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.json({ success: true, reply: smartFallback(message), source: 'fallback' });
  }

  // Build Gemini contents array (multi-turn)
  const systemPrompt = buildSystemPrompt(language);

  // Gemini uses "contents" array — inject system as first user+model turn
  const contents = [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'समझ गया। मैं VoiceKisan AI हूँ — किसानों का साथी। बताइए क्या मदद चाहिए?' }] },
    ...history.slice(-8).map(h => ({
      role : h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const { data } = await axios.post(url, {
      contents,
      generationConfig: {
        temperature    : 0.7,
        maxOutputTokens: 400,
        topP           : 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }, { timeout: 15000 });

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || smartFallback(message);
    res.json({ success: true, reply, model: 'gemini-1.5-flash' });
  } catch (e) {
    console.error('[Gemini]', e.response?.data || e.message);
    res.json({ success: true, reply: smartFallback(message), source: 'fallback' });
  }
});

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function buildSystemPrompt(lang) {
  const langMap = {
    hindi   : 'हमेशा शुद्ध हिन्दी में जवाब दें। सरल शब्द इस्तेमाल करें जो अनपढ़ किसान भी समझें।',
    bhojpuri: 'हमेशा भोजपुरी में जवाब दीं। जइसे पूरबी UP के गाँव में बोलत हैं।',
    awadhi  : 'हमेशा अवधी में जवाब दें। जइसे लखनऊ, अयोध्या के आसपास बोलत हैं।',
    english : 'Reply in very simple English. Short sentences. Like talking to a village farmer.',
  };
  return `तुम VoiceKisan हो — भारत के किसानों का AI साथी।
${langMap[lang] || langMap.hindi}

तुम्हारे पास ये जानकारी है:
📊 मंडी भाव: गेहूँ ₹2,275 | धान ₹3,850 | सरसों ₹5,650 | मक्का ₹1,890 | चना ₹5,440 | प्याज ₹1,450
🌤️ आज लखनऊ में 34°C, आंशिक बादल, बारिश 20%
💰 PM-KISAN: ₹6,000/वर्ष | KCC: 4% ब्याज पर ₹1.6 लाख | फसल बीमा: रबी 1.5% प्रीमियम
📞 हेल्पलाइन: किसान कॉल 1800-180-1551 | PM-KISAN 155261 | फसल बीमा 14447

नियम:
- 3-5 वाक्यों में जवाब दो, ज़्यादा लंबा नहीं
- हमेशा व्यावहारिक और actionable सलाह दो
- किसान को "भाई" या "जी" बुलाओ, सम्मान से बात करो
- ज़रूरी हो तो helpline नंबर बताओ
- कभी झूठ मत बोलो — अगर नहीं जानते तो कहो "pmkisan.gov.in पर देखें"`;
}

function smartFallback(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('गेहूँ') || m.includes('wheat'))      return '🌾 लखनऊ मंडी में आज गेहूँ का भाव ₹2,275 प्रति क्विंटल है — MSP के बराबर। आज बेचना सही रहेगा।';
  if (m.includes('धान')  || m.includes('paddy'))       return '🌾 बासमती धान का भाव ₹3,850/क्विंटल चल रहा है। e-NAM पर ऑनलाइन बेचें तो ₹3,900+ मिल सकता है।';
  if (m.includes('बारिश')|| m.includes('मौसम'))        return '🌤️ अगले 3 दिन लखनऊ में हल्की धूप रहेगी। कल बारिश की 30% संभावना है — सिंचाई आज कर लें।';
  if (m.includes('kisan') || m.includes('किसान'))      return '💰 PM-KISAN की अगली किस्त ₹2,000 जुलाई 2026 में आएगी। स्थिति pmkisan.gov.in पर चेक करें।';
  if (m.includes('loan') || m.includes('लोन') || m.includes('kcc')) return '🏦 KCC के लिए नज़दीकी SBI/PNB जाएँ। खतौनी + आधार लेकर जाएँ। 4% ब्याज पर ₹1.6 लाख मिलेगा।';
  if (m.includes('बीमा') || m.includes('fasal'))       return '🌧️ PM फसल बीमा के लिए pmfby.gov.in पर जाएँ या हेल्पलाइन 14447 पर कॉल करें।';
  if (m.includes('मिट्टी')|| m.includes('soil'))       return '🧪 मिट्टी जाँच के लिए नज़दीकी कृषि केंद्र जाएँ — बिलकुल मुफ्त! soilhealth.dac.gov.in पर जानकारी मिलेगी।';
  return '🙏 जी! मैं मंडी भाव, मौसम, सरकारी योजनाएँ और खेती की सलाह दे सकता हूँ। बताइए क्या जानना है?';
}

function farmingAdvice(cur, fore) {
  const tips = [];
  if (cur.temp > 38)                        tips.push('🌡️ बहुत गर्मी — दोपहर 12-4 बजे काम न करें');
  if (fore.some(f => f.rain_chance > 50))   tips.push('🌧️ कल बारिश संभव — फसल काटनी हो तो आज करें');
  else                                       tips.push('☀️ अच्छा मौसम — कटाई और सुखाने का सही समय');
  if (cur.humidity > 80)                    tips.push('💧 नमी ज़्यादा — फंगस रोग का खतरा, फफूंदनाशी छिड़कें');
  if (cur.wind_kmh > 30)                    tips.push('💨 तेज़ हवा — कीटनाशक छिड़काव न करें आज');
  return tips;
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
  { crop:'Wheat',    crop_hi:'गेहूँ',   market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:2200, max_price:2310, modal_price:2275, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Paddy',    crop_hi:'धान',     market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:3700, max_price:3950, modal_price:3850, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Mustard',  crop_hi:'सरसों',   market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:5580, max_price:5720, modal_price:5650, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Maize',    crop_hi:'मक्का',   market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:1840, max_price:1920, modal_price:1890, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Onion',    crop_hi:'प्याज',   market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:1380, max_price:1510, modal_price:1450, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Chickpea', crop_hi:'चना',     market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:5400, max_price:5500, modal_price:5440, date:new Date().toLocaleDateString('en-IN') },
  { crop:'Potato',   crop_hi:'आलू',     market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:900,  max_price:1050, modal_price:980,  date:new Date().toLocaleDateString('en-IN') },
  { crop:'Tomato',   crop_hi:'टमाटर',   market:'Lucknow', district:'Lucknow', state:'Uttar Pradesh', min_price:1200, max_price:1600, modal_price:1400, date:new Date().toLocaleDateString('en-IN') },
];

const MOCK_WEATHER = {
  current : { temp:34, feels_like:38, humidity:68, description:'आंशिक बादल', wind_kmh:14, rain_chance:20, city:'Lucknow' },
  forecast: [
    { time:'आज शाम', temp:36, humidity:60, description:'धूप',       rain_chance:10, wind_kmh:12 },
    { time:'कल सुबह', temp:28, humidity:75, description:'साफ़',      rain_chance:15, wind_kmh:10 },
    { time:'कल दोपहर',temp:35, humidity:65, description:'हल्के बादल',rain_chance:30, wind_kmh:18 },
  ],
  farming_advice:['☀️ अच्छा मौसम — कटाई का सही समय','💧 शाम को सिंचाई करें'],
};

const MSP_DATA = [
  { crop_hi:'गेहूँ',       crop_en:'Wheat',        msp:2275,  unit:'₹/क्विंटल', season:'रबी'  },
  { crop_hi:'धान (सामान्य)',crop_en:'Paddy',        msp:2183,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'मक्का',       crop_en:'Maize',         msp:1962,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'सरसों',       crop_en:'Mustard',       msp:5650,  unit:'₹/क्विंटल', season:'रबी'  },
  { crop_hi:'चना',         crop_en:'Chickpea',      msp:5440,  unit:'₹/क्विंटल', season:'रबी'  },
  { crop_hi:'अरहर',        crop_en:'Arhar/Tur',     msp:7550,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'मूँग',        crop_en:'Moong',         msp:8682,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'सोयाबीन',     crop_en:'Soybean',       msp:4892,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'कपास (लंबा)', crop_en:'Cotton Long',   msp:7121,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'गन्ना (FRP)', crop_en:'Sugarcane',     msp:340,   unit:'₹/क्विंटल', season:'वार्षिक'},
  { crop_hi:'मूँगफली',     crop_en:'Groundnut',     msp:6783,  unit:'₹/क्विंटल', season:'खरीफ' },
  { crop_hi:'बाजरा',       crop_en:'Bajra',         msp:2625,  unit:'₹/क्विंटल', season:'खरीफ' },
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
    description_hi:'बीज, खाद, उपकरण के लिए 4% ब्याज पर कृषि ऋण। किसी गारंटी की ज़रूरत नहीं।',
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
    description_hi:'मिट्टी की जाँच — सही खाद, सही मात्रा, सही फसल। हर 2 साल में एक बार।',
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

// ══════════════════════════════════════════════
// START
// ══════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🌾 ══════════════════════════════════════`);
  console.log(`   VoiceKisan API  →  http://localhost:${PORT}`);
  console.log(`   AI Engine       →  Google Gemini 1.5 Flash`);
  console.log(`   Mandi Data      →  Agmarknet (data.gov.in)`);
  console.log(`   Weather         →  OpenWeatherMap`);
  console.log(`🌾 ══════════════════════════════════════\n`);
});
