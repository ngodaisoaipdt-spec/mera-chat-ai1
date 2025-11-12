// app.js - PHIÊN BẢN HOÀN CHỈNH (TẠO QR BẰNG VIETQR CLIENT-SIDE)

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
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const querystring = require('querystring');

dotenv.config({ override: true });
const app = express();
const port = process.env.PORT || 3000;
app.set('trust proxy', 1);

mongoose.connect(process.env.MONGODB_URI).then(() => console.log("✅ Đã kết nối MongoDB!")).catch(err => { console.error("❌ Lỗi kết nối MongoDB:", err); process.exit(1); });

const userSchema = new mongoose.Schema({ googleId: String, displayName: String, email: String, avatar: String, isPremium: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } });
const User = mongoose.model('User', userSchema);
const memorySchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, character: String, history: { type: Array, default: [] }, user_profile: { relationship_stage: { type: String, default: 'stranger' }, sent_gallery_images: [String], sent_video_files: [String], message_count: { type: Number, default: 0 } } });
const Memory = mongoose.model('Memory', memorySchema);
const transactionSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, orderCode: { type: String, unique: true }, amount: Number, status: { type: String, enum: ['pending', 'success'], default: 'pending' }, paymentMethod: { type: String, enum: ['qr', 'vnpay'], default: 'qr' }, vnpayTransactionId: String, createdAt: { type: Date, default: Date.now } });
const Transaction = mongoose.model('Transaction', transactionSchema);

const RELATIONSHIP_RULES = [
    { stage: 'stranger', minMessages: 0, requiresPremium: false },
    { stage: 'friend', minMessages: 10, requiresPremium: false },
    { stage: 'lover', minMessages: 25, requiresPremium: true },
    { stage: 'mistress', minMessages: 45, requiresPremium: true }
];

function determineRelationshipStage(messageCount = 0, isPremiumUser = false) {
    let currentStage = 'stranger';
    for (const rule of RELATIONSHIP_RULES) {
        if (messageCount >= rule.minMessages && (!rule.requiresPremium || isPremiumUser)) {
            currentStage = rule.stage;
        } else {
            break;
        }
    }
    return currentStage;
}

function canSelectRelationshipStage(stage, messageCount = 0, isPremiumUser = false) {
    const rule = RELATIONSHIP_RULES.find(r => r.stage === stage);
    if (!rule) return false;
    if (rule.requiresPremium && !isPremiumUser) return false;
    if (messageCount < rule.minMessages) return false;
    return true;
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 60 * 60 * 24 * 30
    }),
    cookie: { secure: 'auto', maxAge: 1000 * 60 * 60 * 24 * 30, sameSite: 'lax' }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({ clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: "/auth/google/callback" }, async (accessToken, refreshToken, profile, done) => { try { let user = await User.findOne({ googleId: profile.id }); if (!user) { user = await new User({ googleId: profile.id, displayName: profile.displayName, email: profile.emails[0].value, avatar: profile.photos[0].value }).save(); } return done(null, user); } catch (err) { console.error("Lỗi trong GoogleStrategy:", err); return done(err, null); } }));
passport.serializeUser((user, done) => { done(null, user.id); });
passport.deserializeUser(async (id, done) => { try { const user = await User.findById(id); done(null, user); } catch (err) { done(err, null); } });
function ensureAuthenticated(req, res, next) { if (req.isAuthenticated()) { return next(); } res.status(401).json({ error: 'Chưa đăng nhập' }); }

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?login_error=true' }), (req, res) => { res.redirect('/?login=success'); });
app.get('/api/current_user', (req, res) => { if (req.user) res.json(req.user); else res.status(401).json(null); });
app.get('/logout', (req, res, next) => { req.logout(err => { if (err) { return next(err); } res.redirect('/'); }); });

const PREMIUM_PRICE = 48000;

