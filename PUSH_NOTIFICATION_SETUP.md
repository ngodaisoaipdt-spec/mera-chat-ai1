# Hướng dẫn cấu hình Push Notifications

## 📋 Tổng quan

Tính năng Push Notifications cho phép Mera/Trương Thắng gửi thông báo đến người dùng ngay cả khi app đang đóng, tương tự như Messenger.

## 🔧 Cấu hình cần thiết

### 1. Tạo VAPID Keys

Chạy lệnh sau để tạo VAPID keys:

```bash
npm run generate-vapid
```

Hoặc:

```bash
node generate-vapid-keys.js
```

Script sẽ hiển thị các keys cần thêm vào `.env` và Render.

### 2. Thêm vào file `.env` (local)

Thêm các dòng sau vào file `.env`:

```env
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_CONTACT_EMAIL=your-email@example.com
```

**Lưu ý:**
- Thay `your-email@example.com` bằng email thật của bạn
- VAPID keys phải giống nhau giữa local và Render

### 3. Thêm vào Render Environment Variables

1. Vào **Render Dashboard** → Chọn service của bạn
2. Vào tab **Environment**
3. Thêm 3 biến môi trường sau:

| Key | Value |
|-----|-------|
| `VAPID_PUBLIC_KEY` | (Public key từ script generate) |
| `VAPID_PRIVATE_KEY` | (Private key từ script generate) |
| `VAPID_CONTACT_EMAIL` | (Email của bạn, ví dụ: `your-email@example.com`) |

4. Click **Save Changes**
5. Render sẽ tự động redeploy

## ✅ Kiểm tra

Sau khi cấu hình xong:

1. **Deploy code lên Render**
2. **Mở app trên điện thoại/desktop**
3. **Cho phép notifications** khi browser hỏi
4. **Gửi tin nhắn cho Mera/Trương Thắng**
5. **Đóng app hoàn toàn**
6. **Đợi 20 phút** → Sẽ nhận được push notification

## 🔍 Troubleshooting

### Notification không hiển thị?

1. **Kiểm tra logs trên Render:**
   - Xem có lỗi về VAPID keys không
   - Xem có log "✅ Đã gửi push notification" không

2. **Kiểm tra browser:**
   - Chrome/Edge: Cần HTTPS (Render đã có)
   - Safari: Cần macOS/iOS và đã cho phép notifications
   - Firefox: Cần HTTPS và đã cho phép notifications

3. **Kiểm tra Service Worker:**
   - Mở DevTools → Application → Service Workers
   - Xem Service Worker đã được đăng ký chưa

4. **Kiểm tra Push Subscription:**
   - Mở DevTools → Application → Service Workers
   - Click vào Service Worker → Push → Xem subscription

### VAPID keys không khớp?

- **Quan trọng:** VAPID keys phải giống nhau giữa:
  - Local development (.env)
  - Render production (Environment Variables)
  
- Nếu keys khác nhau, push notifications sẽ không hoạt động!

## 📝 Các biến môi trường hiện có

App đang sử dụng các biến môi trường sau:

### Bắt buộc:
- `MONGODB_URI` - MongoDB connection string
- `SESSION_SECRET` - Secret cho session
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret
- `XAI_API_KEY` - X.AI API key

### Tùy chọn:
- `PORT` - Port server (mặc định: 3000)
- `XAI_MODEL_DEFAULT` - Model mặc định (mặc định: grok-4-fast)
- `XAI_TIMEOUT_MS` - Timeout cho API (mặc định: 60000)
- `BRIEF_MODE` - Chế độ brief (true/false)

### Payment (nếu dùng):
- `SEPAY_ACCOUNT_NO`
- `SEPAY_ACCOUNT_NAME`
- `SEPAY_BANK_BIN`
- `VNPAY_TMN_CODE`
- `VNPAY_HASH_SECRET`
- `VNPAY_URL`

### TTS (nếu dùng):
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID_NHU`
- `ELEVENLABS_VOICE_ID_TRUONG_THANG`

### Push Notifications (MỚI):
- `VAPID_PUBLIC_KEY` ⭐ **CẦN THÊM**
- `VAPID_PRIVATE_KEY` ⭐ **CẦN THÊM**
- `VAPID_CONTACT_EMAIL` ⭐ **CẦN THÊM**

## 🚀 Sẵn sàng!

Sau khi thêm các biến môi trường vào Render và deploy, tính năng push notifications sẽ hoạt động tự động!

