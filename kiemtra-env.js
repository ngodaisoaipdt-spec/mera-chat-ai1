// kiemtra-env.js

// Tải thư viện dotenv để đọc file .env
require('dotenv').config();

// In ra các dòng để phân biệt kết quả kiểm tra
console.log("======================================");
console.log("=== BẮT ĐẦU KIỂM TRA FILE .ENV ===");
console.log("======================================");

// In ra giá trị của GNEWS_API_KEY mà chương trình đọc được
console.log("Giá trị của GNEWS_API_KEY là: ", process.env.GNEWS_API_KEY);

// Dựa vào dòng trên, chúng ta sẽ biết vấn đề
if (process.env.GNEWS_API_KEY) {
  console.log("\n>>> KẾT LUẬN: THÀNH CÔNG! File .env đã được đọc chính xác.");
} else {
  console.log("\n>>> KẾT LUẬN: THẤT BẠI! Chương trình không đọc được GNEWS_API_KEY từ file .env.");
}

console.log("======================================");