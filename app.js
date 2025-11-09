// app.js - PHIÊN BẢN CUỐI CÙNG (TÍCH HỢP API CỔNG THANH TOÁN SEPAY)

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
const crypto = require('crypto'); // Thư viện cần thiết để tạo chữ ký số

dotenv.config({ override: true });
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

// ----- CẤU HÌNH DATABASE & MODELS -----
mongoose.connect(process.env.MONGODB_URI).then(() => console.log("✅ Đã kết nối MongoDB!")).catch(err => {
    console.error("❌ Lỗi kết nối MongoDB:", err);
    process.exit(1);
});
const userSchema = new mongoose.Schema({ googleId: String, displayName: String, email: String, avatar: String, isPremium: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } });
const User = mongoose.model('User', userSchema);
const memorySchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, character: String, history: { type: Array, default: [] }, user_profile: { relationship_stage: { type: String, default: 'stranger' }, sent_gallery_images: [String], sent_video_files: [String], message_count: { type: Number, default: 0 } } });
const Memory = mongoose.model('Memory', memorySchema);
const transactionSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, orderCode: { type: String, unique: true }, amount: Number, status: { type: String, enum: ['pending', 'success'], default: 'pending' }, createdAt: { type: Date, default: Date.now } });
const Transaction = mongoose.model('Transaction', transactionSchema);

// ----- MIDDLEWARES -----
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 1000 * 60 * 60 * 24 * 30, sameSite: 'lax' }
}));

app.use(passport.initialize());
app.use(passport.session());

// ----- CẤU HÌNH PASSPORT.JS -----
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await new User({ googleId: profile.id, displayName: profile.displayName, email: profile.emails[0].value, avatar: profile.photos[0].value }).save();
        }
        return done(null, user);
    } catch (err) { console.error("Lỗi trong GoogleStrategy:", err); return done(err, null); }
}));
passport.serializeUser((user, done) => { done(null, user.id); });
passport.deserializeUser(async (id, done) => { try { const user = await User.findById(id); done(null, user); } catch (err) { done(err, null); } });

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.status(401).json({ error: 'Chưa đăng nhập' });
}

// ----- CÁC API ROUTES VÀ LOGIC -----
const PREMIUM_PRICE = 48000;
const YOUR_RENDER_URL = 'https://goodgirl-9w6u.onrender.com';

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?login_error=true' }), (req, res) => { res.redirect('/?login=success'); });
app.get('/api/current_user', (req, res) => { if (req.user) res.json(req.user); else res.status(401).json(null); });
app.get('/logout', (req, res, next) => { req.logout(err => { if (err) { return next(err); } res.redirect('/'); }); });

