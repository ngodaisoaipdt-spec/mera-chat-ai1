let conversationHistory = [];
let recognition = null;
let isProcessing = false;
let currentCharacter = 'mera';
let currentMemory = {};
let currentUser = null;
let paymentCheckInterval = null;
let activeAudios = {}; // Lưu trữ audio instances theo message ID

// Helper function để lấy text theo ngôn ngữ dựa trên character
function getText(viText, enText) {
    const isEnglish = currentCharacter === 'kai' || currentCharacter === 'zoe';
    return isEnglish ? enText : viText;
}

// Relationship labels - sẽ được cập nhật động dựa trên character
function getRelationshipLabels() {
    const isEnglish = currentCharacter === 'kai' || currentCharacter === 'zoe';
    return [
        { stage: 'stranger', emoji: '💔', label: isEnglish ? 'Stranger' : 'Người Lạ', minMessages: 0, requiresPremium: false },
        { stage: 'friend', emoji: '🧡', label: isEnglish ? 'Friend' : 'Bạn Thân', minMessages: 30, requiresPremium: false },
        { stage: 'lover', emoji: '💖', label: isEnglish ? 'Lover' : 'Người Yêu', minMessages: 60, requiresPremium: true }
    ];
}

const RELATIONSHIP_RULES_CONFIG = [
    { stage: 'stranger', emoji: '💔', label: 'Người Lạ', minMessages: 0, requiresPremium: false },
    { stage: 'friend', emoji: '🧡', label: 'Bạn Thân', minMessages: 30, requiresPremium: false },
    { stage: 'lover', emoji: '💖', label: 'Người Yêu', minMessages: 60, requiresPremium: true }
];

const ICON_PATHS = {
    speaker: 'icons/icon-speaker.png',
    send: 'icons/icon-send.png',
    mic: 'icons/icon-mic.png',
    memories: 'icons/icon-memories.png',
    premiumActive: 'icons/icon-premium-active.png',
    premiumInactive: 'icons/icon-premium-inactive.png',
    trash: 'icons/icon-trash.png'
};

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

// Set background ngay khi DOM ready (sớm hơn window.onload)
document.addEventListener('DOMContentLoaded', () => {
    // Khôi phục character từ localStorage nếu có
    const savedCharacter = localStorage.getItem('currentCharacter');
    if (savedCharacter && (savedCharacter === 'mera' || savedCharacter === 'thang')) {
        currentCharacter = savedCharacter;
        // Set background ngay khi DOM ready - nhiều lần để chắc chắn
        setTimeout(() => {
            updateChatBackground(currentCharacter);
        }, 10);
        setTimeout(() => {
            updateChatBackground(currentCharacter);
        }, 100);
        setTimeout(() => {
            updateChatBackground(currentCharacter);
        }, 300);
    }
    
    // Sử dụng MutationObserver để theo dõi khi appContainer được hiển thị
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const display = appContainer.style.display;
                    if (display === 'block' && currentCharacter) {
                        // Khi appContainer được hiển thị, set background ngay
                        setTimeout(() => {
                            updateChatBackground(currentCharacter);
                        }, 50);
                    }
                }
            });
        });
        
        observer.observe(appContainer, {
            attributes: true,
            attributeFilter: ['style']
        });
    }
});

window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('login_error')) {
        alert("Đăng nhập thất bại.");
        window.history.replaceState({}, document.title, "/");
    }
    if (urlParams.has('login')) {
        window.history.replaceState({}, document.title, "/");
        // Reload để cập nhật currentUser và load chat data
        const userResponse = await fetch('/api/current_user');
        if (userResponse.ok) {
            currentUser = await userResponse.json();
            // Nếu đang ở chat screen, reload chat data
            if (window.chatAppInitialized && currentCharacter) {
                await loadChatData();
            }
        }
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
            // Khôi phục character từ localStorage nếu có
            const savedCharacter = localStorage.getItem('currentCharacter');
            if (savedCharacter && (savedCharacter === 'mera' || savedCharacter === 'thang')) {
                currentCharacter = savedCharacter;
                // Đảm bảo background được set ngay khi trang load
                setTimeout(() => {
                    updateChatBackground(currentCharacter);
                }, 50);
            }
        }
        // Luôn hiển thị character selection screen (không cần login để xem)
        showCharacterSelection();
    } catch (error) {
        // Ngay cả khi có lỗi, vẫn hiển thị character selection
        showCharacterSelection();
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
    } else {
        // Nếu chưa đăng nhập, ẩn phần user profile
        const userProfileArea = document.querySelector('.user-profile-area');
        if (userProfileArea) {
            userProfileArea.style.display = 'none';
        }
    }
    // Nếu đã có character được chọn trước đó, đảm bảo background được set khi app container hiển thị lại
    const savedCharacter = localStorage.getItem('currentCharacter');
    if (savedCharacter && (savedCharacter === 'mera' || savedCharacter === 'thang')) {
        currentCharacter = savedCharacter;
    }
}

// Function để hiển thị modal yêu cầu đăng nhập
function showLoginRequiredModal() {
    const modal = document.getElementById('loginRequiredModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

// Function để đóng modal yêu cầu đăng nhập
function closeLoginRequiredModal() {
    const modal = document.getElementById('loginRequiredModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

document.getElementById('selectMera').addEventListener('click', () => setupCharacter('mera'));
document.getElementById('selectThang').addEventListener('click', () => setupCharacter('thang'));
document.getElementById('selectZoe').addEventListener('click', () => setupCharacter('zoe'));
document.getElementById('selectKai').addEventListener('click', () => setupCharacter('kai'));

// Hàm để preload ảnh nền
function preloadBackgroundImage(imagePath) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imagePath;
    });
}

// Hàm để thay đổi background image theo nhân vật
async function updateChatBackground(character) {
    if (!character) return;
    
    // Xác định background image theo character
    let backgroundImage;
    if (character === 'mera') {
        backgroundImage = 'nen-mera.jpg';
    } else if (character === 'thang') {
        backgroundImage = 'nen-truongthang.jpg';
    } else if (character === 'zoe') {
        backgroundImage = 'nen-zoe.jpg'; // Sẽ cần thêm file này
    } else if (character === 'kai') {
        backgroundImage = 'nen-kai.jpg'; // Sẽ cần thêm file này
    } else {
        backgroundImage = 'nen-mera.jpg'; // Fallback
    }
    
    const isMera = character === 'mera';
    
    // Sử dụng timestamp để force browser load lại ảnh mỗi lần (tránh cache)
    const timestamp = Date.now();
    const imageUrl = `${backgroundImage}?v=${timestamp}`;
    
    // Force browser to reload background image - set trực tiếp vào element
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) {
        // Nếu chatBox chưa có, đợi một chút rồi thử lại
        setTimeout(() => updateChatBackground(character), 100);
        return;
    }
    
    // Clear background trước để force reload
    chatBox.style.backgroundImage = 'none';
    chatBox.style.backgroundSize = '';
    chatBox.style.backgroundPosition = '';
    chatBox.style.backgroundRepeat = '';
    chatBox.style.backgroundAttachment = '';
    
    // Trigger reflow để clear background
    void chatBox.offsetHeight;
    
    try {
        // Preload ảnh với timestamp mới để đảm bảo nó sẵn sàng
        await preloadBackgroundImage(imageUrl);
    } catch (error) {
        console.warn('Không thể preload ảnh nền:', error);
    }
    
    // Cập nhật CSS variables - QUAN TRỌNG: phải set overlay = 0 để không che background
    document.documentElement.style.setProperty('--chat-background-image', `url('${imageUrl}')`);
    document.documentElement.style.setProperty('--chat-background-size', 'cover');
    document.documentElement.style.setProperty('--chat-background-overlay', 'rgba(255, 255, 255, 0)', 'important');
    
    // Set trực tiếp vào element với URL mới (có timestamp) - dùng !important để override CSS
    chatBox.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
    chatBox.style.setProperty('background-size', 'cover', 'important');
    chatBox.style.setProperty('background-position', 'center', 'important');
    chatBox.style.setProperty('background-repeat', 'no-repeat', 'important');
    // Trên mobile, background-attachment: fixed có thể không hoạt động tốt
    const isMobile = window.innerWidth <= 480;
    chatBox.style.setProperty('background-attachment', isMobile ? 'scroll' : 'fixed', 'important');
    
    // Force clear overlay của ::before bằng cách set trực tiếp
    const chatBoxBefore = window.getComputedStyle(chatBox, '::before');
    // Tạo một style element để override ::before nếu cần
    let styleOverride = document.getElementById('chat-background-override');
    if (!styleOverride) {
        styleOverride = document.createElement('style');
        styleOverride.id = 'chat-background-override';
        document.head.appendChild(styleOverride);
    }
    styleOverride.textContent = `
        #chatBox::before {
            background-color: rgba(255, 255, 255, 0) !important;
        }
    `;
    
    // Force multiple reflows để đảm bảo CSS được apply
    void chatBox.offsetHeight;
    void chatBox.offsetWidth;
    
    // Force repaint bằng cách toggle display
    const originalDisplay = chatBox.style.display;
    chatBox.style.display = 'none';
    void chatBox.offsetHeight;
    chatBox.style.display = originalDisplay || '';
    void chatBox.offsetHeight;
}

