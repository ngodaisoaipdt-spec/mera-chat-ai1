# Mera Chat - AI Chat Application

Ứng dụng chat AI với nhân vật Mera và Trương Thắng sử dụng Grok-3.

## 🚀 Deploy lên Render

### Cách 1: Deploy qua Render Dashboard (Khuyến nghị)

1. **Đăng nhập Render**
   - Truy cập [render.com](https://render.com)
   - Đăng nhập hoặc tạo tài khoản mới

2. **Tạo Web Service mới**
   - Click "New +" → "Web Service"
   - Kết nối repository GitHub/GitLab của bạn
   - Hoặc chọn "Public Git repository" và paste URL repo

3. **Cấu hình Service**
   - **Name**: `mera-chat` (hoặc tên bạn muốn)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Chọn plan phù hợp (Starter hoặc Standard)

4. **Thêm Environment Variables**
   Trong phần "Environment", thêm các biến sau:

   ```
   NODE_ENV=production
   PORT=3000
   XAI_API_KEY=your_xai_api_key
   MONGODB_URI=your_mongodb_connection_string
   SESSION_SECRET=your_random_secret_string
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   SEPAY_ACCOUNT_NO=your_sepay_account
   SEPAY_ACCOUNT_NAME=your_account_name
   SEPAY_BANK_BIN=your_bank_bin
   VIETTEL_AI_TOKEN=your_viettel_token (optional)
   ```

   **Lưu ý**: 
   - Tạo SESSION_SECRET ngẫu nhiên (có thể dùng: `openssl rand -hex 32`)
   - Nếu dùng VNPay, thêm: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`

5. **Deploy**
   - Click "Create Web Service"
   - Render sẽ tự động build và deploy
   - Đợi vài phút để build hoàn tất

### Cách 2: Deploy qua render.yaml

1. **Commit file render.yaml vào repo**
   ```bash
   git add render.yaml
   git commit -m "Add Render configuration"
   git push
   ```

2. **Tạo Service trên Render**
   - Vào Render Dashboard
   - Click "New +" → "Blueprint"
   - Chọn repository có file `render.yaml`
   - Render sẽ tự động đọc cấu hình

3. **Thêm Environment Variables**
   - Vào Settings của service
   - Thêm tất cả các biến môi trường cần thiết

## 📋 Environment Variables cần thiết

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `XAI_API_KEY` | API key từ xAI (Grok) | ✅ |
| `MONGODB_URI` | Connection string MongoDB | ✅ |
| `SESSION_SECRET` | Secret key cho session | ✅ |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | ✅ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | ✅ |
| `SEPAY_ACCOUNT_NO` | Số tài khoản SePay | ✅ |
| `SEPAY_ACCOUNT_NAME` | Tên chủ tài khoản | ✅ |
| `SEPAY_BANK_BIN` | Bank BIN code | ✅ |
| `VIETTEL_AI_TOKEN` | Token Viettel AI cho TTS | ⚠️ Optional |
| `VNPAY_TMN_CODE` | VNPay Terminal Code | ⚠️ Optional |
| `VNPAY_HASH_SECRET` | VNPay Hash Secret | ⚠️ Optional |
| `VNPAY_URL` | VNPay API URL | ⚠️ Optional |

## 🔧 Local Development

```bash
# Cài đặt dependencies
npm install

# Tạo file .env với các biến môi trường
cp .env.example .env

# Chạy server
npm start
```

## 📝 Lưu ý

- Render sẽ tự động set biến `PORT`, không cần set trong .env
- Đảm bảo MongoDB URI có thể truy cập từ internet (không dùng localhost)
- Google OAuth callback URL cần được cập nhật trong Google Console:
  - `https://your-app-name.onrender.com/auth/google/callback`
- Webhook URL cho SePay:
  - `https://your-app-name.onrender.com/api/sepay-webhook`

## 🐛 Troubleshooting

- **Build failed**: Kiểm tra log trong Render Dashboard
- **App không start**: Kiểm tra PORT và các biến môi trường
- **MongoDB connection error**: Kiểm tra MONGODB_URI và network access
- **OAuth không hoạt động**: Kiểm tra callback URL trong Google Console

