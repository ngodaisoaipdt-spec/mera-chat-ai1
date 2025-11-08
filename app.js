// app.js - PHIÊN BẢN HOÀN CHỈNH CUỐI CÙNG (ĐÃ SỬA LỖI CÚ PHÁP)

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const path = require('path');
const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs').promises;
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const bodyParser = require('body-parser');

dotenv.config({ override: true });
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

mongoose.connect(process.env.MONGODB_URI).then(() => console.log("✅ Đã kết nối MongoDB!")).catch(err => { console.error("❌ Lỗi kết nối MongoDB:", err); process.exit(1); });

const userSchema = new mongoose.Schema({ /* ... Giữ nguyên ... */ });
const User = mongoose.model('User', userSchema);
const memorySchema = new mongoose.Schema({ /* ... Giữ nguyên ... */ });
const Memory = mongoose.model('Memory', memorySchema);
const transactionSchema = new mongoose.Schema({ /* ... Giữ nguyên ... */ });
const Transaction = mongoose.model('Transaction', transactionSchema);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    // ... (logic GoogleStrategy giữ nguyên)
}));

passport.serializeUser((user, done) => { done(null, user.id); });
passport.deserializeUser(async (id, done) => { /* ... Giữ nguyên ... */ });
function ensureAuthenticated(req, res, next) { /* ... Giữ nguyên ... */ }

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?login_error=true' }), (req, res) => { res.redirect('/?login=success'); });
app.get('/api/current_user', (req, res) => { /* ... Giữ nguyên ... */ });
app.get('/logout', (req, res, next) => { /* ... Giữ nguyên ... */ });

const PREMIUM_PRICE = 48000;
const YOUR_PUBLIC_URL = 'https://goodgirl-9w6u.onrender.com';

app.post('/api/create-payment', ensureAuthenticated, async (req, res) => { /* ... Giữ nguyên ... */ });
app.post('/api/sepay-webhook', async (req, res) => { /* ... Giữ nguyên ... */ });
app.get('/api/payment-status/:orderCode', ensureAuthenticated, async (req, res) => { /* ... Giữ nguyên ... */ });

const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
const characters = { /* ... Giữ nguyên ... */ };
async function loadMemory(userId, character) { /* ... Giữ nguyên ... */ }
app.get('/api/chat-data/:character', ensureAuthenticated, async (req, res) => { /* ... Giữ nguyên ... */ });

app.post('/chat', ensureAuthenticated, async (req, res) => {
    // ... (toàn bộ logic /chat giữ nguyên)
});

function generateMasterPrompt(userProfile, character, isPremiumUser) { /* ... Giữ nguyên ... */ }
async function createViettelVoice(textToSpeak, character) { /* ... Giữ nguyên ... */ }
async function sendMediaFile(memory, character, mediaType, topic, subject) { /* ... Giữ nguyên ... */ }

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// LỖI NẰM Ở ĐÂY, ĐÂY LÀ PHIÊN BẢN ĐÚNG
app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại cổng ${port}`);
});
// ĐOẠN VĂN BẢN TIẾNG VIỆT GÂY LỖI ĐÃ ĐƯỢC XÓA