async function setupCharacter(char) {
    currentCharacter = char;
    // Lưu character vào localStorage để khôi phục khi reload
    localStorage.setItem('currentCharacter', char);
    
    // Xác định avatar và tên theo character
    let avatarSrc, charName;
    if (char === 'mera') {
        avatarSrc = 'mera_avatar.png';
        charName = 'Mera San';
    } else if (char === 'thang') {
        avatarSrc = 'thang_avatar.png';
        charName = 'Trương Thắng';
    } else if (char === 'zoe') {
        avatarSrc = 'zoe_avatar.png';
        charName = 'Zoe';
    } else if (char === 'kai') {
        avatarSrc = 'kai_avatar.png';
        charName = 'Kai';
    } else {
        // Fallback
        avatarSrc = 'mera_avatar.png';
        charName = 'Mera San';
    }
    
    const isMera = char === 'mera';

    document.querySelectorAll('.character-avatar').forEach(el => el.src = avatarSrc);
    // Cập nhật tên trong header chat (h2.name.character-name)
    const headerName = document.querySelector('.chat-header .character-name');
    if (headerName) {
        headerName.textContent = charName;
    }
    // Cập nhật tên trong selection screen
    document.querySelectorAll('.character-card .character-name').forEach(el => {
        const card = el.closest('.character-card');
        if (card) {
            // Cập nhật tên cho card của character hiện tại
            if ((char === 'mera' && card.id === 'selectMera') ||
                (char === 'thang' && card.id === 'selectThang') ||
                (char === 'zoe' && card.id === 'selectZoe') ||
                (char === 'kai' && card.id === 'selectKai')) {
                el.textContent = charName;
            }
        }
    });
    
    DOMElements.chatBox.innerHTML = '';

    // Cập nhật input placeholder theo ngôn ngữ
    const isEnglish = char === 'kai' || char === 'zoe';
    if (DOMElements.userInput) {
        DOMElements.userInput.placeholder = isEnglish ? 'Type a message...' : 'Nhập tin nhắn...';
    }
    
    // Cập nhật title cho các buttons
    const micBtn = document.getElementById('micBtnText');
    if (micBtn) {
        micBtn.title = isEnglish ? 'Voice message' : 'Nhắn bằng giọng nói';
    }
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.title = isEnglish ? 'Send message' : 'Gửi tin nhắn';
    }
    const memoriesBtn = document.getElementById('memoriesBtn');
    if (memoriesBtn) {
        memoriesBtn.title = isEnglish ? 'Memories' : 'Kỷ niệm';
    }
    const clearChatBtn = document.getElementById('clearChatBtn');
    if (clearChatBtn) {
        clearChatBtn.title = isEnglish ? 'Clear chat' : 'Xóa cuộc trò chuyện';
    }
    const premiumBtn = document.getElementById('premiumBtn');
    if (premiumBtn) {
        premiumBtn.title = isEnglish ? 'Upgrade Premium' : 'Nâng cấp Premium';
    }

    DOMElements.characterSelectionScreen.classList.remove('active');
    DOMElements.appContainer.style.display = 'block';
    
    // Đợi một chút để đảm bảo DOM đã render
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Cập nhật background image theo nhân vật - gọi ngay lập tức
    await updateChatBackground(char);
    
    // Đảm bảo background được set lại sau khi DOM render (nhiều lần để chắc chắn)
    setTimeout(() => {
        updateChatBackground(char);
    }, 100);
    setTimeout(() => {
        updateChatBackground(char);
    }, 200);
    setTimeout(() => {
        updateChatBackground(char);
    }, 400);
    setTimeout(() => {
        updateChatBackground(char);
    }, 800);

    if (!window.chatAppInitialized) {
        initializeChatApp();
        window.chatAppInitialized = true;
    }

    await loadChatData();
}

async function loadChatData() {
    try {
        // Đảm bảo background được cập nhật khi load lại - set ngay lập tức
        if (currentCharacter) {
            await updateChatBackground(currentCharacter);
        }
        
        // Nếu chưa đăng nhập, chỉ hiển thị message chào mừng
        if (!currentUser) {
            conversationHistory = [];
            DOMElements.chatBox.innerHTML = '';
            let greetingMsg = '';
            if (currentCharacter === 'mera') {
                greetingMsg = "Chào anh, em là Mera nè. 🥰 Đăng nhập để bắt đầu trò chuyện với em nhé!";
            } else if (currentCharacter === 'thang') {
                greetingMsg = "Chào em, anh là Trương Thắng. Đăng nhập để bắt đầu trò chuyện với anh nhé!";
            } else if (currentCharacter === 'zoe') {
                greetingMsg = "Hi! I'm Zoe. 🥰 Please log in to start chatting with me!";
            } else if (currentCharacter === 'kai') {
                greetingMsg = "Hey! I'm Kai. Please log in to start chatting with me!";
            } else {
                greetingMsg = "Chào bạn! Đăng nhập để bắt đầu trò chuyện nhé!";
            }
            addMessage(DOMElements.chatBox, currentCharacter, greetingMsg);
            return;
        }
        
        const response = await fetch(`/api/chat-data/${currentCharacter}`);
        if (!response.ok) throw new Error('Không thể tải dữ liệu.');
        const data = await response.json();
        currentMemory = data.memory;
        currentUser.isPremium = data.isPremium;
        
        // Đảm bảo user_profile tồn tại
        if (!currentMemory.user_profile) {
            currentMemory.user_profile = {};
        }
        
        // Log để debug
        console.log(`📊 Load chat data - relationship_stage: ${currentMemory.user_profile.relationship_stage || 'undefined'}, message_count: ${currentMemory.user_profile.message_count || 0}`);
        
        conversationHistory = currentMemory.history || [];
        DOMElements.chatBox.innerHTML = '';
        
        // Đảm bảo background được set lại sau khi DOM đã render (nhiều lần)
        if (currentCharacter) {
            setTimeout(() => updateChatBackground(currentCharacter), 50);
            setTimeout(() => updateChatBackground(currentCharacter), 150);
            setTimeout(() => updateChatBackground(currentCharacter), 300);
            setTimeout(() => updateChatBackground(currentCharacter), 600);
        }
        if (conversationHistory.length === 0) {
            let greetingMsg = '';
            if (currentCharacter === 'mera') {
                greetingMsg = "Chào anh, em là Mera nè. 🥰";
            } else if (currentCharacter === 'thang') {
                greetingMsg = "Chào em, anh là Trương Thắng.";
            } else if (currentCharacter === 'zoe') {
                greetingMsg = "Hi! I'm Zoe. 🥰 Nice to meet you!";
            } else if (currentCharacter === 'kai') {
                greetingMsg = "Hey! I'm Kai. Nice to meet you!";
            } else {
                greetingMsg = "Chào bạn!";
            }
            addMessage(DOMElements.chatBox, currentCharacter, greetingMsg);
        } else {
            conversationHistory.forEach((msg, index) => {
                if (msg.role === 'user') {
                    addMessage(DOMElements.chatBox, "Bạn", msg.content);
                } else if (msg.role === 'assistant') {
                    // Nếu có media trong history, hiển thị kèm theo
                    const mediaUrl = msg.mediaUrl || null;
                    const mediaType = msg.mediaType || null;
                    addMessage(DOMElements.chatBox, currentCharacter, msg.content, null, false, null, mediaUrl, mediaType);
                    
                    // Nếu là auto message, đánh dấu để không check lại
                    if (msg.isAutoMessage) {
                        const msgId = `msg-${index}`;
                        if (!lastMessageId || parseInt(msgId.replace('msg-', '')) > parseInt((lastMessageId || 'msg--1').replace('msg-', ''))) {
                            lastMessageId = msgId;
                        }
                    }
                }
            });
        }
        
        // Cập nhật UI relationship status ngay sau khi load
        console.log(`🔄 Load chat data - Cập nhật UI với relationship_stage: ${currentMemory.user_profile.relationship_stage || 'undefined'}`);
        updateRelationshipStatus();
        updateUIForPremium();
        if (typeof window.renderRelationshipMenu === 'function') window.renderRelationshipMenu();
        DOMElements.chatBox.scrollTop = DOMElements.chatBox.scrollHeight;
    } catch (error) {
        console.error("Lỗi tải lịch sử chat:", error);
    }
}

