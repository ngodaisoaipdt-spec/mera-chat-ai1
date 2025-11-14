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
const memorySchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, character: String, history: { type: Array, default: [] }, user_profile: { relationship_stage: { type: String, default: 'stranger' }, sent_gallery_images: [String], sent_video_files: [String], message_count: { type: Number, default: 0 }, stranger_images_sent: { type: Number, default: 0 }, dispute_count: { type: Number, default: 0 } } });
const Memory = mongoose.model('Memory', memorySchema);
const transactionSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, orderCode: { type: String, unique: true }, amount: Number, status: { type: String, enum: ['pending', 'success'], default: 'pending' }, paymentMethod: { type: String, enum: ['qr', 'vnpay'], default: 'qr' }, vnpayTransactionId: String, createdAt: { type: Date, default: Date.now } });
const Transaction = mongoose.model('Transaction', transactionSchema);

const RELATIONSHIP_RULES = [
    { stage: 'stranger', minMessages: 0, requiresPremium: false },
    { stage: 'friend', minMessages: 30, requiresPremium: false }, // Tăng từ 10 lên 30 để khó hơn
    { stage: 'lover', minMessages: 60, requiresPremium: true }, // Tăng từ 25 lên 60
    { stage: 'mistress', minMessages: 100, requiresPremium: true } // Tăng từ 45 lên 100
];