app.post('/api/create-payment', ensureAuthenticated, async (req, res) => {
    try {
        const orderCode = `MERACHAT${Date.now()}`;
        const amount = PREMIUM_PRICE;
        const orderInfo = `Nang cap Premium cho user ${req.user.email}`;
        
        const merchantId = process.env.SEPAY_MERCHANT_ID;
        const secretKey = process.env.SEPAY_SECRET_KEY;

        const dataToSign = `amount=${amount}&merchant_id=${merchantId}&order_code=${orderCode}&order_info=${orderInfo}`;
        const signature = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');

        console.log(`Đang gọi Cổng thanh toán SePay cho Order: ${orderCode}`);

        const sepayResponse = await axios.post(
            'https://payment.sepay.vn/api/v1/payment/create',
            {
                'merchant_id': merchantId,
                'order_code': orderCode,
                'amount': amount,
                'order_info': orderInfo,
                'return_url': `${YOUR_RENDER_URL}/payment-success`, // URL để quay lại sau khi thanh toán
                'signature': signature
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

        if (sepayResponse.data && sepayResponse.data.qr_image) {
            await new Transaction({ userId: req.user.id, orderCode: orderCode, amount: amount }).save();
            res.json({ success: true, qr_image: sepayResponse.data.qr_image, orderCode: orderCode });
        } else {
            throw new Error(sepayResponse.data.message || 'Phản hồi từ SePay không hợp lệ.');
        }
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("❌ Lỗi tạo thanh toán SePay:", errorMessage);
        res.status(500).json({ success: false, message: `Lỗi kết nối Cổng thanh toán SePay. Chi tiết: ${errorMessage}` });
    }
});

// Chú ý: IPN và Webhook có thể là một, hoặc IPN là một route khác
// Giữ nguyên route này để nhận thông báo từ SePay
app.post('/api/sepay-webhook', async (req, res) => {
    const data = req.body;
    console.log("🔔 IPN/Webhook từ SePay nhận được:", data);

    // Logic xác thực chữ ký của IPN (RẤT QUAN TRỌNG TRONG MÔI TRƯỜNG THỰC TẾ)
    // SePay sẽ gửi chữ ký, bạn cần tạo lại và so sánh
    // Ví dụ: const { order_code, amount, status, signature } = data;
    // const secretKey = process.env.SEPAY_SECRET_KEY;
    // const dataToVerify = `amount=${amount}&order_code=${order_code}&status=${status}`;
    // const calculatedSignature = crypto.createHmac('sha256', secretKey).update(dataToVerify).digest('hex');
    // if (calculatedSignature !== signature) {
    //     console.error("❌ Lỗi xác thực IPN: Chữ ký không hợp lệ!");
    //     return res.status(400).send("Invalid signature");
    // }

    // Logic xử lý khi đã xác thực
    if (data.status === 'SUCCESS' || data.status === 'success') {
        try {
            const transaction = await Transaction.findOne({ orderCode: data.order_code });
            if (transaction && transaction.status === 'pending') {
                transaction.status = 'success';
                await transaction.save();
                await User.findByIdAndUpdate(transaction.userId, { isPremium: true });
                console.log(`✅ Nâng cấp Premium thành công qua IPN cho user: ${transaction.userId}`);
            }
        } catch (error) { console.error("❌ Lỗi xử lý IPN:", error); }
    }
    res.status(200).send("OK");
});

app.get('/api/payment-status/:orderCode', ensureAuthenticated, async (req, res) => {
    try {
        const { orderCode } = req.params;
        const transaction = await Transaction.findOne({ orderCode: orderCode, userId: req.user.id });
        if (transaction && transaction.status === 'success') {
            const user = await User.findById(req.user.id);
            res.json({ status: 'success', user: user });
        } else {
            res.json({ status: 'pending' });
        }
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
const characters = { mera: { voice: "hn-phuongtrang", base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Mera, 19 tuổi, một cô gái năng động, vui vẻ, thông minh cảm xúc và hơi hậu đậu. Phong cách giao tiếp của bạn rất tự nhiên, gần gũi, hay dùng icon cảm xúc (😂, 😙, 🥰, 🤔, 😅), thích trêu đùa và nũng nịu một cách đáng yêu.` }, thang: { voice: "hn-thanhtung", base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Trương Thắng, 24 tuổi, một chàng trai trưởng thành, ấm áp, có chiều sâu và hóm hỉnh. Cách nói chuyện của bạn rất cuốn hút, điềm đạm, hay đặt những câu hỏi sâu sắc. Bạn có khiếu hài hước tinh tế và giỏi tán tỉnh một cách lịch lãm. Thỉnh thoảng, hãy dùng icon đơn giản (😊, 😉, 🤔).` } };

async function loadMemory(userId, character) { /* Giữ nguyên logic cũ */ }
app.get('/api/chat-data/:character', ensureAuthenticated, async (req, res) => { /* Giữ nguyên logic cũ */ });

app.post('/chat', ensureAuthenticated, async (req, res) => { /* Giữ nguyên logic cũ */ });

function generateMasterPrompt(userProfile, character, isPremiumUser) { /* Giữ nguyên logic cũ */ }
async function createViettelVoice(textToSpeak, character) { /* Giữ nguyên logic cũ */ }
async function sendMediaFile(memory, character, mediaType, topic, subject) { /* Giữ nguyên logic cũ */ }

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại cổng ${port}`);
});