let selectedPaymentMethod = 'qr';

function handlePremiumClick() {
    if (currentUser && currentUser.isPremium) {
        alert(getText("Bạn đã là thành viên Premium!", "You are already a Premium member!"));
        return;
    }
    
    // Hiển thị modal mô tả Premium features trước
    openPremiumFeaturesModal();
}

function openPremiumFeaturesModal() {
    // Cập nhật text theo ngôn ngữ
    const isEnglish = currentCharacter === 'kai' || currentCharacter === 'zoe';
    const modal = document.getElementById('premiumFeaturesModal');
    if (modal) {
        const title = modal.querySelector('.modal-header h2');
        if (title) {
            title.textContent = isEnglish ? '✨ Premium Package - Eternal Love' : '✨ Gói Premium - Tình Yêu Vĩnh Cửu';
        }
        const packageName = modal.querySelector('.modal-body > div > div:last-child');
        if (packageName) {
            packageName.textContent = isEnglish ? 'Eternal Love Package' : 'Gói Tình Yêu Vĩnh Cửu';
        }
        const featuresTitle = modal.querySelector('.modal-body h3');
        if (featuresTitle) {
            featuresTitle.textContent = isEnglish ? '🎁 Exclusive Features:' : '🎁 Các tính năng độc quyền:';
        }
        const features = modal.querySelectorAll('.modal-body > div > div > div');
        if (features.length >= 4 && isEnglish) {
            features[0].querySelector('strong').textContent = 'Lover Relationship';
            features[0].querySelector('p').textContent = 'Unlock the Lover stage with deeper conversations';
            features[1].querySelector('strong').textContent = 'Private Videos & Images';
            features[1].querySelector('p').textContent = 'Access exclusive video and image gallery for Premium members';
            features[2].querySelector('strong').textContent = 'Unlimited Chat';
            features[2].querySelector('p').textContent = 'Experience all advanced chat features';
            features[3].querySelector('strong').textContent = 'Priority Support';
            features[3].querySelector('p').textContent = 'Receive special care from our support team';
        }
        const ctaText = modal.querySelector('.modal-body > div:last-child p');
        if (ctaText) {
            ctaText.textContent = isEnglish ? 'Ready to start your love journey?' : 'Sẵn sàng bắt đầu hành trình tình yêu?';
        }
        const upgradeBtn = document.getElementById('upgradeNowBtn');
        if (upgradeBtn) {
            upgradeBtn.textContent = isEnglish ? 'Upgrade Now' : 'Nâng cấp ngay';
        }
    }
    document.body.classList.add('premium-features-active');
}

function closePremiumFeaturesModal() {
    document.body.classList.remove('premium-features-active');
}

function proceedToPayment() {
    closePremiumFeaturesModal();
    
    // Reset UI khi mở lại payment screen
    const transferContent = document.getElementById('transferContent');
    const expiryTime = document.getElementById('expiryTime');
    const manualConfirmArea = document.getElementById('manualConfirmArea');
    const manualOrderCodeInput = document.getElementById('manualOrderCodeInput');
    const manualConfirmError = document.getElementById('manualConfirmError');
    const paymentError = document.getElementById('paymentError');
    
    // Không cần ẩn transferContent nữa vì đã xóa
    if (expiryTime) expiryTime.style.display = 'none';
    if (manualConfirmArea) manualConfirmArea.style.display = 'none';
    if (manualOrderCodeInput) manualOrderCodeInput.value = '';
    if (manualConfirmError) {
        manualConfirmError.style.display = 'none';
        manualConfirmError.textContent = '';
    }
    if (paymentError) paymentError.textContent = '';
    
    // Clear intervals nếu có
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
    if (countdownInterval) clearInterval(countdownInterval);
    
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
        if (qrBtn) qrBtn.classList.add('active');
        if (vnpayBtn) vnpayBtn.classList.remove('active');
        if (qrArea) qrArea.style.display = 'flex';
        if (vnpayArea) vnpayArea.style.display = 'none';
        instructions.textContent = 'Dùng App Ngân hàng hoặc Ví điện tử để quét mã QR';
    } else {
        if (qrBtn) qrBtn.classList.remove('active');
        if (vnpayBtn) vnpayBtn.classList.add('active');
        if (qrArea) qrArea.style.display = 'none';
        if (vnpayArea) vnpayArea.style.display = 'flex';
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
            // Thêm tiền tố SEVQR để ngân hàng luôn đính kèm nội dung trong biến động (khuyến nghị từ SePay)
            const memo = `SEVQR ${data.orderCode}`;
            const url = `${base}/${data.acqId}-${data.accountNo}-${template}.png?amount=${encodeURIComponent(data.amount)}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(data.accountName)}`;
            qrCodeImage.src = url;
            qrCodeImage.style.display = 'block';
            qrLoadingText.style.display = 'none';
            
            // Hiển thị nội dung chuyển khoản với SEVQR ở đầu
            const orderCodeDisplay = document.getElementById('orderCodeDisplay');
            const expiryTime = document.getElementById('expiryTime');
            const manualConfirmArea = document.getElementById('manualConfirmArea');
            
            // Hiển thị mã với SEVQR ở đầu cho người dùng copy (luôn hiển thị)
            if (orderCodeDisplay) {
                orderCodeDisplay.textContent = `SEVQR ${data.orderCode}`;
                // Đảm bảo phần này luôn hiển thị (không cần ẩn nữa vì đã tích hợp vào giao diện)
            }
            
            // Hiển thị countdown timer
            if (data.expiresAt && expiryTime) {
                expiryTime.style.display = 'block';
                startCountdownTimer(data.expiresAt);
            }
            
            // Hiển thị form xác nhận thủ công
            if (manualConfirmArea) {
                manualConfirmArea.style.display = 'block';
                // Set orderCode với SEVQR vào input để người dùng dễ copy
                const manualInput = document.getElementById('manualOrderCodeInput');
                if (manualInput) {
                    manualInput.value = `SEVQR ${data.orderCode}`;
                }
            }
            
            startCheckingPaymentStatus(data.orderCode, data.expiresAt);
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

let countdownInterval = null;

function startCountdownTimer(expiresAtISO) {
    if (countdownInterval) clearInterval(countdownInterval);
    const expiresAt = new Date(expiresAtISO);
    
    function updateCountdown() {
        const now = new Date();
        const diff = expiresAt - now;
        
        if (diff <= 0) {
            const countdownTimer = document.getElementById('countdownTimer');
            if (countdownTimer) {
                const isEnglish = currentCharacter === 'kai' || currentCharacter === 'zoe';
                countdownTimer.textContent = isEnglish ? 'Expired' : 'Đã hết hạn';
                countdownTimer.style.color = '#dc3545';
            }
            clearInterval(countdownInterval);
            return;
        }
        
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        const countdownTimer = document.getElementById('countdownTimer');
        if (countdownTimer) {
            countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

function startCheckingPaymentStatus(orderCode, expiresAtISO) {
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
    paymentCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/payment-status/${orderCode}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                clearInterval(paymentCheckInterval);
                if (countdownInterval) clearInterval(countdownInterval);
                document.getElementById('paymentScreen').classList.remove('active');
                alert("Thanh toán thành công! Chào mừng bạn đến với Premium.");
                const userResponse = await fetch('/api/current_user');
                if (userResponse.ok) currentUser = await userResponse.json();
                await loadChatData();
            } else if (data.status === 'expired') {
                clearInterval(paymentCheckInterval);
                if (countdownInterval) clearInterval(countdownInterval);
                const paymentError = document.getElementById('paymentError');
                if (paymentError) {
                    paymentError.textContent = getText('Giao dịch đã hết hạn. Vui lòng tạo giao dịch mới.', 'Transaction has expired. Please create a new transaction.');
                }
            }
        } catch (error) { console.error("Lỗi kiểm tra trạng thái thanh toán:", error); }
    }, 3000);
}