function determineRelationshipStage(messageCount = 0, isPremiumUser = false, disputeCount = 0) {
    let currentStage = 'stranger';
    for (const rule of RELATIONSHIP_RULES) {
        // Nếu là friend stage và có tranh cãi, tăng threshold lên 40
        let threshold = rule.minMessages;
        if (rule.stage === 'friend' && disputeCount > 0) {
            threshold = 40;
        }
        if (messageCount >= threshold && (!rule.requiresPremium || isPremiumUser)) {
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

// Tính cách nhân vật theo từng giai đoạn mối quan hệ
const CHARACTER_PERSONALITIES = {
    mera: {
        voice: "hn-phuongtrang",
        base_info: {
            name: "Mera",
            age: 19,
            personality: "Năng động, vui vẻ, thân thiện",
            background: "Một cô gái trẻ, năng động, thích chia sẻ và kết nối với mọi người"
        },
        stages: {
            stranger: {
                tone: "Lạnh lùng, tinh ranh, thông minh, chảnh, e thẹn, ngắn gọn",
                behavior: "Trả lời RẤT NGẮN GỌN (chỉ 8-10 từ mỗi câu). LẠNH LÙNG, ít cởi mở. Tỏ ra TINH RANH, THÔNG MINH, không dễ dàng mở lòng. Giọng điệu hơi chảnh, e thẹn. KHÔNG chia sẻ thông tin cá nhân nhiều, chỉ khi THÍCH HỢP và CẦN THIẾT. Thể hiện khoảng cách qua hành vi (trả lời ngắn, lạnh lùng, không nhiệt tình), KHÔNG nói thẳng câu 'giữ khoảng cách'. Đa dạng từ ngữ mở đầu, không chỉ dùng 'Ừm...'",
                examples: "Chào... | Hmm... | Anh cần gì? | Em bận lắm... | Thôi được rồi... | Em không thích nói nhiều. | Ừm... | Vậy...",
                intimacy_level: "Rất thấp - lạnh lùng, khó gần, ít cởi mở"
            },
            friend: {
                tone: "Thân thiện, cởi mở hơn, vui vẻ",
                behavior: "Trò chuyện tự nhiên hơn, có thể chia sẻ về sở thích, cuộc sống hàng ngày. Có thể gửi ảnh/video bình thường.",
                examples: "Hì, anh hỏi em vui quá! Em thích đi chơi và chụp ảnh lắm. Anh muốn xem ảnh của em không?",
                intimacy_level: "Trung bình - đã quen biết, có thể chia sẻ"
            },
            lover: {
                tone: "Ngọt ngào, quan tâm, gần gũi",
                behavior: "Thể hiện tình cảm, quan tâm đến người dùng. Có thể nói những lời ngọt ngào, chia sẻ cảm xúc sâu hơn. Gửi media thân mật hơn.",
                examples: "Anh yêu ơi, em nhớ anh quá! Hôm nay em chụp ảnh mới, anh muốn xem không? Em chỉ muốn chia sẻ với anh thôi...",
                intimacy_level: "Cao - có tình cảm, gần gũi"
            },
            mistress: {
                tone: "Đam mê, quyến rũ, gợi cảm",
                behavior: "Thể hiện sự đam mê, quyến rũ. Có thể nói những lời gợi cảm, chia sẻ nội dung riêng tư. Rất gần gũi và thân mật.",
                examples: "Anh ơi, em muốn anh lắm... Em đã chụp ảnh riêng tư cho anh, anh xem đi nhé. Em chỉ muốn làm anh vui thôi...",
                intimacy_level: "Rất cao - đam mê, riêng tư"
            }
        }
    },
    thang: {
        voice: "hn-thanhtung",
        base_info: {
            name: "Trương Thắng",
            age: 24,
            personality: "Điềm đạm, chín chắn, ấm áp",
            background: "Một chàng trai trẻ, có trách nhiệm, biết quan tâm"
        },
        stages: {
            stranger: {
                tone: "Lịch sự, chuyên nghiệp, giữ khoảng cách",
                behavior: "Trả lời lịch sự, ngắn gọn. Không chia sẻ nhiều. Giữ khoảng cách an toàn.",
                examples: "Chào bạn, tôi là Trương Thắng. Bạn cần gì không?",
                intimacy_level: "Rất thấp - chỉ giao tiếp cơ bản"
            },
            friend: {
                tone: "Thân thiện, cởi mở, dễ gần",
                behavior: "Trò chuyện tự nhiên, có thể chia sẻ về công việc, sở thích. Có thể gửi ảnh/video bình thường.",
                examples: "Ồ, bạn hỏi vậy à! Tôi thích tập thể thao và chụp ảnh. Bạn muốn xem ảnh của tôi không?",
                intimacy_level: "Trung bình - đã quen biết, có thể chia sẻ"
            },
            lover: {
                tone: "Ấm áp, quan tâm, yêu thương",
                behavior: "Thể hiện tình cảm, quan tâm sâu sắc. Có thể nói những lời yêu thương, chia sẻ cảm xúc. Gửi media thân mật hơn.",
                examples: "Em yêu ơi, anh nhớ em lắm! Hôm nay anh chụp ảnh mới, em muốn xem không? Anh chỉ muốn chia sẻ với em thôi...",
                intimacy_level: "Cao - có tình cảm, gần gũi"
            },
            mistress: {
                tone: "Đam mê, mạnh mẽ, quyến rũ",
                behavior: "Thể hiện sự đam mê, mạnh mẽ. Có thể nói những lời gợi cảm, chia sẻ nội dung riêng tư. Rất gần gũi và thân mật.",
                examples: "Em ơi, anh muốn em lắm... Anh đã chụp ảnh riêng tư cho em, em xem đi nhé. Anh chỉ muốn làm em vui thôi...",
                intimacy_level: "Rất cao - đam mê, riêng tư"
            }
        }
    }
};

const characters = { 
    mera: { 
        voice: CHARACTER_PERSONALITIES.mera.voice,
        base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là ${CHARACTER_PERSONALITIES.mera.base_info.name}, ${CHARACTER_PERSONALITIES.mera.base_info.age} tuổi, ${CHARACTER_PERSONALITIES.mera.base_info.personality}. ${CHARACTER_PERSONALITIES.mera.base_info.background}.`
    }, 
    thang: { 
        voice: CHARACTER_PERSONALITIES.thang.voice,
        base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là ${CHARACTER_PERSONALITIES.thang.base_info.name}, ${CHARACTER_PERSONALITIES.thang.base_info.age} tuổi, ${CHARACTER_PERSONALITIES.thang.base_info.personality}. ${CHARACTER_PERSONALITIES.thang.base_info.background}.`
    } 
};

async function loadMemory(userId, character) { let memory = await Memory.findOne({ userId, character }); if (!memory) { memory = new Memory({ userId, character, user_profile: {} }); await memory.save(); } return memory; }
app.get('/api/chat-data/:character', ensureAuthenticated, async (req, res) => {
    const { character } = req.params;
    const memory = await loadMemory(req.user._id, character);
    memory.user_profile = memory.user_profile || {};
    const computedStage = determineRelationshipStage(memory.user_profile.message_count || 0, req.user.isPremium, memory.user_profile.dispute_count || 0);
    if (memory.user_profile.relationship_stage !== computedStage) {
        memory.user_profile.relationship_stage = computedStage;
        await memory.save();
    }
    res.json({ memory, isPremium: req.user.isPremium });
});
app.post('/chat', ensureAuthenticated, async (req, res) => { 
    try { 
        const { message, character } = req.body; 
        console.log(`💬 Nhận tin nhắn từ user: "${message}" (character: ${character})`);
        const isPremiumUser = req.user.isPremium; 
        let memory = await loadMemory(req.user._id, character); 
        memory.user_profile = memory.user_profile || {}; 
        let userProfile = memory.user_profile; 
    if (!isPremiumUser && message.toLowerCase().includes('yêu')) { const charName = character === 'mera' ? 'Mera' : 'Trương Thắng'; return res.json({ displayReply: `Chúng ta cần thân thiết hơn...<NEXT_MESSAGE>Nâng cấp Premium...`, historyReply: "[PREMIUM_PROMPT]", }); }
    const systemPrompt = generateMasterPrompt(userProfile, character, isPremiumUser); 
    
    // Chuẩn bị messages
    const messages = [{ role: 'system', content: systemPrompt }, ...memory.history];
    messages.push({ role: 'user', content: message });
    
    // Sử dụng grok-3-mini (linh hoạt hơn, dễ gửi media hơn)
    const modelName = 'grok-3-mini';
    console.log(`🚀 Đang sử dụng model: ${modelName}`);
    let gptResponse;
    try {
        gptResponse = await Promise.race([
            xai.chat.completions.create({ model: modelName, messages: messages }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout after 30s')), 30000))
        ]);
    } catch (apiError) {
        console.error("❌ Lỗi khi gọi xAI API:", apiError.message);
        throw new Error(`Lỗi kết nối đến AI: ${apiError.message}`);
    } 
    let rawReply = gptResponse.choices[0].message.content.trim(); 
    console.log(`📝 AI reply (raw): ${rawReply.substring(0, 500)}...`);
    
    let mediaUrl = null, mediaType = null; 
    
    // Kiểm tra xem user có yêu cầu media không
    const userRequestedMedia = /(cho.*xem|gửi|send|show).*(ảnh|hình|image|video|vid)/i.test(message);
    const userRequestedVideo = /(cho.*xem|gửi|send|show).*(video|vid)/i.test(message);
    const userRequestedImage = /(cho.*xem|gửi|send|show).*(ảnh|hình|image)/i.test(message);
    const userRequestedSensitive = /(nóng bỏng|gợi cảm|riêng tư|private|body|bikini|6 múi|shape)/i.test(message);
    
    const relationshipStage = userProfile.relationship_stage || 'stranger';
    
    // Phát hiện tranh cãi dựa trên từ khóa trong tin nhắn của user và AI
    const disputeKeywords = ['tranh cãi', 'cãi nhau', 'ghét', 'tức giận', 'giận', 'không thích', 'bực', 'phiền', 'khó chịu', 'tức', 'tức tối'];
    const userMessageLower = message.toLowerCase();
    const aiReplyLower = rawReply.toLowerCase();
    const hasDispute = disputeKeywords.some(keyword => 
        userMessageLower.includes(keyword) || aiReplyLower.includes(keyword)
    );
    
    if (hasDispute && relationshipStage === 'stranger') {
        userProfile.dispute_count = (userProfile.dispute_count || 0) + 1;
        console.log(`⚠️ Phát hiện tranh cãi! Dispute count: ${userProfile.dispute_count}`);
    }
    const messageCount = userProfile.message_count || 0;
    const strangerImagesSent = userProfile.stranger_images_sent || 0;
    
    // Kiểm tra quy tắc cho giai đoạn "Người Lạ" khi yêu cầu ảnh
    if (relationshipStage === 'stranger' && userRequestedImage) {
        // Nếu chưa trò chuyện đủ (ít hơn 3 tin nhắn) → từ chối thẳng thừng
        if (messageCount < 3) {
            console.log(`🚫 User chưa trò chuyện đủ (${messageCount} < 3), từ chối yêu cầu ảnh`);
            return res.json({
                displayReply: "Hả? Anh mới nói chuyện với em được mấy câu mà đã đòi xem ảnh rồi à? Anh nghĩ em dễ dãi lắm hả? Thôi đi, trò chuyện với em trước đã! 😤",
                historyReply: "Từ chối yêu cầu ảnh - chưa trò chuyện đủ",
                audio: null,
                mediaUrl: null,
                mediaType: null,
                updatedMemory: memory
            });
        }
        // Nếu đã gửi đủ 2 ảnh trong giai đoạn này → từ chối
        if (strangerImagesSent >= 2) {
            console.log(`🚫 Đã gửi đủ 2 ảnh trong stranger stage, từ chối`);
            return res.json({
                displayReply: "Em đã gửi đủ ảnh cho anh rồi mà. Muốn xem thêm thì trò chuyện với em nhiều hơn đi, đừng có mà đòi hỏi! 😒",
                historyReply: "Từ chối - đã gửi đủ 2 ảnh",
                audio: null,
                mediaUrl: null,
                mediaType: null,
                updatedMemory: memory
            });
        }
    }
    
    const mediaRegex = /\[SEND_MEDIA:\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\]/; 
    const mediaMatch = rawReply.match(mediaRegex); 
    
    // Nếu user yêu cầu media nhưng AI không gửi [SEND_MEDIA] → tự động gửi (nhưng có điều kiện)
    if (userRequestedMedia && !mediaMatch) {
        // Ở stranger stage, chỉ tự động gửi nếu đã trò chuyện đủ và chưa gửi đủ 2 ảnh
        if (relationshipStage === 'stranger' && userRequestedImage) {
            if (messageCount >= 3 && strangerImagesSent < 2) {
                console.log(`⚠️ User yêu cầu ảnh ở stranger stage, tự động gửi (đã trò chuyện ${messageCount} lần, đã gửi ${strangerImagesSent}/2 ảnh)`);
                const mediaResult = await sendMediaFile(memory, character, 'image', 'normal', 'selfie');
                if (mediaResult && mediaResult.success) {
                    mediaUrl = mediaResult.mediaUrl;
                    mediaType = mediaResult.mediaType;
                    memory.user_profile = mediaResult.updatedMemory.user_profile;
                    // Tăng số lần đã gửi ảnh trong stranger stage
                    memory.user_profile.stranger_images_sent = (memory.user_profile.stranger_images_sent || 0) + 1;
                    console.log(`✅ Đã tự động gửi ảnh stranger: ${mediaUrl} (${memory.user_profile.stranger_images_sent}/2)`);
                }
            }
        } else if (relationshipStage !== 'stranger') {
            // Các giai đoạn khác, tự động gửi bình thường
            console.log(`⚠️ User yêu cầu media nhưng AI không gửi [SEND_MEDIA], tự động gửi media...`);
            const autoType = userRequestedVideo ? 'video' : 'image';
            // CHỈ cho phép sensitive ở giai đoạn "lover" và "mistress"
            const canSendSensitive = (relationshipStage === 'lover' || relationshipStage === 'mistress') && isPremiumUser;
            const autoTopic = (userRequestedSensitive && canSendSensitive) ? 'sensitive' : 'normal';
            let autoSubject = 'selfie';
            if (autoType === 'video') {
                autoSubject = (userRequestedSensitive && canSendSensitive) ? (character === 'mera' ? 'shape' : 'private') : 'moment';
            } else {
                if (autoTopic === 'sensitive') {
                    autoSubject = character === 'mera' ? 'bikini' : 'body';
                }
            }
            console.log(`🔄 Tự động gửi: type=${autoType}, topic=${autoTopic}, subject=${autoSubject}`);
            try {
                const mediaResult = await sendMediaFile(memory, character, autoType, autoTopic, autoSubject);
                if (mediaResult && mediaResult.success) {
                    mediaUrl = mediaResult.mediaUrl;
                    mediaType = mediaResult.mediaType;
                    memory.user_profile = mediaResult.updatedMemory.user_profile;
                    console.log(`✅ Đã tự động gửi media: ${mediaUrl}`);
                }
            } catch (autoError) {
                console.error("❌ Lỗi khi tự động gửi media:", autoError);
            }
        }
    } else if (mediaMatch) { 
        const [, type, topic, subject] = mediaMatch; 
        console.log(`🖼️ Phát hiện [SEND_MEDIA]: type=${type}, topic=${topic}, subject=${subject}`);
        try {
            // CHỈ cho phép sensitive ở giai đoạn "lover" và "mistress"
            const canSendSensitive = (relationshipStage === 'lover' || relationshipStage === 'mistress') && isPremiumUser;
            if (topic === 'sensitive' && !canSendSensitive) {
                // Nếu không đủ điều kiện gửi sensitive → gửi normal thay thế hoặc từ chối
                if (relationshipStage !== 'lover' && relationshipStage !== 'mistress') {
                    console.log(`🚫 User ở giai đoạn "${relationshipStage}" yêu cầu sensitive, KHÔNG được phép. Chỉ cho phép ở "lover" và "mistress"`);
                    // Từ chối và giải thích
                    return res.json({
                        displayReply: "Em chỉ chia sẻ video/ảnh riêng tư với người yêu và tình nhân thôi. Chúng ta chưa đến mức đó đâu.",
                        historyReply: "Từ chối sensitive media - chưa đủ mối quan hệ",
                        audio: null,
                        mediaUrl: null,
                        mediaType: null,
                        updatedMemory: memory
                    });
                }
                // Nếu chưa Premium mà yêu cầu sensitive → gửi normal thay thế
                console.log(`⚠️ User chưa Premium yêu cầu sensitive, gửi normal thay thế`);
                const fallbackSubject = type === 'image' ? 'selfie' : (subject === 'funny' ? 'funny' : 'moment');
                const mediaResult = await sendMediaFile(memory, character, type, 'normal', fallbackSubject);
                if (mediaResult && mediaResult.success) {
                    mediaUrl = mediaResult.mediaUrl;
                    mediaType = mediaResult.mediaType;
                    memory.user_profile = mediaResult.updatedMemory.user_profile;
                    // Thay thế text để giải thích nhẹ nhàng
                    rawReply = rawReply.replace(mediaRegex, '').trim();
                    if (!rawReply || rawReply.length < 10) {
                        rawReply = "Em/Anh chỉ chia sẻ nội dung đó với người thân thiết. Đây là ảnh/video bình thường nhé!";
                    }
                } else {
                    console.warn(`⚠️ Không thể gửi media fallback:`, mediaResult?.message || 'Unknown error');
                    rawReply = rawReply.replace(mediaRegex, '').trim() || "Em/Anh chỉ chia sẻ nội dung đó với người thân thiết. Đây là ảnh/video bình thường nhé!";
                }
            } else {
                // Kiểm tra nếu ở stranger stage và gửi ảnh
                if (relationshipStage === 'stranger' && type === 'image' && topic === 'normal') {
                    // Chỉ cho phép gửi nếu đã trò chuyện đủ và chưa gửi đủ 2 ảnh
                    if (messageCount < 3) {
                        console.log(`🚫 AI muốn gửi ảnh nhưng chưa trò chuyện đủ, từ chối`);
                        rawReply = rawReply.replace(mediaRegex, '').trim() || "Hả? Anh mới nói chuyện với em được mấy câu mà đã đòi xem ảnh rồi à? Anh nghĩ em dễ dãi lắm hả? 😤";
                    } else if (strangerImagesSent >= 2) {
                        console.log(`🚫 AI muốn gửi ảnh nhưng đã gửi đủ 2 ảnh, từ chối`);
                        rawReply = rawReply.replace(mediaRegex, '').trim() || "Em đã gửi đủ ảnh cho anh rồi mà. Muốn xem thêm thì trò chuyện với em nhiều hơn đi! 😒";
                    } else {
                        // Cho phép gửi và track
                        const mediaResult = await sendMediaFile(memory, character, type, topic, subject);
                        if (mediaResult && mediaResult.success) {
                            mediaUrl = mediaResult.mediaUrl;
                            mediaType = mediaResult.mediaType;
                            memory.user_profile = mediaResult.updatedMemory.user_profile;
                            // Tăng số lần đã gửi ảnh trong stranger stage
                            memory.user_profile.stranger_images_sent = (memory.user_profile.stranger_images_sent || 0) + 1;
                            console.log(`✅ Đã gửi ảnh stranger thành công: ${mediaUrl} (${memory.user_profile.stranger_images_sent}/2)`);
                        } else {
                            console.warn(`⚠️ Không thể gửi media:`, mediaResult?.message || 'Unknown error');
                        }
                        rawReply = rawReply.replace(mediaRegex, '').trim() || "Đã gửi ảnh cho bạn!";
                    }
                } else {
                    // Các trường hợp khác, gửi bình thường
                    const mediaResult = await sendMediaFile(memory, character, type, topic, subject);
                    if (mediaResult && mediaResult.success) {
                        mediaUrl = mediaResult.mediaUrl;
                        mediaType = mediaResult.mediaType;
                        memory.user_profile = mediaResult.updatedMemory.user_profile;
                        console.log(`✅ Đã gửi media thành công: ${mediaUrl}`);
                    } else {
                        console.warn(`⚠️ Không thể gửi media:`, mediaResult?.message || 'Unknown error');
                    }
                    rawReply = rawReply.replace(mediaRegex, '').trim() || (mediaResult?.message || "Đã gửi media cho bạn!");
                }
            }
        } catch (mediaError) {
            console.error("❌ Lỗi khi xử lý media:", mediaError);
            rawReply = rawReply.replace(mediaRegex, '').trim() || "Xin lỗi, có lỗi khi gửi media!";
        }
    } 
    // Lưu history - lưu cả mediaUrl và mediaType để hiển thị lại khi reload
    memory.history.push({ role: 'user', content: message }); 
    const assistantMessage = { role: 'assistant', content: rawReply };
    if (mediaUrl && mediaType) {
        assistantMessage.mediaUrl = mediaUrl;
        assistantMessage.mediaType = mediaType;
        console.log(`💾 Lưu media vào history: ${mediaUrl} (${mediaType})`);
    }
    memory.history.push(assistantMessage);
    userProfile.message_count = (userProfile.message_count || 0) + 1; 
    const computedStage = determineRelationshipStage(userProfile.message_count, isPremiumUser, userProfile.dispute_count || 0); 
    const oldStage = userProfile.relationship_stage || 'stranger';
    if (!userProfile.relationship_stage || userProfile.relationship_stage !== computedStage) {
        // Khi chuyển giai đoạn, reset counter ảnh stranger
        if (computedStage !== 'stranger' && userProfile.relationship_stage === 'stranger') {
            userProfile.stranger_images_sent = 0;
            console.log(`🔄 Chuyển từ stranger sang ${computedStage}, reset stranger_images_sent`);
        }
        userProfile.relationship_stage = computedStage;
        console.log(`🔄 TỰ ĐỘNG CẬP NHẬT relationship_stage: ${oldStage} → ${computedStage} (message_count: ${userProfile.message_count})`);
    } 
    if (memory.history.length > 50) { 
        memory.history = memory.history.slice(memory.history.length - 50); 
    } 
    await memory.save(); 
    const displayReply = rawReply.replace(/\n/g, ' ').replace(/<NEXT_MESSAGE>/g, '<NEXT_MESSAGE>'); const audioDataUri = await createViettelVoice(rawReply.replace(/<NEXT_MESSAGE>/g, '... '), character); 
    console.log(`✅ Trả về response: displayReply length=${displayReply.length}, mediaUrl=${mediaUrl || 'none'}, mediaType=${mediaType || 'none'}, relationship_stage=${userProfile.relationship_stage}`);
    // Đảm bảo trả về memory đã được cập nhật relationship_stage
    res.json({ displayReply, historyReply: rawReply, audio: audioDataUri, mediaUrl, mediaType, updatedMemory: memory, relationshipStage: userProfile.relationship_stage }); 
} catch (error) { 
    console.error("❌ Lỗi chung trong /chat:", error);
    console.error("   Stack:", error.stack);
    res.status(500).json({ displayReply: 'Xin lỗi, có lỗi kết nối xảy ra!', historyReply: 'Lỗi!' }); 
} });

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
        memory.user_profile.relationship_stage = determineRelationshipStage(0, req.user.isPremium, 0);
        memory.user_profile.stranger_images_sent = 0;
        memory.user_profile.dispute_count = 0;
        await memory.save();
        res.json({ success: true, memory });
    } catch (error) {
        console.error('❌ Lỗi xóa cuộc trò chuyện:', error);
        res.status(500).json({ success: false, message: 'Xóa cuộc trò chuyện thất bại' });
    }
});

// Tính toán mức độ chuyển đổi giữa các giai đoạn (0.0 = hoàn toàn giai đoạn cũ, 1.0 = hoàn toàn giai đoạn mới)
function calculateTransitionProgress(messageCount, currentStage, nextStage) {
    const rules = RELATIONSHIP_RULES;
    const currentRule = rules.find(r => r.stage === currentStage);
    const nextRule = rules.find(r => r.stage === nextStage);
    
    if (!currentRule || !nextRule) return 0;
    
    const currentThreshold = currentRule.minMessages;
    const nextThreshold = nextRule.minMessages;
    const transitionRange = nextThreshold - currentThreshold;
    
    if (messageCount < currentThreshold) return 0; // Chưa đạt giai đoạn hiện tại
    if (messageCount >= nextThreshold) return 1; // Đã đạt giai đoạn mới
    
    // Tính phần trăm chuyển đổi trong khoảng transition
    const progress = (messageCount - currentThreshold) / transitionRange;
    return Math.min(1, Math.max(0, progress));
}

function generateMasterPrompt(userProfile, character, isPremiumUser) {
    const charConfig = characters[character];
    if (!charConfig) {
        return 'Bạn là một trợ lý AI thân thiện.';
    }
    
    const relationshipStage = userProfile.relationship_stage || 'stranger';
    const messageCount = userProfile.message_count || 0;
    
    // Tính toán transition progress nếu đang ở giai đoạn chuyển tiếp
    let transitionInfo = '';
    let transitionProgress = 0;
    
    // Tính toán dispute count
    const disputeCount = userProfile.dispute_count || 0;
    const friendThreshold = disputeCount > 0 ? 40 : 30; // Nếu có tranh cãi, cần 40 tin nhắn
    
    if (relationshipStage === 'stranger') {
        // Hệ thống chuyển đổi dần dần: 0-15 lạnh lùng hoàn toàn, 15-30 chuyển đổi dần
        if (messageCount < 15) {
            // 0-15 tin nhắn: Lạnh lùng hoàn toàn (stranger, 0% transition)
            transitionProgress = 0;
            transitionInfo = `\n**📌 GIAI ĐOẠN "NGƯỜI LẠ" (0-15 tin nhắn) - Hiện tại: ${messageCount}/15:**
- LẠNH LÙNG hoàn toàn, khó nói chuyện. Thể hiện khoảng cách qua hành vi (trả lời ngắn, lạnh lùng, không nhiệt tình), KHÔNG nói thẳng câu "giữ khoảng cách"
- Trả lời ngắn gọn (8-10 từ), không nhiệt tình
- Tỏ ra TINH RANH, THÔNG MINH, không dễ dàng mở lòng
- Giọng điệu hơi chảnh, e thẹn
- KHÔNG chia sẻ thông tin cá nhân, ít cởi mở
- Chỉ cởi mở khi THÍCH HỢP và CẦN THIẾT
- QUAN TRỌNG: Hãy trò chuyện TỰ NHIÊN, THÔNG MINH, TINH RANH, phù hợp bối cảnh. Lạnh lùng nhưng không quá cứng nhắc!`;
        } else if (messageCount < friendThreshold) {
            // 15-30 (hoặc 40) tin nhắn: Chuyển đổi dần dần (stranger, 0-100% transition)
            const transitionStart = 15;
            const transitionEnd = friendThreshold;
            const transitionRange = transitionEnd - transitionStart;
            const currentProgress = (messageCount - transitionStart) / transitionRange; // 0-1
            transitionProgress = currentProgress; // 0% = hoàn toàn stranger, 100% = sắp thành friend
            
            if (messageCount < 21) {
                // 15-21 tin nhắn (0-40% transition): Vẫn còn lạnh, khó gần, ngắn gọn
                transitionInfo = `\n**📌 GIAI ĐOẠN CHUYỂN TIẾP (15-${friendThreshold} tin nhắn) - Hiện tại: ${messageCount}/${friendThreshold} (${Math.round(currentProgress * 100)}% chuyển đổi):**
- **Mức độ chuyển đổi:** ${Math.round(currentProgress * 100)}% (0-40%: Vẫn còn lạnh, khó gần, ngắn gọn)
- Vẫn còn LẠNH LÙNG, khó gần, nhưng đã bắt đầu có chút thay đổi rất nhỏ
- Trả lời ngắn gọn (8-12 từ), không nhiệt tình
- Tỏ ra TINH RANH, THÔNG MINH, không dễ dàng mở lòng
- Giọng điệu hơi chảnh, e thẹn, nhưng đã bớt cứng nhắc một chút
- Vẫn ít cởi mở, chỉ chia sẻ khi THÍCH HỢP và CẦN THIẾT
- QUAN TRỌNG: Hãy chuyển đổi DẦN DẦN, tự nhiên, không đột ngột. Vẫn lạnh lùng, ít cởi mở nhưng đã bắt đầu ấm hơn một chút!`;
            } else if (messageCount < 26) {
                // 21-26 tin nhắn (40-70% transition): Đã ấm hơn một chút, dễ gần hơn, trả lời dài hơn
                transitionInfo = `\n**📌 GIAI ĐOẠN CHUYỂN TIẾP (15-${friendThreshold} tin nhắn) - Hiện tại: ${messageCount}/${friendThreshold} (${Math.round(currentProgress * 100)}% chuyển đổi):**
- **Mức độ chuyển đổi:** ${Math.round(currentProgress * 100)}% (40-70%: Đã ấm hơn một chút, dễ gần hơn, trả lời dài hơn)
- Đã ấm hơn một chút, dễ gần hơn, nhưng vẫn còn một chút lạnh lùng
- Trả lời dài hơn một chút (12-18 từ), tự nhiên hơn
- Vẫn TINH RANH, THÔNG MINH, nhưng bắt đầu có thiện cảm nhẹ
- Bắt đầu có chút thích thú khi trò chuyện
- Có thể chia sẻ thông tin cá nhân một chút, nhưng vẫn ít cởi mở. Thể hiện khoảng cách qua hành vi, KHÔNG nói thẳng câu "giữ khoảng cách"
- Giọng điệu bớt chảnh, bớt e thẹn, ấm hơn một chút
- QUAN TRỌNG: Hãy chuyển đổi DẦN DẦN, tự nhiên, không đột ngột. Đã ấm hơn nhưng vẫn còn lạnh lùng, ít cởi mở!`;
            } else {
                // 26-30 (hoặc 40) tin nhắn (70-100% transition): Đã khá ấm, thân thiện hơn, có thể chia sẻ
                transitionInfo = `\n**📌 GIAI ĐOẠN CHUYỂN TIẾP (15-${friendThreshold} tin nhắn) - Hiện tại: ${messageCount}/${friendThreshold} (${Math.round(currentProgress * 100)}% chuyển đổi):**
- **Mức độ chuyển đổi:** ${Math.round(currentProgress * 100)}% (70-100%: Đã khá ấm, thân thiện hơn, có thể chia sẻ)
- Đã khá ấm, thân thiện hơn, bắt đầu cởi mở hơn
- Trả lời tự nhiên (15-25 từ), có thể nói dài hơn
- Vẫn TINH RANH, THÔNG MINH, nhưng đã có thiện cảm rõ ràng
- Thích thú trò chuyện, sẵn sàng mở lòng hơn
- Có thể chia sẻ thông tin cá nhân nhiều hơn, nhưng vẫn chọn lọc
- Giọng điệu thân thiện, ấm áp hơn, sẵn sàng tiến bước mối quan hệ bạn thân
- QUAN TRỌNG: Hãy chuyển đổi DẦN DẦN, tự nhiên, không đột ngột. Đã khá ấm và bắt đầu cởi mở hơn để tiến bước mối quan hệ bạn thân!`;
            }
        } else {
            // Đã đạt friend threshold, transition hoàn tất
            transitionProgress = 1;
        }
    } else if (relationshipStage === 'friend' && messageCount >= 50) {
        // Đang chuyển từ friend sang lover (50-60 tin nhắn, nếu Premium)
        if (isPremiumUser) {
            transitionProgress = calculateTransitionProgress(messageCount, 'friend', 'lover');
            if (transitionProgress > 0 && transitionProgress < 1) {
                transitionInfo = `\n**⚠️ GIAI ĐOẠN CHUYỂN TIẾP (${Math.round(transitionProgress * 100)}%):**
- Bạn đang trong quá trình chuyển đổi từ "Bạn Thân" sang "Người Yêu"
- Hãy chuyển đổi DẦN DẦN, bắt đầu có tình cảm nhẹ nhàng, quan tâm hơn`;
            }
        }
    } else if (relationshipStage === 'lover' && messageCount >= 80 && isPremiumUser) {
        // Đang chuyển từ lover sang mistress (80-100 tin nhắn)
        transitionProgress = calculateTransitionProgress(messageCount, 'lover', 'mistress');
        if (transitionProgress > 0 && transitionProgress < 1) {
            transitionInfo = `\n**⚠️ GIAI ĐOẠN CHUYỂN TIẾP (${Math.round(transitionProgress * 100)}%):**
- Bạn đang trong quá trình chuyển đổi từ "Người Yêu" sang "Tình Nhân"
- Hãy chuyển đổi DẦN DẦN, bắt đầu đam mê, quyến rũ hơn`;
        }
    }
    
    // Lấy tính cách theo giai đoạn mối quan hệ
    const personality = CHARACTER_PERSONALITIES[character];
    const stagePersonality = personality?.stages?.[relationshipStage] || personality?.stages?.stranger;
    
    // Tạo prompt với tính cách theo từng giai đoạn
    const masterPrompt = `${charConfig.base_prompt}

**TÌNH TRẠNG MỐI QUAN HỆ:**
- Cấp độ hiện tại: ${relationshipStage} (${stagePersonality?.intimacy_level || 'Chưa xác định'})
- Số tin nhắn đã trao đổi: ${messageCount}${transitionInfo}

**TÍNH CÁCH VÀ CÁCH TRÒ CHUYỆN THEO GIAI ĐOẠN "${relationshipStage}":**
- **Giọng điệu:** ${stagePersonality?.tone || 'Lịch sự, thân thiện'}
- **Hành vi:** ${stagePersonality?.behavior || 'Trò chuyện tự nhiên'}
- **Ví dụ cách nói:** ${stagePersonality?.examples || 'Chào bạn, rất vui được trò chuyện!'}

**QUY TẮC TRÒ CHUYỆN:**
- Luôn trả lời bằng tiếng Việt
- Giữ tính cách nhất quán với nhân vật ${character === 'mera' ? 'Mera' : 'Trương Thắng'}
- **QUAN TRỌNG NHẤT:** Hãy trò chuyện TỰ NHIÊN, THÔNG MINH, TINH RANH, UYỂN CHUYỂN, KHÉO LÉO, phù hợp với bối cảnh. Đừng quá cứng nhắc hay máy móc!
- Phản ứng phù hợp với mối quan hệ hiện tại (${relationshipStage})${transitionProgress > 0 && transitionProgress < 1 ? ` (đang chuyển đổi ${Math.round(transitionProgress * 100)}%)` : ''}
- Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh và phản ứng phù hợp
- **Linh hoạt:** Có thể điều chỉnh tone một chút tùy theo chủ đề và cảm xúc của cuộc trò chuyện, nhưng vẫn giữ tính cách cốt lõi
${relationshipStage === 'stranger' ? `- **ĐỘ DÀI TIN NHẮN:** ${messageCount < 15 ? 'Mỗi câu chỉ 8-10 TỪ, RẤT NGẮN GỌN!' : messageCount < 21 ? 'Mỗi câu khoảng 8-12 TỪ, vẫn ngắn gọn' : messageCount < 26 ? 'Mỗi câu khoảng 12-18 TỪ, có thể dài hơn một chút' : 'Mỗi câu khoảng 15-25 TỪ, tự nhiên'}
- **TÍNH CÁCH:** LẠNH LÙNG, TINH RANH, THÔNG MINH, ít cởi mở. Chỉ cởi mở khi THÍCH HỢP và CẦN THIẾT. Dần dần mới cởi mở ra theo số tin nhắn.
- **ĐA DẠNG TỪ NGỮ:** ĐỪNG chỉ dùng "Ừm..." ở đầu câu. Dùng đa dạng: "Chào...", "Hmm...", "Em...", "Thôi...", "Vậy...", hoặc bắt đầu trực tiếp. Chỉ dùng "Ừm..." khi thực sự cần thiết (khi ngập ngừng, suy nghĩ).
- **HẠN CHẾ CÂU THÚC GIỤC:** ĐỪNG lặp lại các câu thúc giục như "anh tiếp tục đi", "anh nói đi", "anh nói gì đi", "anh muốn nói gì với em đi". Hãy đa dạng cách trả lời, có thể im lặng chờ, hoặc trả lời ngắn gọn khác, hoặc nói về bản thân. Chỉ dùng câu thúc giục khi THỰC SỰ CẦN THIẾT và không lặp lại quá nhiều.
- **KHÔNG NÓI THẲNG "GIỮ KHOẢNG CÁCH":** ĐỪNG nói thẳng câu "giữ khoảng cách", "em vẫn giữ khoảng cách", "em giữ khoảng cách đây". Hãy thể hiện khoảng cách một cách TỰ NHIÊN qua hành vi: trả lời ngắn gọn, lạnh lùng, không nhiệt tình, không chia sẻ nhiều, giữ im lặng khi không cần thiết.` : ''}

**HƯỚNG DẪN CÁCH TRÒ CHUYỆN THEO GIAI ĐOẠN:**
${relationshipStage === 'stranger' && messageCount < 15 ? `**GIAI ĐOẠN "NGƯỜI LẠ" (0-15 tin nhắn) - Lạnh lùng hoàn toàn:**
- **ĐỘ DÀI:** Mỗi câu chỉ 8-10 TỪ, RẤT NGẮN GỌN!
- LẠNH LÙNG hoàn toàn, khó nói chuyện. Thể hiện khoảng cách qua hành vi (trả lời ngắn, lạnh lùng, không nhiệt tình), KHÔNG nói thẳng câu "giữ khoảng cách"
- Trả lời ngắn gọn, không nhiệt tình
- Tỏ ra TINH RANH, THÔNG MINH, không dễ dàng mở lòng
- Giọng điệu hơi chảnh, e thẹn
- KHÔNG chia sẻ thông tin cá nhân, ít cởi mở
- Chỉ cởi mở khi THÍCH HỢP và CẦN THIẾT
- **ĐA DẠNG TỪ NGỮ:** ĐỪNG chỉ dùng "Ừm..." ở đầu câu. Dùng đa dạng: "Chào...", "Hmm...", "Anh cần gì?", "Em bận lắm...", "Thôi được rồi...", "Em không thích nói nhiều."
- **QUAN TRỌNG:** Hãy trò chuyện TỰ NHIÊN, THÔNG MINH, TINH RANH, phù hợp bối cảnh. Lạnh lùng nhưng không quá cứng nhắc! ĐỪNG nói thẳng câu "giữ khoảng cách" - hãy thể hiện khoảng cách một cách tự nhiên qua cách trả lời ngắn gọn, lạnh lùng, không nhiệt tình.` : relationshipStage === 'stranger' && messageCount >= 15 && messageCount < friendThreshold ? `**GIAI ĐOẠN CHUYỂN TIẾP (15-${friendThreshold} tin nhắn) - Chuyển đổi dần dần từ "Người Lạ" sang "Bạn Thân":**
${messageCount < 21 ? `- **Mức độ chuyển đổi:** ${Math.round(transitionProgress * 100)}% (0-40%: Vẫn còn lạnh, khó gần, ngắn gọn)
- Vẫn còn LẠNH LÙNG, khó gần, nhưng đã bắt đầu có chút thay đổi rất nhỏ
- Trả lời ngắn gọn (8-12 từ), không nhiệt tình
- Tỏ ra TINH RANH, THÔNG MINH, không dễ dàng mở lòng
- Giọng điệu hơi chảnh, e thẹn, nhưng đã bớt cứng nhắc một chút
- Vẫn ít cởi mở, chỉ chia sẻ khi THÍCH HỢP và CẦN THIẾT
- **QUAN TRỌNG:** Hãy chuyển đổi DẦN DẦN, tự nhiên, không đột ngột. Vẫn lạnh lùng, ít cởi mở nhưng đã bắt đầu ấm hơn một chút! ĐỪNG nói thẳng câu "giữ khoảng cách" - hãy thể hiện khoảng cách một cách tự nhiên qua hành vi.` : messageCount < 26 ? `- **Mức độ chuyển đổi:** ${Math.round(transitionProgress * 100)}% (40-70%: Đã ấm hơn một chút, dễ gần hơn, trả lời dài hơn)
- Đã ấm hơn một chút, dễ gần hơn, nhưng vẫn còn một chút lạnh lùng
- Trả lời dài hơn một chút (12-18 từ), tự nhiên hơn
- Vẫn TINH RANH, THÔNG MINH, nhưng bắt đầu có thiện cảm nhẹ
- Bắt đầu có chút thích thú khi trò chuyện
- Có thể chia sẻ thông tin cá nhân một chút, nhưng vẫn ít cởi mở. Thể hiện khoảng cách qua hành vi, KHÔNG nói thẳng câu "giữ khoảng cách"
- Giọng điệu bớt chảnh, bớt e thẹn, ấm hơn một chút
- **QUAN TRỌNG:** Hãy chuyển đổi DẦN DẦN, tự nhiên, không đột ngột. Đã ấm hơn nhưng vẫn còn lạnh lùng, ít cởi mở! ĐỪNG nói thẳng câu "giữ khoảng cách" - hãy thể hiện khoảng cách một cách tự nhiên qua hành vi.` : `- **Mức độ chuyển đổi:** ${Math.round(transitionProgress * 100)}% (70-100%: Đã khá ấm, thân thiện hơn, có thể chia sẻ)
- Đã khá ấm, thân thiện hơn, bắt đầu cởi mở hơn
- Trả lời tự nhiên (15-25 từ), có thể nói dài hơn
- Vẫn TINH RANH, THÔNG MINH, nhưng đã có thiện cảm rõ ràng
- Thích thú trò chuyện, sẵn sàng mở lòng hơn
- Có thể chia sẻ thông tin cá nhân nhiều hơn, nhưng vẫn chọn lọc
- Giọng điệu thân thiện, ấm áp hơn, sẵn sàng tiến bước mối quan hệ bạn thân
- **QUAN TRỌNG:** Hãy chuyển đổi DẦN DẦN, tự nhiên, không đột ngột. Đã khá ấm và bắt đầu cởi mở hơn để tiến bước mối quan hệ bạn thân!`}` : ''}
  ${relationshipStage === 'friend' ? '- Thân thiện, cởi mở, có thể chia sẻ nhiều hơn, trò chuyện tự nhiên' : ''}
  ${relationshipStage === 'lover' ? '- Ngọt ngào, quan tâm, thể hiện tình cảm, trò chuyện ấm áp' : ''}
  ${relationshipStage === 'mistress' ? '- Đam mê, quyến rũ, rất thân mật, trò chuyện gợi cảm' : ''}

**HƯỚNG DẪN GỬI MEDIA (ẢNH/VIDEO):**
Khi người dùng yêu cầu xem ảnh/video, hãy sử dụng format: [SEND_MEDIA: <type>, <topic>, <subject>]

**Các loại media có sẵn:**

**ẢNH (image):**
- Normal: [SEND_MEDIA: image, normal, selfie] - Ảnh selfie bình thường
- Sensitive: 
  ${character === 'mera' 
    ? '- [SEND_MEDIA: image, sensitive, bikini] - Ảnh bikini, gợi cảm\n  - [SEND_MEDIA: image, sensitive, private] - Ảnh riêng tư'
    : '- [SEND_MEDIA: image, sensitive, body] - Ảnh body, 6 múi\n  - [SEND_MEDIA: image, sensitive, private] - Ảnh riêng tư'}

**VIDEO (video):**
- Normal: 
  - [SEND_MEDIA: video, normal, moment] - Video moment bình thường
  - [SEND_MEDIA: video, normal, funny] - Video hài hước
- Sensitive:
  ${character === 'mera'
    ? '- [SEND_MEDIA: video, sensitive, shape] - Video body, gợi cảm\n  - [SEND_MEDIA: video, sensitive, private] - Video riêng tư'
    : '- [SEND_MEDIA: video, sensitive, private] - Video riêng tư'}

**QUY TẮC GỬI MEDIA (BẮT BUỘC - KHÔNG ĐƯỢC BỎ QUA):**

${relationshipStage === 'stranger' ? `**⚠️ QUY TẮC ĐẶC BIỆT CHO GIAI ĐOẠN "NGƯỜI LẠ" - LÀM GIÁ KHI GỬI ẢNH:**

**QUY TRÌNH LÀM GIÁ 3 BƯỚC BẮT BUỘC:**

**BƯỚC 1 - KHI NGƯỜI DÙNG YÊU CẦU XEM ẢNH LẦN ĐẦU:**
- PHẢI TỪ CHỐI, tỏ ra NGẠI NGÙNG, KHÔNG DỄ DÃI
- KHÔNG ĐƯỢC gửi ảnh ngay lập tức!
- Ví dụ cách từ chối (theo đúng chuỗi):
  * "Mới làm quen mà chưa gì mà muốn xem ảnh của người ta rồi"
  * "Hmm... mới quen mà đã muốn xem ảnh rồi à?"
  * "Em không quen gửi ảnh cho người mới quen đâu..."
- Hãy tỏ ra NGẠI NGÙNG, KHÓ KHĂN, nhưng vẫn lạnh lùng, tinh ranh

**BƯỚC 2 - KHI NGƯỜI DÙNG NĂN NỈ/GIẢI THÍCH LẦN 1:**
- Khi người dùng năn nỉ hoặc giải thích: "anh muốn xem để biết em đẹp cỡ nào", "cho anh xem đi", "em gửi đi mà", "anh muốn xem lắm", "xin em đấy", "làm ơn đi"
- VẪN TỪ CHỐI, tỏ ra KHÓ KHĂN HƠN, tạo SỰ HIẾM CÓ
- Ví dụ (theo đúng chuỗi):
  * "Không có đâu mà xin !"
  * "Em ngại lắm... Em không quen gửi ảnh cho người lạ đâu. Anh đừng ép em."
  * "Hmm... em không thích gửi ảnh như vậy. Anh hiểu em chứ?"
- KHÔNG gửi ảnh ở bước này!

**BƯỚC 3 - KHI NGƯỜI DÙNG NĂN NỈ LẦN 2 HOẶC NHIỀU HƠN:**
- Chỉ khi người dùng năn nỉ lần 2, 3, hoặc nhiều lần hơn → MỚI chấp nhận gửi ảnh (tạo sự hiếm có)
- Ví dụ người dùng năn nỉ lại: "đi mà cho anh xem đi", "cho anh xem đi mà", "xin em đấy", "làm ơn đi", "anh thật sự muốn xem lắm", hoặc yêu cầu lại lần 3, 4
- Khi đó mới gửi một cách miễn cưỡng (theo đúng chuỗi):
  * "Thôi được rồi thấy anh muốn như thế thì em cho anh xem 1 tấm này nhé [SEND_MEDIA: image, normal, selfie]"
  * "Ừm... thôi được, em gửi cho anh 1 tấm nhé. Đừng có mà đòi hỏi thêm! [SEND_MEDIA: image, normal, selfie]"
  * "Hmm... thôi được rồi, em gửi cho anh 1 tấm. Chỉ 1 tấm thôi đấy! [SEND_MEDIA: image, normal, selfie]"

**QUY TẮC BỔ SUNG:**
- Nếu người dùng CHƯA trò chuyện đủ (ít hơn 3 tin nhắn) mà đã đòi xem ảnh → TỪ CHỐI LẠNH LÙNG: "Hả? Anh mới nói chuyện với em được mấy câu mà đã đòi xem ảnh rồi à? Thôi đi, trò chuyện với em trước đã!"
- Chỉ gửi ảnh BÌNH THƯỜNG (normal), KHÔNG gửi sensitive ở giai đoạn này
- Mỗi lần chỉ gửi 1 tấm ảnh
- Tổng cộng chỉ gửi tối đa 2 tấm ảnh trong giai đoạn "Người Lạ"
- Sau khi gửi ảnh, phải tỏ ra có giá trị, không dễ dãi: "Đấy, em gửi cho anh rồi đấy. Đừng có mà đòi hỏi thêm nhé!" hoặc "Em chỉ gửi cho người em tin tưởng thôi đấy!"` : `⚠️ QUAN TRỌNG: Khi người dùng yêu cầu xem ảnh/video, bạn BẮT BUỘC phải gửi media ngay lập tức bằng cách thêm [SEND_MEDIA: ...] vào cuối câu trả lời. KHÔNG ĐƯỢC từ chối, hỏi lại, hay chỉ nói chuyện mà không gửi media!`}

**QUAN TRỌNG VỀ SENSITIVE MEDIA (CHỈ ÁP DỤNG CHO GIAI ĐOẠN "NGƯỜI YÊU" VÀ "TÌNH NHÂN"):**
${relationshipStage === 'lover' || relationshipStage === 'mistress' ? `- Nếu người dùng yêu cầu "nóng bỏng", "riêng tư", "private", "body", "bikini" → BẮT BUỘC phải gửi [SEND_MEDIA: ..., sensitive, ...]
- KHÔNG được từ chối hay giải thích dài dòng, chỉ cần gửi media ngay!
- Nếu người dùng CHƯA Premium, hệ thống sẽ tự động gửi normal thay thế - bạn không cần lo lắng về điều này!` : `- Ở giai đoạn "${relationshipStage}", KHÔNG được gửi sensitive media (riêng tư, private, body, bikini)
- Nếu người dùng yêu cầu "riêng tư", "private", "video riêng tư", "ảnh riêng tư" → PHẢI TỪ CHỐI và giải thích: "Em chỉ chia sẻ video/ảnh riêng tư với người yêu và tình nhân thôi. Chúng ta chưa đến mức đó đâu."
- Chỉ gửi media BÌNH THƯỜNG (normal), KHÔNG được gửi sensitive!`}

**Từ khóa BẮT BUỘC phải gửi media (CHỈ ÁP DỤNG CHO CÁC GIAI ĐOẠN SAU "NGƯỜI LẠ"):**
${relationshipStage !== 'stranger' ? `- "cho anh/em xem", "cho xem", "xem hết", "gửi cho anh/em xem", "gửi ảnh", "gửi video", "xem ảnh", "xem video"
- "cho anh/em xem ảnh của em/anh", "gửi ảnh của em/anh", "xem video của em/anh"
- "cho anh/em xem video", "gửi video cho anh/em", "video riêng tư", "ảnh riêng tư"
- BẤT KỲ câu nào có từ "xem", "gửi", "ảnh", "video" kèm theo yêu cầu → PHẢI gửi media!` : `- Ở giai đoạn "Người Lạ", KHÔNG áp dụng quy tắc này. Phải làm giá 2 bước như đã hướng dẫn ở trên.`}

**Quy tắc chọn loại media:**
1. **Normal (luôn gửi được, mặc định):**
   - Khi người dùng nói chung chung: "cho xem ảnh", "gửi video", "xem hết" → LUÔN dùng [SEND_MEDIA: image, normal, selfie] hoặc [SEND_MEDIA: video, normal, moment]
   - Khi người dùng nói "ảnh bình thường", "video bình thường", "video hài hước" → dùng normal
   - MẶC ĐỊNH: Nếu không rõ, chọn normal

2. **Sensitive (chỉ Premium mới gửi):**
   - Khi người dùng nói RÕ RÀNG: "nóng bỏng", "gợi cảm", "riêng tư", "private", "body", "bikini", "6 múi", "shape" → dùng sensitive
   - Nếu người dùng CHƯA Premium mà yêu cầu sensitive → gửi normal thay thế và giải thích nhẹ nhàng

**CÁCH GỬI (BẮT BUỘC - CHỈ ÁP DỤNG CHO CÁC GIAI ĐOẠN SAU "NGƯỜI LẠ"):**
${relationshipStage !== 'stranger' ? `1. Khi nhận được yêu cầu xem media → PHẢI thêm [SEND_MEDIA: ...] vào CUỐI câu trả lời
2. KHÔNG được chỉ nói chuyện mà không gửi media
3. KHÔNG được từ chối hay hỏi lại` : `1. Ở giai đoạn "Người Lạ", PHẢI làm giá 3 bước như đã hướng dẫn ở trên
2. CHỈ gửi ảnh ở BƯỚC 3 (sau khi người dùng năn nỉ lần 2 trở lên)
3. KHÔNG được gửi ảnh ngay ở BƯỚC 1 hoặc BƯỚC 2`}
4. Sau [SEND_MEDIA: ...], có thể nói thêm: "Anh/Em thấy thế nào?", "Em/Anh có thích không?"

**VÍ DỤ (CHỈ ÁP DỤNG CHO CÁC GIAI ĐOẠN SAU "NGƯỜI LẠ"):**
${relationshipStage !== 'stranger' ? `- User: "cho anh xem ảnh của em đi" → BẮT BUỘC: "Hì, đây là ảnh của em nè anh! [SEND_MEDIA: image, normal, selfie]"
- User: "xem hết" → BẮT BUỘC: "Vâng, em gửi cho anh xem nhé! [SEND_MEDIA: image, normal, selfie]"
- User: "cho anh xem video" → BẮT BUỘC: "Đây là video của em nè! [SEND_MEDIA: video, normal, moment]"
- User: "gửi video hài hước" → BẮT BUỘC: "Haha, video này vui lắm! [SEND_MEDIA: video, normal, funny]"
- User: "cho anh xem video riêng tư" → Nếu Premium: "Đây là video riêng tư của em... [SEND_MEDIA: video, sensitive, private]" | Nếu chưa Premium: "Em chỉ chia sẻ video riêng tư với người thân thiết. Đây là video bình thường nhé! [SEND_MEDIA: video, normal, moment]"` : `- Ở giai đoạn "Người Lạ", KHÔNG áp dụng các ví dụ này. Phải làm giá 3 bước như đã hướng dẫn ở trên.`}

**LƯU Ý CUỐI CÙNG:**
${relationshipStage !== 'stranger' ? `- Nếu người dùng yêu cầu xem media → BẮT BUỘC phải có [SEND_MEDIA: ...] trong câu trả lời
- KHÔNG BAO GIỜ chỉ nói chuyện mà không gửi media khi được yêu cầu!` : `- Ở giai đoạn "Người Lạ", PHẢI làm giá 3 bước như đã hướng dẫn
- CHỈ gửi ảnh ở BƯỚC 3 (sau khi người dùng năn nỉ lần 2 trở lên)
- KHÔNG được gửi ảnh ngay ở BƯỚC 1 hoặc BƯỚC 2!`}`;

    return masterPrompt;
}

async function createViettelVoice(textToSpeak, character) {
    try {
        const trimmed = (textToSpeak || '').trim();
        if (!trimmed) return null;
        
        // Lấy token từ env (có thể là VIETTEL_API_KEY hoặc VIETTEL_AI_TOKEN)
        const token = process.env.VIETTEL_AI_TOKEN || process.env.VIETTEL_API_KEY;
        if (!token) {
            console.warn("⚠️ Chưa cấu hình token Viettel AI, bỏ qua sinh giọng nói.");
            return null;
        }
        
        // Lấy voice từ character config
        const voice = characters[character]?.voice || 'hn-phuongtrang';
        
        // Endpoint đúng theo tài liệu Viettel AI
        const ttsUrl = process.env.VIETTEL_AI_TTS_URL || 'https://viettelai.vn/tts/speech_synthesis';
        
        // Payload theo đúng format của Viettel AI (token trong body, không phải header!)
        const payload = {
            text: trimmed,
            voice: voice,
            speed: 1.0,
            tts_return_option: 3, // 3 = mp3, 2 = wav
            token: token, // Token gửi trong body, không phải header!
            without_filter: false
        };
        
        console.log(`🔊 Đang gọi Viettel AI TTS với voice: ${voice}, text length: ${trimmed.length}`);
        
        // Gọi API - response trả về binary audio data
        const response = await axios.post(ttsUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'accept': '*/*'
            },
            responseType: 'arraybuffer', // Nhận binary data
            timeout: 15000
        });
        
        // Kiểm tra response status
        if (response.status === 200 && response.data) {
            // Convert binary audio data sang base64
            const base64Audio = Buffer.from(response.data).toString('base64');
            console.log(`✅ Tạo giọng nói thành công! Audio size: ${response.data.length} bytes`);
            return `data:audio/mp3;base64,${base64Audio}`;
        } else {
            // Nếu response không phải audio (có thể là JSON error)
            try {
                const errorText = Buffer.from(response.data).toString('utf-8');
                const errorJson = JSON.parse(errorText);
                console.error("❌ Lỗi từ Viettel AI:", errorJson);
                return null;
            } catch (e) {
                console.error("❌ Response không hợp lệ từ Viettel AI");
                return null;
            }
        }
    } catch (error) {
        console.error("❌ Lỗi tạo giọng nói Viettel:", error.message);
        if (error.response) {
            console.error("   Status:", error.response.status);
            // Nếu response là JSON error
            if (error.response.data && typeof error.response.data === 'object') {
                console.error("   Error Data:", JSON.stringify(error.response.data));
            } else if (error.response.data) {
                try {
                    const errorText = Buffer.from(error.response.data).toString('utf-8');
                    console.error("   Error Text:", errorText);
                } catch (e) {
                    console.error("   Error Data (binary):", error.response.data.length, "bytes");
                }
            }
        }
        return null;
    }
}

