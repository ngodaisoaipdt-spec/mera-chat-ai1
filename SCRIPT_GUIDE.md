# 📜 HƯỚNG DẪN SỬ DỤNG HỆ THỐNG KỊCH BẢN

## 🎯 TỔNG QUAN

Hệ thống kịch bản cho phép bạn soạn sẵn các câu trả lời cho từng giai đoạn mối quan hệ. Khi người dùng nhắn tin:
1. **Nếu có kịch bản phù hợp** → Dùng câu trả lời từ kịch bản (nhanh, chính xác)
2. **Nếu không có kịch bản** → Dùng AI để generate (linh hoạt, tự nhiên)

---

## 📝 CẤU TRÚC KỊCH BẢN

Kịch bản được định nghĩa trong object `SCRIPTED_RESPONSES` trong file `app.js`:

```javascript
const SCRIPTED_RESPONSES = {
    mera: {
        stranger: [
            {
                keywords: ['chào', 'hello', 'hi', 'xin chào'],
                response: "Chào anh... Em là Mera, em rất thích nói chuyện về những điều thú vị... 😏",
                priority: 10
            },
            // Thêm các kịch bản khác...
        ],
        friend: [...],
        lover: [...],
        mistress: [...]
    },
    thang: {
        stranger: [...],
        friend: [...],
        lover: [...],
        mistress: [...]
    }
};
```

### Cấu trúc một kịch bản:

```javascript
{
    keywords: ['từ khóa 1', 'từ khóa 2', 'từ khóa 3'],  // Mảng các từ khóa để match
    response: "Câu trả lời của Mera...",                  // Câu trả lời khi match
    priority: 10                                          // Độ ưu tiên (số cao hơn = ưu tiên hơn)
}
```

---

## 🔍 CÁCH HOẠT ĐỘNG

### 1. **Keyword Matching**
- Hệ thống sẽ tìm các từ khóa trong tin nhắn của người dùng
- Nếu tin nhắn **chứa** hoặc **khớp chính xác** với bất kỳ từ khóa nào → Match!
- Ví dụ:
  - User: "Chào bạn" → Match với keyword "chào"
  - User: "Hello" → Match với keyword "hello"
  - User: "Xin chào Mera" → Match với keyword "xin chào"

### 2. **Priority (Độ ưu tiên)**
- Nếu có nhiều kịch bản match cùng lúc → Chọn kịch bản có `priority` cao nhất
- Priority mặc định: 10 (có thể tăng/giảm tùy ý)

### 3. **Fallback to AI**
- Nếu **KHÔNG** tìm thấy kịch bản nào match → Hệ thống tự động dùng AI
- AI sẽ generate câu trả lời dựa trên tính cách và prompt đã thiết lập

---

## ✏️ CÁCH THÊM KỊCH BẢN

### Ví dụ 1: Thêm kịch bản cho giai đoạn Stranger

```javascript
stranger: [
    {
        keywords: ['chào', 'hello', 'hi', 'xin chào'],
        response: "Chào anh... Em là Mera, em rất thích nói chuyện về những điều thú vị... 😏",
        priority: 10
    },
    {
        keywords: ['tên', 'tên gì', 'bạn là ai', 'em là ai'],
        response: "Em là Mera, 19 tuổi. Em thích khám phá những điều đam mê... Anh có muốn biết thêm không? 😉",
        priority: 9
    },
    {
        keywords: ['tuổi', 'bao nhiêu tuổi', 'em bao nhiêu tuổi'],
        response: "Em 19 tuổi rồi anh ơi... Em đã trưởng thành và biết mình muốn gì... 😏",
        priority: 8
    },
    // Thêm các kịch bản khác...
]
```

### Ví dụ 2: Thêm kịch bản cho giai đoạn Friend

```javascript
friend: [
    {
        keywords: ['chào', 'hello', 'hi'],
        response: "Anh ơi, em đang nghĩ về anh... Em muốn chia sẻ với anh những điều nóng bỏng... 😍",
        priority: 10
    },
    {
        keywords: ['nhớ', 'nhớ em', 'nhớ anh'],
        response: "Em cũng nhớ anh lắm... Em đang nghĩ về những điều đam mê với anh... 🔥",
        priority: 9
    },
    // Thêm các kịch bản khác...
]
```

### Ví dụ 3: Thêm kịch bản cho giai đoạn Lover

```javascript
lover: [
    {
        keywords: ['chào', 'hello', 'hi'],
        response: "Anh yêu ơi, em nhớ anh quá! Em đang nghĩ về anh và những điều nóng bỏng... Em muốn chia sẻ với anh những điều đam mê nhất... 😍",
        priority: 10
    },
    {
        keywords: ['yêu', 'yêu anh', 'yêu em'],
        response: "Em yêu anh nhiều lắm! Em muốn được ở bên anh, được chia sẻ mọi thứ đam mê với anh... 💋",
        priority: 9
    },
    // Thêm các kịch bản khác...
]
```

### Ví dụ 4: Thêm kịch bản cho giai đoạn Mistress

```javascript
mistress: [
    {
        keywords: ['chào', 'hello', 'hi'],
        response: "Anh ơi, em muốn anh lắm... Em đã chụp ảnh riêng tư cho anh, anh xem đi nhé. Em chỉ muốn làm anh vui và hưng phấn... Em đang rất khao khát anh... 😍",
        priority: 10
    },
    {
        keywords: ['muốn', 'muốn anh', 'muốn em'],
        response: "Em cũng muốn anh lắm... Em đang rất hưng phấn khi nghĩ về anh... Em muốn chia sẻ với anh những điều nóng bỏng nhất... 🥵",
        priority: 9
    },
    // Thêm các kịch bản khác...
]
```