function updateUIForPremium() {
    const premiumBtn = document.getElementById('premiumBtn');
    const premiumIconEl = document.getElementById('premiumIcon');
    if (currentUser && currentUser.isPremium) {
        const statusBar = document.getElementById('relationshipStatus');
        if (statusBar) {
            statusBar.style.background = 'linear-gradient(45deg, var(--primary-color), var(--secondary-color))';
            statusBar.style.color = 'white';
            statusBar.title = getText("Bạn đã là Premium!", "You are Premium!");
            // Không tự động đổi trạng thái; để người dùng phát triển mối quan hệ dần
            updateRelationshipStatus();
        }
        if (premiumBtn) { 
            premiumBtn.classList.add('is-premium'); 
            premiumBtn.title = getText("Bạn đã là thành viên Premium!", "You are a Premium member!"); 
        }
        if (premiumIconEl) premiumIconEl.src = ICON_PATHS.premiumActive;
        document.querySelectorAll('.premium-prompt-message').forEach(el => el.remove());
    } else {
        if (premiumBtn) { premiumBtn.classList.remove('is-premium'); premiumBtn.title = "Nâng cấp Premium"; }
        const statusBar = document.getElementById('relationshipStatus');
        if (statusBar) {
            statusBar.style.background = '';
            statusBar.style.color = '';
            statusBar.title = getText("Nâng cấp Premium để mở khóa cấp độ cao hơn", "Upgrade Premium to unlock higher levels");
            updateRelationshipStatus();
        }
        if (premiumIconEl) premiumIconEl.src = ICON_PATHS.premiumInactive;
    }
    // Sau khi tình trạng Premium thay đổi, render lại menu để cập nhật biểu tượng khóa/mở
    if (typeof window.renderRelationshipMenu === 'function') window.renderRelationshipMenu();
}

