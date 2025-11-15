# 🚀 Hướng dẫn Deploy lên Render

## Bước 1: Chuẩn bị Code

Đảm bảo các file sau đã được commit:
- ✅ `app.js`
- ✅ `package.json`
- ✅ `render.yaml`
- ✅ `README.md`

## Bước 2: Đẩy code lên GitHub/GitLab

```bash
# Nếu chưa có git repo
git init
git add .
git commit -m "Initial commit - Ready for Render deploy"

# Tạo repo trên GitHub/GitLab, sau đó:
git remote add origin https://github.com/yourusername/mera-chat.git
git branch -M main
git push -u origin main
```

## Bước 3: Tạo Service trên Render

### Option A: Deploy qua Dashboard (Dễ nhất)

1. **Đăng nhập Render**
   - Vào [dashboard.render.com](https://dashboard.render.com)
   - Đăng nhập hoặc Sign up

2. **Tạo Web Service**
   - Click nút **"New +"** ở góc trên bên phải
   - Chọn **"Web Service"**
   - Kết nối GitHub/GitLab account nếu chưa
   - Chọn repository `mera-chat`

3. **Cấu hình Service**
   ```
   Name: mera-chat
   Environment: Node
   Region: Singapore (hoặc gần nhất)
   Branch: main
   Root Directory: (để trống)
   Build Command: npm install
   Start Command: npm start
   Plan: Starter ($7/tháng) hoặc Free (có giới hạn)
   ```

4. **Thêm Environment Variables**
   
   Click vào **"Environment"** tab và thêm:

   ```bash
   # Bắt buộc
   NODE_ENV=production
   PORT=3000
   XAI_API_KEY=xai-xxxxxxxxxxxxx
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
   SESSION_SECRET=<tạo ngẫu nhiên: openssl rand -hex 32>
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxx
   SEPAY_ACCOUNT_NO=xxxxx
   SEPAY_ACCOUNT_NAME=Your Name
   SEPAY_BANK_BIN=970422
   
   # Tùy chọn
   VIETTEL_AI_TOKEN=xxxxx
   VNPAY_TMN_CODE=xxxxx
   VNPAY_HASH_SECRET=xxxxx
   VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
   ```

5. **Deploy**
   - Click **"Create Web Service"**
   - Đợi build (5-10 phút)
   - Khi thấy "Live", app đã sẵn sàng!

### Option B: Deploy qua Blueprint (render.yaml)

1. **Commit render.yaml**
   ```bash
   git add render.yaml
   git commit -m "Add Render config"
   git push
   ```

2. **Tạo Blueprint**
   - Render Dashboard → "New +" → "Blueprint"
   - Chọn repo có `render.yaml`
   - Render sẽ tự đọc config

3. **Thêm Environment Variables** (giống như Option A)

## Bước 4: Cấu hình Google OAuth

1. Vào [Google Cloud Console](https://console.cloud.google.com)
2. Chọn project → APIs & Services → Credentials
3. Chỉnh sửa OAuth 2.0 Client
4. Thêm **Authorized redirect URIs**:
   ```
   https://mera-chat.onrender.com/auth/google/callback
   ```
   (Thay `mera-chat` bằng tên service của bạn)

## Bước 5: Cấu hình SePay Webhook

1. Vào dashboard SePay/Casso
2. Thêm webhook URL:
   ```
   https://mera-chat.onrender.com/api/sepay-webhook
   ```

## Bước 6: Kiểm tra

1. Truy cập URL: `https://mera-chat.onrender.com`
2. Test đăng nhập Google
3. Test chat với Mera/Thắng
4. Kiểm tra logs trong Render Dashboard nếu có lỗi

## 🔧 Troubleshooting

### Build Failed
- Kiểm tra `package.json` có đúng dependencies
- Xem logs trong Render Dashboard → "Logs" tab

### App không start
- Kiểm tra PORT (Render tự set, không cần set trong code)
- Kiểm tra tất cả environment variables đã đủ chưa
- Xem logs để biết lỗi cụ thể

### MongoDB Connection Error
- Kiểm tra MONGODB_URI đúng format
- Đảm bảo MongoDB Atlas cho phép IP 0.0.0.0/0 (hoặc whitelist Render IPs)

### OAuth không hoạt động
- Kiểm tra callback URL đã đúng trong Google Console
- Kiểm tra GOOGLE_CLIENT_ID và SECRET đúng

## 📝 Lưu ý quan trọng

1. **Free Plan có giới hạn**:
   - App sẽ sleep sau 15 phút không dùng
   - Lần đầu wake up mất ~30 giây
   - Nên dùng Starter plan ($7/tháng) cho production

2. **Environment Variables**:
   - Không commit file `.env` vào git
   - Chỉ thêm trong Render Dashboard

3. **MongoDB**:
   - Dùng MongoDB Atlas (free tier OK)
   - Đảm bảo network access cho phép mọi IP hoặc whitelist Render

4. **Domain Custom**:
   - Có thể thêm custom domain trong Render Settings
   - Cần update callback URL trong Google Console

## ✅ Checklist trước khi deploy

- [ ] Code đã push lên GitHub/GitLab
- [ ] Có file `render.yaml` hoặc sẵn sàng config qua Dashboard
- [ ] Đã chuẩn bị tất cả API keys và secrets
- [ ] MongoDB đã setup và có connection string
- [ ] Google OAuth đã tạo và có Client ID/Secret
- [ ] SePay account đã setup
- [ ] Đã test local trước khi deploy

## 🎉 Xong!

Sau khi deploy thành công, bạn sẽ có URL dạng:
`https://mera-chat.onrender.com`

Chúc bạn deploy thành công! 🚀