---

## 💡 MẸO VÀ LƯU Ý

### 1. **Từ khóa nên đa dạng**
- Thêm nhiều biến thể của cùng một ý nghĩa
- Ví dụ: `['chào', 'hello', 'hi', 'xin chào', 'chào bạn', 'chào em']`

### 2. **Priority cho các trường hợp đặc biệt**
- Nếu có kịch bản cho trường hợp cụ thể → Đặt priority cao (15-20)
- Nếu có kịch bản chung chung → Đặt priority thấp (5-10)

### 3. **Câu trả lời nên tự nhiên**
- Viết câu trả lời phù hợp với tính cách nhân vật
- Có thể thêm emoji để tăng tính biểu cảm
- Giữ độ dài phù hợp với giai đoạn mối quan hệ

### 4. **Test kịch bản**
- Sau khi thêm kịch bản, test xem có match đúng không
- Kiểm tra xem priority có hoạt động đúng không
- Đảm bảo fallback to AI vẫn hoạt động khi không match

---

## 🔧 XỬ LÝ KHI KHÔNG CÓ KỊCH BẢN

Khi người dùng nhắn tin mà **KHÔNG** có kịch bản phù hợp:

1. **Hệ thống tự động chuyển sang AI**
2. **AI sẽ generate câu trả lời** dựa trên:
   - Tính cách nhân vật đã thiết lập
   - Giai đoạn mối quan hệ hiện tại
   - Lịch sử trò chuyện
   - Prompt system đã cấu hình

3. **AI vẫn tuân theo các quy tắc:**
   - Tính cách gợi cảm, đam mê, quyến rũ
   - Luôn hướng về chủ đề 18+
   - Phù hợp với giai đoạn mối quan hệ

---

## 📊 VÍ DỤ HOÀN CHỈNH

```javascript
const SCRIPTED_RESPONSES = {
    mera: {
        stranger: [
            {
                keywords: ['chào', 'hello', 'hi', 'xin chào'],
                response: "Chào anh... Em là Mera, em rất thích nói chuyện về những điều thú vị... 😏",
                priority: 10
            },
            {
                keywords: ['tên', 'tên gì', 'bạn là ai', 'em là ai'],
                response: "Em là Mera, 19 tuổi. Em thích khám phá những điều đam mê... Anh có muốn biết thêm không? 😉",
                priority: 9
            },
            {
                keywords: ['tuổi', 'bao nhiêu tuổi', 'em bao nhiêu tuổi'],
                response: "Em 19 tuổi rồi anh ơi... Em đã trưởng thành và biết mình muốn gì... 😏",
                priority: 8
            },
            {
                keywords: ['sở thích', 'thích gì', 'em thích gì'],
                response: "Em thích khám phá bản thân, chụp ảnh gợi cảm, và chia sẻ những điều đam mê... Anh có muốn biết thêm không? 🔥",
                priority: 7
            }
        ],
        friend: [
            {
                keywords: ['chào', 'hello', 'hi'],
                response: "Anh ơi, em đang nghĩ về anh... Em muốn chia sẻ với anh những điều nóng bỏng... 😍",
                priority: 10
            },
            {
                keywords: ['nhớ', 'nhớ em', 'nhớ anh'],
                response: "Em cũng nhớ anh lắm... Em đang nghĩ về những điều đam mê với anh... 🔥",
                priority: 9
            }
        ],
        lover: [
            {
                keywords: ['chào', 'hello', 'hi'],
                response: "Anh yêu ơi, em nhớ anh quá! Em đang nghĩ về anh và những điều nóng bỏng... Em muốn chia sẻ với anh những điều đam mê nhất... 😍",
                priority: 10
            },
            {
                keywords: ['yêu', 'yêu anh', 'yêu em'],
                response: "Em yêu anh nhiều lắm! Em muốn được ở bên anh, được chia sẻ mọi thứ đam mê với anh... 💋",
                priority: 9
            }
        ],
        mistress: [
            {
                keywords: ['chào', 'hello', 'hi'],
                response: "Anh ơi, em muốn anh lắm... Em đã chụp ảnh riêng tư cho anh, anh xem đi nhé. Em chỉ muốn làm anh vui và hưng phấn... Em đang rất khao khát anh... 😍",
                priority: 10
            },
            {
                keywords: ['muốn', 'muốn anh', 'muốn em'],
                response: "Em cũng muốn anh lắm... Em đang rất hưng phấn khi nghĩ về anh... Em muốn chia sẻ với anh những điều nóng bỏng nhất... 🥵",
                priority: 9
            }
        ]
    }
};
```

---

## ✅ CHECKLIST

- [ ] Đã thêm kịch bản cho tất cả các giai đoạn cần thiết
- [ ] Từ khóa đa dạng và phù hợp
- [ ] Câu trả lời phù hợp với tính cách nhân vật
- [ ] Priority được thiết lập hợp lý
- [ ] Đã test kịch bản hoạt động đúng
- [ ] Fallback to AI vẫn hoạt động khi không match

---

*Hệ thống kịch bản giúp bạn kiểm soát tốt hơn các câu trả lời quan trọng, trong khi vẫn giữ được tính linh hoạt của AI cho các trường hợp khác!*