function initializeChatApp() {
    DOMElements.sendBtn.addEventListener("click", sendMessageFromInput);
    DOMElements.userInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessageFromInput(); });
    
    // Simple scroll to bottom when input is focused (like Telegram)
    if (DOMElements.userInput) {
        DOMElements.userInput.addEventListener('focus', () => {
            // Scroll chat box to show latest messages when keyboard opens
            setTimeout(() => {
                const chatBox = document.getElementById('chatBox');
                if (chatBox) {
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
            }, 200);
        });
    }
    const premiumBtn = document.getElementById('premiumBtn');
    if (premiumBtn) { premiumBtn.addEventListener('click', handlePremiumClick); }
    document.getElementById('characterAvatarContainer').addEventListener('click', () => { const avatarImage = document.querySelector('.character-avatar'); if (avatarImage) { document.getElementById('lightboxImage').src = avatarImage.src; document.body.classList.add('lightbox-active'); } });
    // Dropdown chọn mối quan hệ
    const relationshipStatus = document.getElementById('relationshipStatus');
    const relationshipMenu = document.getElementById('relationshipMenu');
    const closeRelationshipMenu = () => relationshipMenu.style.display = 'none';

    function renderRelationshipMenu() {
        if (!relationshipMenu) return;
        const isPremium = !!(currentUser && currentUser.isPremium);
        const messageCount = currentMemory?.user_profile?.message_count || 0;
        const currentStage = currentMemory?.user_profile?.relationship_stage || 'stranger';
        const relationshipConfig = getRelationshipLabels(); // Lấy labels theo ngôn ngữ
        relationshipMenu.innerHTML = relationshipConfig.map(rule => {
            const meetsMessages = messageCount >= rule.minMessages;
            const meetsPremium = !rule.requiresPremium || isPremium;
            const unlocked = meetsMessages && meetsPremium;
            const icon = unlocked ? (rule.requiresPremium ? '🔓' : '✅') : '🔒';
            const optionClasses = ['relationship-option'];
            if (!unlocked) optionClasses.push('locked');
            if (currentStage === rule.stage) optionClasses.push('active');
            return `<div class="${optionClasses.join(' ')}" data-stage="${rule.stage}" data-unlocked="${unlocked}" data-requires-premium="${rule.requiresPremium}" data-min-messages="${rule.minMessages}">${icon} ${rule.emoji} ${rule.label}</div>`;
        }).join('');
        bindRelationshipOptionClicks();
    }
    window.renderRelationshipMenu = renderRelationshipMenu;

    function bindRelationshipOptionClicks() {
        relationshipMenu.querySelectorAll('.relationship-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const unlocked = opt.getAttribute('data-unlocked') === 'true';
                const requiresPremium = opt.getAttribute('data-requires-premium') === 'true';
                if (!unlocked) {
                    if (requiresPremium && !(currentUser && currentUser.isPremium)) {
                        alert(getText("Bạn cần nâng cấp Premium để mở khóa giai đoạn này.", "You need to upgrade to Premium to unlock this stage."));
                        handlePremiumClick();
                    } else {
                        alert(getText("Bạn hãy trò chuyện nhiều hơn để thăng cấp mối quan hệ.", "Please chat more to level up your relationship."));
                    }
                    closeRelationshipMenu();
                    return;
                }
                const stage = opt.getAttribute('data-stage');
                try {
                    const res = await fetch('/api/relationship', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ character: currentCharacter, stage })
                    });
                    const data = await res.json();
                    if (!data.success) {
                        alert(data.message || "Bạn hãy trò chuyện nhiều hơn để thăng cấp mối quan hệ.");
                        closeRelationshipMenu();
                        return;
                    }
                    currentMemory.user_profile = currentMemory.user_profile || {};
                    currentMemory.user_profile.relationship_stage = stage;
                    updateRelationshipStatus();
                    renderRelationshipMenu();
                    closeRelationshipMenu();
                } catch (err) { console.error('Lỗi cập nhật relationship:', err); }
            });
        });
    }

    // Khởi tạo menu lần đầu
    renderRelationshipMenu();
    relationshipStatus.addEventListener('click', (e) => {
        e.stopPropagation();
        relationshipMenu.style.display = (relationshipMenu.style.display === 'block') ? 'none' : 'block';
    });
    document.body.addEventListener('click', (e) => {
        if (relationshipMenu.style.display === 'block' && !relationshipMenu.contains(e.target)) closeRelationshipMenu();
    });

    document.getElementById('memoriesBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openMemoriesModal();
    });
    const clearChatBtn = document.getElementById('clearChatBtn');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', async () => {
            const confirmMsg = getText("Bạn chắc chắn muốn xóa toàn bộ cuộc trò chuyện với nhân vật này?", "Are you sure you want to delete all conversations with this character?");
            if (!confirm(confirmMsg)) return;
            try {
                const res = await fetch('/api/clear-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ character: currentCharacter })
                });
                const data = await res.json();
                if (data.success) {
                    // Dừng tất cả audio đang phát
                    Object.keys(activeAudios).forEach(id => {
                        if (activeAudios[id]) {
                            activeAudios[id].pause();
                            activeAudios[id].currentTime = 0;
                        }
                    });
                    activeAudios = {};
                    currentMemory = data.memory;
                    DOMElements.chatBox.innerHTML = '';
                    let greetingMsg = '';
                    if (currentCharacter === 'mera') {
                        greetingMsg = "Chào anh, em là Mera nè. 🥰";
                    } else if (currentCharacter === 'thang') {
                        greetingMsg = "Chào em, anh là Trương Thắng.";
                    } else if (currentCharacter === 'zoe') {
                        greetingMsg = "Hi! I'm Zoe. 🥰 Nice to meet you!";
                    } else if (currentCharacter === 'kai') {
                        greetingMsg = "Hey! I'm Kai. Nice to meet you!";
                    } else {
                        greetingMsg = "Chào bạn!";
                    }
                    addMessage(DOMElements.chatBox, currentCharacter, greetingMsg);
                    updateRelationshipStatus();
                    if (typeof window.renderRelationshipMenu === 'function') window.renderRelationshipMenu();
                } else {
                    alert(data.message || "Xóa cuộc trò chuyện thất bại.");
                }
            } catch (err) {
                console.error("Lỗi xóa chat:", err);
                alert("Có lỗi xảy ra khi xóa cuộc trò chuyện.");
            }
        });
    }
    if (SpeechRecognition) { 
        recognition = new SpeechRecognition(); 
        recognition.lang = 'vi-VN'; 
        recognition.continuous = false;
        recognition.interimResults = false;
        
        // Khi bắt đầu lắng nghe
        recognition.onstart = () => {
            if (DOMElements.micBtnText) {
                DOMElements.micBtnText.classList.add('listening');
            }
        };
        
        // Khi kết thúc lắng nghe
        recognition.onend = () => {
            if (DOMElements.micBtnText) {
                DOMElements.micBtnText.classList.remove('listening');
            }
        };
        
        // Khi có kết quả
        recognition.onresult = e => { 
            DOMElements.userInput.value = e.results[0][0].transcript.trim(); 
            sendMessageFromInput();
            if (DOMElements.micBtnText) {
                DOMElements.micBtnText.classList.remove('listening');
            }
        }; 
        
        // Xử lý lỗi
        recognition.onerror = e => { 
            console.error("Lỗi recognition:", e.error);
            if (DOMElements.micBtnText) {
                DOMElements.micBtnText.classList.remove('listening');
            }
        }; 
        
        // Khi click vào nút mic
        DOMElements.micBtnText.addEventListener('click', () => { 
            if (!isProcessing) {
                try { 
                    recognition.start(); 
                } catch (e) {
                    console.error("Lỗi khởi động recognition:", e);
                }
            }
        }); 
    }
    const imageLightbox = document.getElementById('imageLightbox'), closeLightboxBtn = document.getElementById('closeLightboxBtn');
    document.body.addEventListener('click', (e) => { if (e.target.matches('.chat-image')) { document.getElementById('lightboxImage').src = e.target.src; document.body.classList.add('lightbox-active'); } });
    const closeLightbox = () => document.body.classList.remove('lightbox-active');
    if (closeLightboxBtn) closeLightboxBtn.addEventListener('click', closeLightbox);
    if (imageLightbox) imageLightbox.addEventListener('click', e => { if (e.target === imageLightbox) closeLightbox(); });
    const memoriesModal = document.getElementById('memoriesModal'), closeMemoriesBtn = document.getElementById('closeMemoriesBtn');
    if (closeMemoriesBtn) closeMemoriesBtn.addEventListener('click', () => document.body.classList.remove('memories-active'));
    if (memoriesModal) memoriesModal.addEventListener('click', e => { if (e.target === memoriesModal) document.body.classList.remove('memories-active'); });
    
    // Premium Features Modal
    const premiumFeaturesModal = document.getElementById('premiumFeaturesModal');
    const closePremiumFeaturesBtn = document.getElementById('closePremiumFeaturesBtn');
    const upgradeNowBtn = document.getElementById('upgradeNowBtn');
    
    if (closePremiumFeaturesBtn) {
        closePremiumFeaturesBtn.addEventListener('click', closePremiumFeaturesModal);
    }
    if (premiumFeaturesModal) {
        premiumFeaturesModal.addEventListener('click', e => {
            if (e.target === premiumFeaturesModal) closePremiumFeaturesModal();
        });
    }
    if (upgradeNowBtn) {
        upgradeNowBtn.addEventListener('click', proceedToPayment);
    }
    const closePaymentBtn = document.getElementById('closePaymentBtn');
    closePaymentBtn.addEventListener('click', () => { 
        document.getElementById('paymentScreen').classList.remove('active'); 
        if (paymentCheckInterval) clearInterval(paymentCheckInterval);
        if (countdownInterval) clearInterval(countdownInterval);
    });
    
    // Xử lý xác nhận thanh toán thủ công
    const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
    const manualOrderCodeInput = document.getElementById('manualOrderCodeInput');
    const manualConfirmError = document.getElementById('manualConfirmError');
    
    if (confirmPaymentBtn && manualOrderCodeInput) {
        confirmPaymentBtn.addEventListener('click', async () => {
            const orderCode = manualOrderCodeInput.value.trim();
            if (!orderCode) {
                if (manualConfirmError) {
                    manualConfirmError.textContent = 'Vui lòng nhập nội dung chuyển khoản';
                    manualConfirmError.style.display = 'block';
                }
                return;
            }
            
            // Validate format
            // Hỗ trợ cả format có SEVQR và không có SEVQR
            const cleanOrderCode = orderCode.replace(/^SEVQR\s+/i, '').trim();
            if (!cleanOrderCode.match(/^MERACHAT\d+$/i)) {
                if (manualConfirmError) {
                    manualConfirmError.textContent = 'Nội dung chuyển khoản không hợp lệ. Vui lòng nhập đúng định dạng MERACHAT...';
                    manualConfirmError.style.display = 'block';
                }
                return;
            }
            
            confirmPaymentBtn.disabled = true;
            confirmPaymentBtn.textContent = 'Đang kiểm tra...';
            if (manualConfirmError) manualConfirmError.style.display = 'none';
            
            try {
                // Chỉ kiểm tra trạng thái, KHÔNG tự động xác nhận
                // Gửi cleanOrderCode (không có SEVQR) lên server
                const response = await fetch('/api/check-payment-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderCode: cleanOrderCode })
                });
                
                const data = await response.json();
                
                if (data.success && data.status === 'success') {
                    // Thanh toán đã được webhook xác nhận
                    if (paymentCheckInterval) clearInterval(paymentCheckInterval);
                    if (countdownInterval) clearInterval(countdownInterval);
                    document.getElementById('paymentScreen').classList.remove('active');
                    alert("Thanh toán thành công! Chào mừng bạn đến với Premium.");
                    
                    // Reload user data
                    const userResponse = await fetch('/api/current_user');
                    if (userResponse.ok) currentUser = await userResponse.json();
                    await loadChatData();
                } else {
                    // Chưa được xác nhận - hiển thị thông báo
                    if (manualConfirmError) {
                        manualConfirmError.textContent = data.message || 'Hệ thống đang chờ xác nhận từ ngân hàng. Vui lòng đợi vài phút sau khi chuyển khoản. Hệ thống sẽ tự động cập nhật khi nhận được thông báo.';
                        manualConfirmError.style.display = 'block';
                        manualConfirmError.style.color = '#ff9800'; // Màu cam để cảnh báo
                    }
                    confirmPaymentBtn.disabled = false;
                    confirmPaymentBtn.textContent = 'Kiểm tra lại';
                }
            } catch (error) {
                console.error("Lỗi kiểm tra thanh toán:", error);
                if (manualConfirmError) {
                    manualConfirmError.textContent = 'Lỗi kết nối đến server. Vui lòng thử lại.';
                    manualConfirmError.style.display = 'block';
                }
                confirmPaymentBtn.disabled = false;
                confirmPaymentBtn.textContent = 'Kiểm tra lại';
            }
        });
        
        // Cho phép nhấn Enter để xác nhận
        if (manualOrderCodeInput) {
            manualOrderCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmPaymentBtn.click();
                }
            });
        }
    }
    
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

