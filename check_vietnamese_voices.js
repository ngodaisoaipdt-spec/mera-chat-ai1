// Script để kiểm tra chi tiết voice "Nhu" và tìm các Vietnamese voices
require('dotenv').config({ override: true });

const axios = require('axios');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
    console.error('❌ Chưa có ELEVENLABS_API_KEY trong file .env');
    process.exit(1);
}

async function checkVoices() {
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
                console.log('🎯 Voice "Nhu" chi tiết:\n');
                console.log(`   Name: ${nhuVoice.name}`);
                console.log(`   Voice ID: ${nhuVoice.voice_id}`);
                console.log(`   Description: ${nhuVoice.description || 'N/A'}`);
                console.log(`   Category: ${nhuVoice.category || 'N/A'}`);
                console.log(`   Labels:`, nhuVoice.labels || 'N/A');
                console.log(`   Settings:`, JSON.stringify(nhuVoice.settings || {}, null, 2));
                console.log(`   High Quality Base Model IDs:`, nhuVoice.high_quality_base_model_ids || 'N/A');
                console.log(`   Safety Control Tokens:`, nhuVoice.safety_control_tokens || 'N/A');
                console.log(`   Voice Cloning:`, nhuVoice.voice_cloning || 'N/A');
                console.log(`   Permission Tier:`, nhuVoice.permission_tier || 'N/A');
                console.log(`   Available For Tiers:`, nhuVoice.available_for_tiers || 'N/A');
                console.log(`   Created At:`, nhuVoice.created_at || 'N/A');
                console.log(`   Sharing:`, nhuVoice.sharing || 'N/A');
                console.log(`   Samples:`, nhuVoice.samples ? nhuVoice.samples.length : 0, 'samples');
                console.log(`   Fine Tuning:`, nhuVoice.fine_tuning || 'N/A');
                console.log(`   Is Cloned:`, nhuVoice.is_cloned || false);
                console.log(`   Is Instantly Cloned:`, nhuVoice.is_instantly_cloned || false);
                console.log(`   Can Be Downloaded:`, nhuVoice.can_be_downloaded || false);
                console.log(`   Can Be Fine Tuned:`, nhuVoice.can_be_fine_tuned || false);
                console.log(`   Can Do Text To Speech:`, nhuVoice.can_do_text_to_speech || false);
                console.log(`   Can Use Style:`, nhuVoice.can_use_style || false);
                console.log(`   Can Use Speaker Boost:`, nhuVoice.can_use_speaker_boost || false);
                console.log(`   Served For Pro:`, nhuVoice.served_for_pro || false);
                console.log(`   Speaker ID:`, nhuVoice.speaker_id || 'N/A');
                console.log(`   Language:`, nhuVoice.language || 'N/A');
                console.log(`   Use Case:`, nhuVoice.use_case || 'N/A');
                console.log(`   Age:`, nhuVoice.age || 'N/A');
                console.log(`   Gender:`, nhuVoice.gender || 'N/A');
                console.log(`   Accent:`, nhuVoice.accent || 'N/A');
                console.log(`   Description:`, nhuVoice.description || 'N/A');
            }
            
            // Tìm tất cả Vietnamese voices
            console.log('\n\n🇻🇳 Tìm kiếm Vietnamese voices:\n');
            const vietnameseVoices = response.data.voices.filter(voice => {
                const name = (voice.name || '').toLowerCase();
                const desc = (voice.description || '').toLowerCase();
                const labels = JSON.stringify(voice.labels || {}).toLowerCase();
                return name.includes('vietnam') || 
                       name.includes('vietnamese') || 
                       name.includes('việt') ||
                       name.includes('viet') ||
                       desc.includes('vietnam') ||
                       desc.includes('vietnamese') ||
                       desc.includes('việt') ||
                       desc.includes('hanoi') ||
                       desc.includes('hà nội') ||
                       labels.includes('vietnam') ||
                       labels.includes('vietnamese') ||
                       (voice.language && voice.language.toLowerCase().includes('vi'));
            });
            
            if (vietnameseVoices.length > 0) {
                console.log(`✅ Tìm thấy ${vietnameseVoices.length} Vietnamese voices:\n`);
                vietnameseVoices.forEach((voice, index) => {
                    console.log(`${index + 1}. ${voice.name} (ID: ${voice.voice_id})`);
                    console.log(`   Description: ${voice.description || 'N/A'}`);
                    console.log(`   Language: ${voice.language || 'N/A'}`);
                    console.log(`   Accent: ${voice.accent || 'N/A'}`);
                    console.log('');
                });
            } else {
                console.log('⚠️ Không tìm thấy Vietnamese voices rõ ràng.');
                console.log('💡 Voice "Nhu" có thể là multilingual voice, không phải Vietnamese native.');
            }
            
            // Hiển thị tất cả voices để user có thể chọn
            console.log('\n\n📋 Tất cả voices (để tham khảo):\n');
            response.data.voices.forEach((voice, index) => {
                console.log(`${index + 1}. ${voice.name} (ID: ${voice.voice_id})`);
                if (voice.description) {
                    console.log(`   ${voice.description}`);
                }
            });
            
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

checkVoices();

