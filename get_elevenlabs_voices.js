// Script để lấy danh sách voices từ ElevenLabs và tìm Voice ID của "Nhu"
require('dotenv').config({ override: true });

const axios = require('axios');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
    console.error('❌ Chưa có ELEVENLABS_API_KEY trong file .env');
    console.log('💡 Vui lòng thêm: ELEVENLABS_API_KEY=your_api_key_here');
    process.exit(1);
}

async function getVoices() {
    try {
        console.log('🔍 Đang lấy danh sách voices từ ElevenLabs...\n');
        
        const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY
            }
        });
        
        if (response.data && response.data.voices) {
            console.log(`✅ Tìm thấy ${response.data.voices.length} voices:\n`);
            
            // Tìm voice "Nhu"
            const nhuVoice = response.data.voices.find(voice => 
                voice.name.toLowerCase().includes('nhu') || 
                voice.name.toLowerCase().includes('calm') ||
                voice.name.toLowerCase().includes('confident')
            );
            
            if (nhuVoice) {
                console.log('🎯 Tìm thấy voice "Nhu":\n');
                console.log(`   Name: ${nhuVoice.name}`);
                console.log(`   Voice ID: ${nhuVoice.voice_id}`);
                console.log(`   Description: ${nhuVoice.description || 'N/A'}`);
                console.log(`   Category: ${nhuVoice.category || 'N/A'}\n`);
                console.log('✅ Voice ID để sử dụng:', nhuVoice.voice_id);
                console.log('\n📝 Vui lòng thêm vào file .env:');
                console.log(`   ELEVENLABS_VOICE_ID_NHU=${nhuVoice.voice_id}`);
            } else {
                console.log('⚠️ Không tìm thấy voice "Nhu" trong danh sách.\n');
                console.log('📋 Danh sách tất cả voices:\n');
                response.data.voices.forEach((voice, index) => {
                    console.log(`${index + 1}. ${voice.name} (ID: ${voice.voice_id})`);
                    if (voice.description) {
                        console.log(`   Description: ${voice.description}`);
                    }
                });
            }
            
            // Hiển thị thông tin về models
            console.log('\n📚 Models có sẵn:');
            console.log('   - eleven_multilingual_v2 (Thế hệ 2 - Multilingual)');
            console.log('   - eleven_turbo_v2_5 (Fast, low latency)');
            console.log('   - eleven_monolingual_v1 (English only)');
            
        } else {
            console.error('❌ Không nhận được dữ liệu voices');
        }
        
    } catch (error) {
        console.error('❌ Lỗi khi lấy voices:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }
}

getVoices();

