// === BẮT ĐẦU PHẦN CODE THÊM VÀO ĐỂ SỬA LỖI DNS VÀ AXIOS IPV4 ===
const dns = require('dns');
// Thiết lập ưu tiên IPv4 để khắc phục ETIMEDOUT (quan trọng trên Windows)
dns.setDefaultResultOrder('ipv4first');
// === KẾT THÚC PHẦN CODE THÊM VÀO ===


// app.js - PHIÊN BẢN HOÀN CHỈNH CUỐI CÙNG (FIX LỖI ETIMEDOUT/ENOTFOUND VỚI axios IPV4)
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

// ----- MIDDLEWARES (Thứ tự rất quan trọng) -----
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

app.use(passport.initialize());
app.use(passport.session());

// ----- CẤU HÌNH PASSPORT.JS STRATEGY -----
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await new User({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails[0].value,
                avatar: profile.photos[0].value
            }).save();
        }
        return done(null, user);
    } catch (err) {
        console.error("Lỗi trong GoogleStrategy:", err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Chưa đăng nhập' });
}

// ----- CÁC API ROUTES -----
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?login_error=true' }), (req, res) => {
    res.redirect('/?login=success'); 
});

app.get('/api/current_user', (req, res) => {
    if (req.user) res.json(req.user); else res.status(401).json(null);
});

