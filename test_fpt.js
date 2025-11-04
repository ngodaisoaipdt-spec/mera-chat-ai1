// test_fpt.js - File kiểm tra FPT.AI một cách độc lập

const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');

// Đọc file .env
dotenv.config({ override: true });

// Lấy key trực tiếp
const FPT_API_KEY = process.env.FPT_API_KEY;

// Nội dung cần chuyển thành giọng nói
const textToSpeak = "Nếu bạn nghe được câu này, chúng ta đã thành công.";
const voice = "linhsan"; // Giọng bạn muốn test

async function testVoice() {
    console.log("==============================================");
    console.log("BẮT ĐẦU KIỂM TRA FPT.AI VOICE");
    console.log("==============================================");

    if (!FPT_API_KEY) {
        console.error("LỖI NGHIÊM TRỌNG: Không thể đọc FPT_API_KEY từ file .env.");
        return;
    }

    console.log(`🔑 Key đang sử dụng (4 ký tự cuối): ...${FPT_API_KEY.slice(-4)}`);
    console.log(`🎤 Giọng nói đang thử nghiệm: ${voice}`);
    console.log(`💬 Nội dung: "${textToSpeak}"`);

    try {
        console.log("\n▶️ Đang gửi yêu cầu đến FPT.AI...");

        const response = await axios.post(
            'https://api.fpt.ai/hmi/tts/v5',
            textToSpeak,
            {
                headers: {
                    'api-key': FPT_API_KEY,
                    'voice': voice
                }
            }
        );

        if (response.data && response.data.error === 0 && response.data.async) {
            console.log("✅ THÀNH CÔNG! FPT.AI đã trả về dữ liệu âm thanh.");
            
            // Lấy dữ liệu base64
            const base64Data = response.data.async;
            
            // Giải mã và lưu thành file .mp3 để kiểm tra
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync('test_output.mp3', buffer);
            
            console.log("\n✅ Đã lưu file âm thanh thành công với tên: test_output.mp3");
            console.log("-> Vui lòng mở file này trong thư mục dự án của bạn để nghe thử.");
            
        } else {
            console.error("\n❌ FPT.AI trả về một lỗi:", response.data);
        }

    } catch (error) {
        console.error("\n❌ LỖI MẠNG khi gọi FPT.AI:");
        if (error.response) {
            console.error(`   - Status Code: ${error.response.status}`);
            console.error("   - Phản hồi từ Server:", error.response.data);
        } else {
            console.error("   - Lỗi:", error.message);
        }
    }
    console.log("\n==============================================");
    console.log("KẾT THÚC KIỂM TRA");
    console.log("==============================================");
}

// Chạy hàm test
testVoice();``