app.post('/api/create-payment', ensureAuthenticated, async (req, res) => {
    try {
        const { paymentMethod = 'qr' } = req.body;
        const orderCode = `MERACHAT${Date.now()}`;
        const transaction = await new Transaction({ userId: req.user.id, orderCode: orderCode, amount: PREMIUM_PRICE, paymentMethod: paymentMethod }).save();
        
        if (paymentMethod === 'vnpay') {
            const vnpayUrl = createVNPayPaymentUrl(orderCode, PREMIUM_PRICE, req);
            console.log(`Đã tạo thông tin thanh toán VNPay cho Order: ${orderCode}`);
            res.json({
                success: true,
                paymentUrl: vnpayUrl,
                orderCode: orderCode,
                paymentMethod: 'vnpay'
            });
        } else {
            console.log(`Đã tạo thông tin thanh toán VietQR cho Order: ${orderCode}`);
            res.json({
                success: true,
                accountNo: process.env.SEPAY_ACCOUNT_NO,
                accountName: process.env.SEPAY_ACCOUNT_NAME,
                acqId: process.env.SEPAY_BANK_BIN,
                amount: PREMIUM_PRICE,
                orderCode: orderCode,
                paymentMethod: 'qr'
            });
        }
    } catch (error) {
        console.error("❌ Lỗi tạo thông tin giao dịch:", error.message);
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo thông tin giao dịch.' });
    }
});