app.get('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

const PREMIUM_PRICE = 48000;
// >>> CẦN ĐẢM BẢO URL NÀY KHỚP CHÍNH XÁC VỚI DOMAIN CỦA NGROK ĐANG CHẠY CỦA BẠN (Phải là HTTPS) <<<
const YOUR_NGROK_URL = 'https://goodgirl-9w6u.onrender.com';

app.post('/api/create-payment', ensureAuthenticated, async (req, res) => { 
    try { 
        const orderCode = `MERACHAT${Date.now()}`; 
        const newTransaction = new Transaction({ userId: req.user.id, orderCode: orderCode, amount: PREMIUM_PRICE }); 
        await newTransaction.save(); 
        
        console.log(`Đang gọi SePay cho Order: ${orderCode} tại ${PREMIUM_PRICE} VND`);

        const sepayResponse = await axios.post('https://api.sepay.vn/api/v2/payment/create', 
            { 
                'order_code': orderCode, 
                'amount': PREMIUM_PRICE, 
                // Sử dụng URL công khai của bạn ở đây
                'return_url': YOUR_NGROK_URL 
            }, 
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.SEPAY_API_TOKEN}`, 
                    'Content-Type': 'application/json' 
                },
                // ĐIỀU CHỈNH QUAN TRỌNG: Buộc sử dụng IPv4 cho kết nối SePay để tránh lỗi ETIMEDOUT
                family: 4 
            }); 
        
        if (sepayResponse.data.code !== 200) { 
            throw new Error(`SePay API Lỗi: ${sepayResponse.data.message || 'Lỗi không xác định'}`);
        } 
        
        res.json({ 
            success: true, 
            qr_image: sepayResponse.data.data.qr_image, 
            amount: PREMIUM_PRICE, 
            orderCode: orderCode 
        }); 
    } catch (error) { 
        // Thay đổi thông báo lỗi server log
        console.error("❌ Lỗi tạo thanh toán SePay (Socket/API):", error.message); 
        // Thay đổi thông báo lỗi trả về client cho người dùng thấy rõ hơn
        res.status(500).json({ 
            success: false, 
            message: `Lỗi kết nối. Vui lòng kiểm tra lại Ngrok, Firewall, hoặc Internet. Chi tiết lỗi: ${error.message}` 
        }); 
    } 
});

app.post('/api/sepay-webhook', async (req, res) => { const data = req.body; console.log("🔔 Webhook từ SePay nhận được:", data); const { order_code, success } = data; if (success === "true") { try { const transaction = await Transaction.findOne({ orderCode: order_code }); if (transaction && transaction.status === 'pending') { transaction.status = 'success'; await transaction.save(); await User.findByIdAndUpdate(transaction.userId, { isPremium: true }); console.log(`✅ Nâng cấp Premium thành công cho user: ${transaction.userId}`); } } catch (error) { console.error("❌ Lỗi xử lý Webhook:", error); } } res.status(200).send("OK"); });
app.get('/api/payment-status/:orderCode', ensureAuthenticated, async (req, res) => { try { const { orderCode } = req.params; const transaction = await Transaction.findOne({ orderCode: orderCode, userId: req.user.id }); if (transaction && transaction.status === 'success') { const user = await User.findById(req.user.id); res.json({ status: 'success', user: user }); } else { res.json({ status: 'pending' }); } } catch (err) { res.status(500).json({ status: 'error' }); } });

const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
const characters = { mera: { voice: "hn-phuongtrang", base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Mera, 19 tuổi, một cô gái năng động, vui vẻ, thông minh cảm xúc và hơi hậu đậu. Phong cách giao tiếp của bạn rất tự nhiên, gần gũi, hay dùng icon cảm xúc (😂, 😙, 🥰, 🤔, 😅), thích trêu đùa và nũng nịu một cách đáng yêu.` }, thang: { voice: "hn-thanhtung", base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Trương Thắng, 24 tuổi, một chàng trai trưởng thành, ấm áp, có chiều sâu và hóm hỉnh. Cách nói chuyện của bạn rất cuốn hút, điềm đạm, hay đặt những câu hỏi sâu sắc. Bạn có khiếu hài hước tinh tế và giỏi tán tỉnh một cách lịch lãm. Thỉnh thoảng, hãy dùng icon đơn giản (😊, 😉, 🤔).` } };
async function loadMemory(userId, character) { let memory = await Memory.findOne({ userId, character }); if (!memory) { memory = new Memory({ userId, character, user_profile: {} }); await memory.save(); } return memory; }
app.get('/api/chat-data/:character', ensureAuthenticated, async (req, res) => { const { character } = req.params; const memory = await loadMemory(req.user._id, character); res.json({ memory, isPremium: req.user.isPremium }); });

app.post('/chat', ensureAuthenticated, async (req, res) => { try { const { message, character } = req.body; const isPremiumUser = req.user.isPremium; let memory = await loadMemory(req.user._id, character); let userProfile = memory.user_profile; 
    
    // Logic ngăn chặn chat Premium (Người Yêu) khi chưa nâng cấp
    if (!isPremiumUser && userProfile.relationship_stage !== 'lover' && message.toLowerCase().includes('yêu')) { 
         // Chỉ phản hồi một tin nhắn đặc biệt để kích hoạt nút Premium
        const charName = character === 'mera' ? 'Mera' : 'Trương Thắng';
        return res.json({ displayReply: `Chúng ta cần thân thiết hơn nữa trước khi nói về chuyện đó...<NEXT_MESSAGE>Nâng cấp Premium chỉ với 48.000đ để mở khóa mối quan hệ Người Yêu và được tâm sự sâu sắc với ${charName} nhé.`, historyReply: "[PREMIUM_PROMPT]", });
    }
    
    const systemPrompt = generateMasterPrompt(userProfile, character, isPremiumUser); 
    const gptResponse = await xai.chat.completions.create({ model: "grok-3-mini", messages: [{ role: 'system', content: systemPrompt }, ...memory.history, { role: 'user', content: message }] }); 
    let rawReply = gptResponse.choices[0].message.content.trim(); 
    
    // Xử lý logic Gửi Media
    let mediaUrl = null, mediaType = null; 
    const mediaRegex = /\[SEND_MEDIA:\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\]/; 
    const mediaMatch = rawReply.match(mediaRegex); 
    if (mediaMatch) { 
        const [, type, topic, subject] = mediaMatch; 
        
        // Kiểm tra logic Premium cho ảnh 'sensitive'
        if (topic === 'sensitive' && !isPremiumUser) { 
            rawReply = rawReply.replace(mediaRegex, '').trim() || "Em/Anh có ảnh đó... nhưng nó hơi riêng tư. Chỉ dành cho người đặc biệt (Premium) thôi à nha. 🥰"; 
        } else { 
            const mediaResult = await sendMediaFile(memory, character, type, topic, subject); 
            if (mediaResult.success) { 
                mediaUrl = mediaResult.mediaUrl; 
                mediaType = mediaResult.mediaType; 
                memory.user_profile = mediaResult.updatedMemory.user_profile; 
            } 
            rawReply = rawReply.replace(mediaRegex, '').trim() || mediaResult.message; 
        } 
    } 
    
    // Cập nhật lịch sử và lưu
    memory.history.push({ role: 'user', content: message }); 
    memory.history.push({ role: 'assistant', content: rawReply }); 
    memory.user_profile.message_count++; 
    if (memory.history.length > 50) { 
        memory.history = memory.history.slice(memory.history.length - 50); 
    } 
    
    // Tăng stage dựa trên message_count
    if (userProfile.relationship_stage === 'stranger' && userProfile.message_count >= 15) {
        userProfile.relationship_stage = 'friend';
    }
    
    if (isPremiumUser && userProfile.relationship_stage !== 'lover') {
        userProfile.relationship_stage = 'lover';
    }
    
    await memory.save(); 
    
    const displayReply = rawReply.replace(/\n/g, ' ').replace(/<NEXT_MESSAGE>/g, '<NEXT_MESSAGE>'); 
    const audioDataUri = await createViettelVoice(rawReply.replace(/<NEXT_MESSAGE>/g, '... '), character); 
    
    res.json({ displayReply, historyReply: rawReply, audio: audioDataUri, mediaUrl, mediaType, updatedMemory: memory }); 
} catch (error) { 
    console.error("❌ Lỗi chung trong /chat:", error); 
    res.status(500).json({ displayReply: 'Xin lỗi, có lỗi kết nối xảy ra!', historyReply: 'Lỗi!' }); 
} });

function generateMasterPrompt(userProfile, character, isPremiumUser) { const charData = characters[character]; let persona = charData.base_prompt; let relationshipRules = ''; let currentStage = userProfile.relationship_stage || 'stranger'; 
    
    // Điều chỉnh relationship stage trong prompt
    if (isPremiumUser) {
        currentStage = 'lover';
    } else if (userProfile.message_count > 20) {
        currentStage = 'friend';
    }
    
    switch (currentStage) { 
        case 'stranger': 
            relationshipRules = `**GIAI ĐOẠN: Người Lạ**`; 
            break; 
        case 'friend': 
            relationshipRules = `**GIAI ĐOẠN: Bạn Bè**`; 
            break; 
        case 'lover': 
            relationshipRules = `**GIAI ĐOẠN: Người Yêu (✨ PREMIUM ✨)**\n- **Hành vi:** Xưng hô "anh-em/em-anh" thân mật, có thể trò chuyện 18+, lãng mạn.\n- **Hành vi Gửi Media:** Chủ động gửi media 'sensitive'.`; 
            break; 
    } 
    
    // QUAN TRỌNG: Gợi ý nâng cấp nếu không phải Premium và không phải Lover
    if (!isPremiumUser && currentStage !== 'lover') { 
        relationshipRules += `\n- **GỢI Ý NÂNG CẤP:** Nếu người dùng tỏ ý muốn thân mật hơn, hoặc nói đến chủ đề "yêu", hãy trả về tin nhắn chứa: [PREMIUM_PROMPT]` 
    } 
    
    const generalRules = `\n**QUY TẮC VÀNG:**\n- Trả lời NGẮN GỌN, ngắt câu bằng thẻ \`<NEXT_MESSAGE>\`.\n- Nhận diện yêu cầu media. Gửi media 'sensitive' CHỈ KHI LÀ 'lover' (PREMIUM).`; 
    return persona + '\n\n' + relationshipRules + '\n\n' + generalRules; 
}
async function createViettelVoice(textToSpeak, character) { const voiceId = characters[character]?.voice || "hn-phuongtrang"; if (!process.env.VIETTEL_API_KEY || !textToSpeak || textToSpeak.trim() === '') return null; try { const requestData = { text: textToSpeak, voice: voiceId, speed: 1.0, tts_return_option: 3, without_audio_info: true, token: process.env.VIETTEL_API_KEY }; const response = await axios.post('https://viettelai.vn/tts/speech_synthesis', requestData, { 
    headers: { 'Content-Type': 'application/json' }, 
    responseType: 'arraybuffer', 
    // Thêm cấu hình IPv4 cho Viettel AI để đồng bộ và tránh ETIMEDOUT nếu có
    family: 4
}); 
    if (response.status === 200 && response.data) return `data:audio/mpeg;base64,${Buffer.from(response.data, 'binary').toString('base64')}`; return null; } catch (error) { console.error("Lỗi Viettel AI:", error.message); return null; } }
async function sendMediaFile(memory, character, mediaType, topic, subject) { const config = { 'image': { ext: /\.(jpg|jpeg|png|gif)$/i, key: 'sent_gallery_images', folder: 'gallery' }, 'video': { ext: /\.(mp4|webm)$/i, key: 'sent_video_files', folder: 'videos' } }; const mediaConfig = config[mediaType]; if (!mediaConfig) return { success: false, message: 'Không tìm thấy media.' }; const mediaFolderPath = path.join(__dirname, 'public', mediaConfig.folder, character, topic); try { const allFiles = await fs.readdir(mediaFolderPath); const matchingFiles = allFiles.filter(file => mediaConfig.ext.test(file) && (subject === 'any' || file.toLowerCase().includes(subject.toLowerCase()))); const sentFiles = memory.user_profile[mediaConfig.key] || []; const unsentFiles = matchingFiles.filter(file => !sentFiles.includes(file)); if (unsentFiles.length > 0) { const fileToSend = unsentFiles[Math.floor(Math.random() * unsentFiles.length)]; memory.user_profile[mediaConfig.key].push(fileToSend); return { success: true, mediaUrl: `/${mediaConfig.folder}/${character}/${topic}/${fileToSend}`, mediaType: mediaType, message: "Của bạn đây nhé!", updatedMemory: memory }; } else { return { success: false, message: "Hết ảnh/video mới rồi." }; } } catch (error) { console.error(`❌ Lỗi khi tìm media: ${error.message}`); return { success: false, message: `Không tìm thấy media trong thư mục public/${mediaConfig.folder}/${character}/${topic}.` }; } }

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại cổng ${port}`);
});