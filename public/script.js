// script.js - PHIÊN BẢN CUỐI CÙNG VỚI THANH TOÁN (ĐÃ SỬA LỖI ĐẢM BẢO HIỂN THỊ NÚT PREMIUM)

let conversationHistory = [];
let recognition = null;
let isProcessing = false;
let currentCharacter = 'mera';
let currentMemory = {};
let currentUser = null;
let paymentCheckInterval = null;
let hasDisplayedPremiumPrompt = false; // <<< THÊM: Biến này đảm bảo nút Premium chỉ hiện 1 lần sau khi chat

const DOMElements = {
    loginScreen: document.getElementById('loginScreen'),
    characterSelectionScreen: document.getElementById('characterSelectionScreen'),
    appContainer: document.getElementById('appContainer'),
    chatBox: document.getElementById("chatBox"),
    userInput: document.getElementById("userInput"),
    sendBtn: document.getElementById("sendBtn"),
    micBtnText: document.getElementById("micBtnText"),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('login_error')) {
        alert("Đăng nhập thất bại. Vui lòng kiểm tra lại cấu hình trên Google Cloud và file .env của bạn.");
        window.history.replaceState({}, document.title, "/");
    }
    
    // THÊM ĐOẠN NÀY: Dọn dẹp URL sau khi đăng nhập thành công
    if (urlParams.has('login')) {
        window.history.replaceState({}, document.title, "/");
    }

    try {
        const response = await fetch('/api/current_user');
        if (response.ok) {
            currentUser = await response.json();
            if (currentUser) {
                showCharacterSelection();
            } else {
                // Trường hợp API trả về ok nhưng không có user (hiếm gặp)
                showLoginScreen();
            }
        } else {
            showLoginScreen();
        }
    } catch (error) {
        showLoginScreen();
        console.error("Lỗi kiểm tra session:", error);
    }
};


function showLoginScreen() {
    DOMElements.loginScreen.classList.add('active');
    DOMElements.characterSelectionScreen.classList.remove('active');
    DOMElements.appContainer.style.display = 'none';
}

function showCharacterSelection() {
    DOMElements.loginScreen.classList.remove('active');
    DOMElements.characterSelectionScreen.classList.add('active');
    DOMElements.appContainer.style.display = 'none';
    if (currentUser) {
        DOMElements.userAvatar.src = currentUser.avatar;
        DOMElements.userName.textContent = currentUser.displayName;
    }
}

document.getElementById('selectMera').addEventListener('click', () => setupCharacter('mera'));
document.getElementById('selectThang').addEventListener('click', () => setupCharacter('thang'));

async function setupCharacter(char) {
    currentCharacter = char;
    const isMera = char === 'mera';
    const avatarSrc = isMera ? 'mera_avatar.png' : 'thang_avatar.png';
    const charName = isMera ? 'Mera San' : 'Trương Thắng';

    document.querySelectorAll('.character-avatar').forEach(el => el.src = avatarSrc);
    document.querySelector('.character-name').textContent = charName;
    DOMElements.chatBox.innerHTML = '';
    hasDisplayedPremiumPrompt = false; // Reset trạng thái hiển thị khi chọn nhân vật

    DOMElements.characterSelectionScreen.classList.remove('active');
    DOMElements.appContainer.style.display = 'block';

    if (!window.chatAppInitialized) {
        initializeChatApp();
        window.chatAppInitialized = true;
    }

    await loadChatData();
}

async function loadChatData() {
    try {
        const response = await fetch(`/api/chat-data/${currentCharacter}`);
        if (!response.ok) throw new Error('Không thể tải dữ liệu.');
        const data = await response.json();
        
        currentMemory = data.memory;
        currentUser.isPremium = data.isPremium;
        conversationHistory = currentMemory.history || [];
        
        DOMElements.chatBox.innerHTML = '';
        if (conversationHistory.length === 0) {
            addMessage(DOMElements.chatBox, currentCharacter, currentCharacter === 'mera' ? "Chào anh, em là Mera nè. 🥰" : "Chào em, anh là Trương Thắng.");
        } else {
             conversationHistory.forEach(msg => {
                // Thêm tin nhắn từ history, [PREMIUM_PROMPT] vẫn được xử lý ở addMessage
                if (msg.role === 'user') addMessage(DOMElements.chatBox, "Bạn", msg.content);
                if (msg.role === 'assistant') {
                    addMessage(DOMElements.chatBox, currentCharacter, msg.content);
                }
            });
        }
        updateRelationshipStatus();
        updateUIForPremium();
        // Cuộn xuống cuối sau khi load
        DOMElements.chatBox.scrollTop = DOMElements.chatBox.scrollHeight;
    } catch (error) {
        console.error("Lỗi tải lịch sử chat:", error);
    }
}

