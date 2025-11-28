// Script để generate VAPID keys cho Web Push Notifications
const webpush = require('web-push');

console.log('🔑 Đang tạo VAPID keys...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ Đã tạo VAPID keys thành công!\n');
console.log('📝 Thêm các dòng sau vào file .env:\n');
console.log('='.repeat(60));
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_CONTACT_EMAIL=your-email@example.com`);
console.log('='.repeat(60));
console.log('\n⚠️ Lưu ý:');
console.log('1. Thay "your-email@example.com" bằng email thật của bạn');
console.log('2. Thêm các biến này vào Render Environment Variables');
console.log('3. VAPID keys này sẽ được dùng để gửi push notifications');