function sendMessageFromInput() { 
    const message = DOMElements.userInput.value.trim(); 
    if (!message || isProcessing) return; 
    
    // Lưu ID của tin nhắn user để đảm bảo không bị mất
    const userMessageId = addMessage(DOMElements.chatBox, "Bạn", message); 
    console.log(`✅ Đã thêm tin nhắn user với ID: ${userMessageId}`);
    
    DOMElements.userInput.value = ""; 
    
    // Đóng bàn phím trên mobile sau khi gửi tin nhắn
    if (DOMElements.userInput === document.activeElement) {
        DOMElements.userInput.blur();
    }
    
    const loadingId = addMessage(DOMElements.chatBox, currentCharacter, "💭 Đang suy nghĩ...", null, true); 
    sendMessageToServer(message, loadingId); 
}
async function sendMessageToServer(messageText, loadingId) {
    setProcessing(true);
    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText, character: currentCharacter })
        });
        
        // Kiểm tra nếu chưa đăng nhập
        if (response.status === 401) {
            const errorData = await response.json();
            if (errorData.requiresLogin || errorData.error === 'LOGIN_REQUIRED') {
                removeMessage(loadingId);
                // Hiển thị modal yêu cầu đăng nhập
                showLoginRequiredModal();
                return;
            }
        }
        
        if (!response.ok) throw new Error(`Server trả về lỗi ${response.status}`);
        const data = await response.json();
        
        // Kiểm tra nếu user đã hết lượt hoặc cần premium
            if (data.requiresPremium || data.historyReply === "[MESSAGE_LIMIT_REACHED]" || data.historyReply === "[PREMIUM_REQUIRED_FOR_LOVER]") {
            removeMessage(loadingId);
            const limitMessage = getText("Bạn đã hết lượt trò chuyện trong ngày hôm nay, vui lòng nâng cấp Premium để trò chuyện không giới hạn và nhiều tính năng khác.", "You've reached your daily message limit. Please upgrade to Premium for unlimited chats and more features.");
            addMessage(DOMElements.chatBox, currentCharacter, data.displayReply || limitMessage);
            // Mở modal premium sau 1 giây
            setTimeout(() => {
                if (typeof openPremiumFeaturesModal === 'function') {
                    openPremiumFeaturesModal();
                } else {
                    // Fallback: click premium button
                    const premiumBtn = document.getElementById('premiumBtn');
                    if (premiumBtn) premiumBtn.click();
                }
            }, 1500);
            return;
        }
        
        // Cập nhật relationship_stage từ response
        if (!currentMemory) currentMemory = { user_profile: {} };
        if (!currentMemory.user_profile) currentMemory.user_profile = {};
        
        const oldStage = currentMemory.user_profile.relationship_stage || 'stranger';
        const oldMessageCount = currentMemory.user_profile.message_count || 0;
        
        // Cập nhật message_count nếu có
        if (data.message_count !== undefined) {
            currentMemory.user_profile.message_count = data.message_count;
            console.log(`📊 Message count: ${oldMessageCount} → ${data.message_count}`);
        }
        
        // Cập nhật daily_message_count nếu có
        if (data.daily_message_count !== undefined) {
            currentMemory.user_profile.daily_message_count = data.daily_message_count;
            console.log(`📊 Daily message count: ${data.daily_message_count}/10`);
        }
        
        // Cập nhật relationship_stage nếu có - LUÔN cập nhật để đảm bảo sync
        if (data.relationship_stage) {
            const newStage = data.relationship_stage;
            currentMemory.user_profile.relationship_stage = newStage;
            
            if (oldStage !== newStage) {
                console.log(`🔄 Relationship stage thay đổi: ${oldStage} → ${newStage}`);
            } else {
                console.log(`ℹ️ Relationship stage không thay đổi: ${oldStage}`);
            }
            
            // LUÔN cập nhật UI để đảm bảo sync với backend
            console.log(`🔄 Cập nhật UI với relationship_stage: ${newStage}`);
            updateRelationshipStatus();
            if (typeof window.renderRelationshipMenu === 'function') {
                window.renderRelationshipMenu();
            }
        } else {
            console.warn(`⚠️ Không nhận được relationship_stage trong response!`, data);
        }
        
        removeMessage(loadingId);
        const messages = data.displayReply.split('<NEXT_MESSAGE>').filter(m => m.trim().length > 0);
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i].trim();
            addMessage(DOMElements.chatBox, currentCharacter, msg, (i === 0) ? data.audio : null, false, null, (i === messages.length - 1) ? data.mediaUrl : null, (i === messages.length - 1) ? data.mediaType : null);
            if (i < messages.length - 1) await new Promise(resolve => setTimeout(resolve, 800 + msg.length * 30));
        }
    } catch (error) {
        console.error("Lỗi gửi tin nhắn:", error);
        if (loadingId) removeMessage(loadingId);
        addMessage(DOMElements.chatBox, currentCharacter, "Xin lỗi, có lỗi kết nối mất rồi!");
    } finally {
        setProcessing(false);
    }
}
function setProcessing(state) { isProcessing = state;[DOMElements.userInput, DOMElements.sendBtn, DOMElements.micBtnText].forEach(el => { if (el) el.disabled = state; }); }
function updateRelationshipStatus() {
    if (!currentMemory || !currentMemory.user_profile) {
        console.warn('⚠️ updateRelationshipStatus: currentMemory hoặc user_profile không tồn tại');
        return;
    }
    
    const stage = currentMemory.user_profile.relationship_stage || 'stranger';
    const statusEl = document.getElementById('relationshipStatus');
    
    if (!statusEl) {
        console.error('❌ updateRelationshipStatus: Không tìm thấy element relationshipStatus');
        return;
    }
    
    const relationshipConfig = getRelationshipLabels(); // Lấy labels theo ngôn ngữ
    const rule = relationshipConfig.find(r => r.stage === stage);
    if (!rule) {
        console.error(`❌ updateRelationshipStatus: Không tìm thấy rule cho stage: ${stage}`);
        return;
    }
    
    const newText = `${rule.emoji} ${rule.label}`;
    const oldText = statusEl.textContent.trim();
    
    statusEl.textContent = newText;
    statusEl.dataset.stage = stage;
    
    if (oldText !== newText) {
        console.log(`✅ Đã cập nhật relationship status: "${oldText}" → "${newText}" (stage: ${stage})`);
    } else {
        console.log(`ℹ️ Relationship status đã đúng: "${newText}" (stage: ${stage})`);
    }
}
function openMemoriesModal() { 
    const memoriesGrid = document.getElementById('memoriesGrid'); 
    if (!memoriesGrid) return; 
    memoriesGrid.innerHTML = ''; 
    const mediaElements = Array.from(document.querySelectorAll('.chat-image, .chat-video')); 
    const isEnglish = currentCharacter === 'kai' || currentCharacter === 'zoe';
    if (mediaElements.length === 0) { 
        memoriesGrid.innerHTML = `<p class="no-memories">${isEnglish ? 'No memories yet.' : 'Chưa có kỷ niệm nào.'}</p>`; 
    } else { 
        mediaElements.forEach(el => { 
            const memoryItem = document.createElement('div'); 
            memoryItem.className = 'memory-item'; 
            const mediaClone = el.cloneNode(true); 
            memoryItem.appendChild(mediaClone); 
            memoriesGrid.appendChild(memoryItem); 
        }); 
    } 
    // Cập nhật title của modal
    const modalTitle = document.querySelector('#memoriesModal .modal-header h2');
    if (modalTitle) {
        modalTitle.textContent = isEnglish ? 'Our Memories' : 'Kỷ niệm của chúng ta';
    }
    document.body.classList.add('memories-active'); 
}