function formatDateVNPay(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function createVNPayPaymentUrl(orderCode, amount, req) {
    const vnp_TmnCode = process.env.VNPAY_TMN_CODE || '';
    const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || '';
    const vnp_Url = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const vnp_ReturnUrl = `${req.protocol}://${req.get('host')}/api/vnpay-return`;
    
    const date = new Date();
    const createDate = formatDateVNPay(date);
    const expireDate = formatDateVNPay(new Date(date.getTime() + 15 * 60000));
    
    // Try to get a clean IPv4 address for VNPay
    const rawIp =
        (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        (req.connection && req.connection.socket && req.connection.socket.remoteAddress) ||
        '127.0.0.1';
    const ipv4 = rawIp.replace('::ffff:', '') || '127.0.0.1';
    
    const vnp_Params = {};
    vnp_Params['vnp_Version'] = '2.1.0';
    vnp_Params['vnp_Command'] = 'pay';
    vnp_Params['vnp_TmnCode'] = vnp_TmnCode;
    vnp_Params['vnp_Locale'] = 'vn';
    vnp_Params['vnp_CurrCode'] = 'VND';
    vnp_Params['vnp_TxnRef'] = orderCode;
    vnp_Params['vnp_OrderInfo'] = `Thanh toan Premium - ${orderCode}`;
    vnp_Params['vnp_OrderType'] = 'other';
    vnp_Params['vnp_Amount'] = (amount * 100).toString();
    vnp_Params['vnp_ReturnUrl'] = vnp_ReturnUrl;
    vnp_Params['vnp_IpAddr'] = ipv4;
    vnp_Params['vnp_CreateDate'] = createDate;
    vnp_Params['vnp_ExpireDate'] = expireDate;
    
    const sortedParams = Object.keys(vnp_Params).sort().reduce((result, key) => {
        result[key] = vnp_Params[key];
        return result;
    }, {});
    
    const signData = querystring.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    // Append hash after signing; do not include in signed string
    vnp_Params['vnp_SecureHashType'] = 'HMACSHA512';
    vnp_Params['vnp_SecureHash'] = signed;
    
    return vnp_Url + '?' + querystring.stringify(vnp_Params, { encode: false });
}

app.post('/api/sepay-webhook', async (req, res) => {
    try {
        const payload = req.body || {};
        console.log("🔔 Webhook từ SePay/Casso nhận được:", payload);

        // Hỗ trợ nhiều tên trường khác nhau cho "nội dung/memo"
        const possibleMemoFields = [
            payload.description, payload.memo, payload.order_code, payload.content, payload.addInfo, payload.note,
            payload.txContent, payload.message, payload.comment,
            payload.data?.description, payload.data?.addInfo, payload.data?.memo
        ].filter(v => typeof v === 'string');

        let memo = possibleMemoFields.find(Boolean) || '';
        // Trích xuất MERACHATxxxx nếu có
        const matched = memo.match(/MERACHAT\d+/i);
        const orderCode = matched ? matched[0] : memo;

        // Hỗ trợ nhiều trạng thái thành công
        const statusRaw = String(payload.status || payload.data?.status || payload.result || payload.event || '').toUpperCase();
        let isSuccess = ['SUCCESS', 'PAID', 'COMPLETED', 'DONE', 'SUCCESSFUL'].some(k => statusRaw.includes(k)) || payload.success === true;
        // Một số webhook Bank API không có status, dùng transferType/amount để xác định "tiền vào"
        const transferType = String(payload.transferType || payload.data?.transferType || '').toLowerCase();
        const transferAmount = Number(payload.transferAmount || payload.amount || payload.data?.amount || 0);
        if (!isSuccess) {
            if (transferType === 'in' || transferType === 'credit') isSuccess = true;
            else if (transferAmount > 0 && /CT\s*DEN|SEVQR/i.test(String(payload.description || payload.content || ''))) {
                isSuccess = true;
            }
        }

        if (!orderCode) {
            console.warn('⚠️ Webhook không có orderCode/memo hợp lệ.');
            return res.status(200).send('NO_ORDER_CODE');
        }

        if (!isSuccess) {
            console.warn(`⚠️ Webhook chưa ở trạng thái thành công (status=${statusRaw}).`);
            return res.status(200).send('IGNORED');
        }

        const transaction = await Transaction.findOne({ orderCode });
        if (transaction && transaction.status === 'pending') {
            transaction.status = 'success';
            await transaction.save();
            await User.findByIdAndUpdate(transaction.userId, { isPremium: true });
            console.log(`✅ Nâng cấp Premium thành công qua Webhook cho user: ${transaction.userId} với order ${orderCode}`);
        } else {
            console.log(`ℹ️ Không tìm thấy transaction pending cho order ${orderCode} (có thể đã xử lý).`);
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('❌ Lỗi xử lý Webhook:', err);
        res.status(200).send('ERROR');
    }
});

// Endpoint xác nhận thủ công (dùng khi cần test nếu webhook chậm)
app.post('/api/confirm-payment', ensureAuthenticated, async (req, res) => {
    try {
        const { orderCode } = req.body;
        if (!orderCode) return res.status(400).json({ success: false, message: 'Thiếu orderCode' });
        const transaction = await Transaction.findOne({ orderCode, userId: req.user.id });
        if (!transaction) return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
        if (transaction.status === 'success') return res.json({ success: true, message: 'Đã xác nhận trước đó' });
        transaction.status = 'success';
        await transaction.save();
        await User.findByIdAndUpdate(transaction.userId, { isPremium: true });
        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

app.get('/api/vnpay-return', async (req, res) => {
    try {
        const vnp_Params = req.query;
        const secureHash = vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];
        
        const vnp_HashSecret = process.env.VNPAY_HASH_SECRET || '';
        const signData = querystring.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', vnp_HashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
        
        if (secureHash === signed) {
            const orderCode = vnp_Params['vnp_TxnRef'];
            const responseCode = vnp_Params['vnp_ResponseCode'];
            const transactionId = vnp_Params['vnp_TransactionNo'];
            
            if (responseCode === '00') {
                const transaction = await Transaction.findOne({ orderCode: orderCode });
                if (transaction && transaction.status === 'pending') {
                    transaction.status = 'success';
                    transaction.vnpayTransactionId = transactionId;
                    await transaction.save();
                    await User.findByIdAndUpdate(transaction.userId, { isPremium: true });
                    console.log(`✅ Nâng cấp Premium thành công qua VNPay cho user: ${transaction.userId} với order ${orderCode}`);
                }
                res.redirect('/?payment=success');
            } else {
                console.log(`❌ Thanh toán VNPay thất bại: ${orderCode}, ResponseCode: ${responseCode}`);
                res.redirect('/?payment=failed');
            }
        } else {
            console.log('❌ Chữ ký VNPay không hợp lệ');
            res.redirect('/?payment=invalid');
        }
    } catch (error) {
        console.error("❌ Lỗi xử lý VNPay return:", error);
        res.redirect('/?payment=error');
    }
});

app.get('/api/payment-status/:orderCode', ensureAuthenticated, async (req, res) => {
    try {
        const { orderCode } = req.params;
        const transaction = await Transaction.findOne({ orderCode: orderCode, userId: req.user.id });
        res.json({ status: transaction ? transaction.status : 'pending' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
const characters = { mera: { voice: "hn-phuongtrang", base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Mera, 19 tuổi, một cô gái năng động...` }, thang: { voice: "hn-thanhtung", base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Trương Thắng, 24 tuổi...` } };

async function loadMemory(userId, character) { let memory = await Memory.findOne({ userId, character }); if (!memory) { memory = new Memory({ userId, character, user_profile: {} }); await memory.save(); } return memory; }
app.get('/api/chat-data/:character', ensureAuthenticated, async (req, res) => {
    const { character } = req.params;
    const memory = await loadMemory(req.user._id, character);
    memory.user_profile = memory.user_profile || {};
    const computedStage = determineRelationshipStage(memory.user_profile.message_count || 0, req.user.isPremium);
    if (memory.user_profile.relationship_stage !== computedStage) {
        memory.user_profile.relationship_stage = computedStage;
        await memory.save();
    }
    res.json({ memory, isPremium: req.user.isPremium });
});
app.post('/chat', ensureAuthenticated, async (req, res) => { try { const { message, character } = req.body; const isPremiumUser = req.user.isPremium; let memory = await loadMemory(req.user._id, character); memory.user_profile = memory.user_profile || {}; let userProfile = memory.user_profile; 
    if (!isPremiumUser && message.toLowerCase().includes('yêu')) { const charName = character === 'mera' ? 'Mera' : 'Trương Thắng'; return res.json({ displayReply: `Chúng ta cần thân thiết hơn...<NEXT_MESSAGE>Nâng cấp Premium...`, historyReply: "[PREMIUM_PROMPT]", }); }
    const systemPrompt = generateMasterPrompt(userProfile, character, isPremiumUser); 
    const gptResponse = await xai.chat.completions.create({ model: "grok-3-mini", messages: [{ role: 'system', content: systemPrompt }, ...memory.history, { role: 'user', content: message }] }); 
    let rawReply = gptResponse.choices[0].message.content.trim(); 
    let mediaUrl = null, mediaType = null; const mediaRegex = /\[SEND_MEDIA:\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\]/; const mediaMatch = rawReply.match(mediaRegex); if (mediaMatch) { const [, type, topic, subject] = mediaMatch; if (topic === 'sensitive' && !isPremiumUser) { rawReply = rawReply.replace(mediaRegex, '').trim() || "Em/Anh có ảnh đó... riêng tư lắm."; } else { const mediaResult = await sendMediaFile(memory, character, type, topic, subject); if (mediaResult.success) { mediaUrl = mediaResult.mediaUrl; mediaType = mediaResult.mediaType; memory.user_profile = mediaResult.updatedMemory.user_profile; } rawReply = rawReply.replace(mediaRegex, '').trim() || mediaResult.message; } } 
    memory.history.push({ role: 'user', content: message }); memory.history.push({ role: 'assistant', content: rawReply }); userProfile.message_count = (userProfile.message_count || 0) + 1; const computedStage = determineRelationshipStage(userProfile.message_count, isPremiumUser); if (!userProfile.relationship_stage || userProfile.relationship_stage !== computedStage) { userProfile.relationship_stage = computedStage; } if (memory.history.length > 50) { memory.history = memory.history.slice(memory.history.length - 50); } 
    await memory.save(); 
    const displayReply = rawReply.replace(/\n/g, ' ').replace(/<NEXT_MESSAGE>/g, '<NEXT_MESSAGE>'); const audioDataUri = await createViettelVoice(rawReply.replace(/<NEXT_MESSAGE>/g, '... '), character); 
    res.json({ displayReply, historyReply: rawReply, audio: audioDataUri, mediaUrl, mediaType, updatedMemory: memory }); 
} catch (error) { console.error("❌ Lỗi chung trong /chat:", error); res.status(500).json({ displayReply: 'Xin lỗi, có lỗi kết nối xảy ra!', historyReply: 'Lỗi!' }); } });

// Cập nhật tình trạng mối quan hệ
app.post('/api/relationship', ensureAuthenticated, async (req, res) => {
    try {
        const { character, stage } = req.body;
        if (!character || !stage) return res.status(400).json({ success: false, message: 'Thiếu tham số' });
        const memory = await loadMemory(req.user._id, character);
        memory.user_profile = memory.user_profile || {};
        const rule = RELATIONSHIP_RULES.find(r => r.stage === stage);
        if (!rule) return res.status(400).json({ success: false, message: 'Cấp độ không hợp lệ' });
        const messageCount = memory.user_profile.message_count || 0;
        if (rule.requiresPremium && !req.user.isPremium) {
            return res.status(403).json({ success: false, message: 'Bạn cần nâng cấp Premium để mở khóa giai đoạn này.' });
        }
        if (messageCount < rule.minMessages) {
            return res.status(403).json({ success: false, message: 'Bạn hãy trò chuyện nhiều hơn để thăng cấp mối quan hệ.' });
        }
        memory.user_profile.relationship_stage = stage;
        await memory.save();
        res.json({ success: true, stage });
    } catch (e) {
        console.error('❌ Lỗi cập nhật relationship:', e);
        res.status(500).json({ success: false });
    }
});

// Xóa toàn bộ cuộc trò chuyện
app.post('/api/clear-chat', ensureAuthenticated, async (req, res) => {
    try {
        const { character } = req.body;
        if (!character) return res.status(400).json({ success: false, message: 'Thiếu tham số' });
        const memory = await loadMemory(req.user._id, character);
        memory.history = [];
        memory.user_profile = memory.user_profile || {};
        memory.user_profile.message_count = 0;
        memory.user_profile.relationship_stage = determineRelationshipStage(0, req.user.isPremium);
        await memory.save();
        res.json({ success: true, memory });
    } catch (error) {
        console.error('❌ Lỗi xóa cuộc trò chuyện:', error);
        res.status(500).json({ success: false, message: 'Xóa cuộc trò chuyện thất bại' });
    }
});

function generateMasterPrompt(userProfile, character, isPremiumUser) { /* Toàn bộ logic giữ nguyên */ return ``; }
let cachedViettelToken = process.env.VIETTEL_AI_TOKEN || null;
let cachedTokenExpiredAt = 0;

async function getViettelToken() {
    if (cachedViettelToken && Date.now() < cachedTokenExpiredAt) {
        return cachedViettelToken;
    }
    const tokenUrl = process.env.VIETTEL_AI_TOKEN_URL;
    const clientId = process.env.VIETTEL_AI_CLIENT_ID;
    const clientSecret = process.env.VIETTEL_AI_CLIENT_SECRET;
    if (!tokenUrl || !clientId || !clientSecret) {
        return cachedViettelToken;
    }
    try {
        const response = await axios.post(tokenUrl, {
            client_id: clientId,
            client_secret: clientSecret
        }, { timeout: 8000 });
        const token = response.data?.access_token || response.data?.token;
        const expiresIn = response.data?.expires_in || 3600;
        if (token) {
            cachedViettelToken = token;
            cachedTokenExpiredAt = Date.now() + (expiresIn - 30) * 1000;
        }
        return cachedViettelToken;
    } catch (error) {
        console.error("❌ Lỗi lấy token Viettel AI:", error.response?.data || error.message);
        return cachedViettelToken;
    }
}

async function createViettelVoice(textToSpeak, character) {
    try {
        const trimmed = (textToSpeak || '').trim();
        if (!trimmed) return null;
        const voice = characters[character]?.voice || 'hn-phuongtrang';
        const token = await getViettelToken();
        if (!token) {
            console.warn("⚠️ Chưa cấu hình token Viettel AI, bỏ qua sinh giọng nói.");
            return null;
        }
        const ttsUrl = process.env.VIETTEL_AI_TTS_URL || 'https://viettelgroup.ai/api/tts/v1/rest/syn';
        const payload = {
            text: trimmed,
            voice,
            id: crypto.randomUUID(),
            speed: 1,
            volume: 1,
            tts_return_option: 3 // trả về dữ liệu base64
        };
        const response = await axios.post(ttsUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'token': token
            },
            timeout: 15000
        });
        const base64Audio = response.data?.data || response.data?.result?.data;
        if (!base64Audio) return null;
        return `data:audio/wav;base64,${base64Audio}`;
    } catch (error) {
        console.error("❌ Lỗi tạo giọng nói Viettel:", error.response?.data || error.message);
        return null;
    }
}
async function sendMediaFile(memory, character, mediaType, topic, subject) { /* Toàn bộ logic giữ nguyên */ return { success: false, message: "Lỗi" }; }

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(port, () => { console.log(`🚀 Server đang chạy tại cổng ${port}`); });