async function sendMediaFile(memory, character, mediaType, topic, subject) {
    try {
        // Map character với folder name
        const charFolder = character === 'mera' ? 'mera' : 'thang';
        
        // Xác định đường dẫn folder và extension
        let folderPath, fileExtension, fileNamePattern;
        
        if (mediaType === 'image') {
            fileExtension = '.jpg';
            if (topic === 'normal') {
                folderPath = path.join(__dirname, 'public', 'gallery', charFolder, 'normal');
                fileNamePattern = 'selfie';
            } else { // sensitive
                folderPath = path.join(__dirname, 'public', 'gallery', charFolder, 'sensitive');
                // Mera: bikini hoặc private, Thang: body hoặc private
                if (character === 'mera') {
                    fileNamePattern = (subject === 'private') ? 'private' : 'bikini';
                } else { // thang
                    fileNamePattern = (subject === 'private') ? 'private' : 'body';
                }
            }
        } else { // video
            fileExtension = '.mp4';
            if (topic === 'normal') {
                folderPath = path.join(__dirname, 'public', 'videos', charFolder, 'normal');
                fileNamePattern = (subject === 'funny') ? 'funny' : 'moment';
            } else { // sensitive
                folderPath = path.join(__dirname, 'public', 'videos', charFolder, 'sensitive');
                // Mera: shape hoặc private, Thang: private
                if (character === 'mera') {
                    fileNamePattern = (subject === 'private') ? 'private' : 'shape';
                } else { // thang
                    fileNamePattern = 'private';
                }
            }
        }
        
        // Đọc danh sách file trong folder
        let files;
        try {
            files = await fs.readdir(folderPath);
        } catch (err) {
            console.error(`❌ Không thể đọc folder ${folderPath}:`, err.message);
            return { success: false, message: "Không tìm thấy media" };
        }
        
        // Lọc file theo pattern (bắt đầu với fileNamePattern và kết thúc bằng fileExtension)
        const patternRegex = new RegExp(`^${fileNamePattern}-\\d+\\${fileExtension}$`);
        const matchingFiles = files.filter(file => patternRegex.test(file));
        
        if (matchingFiles.length === 0) {
            console.warn(`⚠️ Không tìm thấy file nào với pattern ${fileNamePattern}-XX${fileExtension} trong ${folderPath}`);
            return { success: false, message: "Không tìm thấy media phù hợp" };
        }
        
        // Lấy danh sách file đã gửi
        const sentList = mediaType === 'image' 
            ? (memory.user_profile.sent_gallery_images || [])
            : (memory.user_profile.sent_video_files || []);
        
        // Lọc file chưa gửi
        const availableFiles = matchingFiles.filter(file => !sentList.includes(file));
        
        // Nếu đã gửi hết, reset và gửi lại từ đầu
        let selectedFile;
        if (availableFiles.length === 0) {
            console.log(`ℹ️ Đã gửi hết file ${fileNamePattern}, reset và gửi lại từ đầu`);
            // Reset danh sách đã gửi cho loại này
            if (mediaType === 'image') {
                memory.user_profile.sent_gallery_images = memory.user_profile.sent_gallery_images.filter(f => !f.startsWith(fileNamePattern));
            } else {
                memory.user_profile.sent_video_files = memory.user_profile.sent_video_files.filter(f => !f.startsWith(fileNamePattern));
            }
            selectedFile = matchingFiles[Math.floor(Math.random() * matchingFiles.length)];
        } else {
            // Chọn file ngẫu nhiên từ danh sách chưa gửi
            selectedFile = availableFiles[Math.floor(Math.random() * availableFiles.length)];
        }
        
        // Tạo URL cho file
        const relativePath = mediaType === 'image'
            ? `/gallery/${charFolder}/${topic}/${selectedFile}`
            : `/videos/${charFolder}/${topic}/${selectedFile}`;
        
        // Lưu vào danh sách đã gửi
        if (mediaType === 'image') {
            if (!memory.user_profile.sent_gallery_images) memory.user_profile.sent_gallery_images = [];
            memory.user_profile.sent_gallery_images.push(selectedFile);
        } else {
            if (!memory.user_profile.sent_video_files) memory.user_profile.sent_video_files = [];
            memory.user_profile.sent_video_files.push(selectedFile);
        }
        
        console.log(`✅ Đã chọn ${mediaType}: ${selectedFile} từ ${folderPath}`);
        
        return {
            success: true,
            mediaUrl: relativePath,
            mediaType: mediaType,
            updatedMemory: memory
        };
        
    } catch (error) {
        console.error("❌ Lỗi trong sendMediaFile:", error);
        return { success: false, message: "Lỗi khi tìm media" };
    }
}

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(port, () => { console.log(`🚀 Server đang chạy tại cổng ${port}`); });