async function toggleAudio(messageId) {
    const btn = document.querySelector(`#${messageId} .replay-btn`);
    if (!btn) return;
    
    // Nếu đang có audio đang phát cho message này
    if (activeAudios[messageId]) {
        const audio = activeAudios[messageId];
        if (!audio.paused) {
            // Đang phát -> Dừng
            audio.pause();
            audio.currentTime = 0;
            btn.classList.remove('playing');
            btn.title = 'Nghe';
            delete activeAudios[messageId];
        } else {
            // Đã dừng -> Phát lại
            audio.play();
            btn.classList.add('playing');
            btn.title = 'Dừng';
        }
    } else {
        // Chưa có audio -> Tạo TTS on-demand
        const text = btn.dataset.text;
        const character = btn.dataset.character;
        
        if (!text || !character) {
            console.error('Không có text hoặc character để tạo TTS');
            return;
        }
        
        // Disable button và hiển thị loading
        btn.disabled = true;
        btn.title = 'Đang tạo âm thanh...';
        
        try {
            // Gọi API để tạo TTS
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, character })
            });
            
            if (!response.ok) {
                throw new Error(`TTS API trả về lỗi ${response.status}`);
            }
            
            const data = await response.json();
            if (!data.success || !data.audio) {
                throw new Error('Không thể tạo TTS');
            }
            
            // Tạo audio và phát
            const audio = new Audio(data.audio);
            activeAudios[messageId] = audio;
            
            // Xử lý khi audio kết thúc
            audio.onended = () => {
                btn.classList.remove('playing');
                btn.title = 'Nghe';
                btn.disabled = false;
                delete activeAudios[messageId];
            };
            
            // Xử lý lỗi
            audio.onerror = () => {
                btn.classList.remove('playing');
                btn.title = 'Nghe';
                btn.disabled = false;
                delete activeAudios[messageId];
                console.error('Lỗi phát audio');
            };
            
            audio.play();
            btn.classList.add('playing');
            btn.title = 'Dừng';
            btn.disabled = false;
        } catch (error) {
            console.error('Lỗi tạo TTS:', error);
            btn.title = 'Lỗi, thử lại';
            btn.disabled = false;
        }
    }
}

function addMessage(chatBox, sender, text, audioBase64 = null, isLoading = false, imageBase64 = null, mediaUrl = null, mediaType = null) { 
    // Tạo ID unique với timestamp và random để tránh trùng lặp
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; 
    const msgClass = sender === "Bạn" ? "user" : "mera"; 
    const loadingClass = isLoading ? "loading" : ""; 
    
    if (text.includes('[PREMIUM_PROMPT]')) { 
        if (currentUser && currentUser.isPremium) return null; 
        const isEnglish = currentCharacter === 'kai' || currentCharacter === 'zoe';
        const promptText = isEnglish 
            ? `<p>Upgrade to Premium for just <strong>58,000₫/month</strong> to unlock the <strong>Lover</strong> stage!...</p><button class="premium-prompt-button" onclick="handlePremiumClick()">Discover Deeper Relationships</button>`
            : `<p>Nâng cấp Premium chỉ với <strong>58.000đ/tháng</strong> để mở khóa giai đoạn <strong>Người Yêu</strong>!...</p><button class="premium-prompt-button" onclick="handlePremiumClick()">Tìm Hiểu Mối Quan Hệ Sâu Sắc Hơn</button>`;
        const promptHtml = `<div id="${id}" class="message mera premium-prompt-message">${promptText}</div>`; 
        chatBox.insertAdjacentHTML('beforeend', promptHtml); 
        chatBox.scrollTop = chatBox.scrollHeight; 
        return id; 
    } 
    
    // Luôn hiển thị nút speaker cho tin nhắn từ AI (không phải loading) - TTS sẽ được tạo on-demand
    const audioBtn = (sender !== "Bạn" && !isLoading) ? `<button class="replay-btn" title="Nghe" onclick='toggleAudio("${id}")' data-text="${text.replace(/"/g, '&quot;')}" data-character="${currentCharacter}"><img src="${ICON_PATHS.speaker}" alt="Nghe"></button>` : ''; 
    let mediaHtml = ''; 
    if (imageBase64) { 
        mediaHtml = `<img src="${imageBase64}" alt="Ảnh đã gửi" class="chat-image"/>`; 
    } else if (mediaUrl && mediaType === 'image') { 
        mediaHtml = `<img src="${mediaUrl}" alt="Kỷ niệm" class="chat-image"/>`; 
    } else if (mediaUrl && mediaType === 'video') { 
        // Thêm muted={false} và playsinline để đảm bảo âm thanh không bị tắt
        mediaHtml = `<video src="${mediaUrl}" controls class="chat-video" muted="false" playsinline><source src="${mediaUrl}" type="video/mp4">Trình duyệt không hỗ trợ video.</video>`; 
    } 
    
    const html = `<div id="${id}" class="message ${msgClass} ${loadingClass}"><p>${text.replace(/\n/g, "<br>")}</p>${mediaHtml}${audioBtn}</div>`; 
    chatBox.insertAdjacentHTML('beforeend', html); 
    
    // Sau khi thêm video, đảm bảo không bị muted
    if (mediaUrl && mediaType === 'video') {
        const videoElement = document.querySelector(`#${id} video`);
        if (videoElement) {
            videoElement.muted = false;
            videoElement.volume = 1.0;
            console.log(`🔊 Đã đảm bảo video không bị muted: ${mediaUrl}`);
        }
    }
    
    chatBox.scrollTop = chatBox.scrollHeight; 
    
    // Debug log để kiểm tra
    if (sender === "Bạn") {
        console.log(`✅ Đã thêm tin nhắn user vào DOM với ID: ${id}, text: "${text.substring(0, 50)}..."`);
    }
    
    return id; 
}
function removeMessage(id) { 
    // Dừng audio nếu đang phát
    if (activeAudios[id]) {
        activeAudios[id].pause();
        activeAudios[id].currentTime = 0;
        delete activeAudios[id];
    }
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ==================== AUTO MESSAGES POLLING & NOTIFICATION ====================

let autoMessagePollingInterval = null;
let lastMessageId = null;

// Function để play notification sound
function playNotificationSound() {
    try {
        // Tạo audio context để phát âm thanh notification
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Tạo âm thanh ngắn, dễ thương
        oscillator.frequency.value = 800; // Tần số cao, dễ thương
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.warn('Không thể phát notification sound:', error);
    }
}

// Function để hiển thị notification
function showNotification(messageText, characterName) {
    // Kiểm tra xem browser có hỗ trợ Notification API không
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const notification = new Notification(`${characterName} nhắn tin`, {
                body: messageText.substring(0, 100),
                icon: characterName === 'Mera San' ? 'mera_avatar.png' : 'thang_avatar.png',
                badge: 'yorluv-logo.png',
                tag: 'auto-message',
                requireInteraction: false
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            // Tự động đóng sau 5 giây
            setTimeout(() => notification.close(), 5000);
        } catch (error) {
            console.warn('Không thể hiển thị notification:', error);
        }
    }
}

// Function để đăng ký Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker đã được đăng ký:', registration.scope);
            return registration;
        } catch (error) {
            console.warn('⚠️ Không thể đăng ký Service Worker:', error);
            return null;
        }
    } else {
        console.warn('⚠️ Browser không hỗ trợ Service Worker');
        return null;
    }
}

