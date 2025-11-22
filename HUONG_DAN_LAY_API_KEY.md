# Hướng dẫn lấy API Key từ ElevenLabs

## Bước 1: Đăng nhập
1. Truy cập: https://elevenlabs.io
2. Đăng nhập hoặc đăng ký tài khoản

## Bước 2: Vào Settings
1. Click vào **Profile** (góc trên bên phải)
2. Chọn **Settings**

## Bước 3: Mở phần API Keys
1. Tìm mục **API Keys** trong menu bên trái
2. Hoặc truy cập trực tiếp: https://elevenlabs.io/app/settings/api-keys

## Bước 4: Tạo API Key mới
1. Click nút **"+ New API Key"** hoặc **"Create API Key"**
2. Đặt tên cho API key (ví dụ: "Mera Chat TTS")
3. Chọn quyền truy cập (Text-to-Speech, Voices)
4. Click **"Create"** hoặc **"Generate"**

## Bước 5: Copy API Key
⚠️ **QUAN TRỌNG**: API key chỉ hiển thị **MỘT LẦN DUY NHẤT**!
- Copy ngay API key (dạng: `sk-xxxxxxxxxxxxx...`)
- Lưu vào nơi an toàn

## Bước 6: Thêm vào file .env
Mở file `.env` và thêm:
```
ELEVENLABS_API_KEY=sk-your-api-key-here
```

## Bước 7: Lấy Voice ID
Sau khi có API key, chạy:
```bash
node get_elevenlabs_voices.js
```

Script sẽ tìm voice "Nhu" và hiển thị Voice ID để bạn thêm vào `.env`

---

**Lưu ý bảo mật:**
- ❌ KHÔNG chia sẻ API key với ai
- ❌ KHÔNG commit file `.env` lên Git
- ❌ KHÔNG public API key trên mạng

