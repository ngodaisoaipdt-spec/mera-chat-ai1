let conversationHistory = [];
let recognition = null;
let isProcessing = false;
let currentCharacter = 'mera';
let currentMemory = {};
let currentUser = null;
let paymentCheckInterval = null;

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
    premiumBtn: document.getElementById('premiumBtn')
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('login_error')) {
        alert("Đăng nhập thất bại.");
        window.history.replaceState({}, document.title, "/");
    }
    if (urlParams.has('login')) {
        window.history.replaceState({}, document.title, "/");
    }
    if (urlParams.has('payment')) {
        const paymentStatus = urlParams.get('payment');
        if (paymentStatus === 'success') {
            alert("Thanh toán thành công! Chào mừng bạn đến với Premium.");
            const userResponse = await fetch('/api/current_user');
            if (userResponse.ok) currentUser = await userResponse.json();
            if (window.chatAppInitialized) await loadChatData();
        } else if (paymentStatus === 'failed') {
            alert("Thanh toán thất bại. Vui lòng thử lại.");
        } else if (paymentStatus === 'invalid') {
            alert("Thanh toán không hợp lệ. Vui lòng liên hệ hỗ trợ.");
        } else if (paymentStatus === 'error') {
            alert("Có lỗi xảy ra trong quá trình thanh toán. Vui lòng thử lại.");
        }
        window.history.replaceState({}, document.title, "/");
    }

    try {
        const response = await fetch('/api/current_user');
        if (response.ok) {
            currentUser = await response.json();
            if (currentUser) {
                showCharacterSelection();
            } else {
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
                if (msg.role === 'user') addMessage(DOMElements.chatBox, "Bạn", msg.content);
                if (msg.role === 'assistant') addMessage(DOMElements.chatBox, currentCharacter, msg.content);
            });
        }
        updateRelationshipStatus();
        updateUIForPremium();
        DOMElements.chatBox.scrollTop = DOMElements.chatBox.scrollHeight;
    } catch (error) {
        console.error("Lỗi tải lịch sử chat:", error);
    }
}

let selectedPaymentMethod = 'qr';

function handlePremiumClick() {
    if (currentUser && currentUser.isPremium) return;
    document.getElementById('paymentScreen').classList.add('active');
    selectedPaymentMethod = 'qr';
    updatePaymentMethodUI();
    initiatePayment();
}

function updatePaymentMethodUI() {
    const qrBtn = document.getElementById('qrPaymentBtn');
    const vnpayBtn = document.getElementById('vnpayPaymentBtn');
    const qrArea = document.getElementById('qrCodeArea');
    const vnpayArea = document.getElementById('vnpayArea');
    const instructions = document.getElementById('paymentInstructions');
    
    if (selectedPaymentMethod === 'qr') {
        qrBtn.classList.add('active');
        vnpayBtn.classList.remove('active');
        qrArea.style.display = 'flex';
        vnpayArea.style.display = 'none';
        instructions.textContent = 'Dùng App Ngân hàng hoặc Ví điện tử để quét mã QR';
    } else {
        qrBtn.classList.remove('active');
        vnpayBtn.classList.add('active');
        qrArea.style.display = 'none';
        vnpayArea.style.display = 'flex';
        instructions.textContent = 'Bạn sẽ được chuyển hướng đến cổng thanh toán VNPay';
    }
}

async function initiatePayment() {
    const qrCodeImage = document.getElementById('qrCodeImage');
    const qrLoadingText = document.querySelector('.qr-loading');
    const paymentError = document.getElementById('paymentError');
    const vnpayArea = document.getElementById('vnpayArea');
    const vnpayLoading = document.querySelector('.vnpay-loading');
    const vnpayRedirectBtn = document.getElementById('vnpayRedirectBtn');
    
    paymentError.textContent = '';
    
    if (selectedPaymentMethod === 'vnpay') {
        vnpayArea.style.display = 'flex';
        vnpayLoading.style.display = 'block';
        vnpayRedirectBtn.style.display = 'none';
        
        try {
            const response = await fetch('/api/create-payment', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentMethod: 'vnpay' })
            });
            const data = await response.json();
            if (data.success && data.paymentUrl) {
                vnpayLoading.textContent = 'Sẵn sàng thanh toán!';
                vnpayRedirectBtn.style.display = 'block';
                vnpayRedirectBtn.onclick = () => {
                    window.location.href = data.paymentUrl;
                };
            } else {
                vnpayLoading.style.display = 'none';
                paymentError.textContent = data.message || "Lỗi khi tạo thanh toán tự động.";
            }
        } catch (error) {
            console.error("Lỗi trong quá trình initiatePayment:", error);
            vnpayLoading.style.display = 'none';
            paymentError.textContent = "Lỗi kết nối đến server.";
        }
        return;
    }
    
    // QR Payment method
    qrCodeImage.style.display = 'none';
    qrLoadingText.style.display = 'block';
    qrLoadingText.textContent = 'Đang lấy thông tin thanh toán...';
    
    try {
        const response = await fetch('/api/create-payment', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethod: 'qr' })
        });
        const data = await response.json();
        if (data.success) {
            qrLoadingText.textContent = 'Đang tạo mã QR...';
            const base = 'https://img.vietqr.io/image';
            const template = 'compact';
            const url = `${base}/${data.acqId}-${data.accountNo}-${template}.png?amount=${encodeURIComponent(data.amount)}&addInfo=${encodeURIComponent(data.orderCode)}&accountName=${encodeURIComponent(data.accountName)}`;
            qrCodeImage.src = url;
            qrCodeImage.style.display = 'block';
            qrLoadingText.style.display = 'none';
            startCheckingPaymentStatus(data.orderCode);
        } else {
            qrLoadingText.style.display = 'none';
            paymentError.textContent = data.message || "Lỗi khi lấy thông tin thanh toán.";
        }
    } catch (error) {
        console.error("Lỗi trong quá trình initiatePayment:", error);
        qrLoadingText.style.display = 'none';
        paymentError.textContent = "Lỗi kết nối đến server.";
    }
}