// Function để đăng ký Push Subscription
async function subscribeToPush(registration) {
    if (!registration || !('PushManager' in window)) {
        console.warn('⚠️ Browser không hỗ trợ Push Manager');
        return null;
    }
    
    try {
        // Lấy VAPID public key từ server
        const vapidResponse = await fetch('/api/vapid-public-key');
        if (!vapidResponse.ok) {
            console.warn('⚠️ Không thể lấy VAPID public key');
            return null;
        }
        const { publicKey } = await vapidResponse.json();
        
        // Convert VAPID key từ base64 URL-safe sang Uint8Array
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding)
                .replace(/\-/g, '+')
                .replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        }
        
        // Đăng ký push subscription
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        
        // Gửi subscription lên server
        const subscribeResponse = await fetch('/api/push-subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subscription: subscription.toJSON() })
        });
        
        if (subscribeResponse.ok) {
            console.log('✅ Đã đăng ký push subscription thành công');
            return subscription;
        } else {
            console.warn('⚠️ Không thể lưu push subscription lên server');
            return null;
        }
    } catch (error) {
        console.warn('⚠️ Lỗi đăng ký push subscription:', error);
        return null;
    }
}

// Function để request notification permission và setup push
async function requestNotificationPermission() {
    if ('Notification' in window) {
        try {
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            
            if (permission === 'granted') {
                console.log('✅ Notification permission đã được cấp');
                
                // Đăng ký Service Worker và Push Subscription
                const registration = await registerServiceWorker();
                if (registration) {
                    // Kiểm tra xem đã có subscription chưa
                    const existingSubscription = await registration.pushManager.getSubscription();
                    if (!existingSubscription) {
                        await subscribeToPush(registration);
                    } else {
                        console.log('ℹ️ Đã có push subscription');
                    }
                }
            } else {
                console.warn('⚠️ Notification permission bị từ chối');
            }
        } catch (error) {
            console.warn('Không thể request notification permission:', error);
        }
    }
}

// Function để check tin nhắn mới
async function checkNewAutoMessages() {
    if (!currentUser || !currentCharacter) {
        console.log('⏭️ [POLLING] Skip: chưa có currentUser hoặc currentCharacter');
        return;
    }
    
    try {
        console.log(`🔍 [POLLING] Checking new messages for character: ${currentCharacter}, lastMessageId: ${lastMessageId || 'none'}`);
        const response = await fetch(`/api/check-new-messages?character=${currentCharacter}&lastMessageId=${lastMessageId || ''}`);
        if (!response.ok) {
            console.warn(`⚠️ [POLLING] Response not OK: ${response.status}`);
            return;
        }
        
        const data = await response.json();
        console.log(`📊 [POLLING] Response: hasNewMessages=${data.hasNewMessages}, count=${data.newMessages?.length || 0}`);
        
        if (data.hasNewMessages && data.newMessages && data.newMessages.length > 0) {
            console.log(`✅ [POLLING] Có ${data.newMessages.length} tin nhắn mới!`);
            // Có tin nhắn mới
            for (const newMsg of data.newMessages) {
                // Thêm tin nhắn vào chat box
                const characterName = currentCharacter === 'mera' ? 'Mera San' : 'Trương Thắng';
                addMessage(DOMElements.chatBox, currentCharacter, newMsg.content);
                
                // Play sound
                playNotificationSound();
                
                // Hiển thị notification
                showNotification(newMsg.content, characterName);
                
                // Scroll to bottom
                DOMElements.chatBox.scrollTop = DOMElements.chatBox.scrollHeight;
            }
            
            // Cập nhật lastMessageId từ response
            if (data.lastMessageId) {
                lastMessageId = data.lastMessageId;
            } else if (data.newMessages.length > 0) {
                lastMessageId = data.newMessages[data.newMessages.length - 1].id;
            }
            
            // Reload chat data để sync với server
            await loadChatData();
        } else {
            console.log('ℹ️ [POLLING] Không có tin nhắn mới');
        }
    } catch (error) {
        console.error('❌ [POLLING] Lỗi check new messages:', error);
    }
}

// Function để start polling
function startAutoMessagePolling() {
    // Dừng polling cũ nếu có
    if (autoMessagePollingInterval) {
        clearInterval(autoMessagePollingInterval);
    }
    
    // Request notification permission
    requestNotificationPermission();
    
    // Check ngay lập tức
    checkNewAutoMessages();
    
    // Polling mỗi 10 giây
    autoMessagePollingInterval = setInterval(() => {
        checkNewAutoMessages();
    }, 10000); // 10 giây
    
    console.log('✅ Auto message polling đã được khởi động');
}

// Function để stop polling
function stopAutoMessagePolling() {
    if (autoMessagePollingInterval) {
        clearInterval(autoMessagePollingInterval);
        autoMessagePollingInterval = null;
    }
}

// Khởi động polling khi app được khởi tạo
if (window.chatAppInitialized) {
    startAutoMessagePolling();
}

// Khởi động polling khi load chat data
const originalLoadChatData = loadChatData;
loadChatData = async function() {
    await originalLoadChatData();
    
    // Set lastMessageId từ tin nhắn cuối cùng (bao gồm cả auto messages)
    // Để đảm bảo chỉ check tin nhắn mới sau khi load
    if (conversationHistory && conversationHistory.length > 0) {
        // Set từ tin nhắn cuối cùng (bất kỳ loại nào)
        lastMessageId = `msg-${conversationHistory.length - 1}`;
        console.log(`✅ [POLLING] Set lastMessageId từ loadChatData: ${lastMessageId} (total: ${conversationHistory.length})`);
    }
    
    // Start polling nếu chưa start
    if (!autoMessagePollingInterval) {
        startAutoMessagePolling();
    }
};

// ==================== END AUTO MESSAGES POLLING & NOTIFICATION ====================