function handlePremiumClick() {
    document.getElementById('paymentScreen').classList.add('active');
    initiatePayment();
}

async function initiatePayment() {
    const qrCodeImage = document.getElementById('qrCodeImage');
    const qrLoadingText = document.querySelector('.qr-loading');
    const paymentError = document.getElementById('paymentError'); // Element để hiển thị lỗi

    qrCodeImage.style.display = 'none';
    qrLoadingText.style.display = 'block';
    qrLoadingText.textContent = 'Đang tạo mã thanh toán...';
    paymentError.textContent = ''; // Xóa lỗi cũ

    try {
        const response = await fetch('/api/create-payment', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            qrCodeImage.src = data.qr_image;
            qrCodeImage.style.display = 'block';
            qrLoadingText.style.display = 'none';
            startCheckingPaymentStatus(data.orderCode);
        } else {
            // Xử lý lỗi từ server (nếu server gửi lại message lỗi)
            qrLoadingText.style.display = 'none';
            paymentError.textContent = data.message || "Lỗi không xác định khi tạo mã QR. Vui lòng kiểm tra console.";
        }
    } catch (error) {
        console.error("Lỗi kết nối /api/create-payment:", error);
        qrLoadingText.style.display = 'none';
        paymentError.textContent = "Lỗi kết nối. Vui lòng kiểm tra Network/Firewall hoặc URL Ngrok.";
    }
}