function startCheckingPaymentStatus(orderCode) {
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
    paymentCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/payment-status/${orderCode}`);
            const data = await response.json();
            if (data.status === 'success') {
                clearInterval(paymentCheckInterval);
                document.getElementById('paymentScreen').classList.remove('active');
                alert("Thanh toán thành công! Chào mừng bạn đến với Premium.");
                const userResponse = await fetch('/api/current_user');
                if (userResponse.ok) currentUser = await userResponse.json();
                await loadChatData();
            }
        } catch (error) { console.error("Lỗi kiểm tra trạng thái thanh toán:", error); }
    }, 3000);
}

function updateUIForPremium() {
    const premiumBtn = document.getElementById('premiumBtn');
    if (currentUser && currentUser.isPremium) {
        const statusBar = document.getElementById('relationshipStatus');
        if (statusBar) {
            statusBar.style.background = 'linear-gradient(45deg, var(--primary-color), var(--secondary-color))';
            statusBar.style.color = 'white';
            statusBar.title = "Bạn đã là Premium!";
            statusBar.textContent = "💖 Người Yêu";
        }
        if (premiumBtn) { premiumBtn.classList.add('is-premium'); premiumBtn.title = "Bạn đã là thành viên Premium!"; }
        document.querySelectorAll('.premium-prompt-message').forEach(el => el.remove());
    } else {
        if (premiumBtn) { premiumBtn.classList.remove('is-premium'); premiumBtn.title = "Nâng cấp Premium"; }
    }
}

function initializeChatApp() {
    DOMElements.sendBtn.addEventListener("click", sendMessageFromInput);
    DOMElements.userInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessageFromInput(); });
    const premiumBtn = document.getElementById('premiumBtn');
    if (premiumBtn) { premiumBtn.addEventListener('click', handlePremiumClick); }
    document.getElementById('characterAvatarContainer').addEventListener('click', () => { const avatarImage = document.querySelector('.character-avatar'); if (avatarImage) { document.getElementById('lightboxImage').src = avatarImage.src; document.body.classList.add('lightbox-active'); } });
    document.getElementById('relationshipStatus').addEventListener('click', () => { const descriptions = `CÁC GIAI ĐOẠN MỐI QUAN HỆ:\n\n` + `💔 Người Lạ: Giai đoạn làm quen ban đầu.\n\n` + `🧡 Bạn Bè: Giai đoạn cởi mở, chia sẻ hơn.\n\n` + `💖 Người Yêu (Premium): Mở khóa trò chuyện sâu sắc, lãng mạn, 18+ và media riêng tư!`; alert(descriptions); });
    document.getElementById('memoriesBtn').addEventListener('click', openMemoriesModal);
    if (SpeechRecognition) { recognition = new SpeechRecognition(); recognition.lang = 'vi-VN'; recognition.onresult = e => { DOMElements.userInput.value = e.results[0][0].transcript.trim(); sendMessageFromInput(); }; recognition.onerror = e => console.error("Lỗi recognition:", e.error); DOMElements.micBtnText.addEventListener('click', () => { if (!isProcessing) try { recognition.start(); } catch (e) {} }); }
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
    
    const qrPaymentBtn = document.getElementById('qrPaymentBtn');
    const vnpayPaymentBtn = document.getElementById('vnpayPaymentBtn');
    if (qrPaymentBtn) {
        qrPaymentBtn.addEventListener('click', () => {
            selectedPaymentMethod = 'qr';
            updatePaymentMethodUI();
            initiatePayment();
        });
    }
    if (vnpayPaymentBtn) {
        vnpayPaymentBtn.addEventListener('click', () => {
            selectedPaymentMethod = 'vnpay';
            updatePaymentMethodUI();
            initiatePayment();
        });
    }
}

function sendMessageFromInput() { const message = DOMElements.userInput.value.trim(); if (!message || isProcessing) return; addMessage(DOMElements.chatBox, "Bạn", message); DOMElements.userInput.value = ""; const loadingId = addMessage(DOMElements.chatBox, currentCharacter, "💭 Đang suy nghĩ...", null, true); sendMessageToServer(message, loadingId); }
async function sendMessageToServer(messageText, loadingId) { setProcessing(true); try { const response = await fetch("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: messageText, character: currentCharacter }) }); if (!response.ok) throw new Error(`Server trả về lỗi ${response.status}`); const data = await response.json(); if (data.updatedMemory) currentMemory = data.updatedMemory; removeMessage(loadingId); updateRelationshipStatus(); const messages = data.displayReply.split('<NEXT_MESSAGE>').filter(m => m.trim().length > 0); for (let i = 0; i < messages.length; i++) { const msg = messages[i].trim(); addMessage(DOMElements.chatBox, currentCharacter, msg, (i === 0) ? data.audio : null, false, null, (i === messages.length - 1) ? data.mediaUrl : null, (i === messages.length - 1) ? data.mediaType : null); if (i < messages.length - 1) await new Promise(resolve => setTimeout(resolve, 800 + msg.length * 30)); } } catch (error) { console.error("Lỗi gửi tin nhắn:", error); if (loadingId) removeMessage(loadingId); addMessage(DOMElements.chatBox, currentCharacter, "Xin lỗi, có lỗi kết nối mất rồi!"); } finally { setProcessing(false); } }
function setProcessing(state) { isProcessing = state;[DOMElements.userInput, DOMElements.sendBtn, DOMElements.micBtnText].forEach(el => { if (el) el.disabled = state; }); }
function updateRelationshipStatus() { const stage = currentMemory?.user_profile?.relationship_stage || 'stranger'; const statusEl = document.getElementById('relationshipStatus'); if (!statusEl) return; const stages = { 'stranger': '💔 Người Lạ', 'friend': '🧡 Bạn Bè', 'lover': '💖 Người Yêu' }; statusEl.textContent = (currentUser && currentUser.isPremium) ? "💖 Người Yêu" : (stages[stage] || '💔 Người Lạ'); }
function openMemoriesModal() { const memoriesGrid = document.getElementById('memoriesGrid'); if (!memoriesGrid) return; memoriesGrid.innerHTML = ''; const mediaElements = Array.from(document.querySelectorAll('.chat-image, .chat-video')); if (mediaElements.length === 0) { memoriesGrid.innerHTML = '<p class="no-memories">Chưa có kỷ niệm nào.</p>'; } else { mediaElements.forEach(el => { const memoryItem = document.createElement('div'); memoryItem.className = 'memory-item'; const mediaClone = el.cloneNode(true); memoryItem.appendChild(mediaClone); memoriesGrid.appendChild(memoryItem); }); } document.body.classList.add('memories-active'); }
function addMessage(chatBox, sender, text, audioBase64 = null, isLoading = false, imageBase64 = null, mediaUrl = null, mediaType = null) { const id = `msg-${Date.now()}`; const msgClass = sender === "Bạn" ? "user" : "mera"; const loadingClass = isLoading ? "loading" : ""; if (text.includes('[PREMIUM_PROMPT]')) { if (currentUser && currentUser.isPremium) return; const charName = currentCharacter === 'mera' ? 'Mera' : 'Trương Thắng'; const promptHtml = `<div id="${id}" class="message mera premium-prompt-message"><p>Nâng cấp Premium chỉ với <strong>48.000đ/tháng</strong> để mở khóa giai đoạn <strong>Người Yêu</strong>!...</p><button class="premium-prompt-button" onclick="handlePremiumClick()">Tìm Hiểu Mối Quan Hệ Sâu Sắc Hơn</button></div>`; chatBox.insertAdjacentHTML('beforeend', promptHtml); chatBox.scrollTop = chatBox.scrollHeight; return id; } const audioBtn = (audioBase64 && !isLoading) ? `<button class="replay-btn" onclick='new Audio(\`${audioBase64}\`).play()'>🔊</button>` : ''; let mediaHtml = ''; if (mediaUrl && mediaType === 'image') { mediaHtml = `<img src="${mediaUrl}" alt="Kỷ niệm" class="chat-image"/>`; } const html = `<div id="${id}" class="message ${msgClass} ${loadingClass}"><p>${text.replace(/\n/g, "<br>")}</p>${mediaHtml}${audioBtn}</div>`; chatBox.insertAdjacentHTML('beforeend', html); chatBox.scrollTop = chatBox.scrollHeight; if (audioBase64 && !isLoading && !document.hidden) { new Audio(audioBase64).play(); } return id; }
function removeMessage(id) { const el = document.getElementById(id); if (el) el.remove(); }