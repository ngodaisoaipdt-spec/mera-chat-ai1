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
        case 'stranger': relationshipRules = `**GIAI ĐOẠN: Người Lạ**\n...`; break;
        case 'friend': relationshipRules = `**GIAI ĐOẠN: Bạn Bè**\n...`; break;
        case 'close_friend': relationshipRules = `**GIAI ĐOẠN: Bạn Thân**\n...`; break;
        case 'lover': relationshipRules = `**GIAI ĐOẠN: Người Yêu**\n...`; break;
    }

    const generalRules = `\n**QUY TẮC CHUNG (CỰC KỲ QUAN TRỌNG):**\n...`;
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