function startCheckingPaymentStatus(orderCode) {
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
    const paymentBox = document.querySelector('.payment-box');
    
    // Tạo element cho trạng thái chờ
    let checkStatusText = document.getElementById('checkStatusText');
    if (!checkStatusText) {
        checkStatusText = document.createElement('p');
        checkStatusText.id = 'checkStatusText';
        checkStatusText.className = 'payment-instructions';
        // Tìm element phù hợp để chèn (ví dụ: sau qr-code-area)
        const qrCodeArea = document.getElementById('qrCodeArea');
        if(qrCodeArea && qrCodeArea.parentNode) {
            qrCodeArea.parentNode.insertBefore(checkStatusText, qrCodeArea.nextSibling);
        }
    }
    
    paymentCheckInterval = setInterval(async () => {
        checkStatusText.textContent = "⌛ Đang chờ thanh toán được xác nhận...";

        const response = await fetch(`/api/payment-status/${orderCode}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            clearInterval(paymentCheckInterval);
            currentUser = data.user;
            document.getElementById('paymentScreen').classList.remove('active');
            alert("Thanh toán thành công! Chào mừng bạn đến với Premium.");
            checkStatusText.remove(); // Xóa thông báo chờ
            hasDisplayedPremiumPrompt = false; // Reset để UI premium hiển thị đúng
            updateUIForPremium();
            await loadChatData(); // Tải lại dữ liệu để AI nhận biết trạng thái mới
        }
    }, 3000);
}

function updateUIForPremium() {
    if (currentUser && currentUser.isPremium) {
        const statusBar = document.getElementById('relationshipStatus');
        if (statusBar) {
            statusBar.style.background = 'linear-gradient(45deg, var(--primary-color), var(--secondary-color))';
            statusBar.style.color = 'white';
            statusBar.title = "Bạn đã là Premium!";
            statusBar.textContent = "💖 Người Yêu (Premium)"; // Cập nhật trạng thái
        }
        document.querySelectorAll('.premium-prompt-message').forEach(el => el.remove()); // Xóa tất cả các thông báo Premium
    }
}

function initializeChatApp() {
    DOMElements.sendBtn.addEventListener("click", sendMessageFromInput);
    DOMElements.userInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessageFromInput(); });
    document.getElementById('characterAvatarContainer').addEventListener('click', () => { const avatarImage = document.querySelector('.character-avatar'); if (avatarImage) { document.getElementById('lightboxImage').src = avatarImage.src; document.body.classList.add('lightbox-active'); } });
    document.getElementById('relationshipStatus').addEventListener('click', () => { const descriptions = `CÁC GIAI ĐOẠN MỐI QUAN HỆ:\n\n` + `💔 Người Lạ: Giai đoạn làm quen ban đầu.\n\n` + `🧡 Bạn Bè: Giai đoạn cởi mở, chia sẻ hơn.\n\n` + `💖 Người Yêu (Premium): Mở khóa trò chuyện sâu sắc, lãng mạn, 18+ và media riêng tư!`; alert(descriptions); });
    document.getElementById('memoriesBtn').addEventListener('click', openMemoriesModal);
    if (SpeechRecognition) { recognition = new SpeechRecognition(); recognition.lang = 'vi-VN'; recognition.onresult = e => { DOMElements.userInput.value = e.results[0][0].transcript.trim(); sendMessageFromInput(); }; recognition.onerror = e => console.error("Lỗi recognition:", e.error); DOMElements.micBtnText.addEventListener('click', () => { if (!isProcessing) try { recognition.start(); } catch (e) { } }); }
    const imageLightbox = document.getElementById('imageLightbox'), closeLightboxBtn = document.getElementById('closeLightboxBtn');
    document.body.addEventListener('click', (e) => { if (e.target.matches('.chat-image')) { document.getElementById('lightboxImage').src = e.target.src; document.body.classList.add('lightbox-active'); } });
    const closeLightbox = () => document.body.classList.remove('lightbox-active');
    if (closeLightboxBtn) closeLightboxBtn.addEventListener('click', closeLightbox);
    if (imageLightbox) imageLightbox.addEventListener('click', e => { if (e.target === imageLightbox) closeLightbox(); });
    const memoriesModal = document.getElementById('memoriesModal'), closeMemoriesBtn = document.getElementById('closeMemoriesBtn');
    if (closeMemoriesBtn) closeMemoriesBtn.addEventListener('click', () => document.body.classList.remove('memories-active'));
    if (memoriesModal) memoriesModal.addEventListener('click', e => { if (e.target === memoriesModal) document.body.classList.remove('memories-active'); });
    const closePaymentBtn = document.getElementById('closePaymentBtn');
    closePaymentBtn.addEventListener('click', () => { document.getElementById('paymentScreen').classList.remove('active'); if (paymentCheckInterval) clearInterval(paymentCheckInterval); });
}

function sendMessageFromInput() { const message = DOMElements.userInput.value.trim(); if (!message || isProcessing) return; addMessage(DOMElements.chatBox, "Bạn", message); DOMElements.userInput.value = ""; const loadingId = addMessage(DOMElements.chatBox, currentCharacter, "💭 Đang suy nghĩ...", null, true); sendMessageToServer(message, loadingId); }
async function sendMessageToServer(messageText, loadingId) { setProcessing(true); try { const response = await fetch("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: messageText, character: currentCharacter }) }); if (!response.ok) throw new Error(`Server trả về lỗi ${response.status}`); const data = await response.json(); if (data.updatedMemory) currentMemory = data.updatedMemory; removeMessage(loadingId); updateRelationshipStatus(); const messages = data.displayReply.split('<NEXT_MESSAGE>').filter(m => m.trim().length > 0); for (let i = 0; i < messages.length; i++) { const msg = messages[i].trim(); addMessage(DOMElements.chatBox, currentCharacter, msg, (i === 0) ? data.audio : null, false, null, (i === messages.length - 1) ? data.mediaUrl : null, (i === messages.length - 1) ? data.mediaType : null); if (i < messages.length - 1) await new Promise(resolve => setTimeout(resolve, 800 + msg.length * 30)); } } catch (error) { console.error("Lỗi gửi tin nhắn:", error); if (loadingId) removeMessage(loadingId); addMessage(DOMElements.chatBox, currentCharacter, "Xin lỗi, có lỗi kết nối mất rồi!"); } finally { setProcessing(false); } }
function setProcessing(state) { isProcessing = state; [DOMElements.userInput, DOMElements.sendBtn, DOMElements.micBtnText].forEach(el => { if (el) el.disabled = state; }); }
function updateRelationshipStatus() { const stage = currentMemory?.user_profile?.relationship_stage || 'stranger'; const statusEl = document.getElementById('relationshipStatus'); if (!statusEl) return; const stages = { 'stranger': '💔 Người Lạ', 'friend': '🧡 Bạn Bè', 'lover': '💖 Người Yêu' }; 
    statusEl.textContent = stages[stage] || '💔 Người Lạ';
    // Đảm bảo trạng thái Premium luôn được hiển thị đúng
    if (currentUser && currentUser.isPremium) {
         statusEl.textContent = "💖 Người Yêu (Premium)";
    }
}
function openMemoriesModal() { const memoriesGrid = document.getElementById('memoriesGrid'); if (!memoriesGrid) return; memoriesGrid.innerHTML = ''; const mediaElements = Array.from(document.querySelectorAll('.chat-image, .chat-video')); if (mediaElements.length === 0) { memoriesGrid.innerHTML = '<p class="no-memories">Chưa có kỷ niệm nào được chia sẻ...</p>'; } else { mediaElements.forEach(el => { const memoryItem = document.createElement('div'); memoryItem.className = 'memory-item'; const mediaClone = el.cloneNode(true); mediaClone.style.marginTop = '0'; if (el.tagName === 'IMG') { mediaClone.onclick = () => { document.getElementById('lightboxImage').src = el.src; document.body.classList.add('lightbox-active'); }; } else if (el.tagName === 'VIDEO') { memoryItem.classList.add('video'); mediaClone.muted = true; mediaClone.onclick = () => { if (mediaClone.requestFullscreen) mediaClone.requestFullscreen(); }; } memoryItem.appendChild(mediaClone); memoriesGrid.appendChild(memoryItem); }); } document.body.classList.add('memories-active'); }
function addMessage(chatBox, sender, text, audioBase64 = null, isLoading = false, imageBase64 = null, mediaUrl = null, mediaType = null) { 
    const id = `msg-${Date.now()}-${Math.random()}`; 
    const msgClass = sender === "Bạn" ? "user" : "mera"; 
    const loadingClass = isLoading ? "loading" : ""; 
    
    // Xử lý thông báo Premium đặc biệt (ĐẢM BẢO HIỂN THỊ SAU LẦN CHAT ĐẦU TIÊN NẾU CHƯA PREMIUM)
    // Kích hoạt nếu: (AI trả về chuỗi đặc biệt) HOẶC (Chưa premium VÀ không phải là tin nhắn loading VÀ chưa hiển thị trước đó)
    if (text.includes('[PREMIUM_PROMPT]') || (!currentUser?.isPremium && sender !== "Bạn" && !isLoading && !hasDisplayedPremiumPrompt && conversationHistory.length > 0)) { 
        
        if (currentUser && currentUser.isPremium) return; // Không hiển thị nếu đã Premium
        if (hasDisplayedPremiumPrompt && !text.includes('[PREMIUM_PROMPT]')) return; // Chỉ cho phép hiển thị lại nếu AI yêu cầu bằng chuỗi đặc biệt

        const charName = currentCharacter === 'mera' ? 'Mera' : 'Trương Thắng'; 
        const promptHtml = `<div id="${id}" class="message mera premium-prompt-message"><p>Nâng cấp lên Premium chỉ với <strong>48.000đ/tháng</strong> để <strong>mở khóa giai đoạn Người Yêu</strong>! Khám phá những tâm sự sâu sắc nhất và truy cập <strong>toàn bộ album ảnh & video riêng tư</strong> của ${charName}.</p><button class="premium-prompt-button" onclick="handlePremiumClick()">Tìm Hiểu Mối Quan Hệ Sâu Sắc Hơn</button></div>`; 
        
        hasDisplayedPremiumPrompt = true; // Đánh dấu đã hiển thị

        if (chatBox) { 
            chatBox.insertAdjacentHTML('beforeend', promptHtml); 
            chatBox.scrollTop = chatBox.scrollHeight; 
        } 
        return id; 
    } 
    
    const audioBtn = (audioBase64 && !isLoading) ? `<button class="replay-btn" onclick='new Audio(\`${audioBase64}\').play()'>🔊</button>` : ''; 
    let mediaHtml = ''; 
    if (mediaUrl && mediaType) { 
        switch (mediaType) { 
            case 'image': mediaHtml = `<img src="${mediaUrl}" alt="Kỷ niệm" class="chat-image"/>`; break; 
            case 'video': mediaHtml = `<video controls playsinline muted class="chat-video" src="${mediaUrl}"></video>`; break; 
        } 
    } 
    const html = `<div id="${id}" class="message ${msgClass} ${loadingClass}"><p>${text.replace(/\n/g, "<br>")}</p>${mediaHtml}${audioBtn}</div>`; 
    if (chatBox) { 
        chatBox.insertAdjacentHTML('beforeend', html); 
        chatBox.scrollTop = chatBox.scrollHeight; 
    } 
    if (audioBase64 && !isLoading && !document.hidden) { new Audio(audioBase64).play(); } 
    return id; 
}
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }