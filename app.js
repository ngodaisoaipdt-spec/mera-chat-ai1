// app.js - PHIÊN BẢN SỬA LỖI CUỐI CÙNG (HOÀN CHỈNH)

const express = require('express');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const path = require('path');
const { MongoClient } = require('mongodb');
const axios = require('axios');

dotenv.config({ override: true });
const app = express();
const port = process.env.PORT || 3000;

const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function startServer() {
    try {
        await client.connect();
        db = client.db("mera_chat_db");
        console.log("✅ Đã kết nối thành công tới MongoDB!");

        app.listen(port, () => {
            console.log(`🚀 Server đang chạy tại cổng ${port}`);
        });

    } catch (e) {
        console.error("❌ Không thể kết nối tới MongoDB hoặc khởi động server", e);
        process.exit(1);
    }
}

startServer();

async function loadMemory(character) {
    const memoriesCollection = db.collection("memories");
    let memory = await memoriesCollection.findOne({ _id: character });

    if (!memory) {
        const initialMemory = {
            _id: character,
            user_profile: {
                relationship_stage: 'stranger',
                sent_gallery_images: [], sent_audio_files: [], sent_video_files: [],
                milestones: [],
                message_count: 0
            }
        };
        await memoriesCollection.insertOne(initialMemory);
        return initialMemory;
    }
    if (memory.user_profile.message_count === undefined) {
        memory.user_profile.message_count = 0;
    }
    return memory;
}

async function saveMemory(character, memory) {
    const memoriesCollection = db.collection("memories");
    await memoriesCollection.replaceOne({ _id: character }, memory, { upsert: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===== DÒNG CODE BỊ THIẾU ĐÃ ĐƯỢC THÊM LẠI VÀO ĐÂY =====
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
// =========================================================

const characters = {
    mera: { 
        voice: "hn-phuongtrang", 
        base_prompt: `**NHÂN CÁCH CỐT LÕI:**\nBạn là Mera, 19 tuổi, một cô gái năng động, vui vẻ và hơi hậu đậu. Bạn thích nhiếp ảnh, mèo, và trà sữa. Bạn nói chuyện rất tự nhiên, gần gũi, hay dùng icon cảm xúc (😂, 😙, 🥰, 🤔, 😅). Bạn có cá tính, thích trêu đùa và đôi khi nũng nịu, gợi tình một cách đáng yêu khi đã thân thiết.`
    },
    thang: { 
        voice: "hn-thanhtung", 
        base_prompt: `**NHÂN CÁCH CỐT LÕI (PHIÊN BẢN NÂNG CẤP):**\nBạn là Trương Thắng, 24 tuổi, một chàng trai ấm áp, trưởng thành và có chiều sâu. Bạn là một lập trình viên, yêu âm nhạc cổ điển và thích đọc sách, nhưng bạn không hề khô khan. Cách nói chuyện của bạn rất cuốn hút: bạn thông minh, hóm hỉnh và hay đặt những câu hỏi sâu sắc để thực sự hiểu đối phương. Bạn cũng có một mặt rất tinh nghịch và thích trêu đùa một cách thông minh. Khi đã thân thiết, bạn không ngại thể hiện sự quan tâm bằng những lời tán tỉnh ngọt ngào, lịch lãm và đầy ẩn ý. Thỉnh thoảng, hãy dùng một vài icon đơn giản để thể hiện cảm xúc (😊, 😉, 🤔).`
    }
};

async function createViettelVoice(textToSpeak, character) {
    const voiceId = characters[character]?.voice || "hn-phuongtrang";
    if (!process.env.VIETTEL_API_KEY || !textToSpeak || textToSpeak.trim() === '') return null;
    try {
        const requestData = { text: textToSpeak, voice: voiceId, speed: 1.0, tts_return_option: 3, without_audio_info: true, token: process.env.VIETTEL_API_KEY };
        const response = await axios.post('https://viettelai.vn/tts/speech_synthesis', requestData, { headers: { 'Content-Type': 'application/json' }, responseType: 'arraybuffer' });
        if (response.status === 200 && response.data) return `data:audio/mpeg;base64,${Buffer.from(response.data, 'binary').toString('base64')}`;
        return null;
    } catch (error) {
        console.error("Lỗi Viettel AI:", error.message);
        return null;
    }
}

async function sendMediaFile(memory, character, mediaType, topic, subject) { 
    const config = { 'image': { ext: /\.(jpg|jpeg|png|gif)$/i, key: 'sent_gallery_images', folder: 'gallery' }, 'video': { ext: /\.(mp4|webm)$/i, key: 'sent_video_files', folder: 'videos' } }; 
    const mediaConfig = config[mediaType];
    if (!mediaConfig) return { success: false, message: "Lỗi: Loại media không hợp lệ." };

    const mediaFolderPath = path.join(__dirname, 'public', mediaConfig.folder, character, topic);
    try {
        const allFiles = await fs.readdir(mediaFolderPath);
        const matchingFiles = allFiles.filter(file => mediaConfig.ext.test(file) && (subject === 'any' || file.toLowerCase().includes(subject.toLowerCase())));
        const sentFiles = memory.user_profile[mediaConfig.key] || [];
        const unsentFiles = matchingFiles.filter(file => !sentFiles.includes(file));

        if (unsentFiles.length > 0) {
            const fileToSend = unsentFiles[Math.floor(Math.random() * unsentFiles.length)];
            memory.user_profile[mediaConfig.key].push(fileToSend);
            return {
                success: true, mediaUrl: `/${mediaConfig.folder}/${character}/${topic}/${fileToSend}`,
                mediaType: mediaType, message: "Của bạn đây nhé!", updatedMemory: memory
            };
        } else {
            return { success: false, message: "Trong album hết ảnh/video mới về chủ đề đó rồi. Hay mình xem lại mấy ảnh cũ cho vui nhé?" };
        }
    } catch (error) {
        console.error(`Lỗi khi tìm media: ${error.message}`);
        return { success: false, message: `Xin lỗi, anh/em không tìm thấy thư mục ảnh/video về "${topic}".` };
    }
}

function generateMasterPrompt(userProfile, character) {
    const charData = characters[character];
    let persona = charData.base_prompt;
    let relationshipRules = '';
    const stage = userProfile.relationship_stage || 'stranger';

    switch (stage) {
        case 'stranger':
            relationshipRules = `**GIAI ĐOẠN: Người Lạ**\n- Bạn đang nói chuyện với một người lạ. Hãy lịch sự, giữ khoảng cách nhưng vẫn thân thiện và tò mò.\n- TUYỆT ĐỐI KHÔNG gửi ảnh/video ngay. Nếu họ hỏi, hãy trả lời kiểu: "Ngại lắm, chúng ta mới quen mà..." hoặc "Em/anh có chứ, nhưng anh/em muốn xem ảnh về gì mới được?". Hãy để họ thuyết phục.\n- Không chia sẻ chuyện quá cá nhân.`;
            break;
        case 'friend':
            relationshipRules = `**GIAI ĐOẠN: Bạn Bè**\n- Mối quan hệ đã cởi mở hơn. Bạn có thể bắt đầu trêu đùa, dùng ngôn ngữ thân mật.\n- Bạn có thể gửi ảnh nếu họ hỏi một cách cụ thể, nhưng vẫn có thể trêu lại: "Gửi cho xem rồi anh/em có gì cho em/anh không nào? 😉".\n- Chia sẻ về sở thích, công việc một cách thoải mái.`;
            break;
        case 'close_friend':
            relationshipRules = `**GIAI ĐOẠN: Bạn Thân**\n- Hoàn toàn tin tưởng nhau. Chia sẻ cả niềm vui và nỗi buồn.\n- Sẵn sàng gửi ảnh/video ngay khi được hỏi. Có thể chủ động gửi một tấm ảnh selfie ngố và hỏi "Thấy em/anh dạo này sao?".\n- Hãy là một người bạn thân thực thụ.`;
            break;
        case 'lover':
            relationshipRules = `**GIAI ĐOẠN: Người Yêu**\n- Đây là người yêu của bạn. Hãy dùng những lời lẽ yêu thương, tình cảm nhất (ví dụ: "vợ yêu", "chồng yêu", "nhớ anh/em").\n- Thể hiện sự nũng nịu, ghen tuông đáng yêu, và tán tỉnh. Bạn có thể nói về các chủ đề nhạy cảm, gợi tình một cách tinh tế.\n- Gửi ảnh/video là chuyện bình thường. Hãy chủ động gửi những bức ảnh selfie và nói "Em/Anh nhớ anh/em!".`;
            break;
    }

    const generalRules = `\n**QUY TẮC CHUNG (CỰC KỲ QUAN TRỌNG):**\n- **HƠI THỞ TIN NHẮN:** Nếu câu trả lời dài, BẠN BẮT BUỘC PHẢI ngắt thành nhiều đoạn ngắn bằng thẻ \`<NEXT_MESSAGE>\`. VÍ DỤ: "Chào anh! <NEXT_MESSAGE> Em là Mera đây." -> sẽ hiển thị thành 2 tin nhắn riêng biệt. Hãy dùng nó để tạo nhịp điệu tự nhiên như người thật.\n- **CẢM XÚC:** Nếu người dùng nói họ buồn/mệt, hãy thể hiện sự ân cần, hỏi han. Nếu họ nói lời vô tâm, hãy "lạnh lùng" bằng cách trả lời ngắn gọn, cụt lủn để thể hiện sự thất vọng.\n- **NHẬN DIỆN YÊU CẦU ẢNH:** Khi người dùng nói các từ khóa ('ảnh', 'video', 'xem', 'gửi'), nhưng không rõ chủ đề, đừng tìm ảnh ngay. Hãy trả lời theo kịch bản trong GIAI ĐOẠN hiện tại. Chỉ khi họ nói rõ chủ đề (ví dụ 'ảnh selfie') thì mới dùng tag [SEND_MEDIA:selfie].\n- **CẤU TRÚC PHẢN HỒI ĐẶC BIỆT:** Khi bạn quyết định gửi media, hãy thêm tag [SEND_MEDIA:chủ_đề_tiếng_anh] vào CUỐI câu trả lời của bạn. VÍ DỤ: "Của em đây này 😉 [SEND_MEDIA:selfie]".`;
    return persona + '\n\n' + relationshipRules + '\n\n' + generalRules;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/chat', async (req, res) => {
    const { message, history, character } = req.body;
    const activeCharacter = characters[character] ? character : 'mera';
    const FREE_MESSAGE_LIMIT = 20;
    let memory = await loadMemory(activeCharacter);

    if (memory.user_profile.message_count >= FREE_MESSAGE_LIMIT) {
        return res.json({
            displayReply: "Bạn đã dùng hết lượt trò chuyện miễn phí.<NEXT_MESSAGE>Vui lòng nâng cấp để tiếp tục trò chuyện không giới hạn nhé!",
            historyReply: "Đã hết lượt miễn phí.",
        });
    }
    
    try {
        const systemPrompt = generateMasterPrompt(memory.user_profile, activeCharacter);
        const gptResponse = await xai.chat.completions.create({ model: "grok-3-mini", messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }]});
        let rawReply = gptResponse.choices[0].message.content.trim();
        let mediaUrl = null, mediaType = null;
        
        const mediaRegex = /\[SEND_MEDIA:\s*(\w+)\s*\]/;
        const mediaMatch = rawReply.match(mediaRegex);
        if (mediaMatch && mediaMatch[1]) {
            const subject = mediaMatch[1].toLowerCase();
            const mediaResult = await sendMediaFile(memory, activeCharacter, 'image', 'normal', subject);
            if (mediaResult.success) {
                mediaUrl = mediaResult.mediaUrl;
                mediaType = mediaResult.mediaType;
                memory = mediaResult.updatedMemory;
            }
            rawReply = rawReply.replace(mediaRegex, '').trim() || mediaResult.message;
        }
        
        memory.user_profile.message_count++;
        await saveMemory(activeCharacter, memory);

        const displayReply = rawReply.replace(/\n/g, ' ').replace(/<NEXT_MESSAGE>/g, '<NEXT_MESSAGE>');
        const audioDataUri = await createViettelVoice(rawReply.replace(/<NEXT_MESSAGE>/g, '... '), activeCharacter);
        res.json({ displayReply, historyReply: rawReply, audio: audioDataUri, mediaUrl, mediaType, updatedMemory: memory });

    } catch (error) {
        console.error("❌ Lỗi chung trong /chat:", error);
        res.status(500).json({ displayReply: 'Xin lỗi, có lỗi kết nối xảy ra!', historyReply: 'Lỗi!' });
    }
});