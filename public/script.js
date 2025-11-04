// script.js - PHIÊN BẢN CUỐI CÙNG (TẮT TỰ ĐỘNG PHÁT ÂM THANH)

let conversationHistory = [],
    recognition = null, isCallActive = false, isProcessing = false,
    currentCharacter = 'mera', currentAudio = null, currentMemory = {};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function updateRelationshipStatus() { const stage = currentMemory?.user_profile?.relationship_stage || 'stranger'; const statusEl = document.getElementById('relationshipStatus'); if (!statusEl) return; const stages = {'stranger':'💔 Người Lạ','friend':'🧡 Bạn Bè','close_friend':'💛 Bạn Thân','lover':'💖 Người Yêu'}; statusEl.textContent = stages[stage] || '💔 Người Lạ'; }

function openMemoriesModal() {
    const memoriesGrid = document.getElementById('memoriesGrid');
    if (!memoriesGrid) return;
    memoriesGrid.innerHTML = '';
    const mediaElements = Array.from(document.querySelectorAll('.chat-image, .chat-video'));
    const milestones = currentMemory?.user_profile?.milestones || [];
    let allMemories = [];
    mediaElements.forEach(el => { const msgId = el.closest('.message')?.id; const timestamp = msgId ? parseInt(msgId.split('-')[1]) : Date.now() - 10000; allMemories.push({ type: el.tagName, element: el.cloneNode(true), date: new Date(timestamp), url: el.src }); });
    milestones.forEach(ms => { allMemories.push({ type: 'milestone', element: ms, date: new Date(ms.date) }); });
    allMemories.sort((a, b) => b.date - a.date);
    if (allMemories.length === 0) { memoriesGrid.innerHTML = '<p class="no-memories">Chưa có kỷ niệm nào được chia sẻ...</p>'; } else {
         allMemories.forEach(mem => {
            if (mem.type === 'milestone') { const milestoneItem = document.createElement('div'); milestoneItem.className = 'milestone-item'; milestoneItem.innerHTML = `<span class="milestone-icon">💖</span><p>${mem.element.text}</p><span class="milestone-date">${new Date(mem.element.date).toLocaleDateString('vi-VN')}</span>`; memoriesGrid.appendChild(milestoneItem);
            } else { const memoryItem = document.createElement('div'); memoryItem.className = 'memory-item'; const el = mem.element; el.src = mem.url; if (el.tagName === 'IMG') { el.onclick = () => {document.getElementById('lightboxImage').src = el.src; document.body.classList.add('lightbox-active');}; memoryItem.appendChild(el); } else if (el.tagName === 'VIDEO') { memoryItem.classList.add('video'); el.muted = true; el.onclick = () => { if(el.requestFullscreen) el.requestFullscreen(); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); }; memoryItem.appendChild(el); } memoriesGrid.appendChild(memoryItem); }
        });
    }
    document.body.classList.add('memories-active');
}

function loadChatHistory(){
    const chatBox = document.getElementById('chatBox');
    try{ chatBox.innerHTML = localStorage.getItem(`chatHistory_${currentCharacter}`) || ''; conversationHistory = JSON.parse(localStorage.getItem(`conversations_${currentCharacter}`)) || []; currentMemory = JSON.parse(localStorage.getItem(`memory_${currentCharacter}`)) || {}; updateRelationshipStatus();
    } catch(e) { console.error("Lỗi khôi phục lịch sử:", e); localStorage.clear(); conversationHistory = []; currentMemory = {}; }
}

function saveHistory(){ const chatBox = document.getElementById('chatBox'); if (!chatBox) return; localStorage.setItem(`chatHistory_${currentCharacter}`, chatBox.innerHTML); localStorage.setItem(`conversations_${currentCharacter}`, JSON.stringify(conversationHistory)); localStorage.setItem(`memory_${currentCharacter}`, JSON.stringify(currentMemory)); }

function initializeChatApp() {
    const body = document.body, startCallBtn = document.getElementById('startCallBtn'), endCallBtn = document.getElementById('endCallBtn'), micBtnCall = document.getElementById('micBtnCall'), sendBtn = document.getElementById("sendBtn"), userInput = document.getElementById("userInput"), chatBox = document.getElementById("chatBox"), micBtnText = document.getElementById("micBtnText");
    const meraAvatarBtn = document.getElementById('meraAvatarBtn');
    const imageLightbox = document.getElementById('imageLightbox'), lightboxImage = document.getElementById('lightboxImage'), closeLightboxBtn = document.getElementById('closeLightboxBtn');
    const clearBtn = document.getElementById('clearBtn'), memoriesBtn = document.getElementById('memoriesBtn'), closeMemoriesBtn = document.getElementById('closeMemoriesBtn'), memoriesModal = document.getElementById('memoriesModal');
    if (SpeechRecognition) { recognition = new SpeechRecognition(); recognition.lang = 'vi-VN'; recognition.continuous = false; recognition.interimResults = false; recognition.onresult = e => { const transcript = e.results[0][0].transcript.trim(); body.classList.contains("video-call-active") ? sendMessage(transcript, 'call') : (userInput.value = transcript, sendMessageFromInput()); }; recognition.onerror = e => console.error("Lỗi recognition:", e.error); recognition.onstart = () => body.classList.add('is-listening'); recognition.onend = () => body.classList.remove('is-listening'); micBtnCall.addEventListener('click', () => { if (!isProcessing) try { recognition.start(); } catch(e){} }); micBtnText.addEventListener('click', () => { if (!isProcessing) try { recognition.start(); } catch(e){} }); }
    startCallBtn.addEventListener('click', () => { isCallActive = true; document.body.classList.add('video-call-active'); });
    endCallBtn.addEventListener('click', () => { isCallActive = false; document.body.classList.remove('video-call-active'); if (recognition) recognition.stop(); if (currentAudio) currentAudio.pause(); setProcessing(false); });
    sendBtn.addEventListener("click", sendMessageFromInput);
    userInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessageFromInput(); });
    clearBtn.addEventListener("click", () => { const charName = currentCharacter === 'mera' ? 'Mera' : 'Thắng'; if (confirm(`Bạn có chắc muốn xóa toàn bộ lịch sử trò chuyện với ${charName} không?`)) { chatBox.innerHTML = ''; conversationHistory = []; currentMemory = {}; saveHistory(); updateRelationshipStatus(); } });
    meraAvatarBtn.addEventListener('click', () => { const avatarImage = meraAvatarBtn.querySelector('img'); if (avatarImage) { lightboxImage.src = avatarImage.src; body.classList.add('lightbox-active'); } });
    document.body.addEventListener('click', function(e) { if (e.target.matches('.chat-image')) { lightboxImage.src = e.target.src; body.classList.add('lightbox-active'); } });
    const closeLightbox = () => body.classList.remove('lightbox-active');
    closeLightboxBtn.addEventListener('click', closeLightbox);
    imageLightbox.addEventListener('click', e => { if (e.target === imageLightbox) closeLightbox(); });
    memoriesBtn.addEventListener('click', openMemoriesModal);
    closeMemoriesBtn.addEventListener('click', () => document.body.classList.remove('memories-active'));
    memoriesModal.addEventListener('click', e => { if (e.target === memoriesModal) document.body.classList.remove('memories-active'); });
}

function setupCharacter(char) { document.getElementById('characterSelectionScreen').classList.remove('active'); currentCharacter = char; const isMera = char === 'mera'; const avatarSrc = isMera ? 'mera_avatar.png' : 'thang_avatar.png'; const charName = isMera ? 'Mera San' : 'Trương Thắng'; document.querySelectorAll('.avatar, #meraAvatarBtn img').forEach(el => el.src = avatarSrc); document.querySelector('.header-info .name').textContent = charName; loadChatHistory(); initializeChatApp(); }

window.onload = () => { document.getElementById('selectMera').addEventListener('click', () => setupCharacter('mera')); document.getElementById('selectThang').addEventListener('click', () => setupCharacter('thang')); };

function setProcessing(state){isProcessing=state;document.querySelectorAll("#micBtnCall, #sendBtn, #micBtnText, #userInput").forEach(el=>{if(el)el.disabled=state;});}

function sendMessageFromInput(){const userInput=document.getElementById("userInput");const message=userInput.value.trim();if(!message||isProcessing)return;addMessage(document.getElementById("chatBox"),"Bạn",message);userInput.value="";const loadingId=addMessage(document.getElementById("chatBox"),currentCharacter,"💭 Đang suy nghĩ...",null,true);sendMessage(message,'text',loadingId);}

async function sendMessage(messageText,source='text',loadingId=null){
    const chatBox=document.getElementById("chatBox");const message=messageText.trim();if(!message){if(loadingId)removeMessage(loadingId);return;} setProcessing(true);if(source==='call')document.getElementById('callStatus').textContent="💭 Đang xử lý...";
    try{
        const response=await fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,history:[...conversationHistory],character:currentCharacter})});
        if(!response.ok)throw new Error(`Server responded with ${response.status}`);
        const data=await response.json();
        if(data.updatedMemory)currentMemory=data.updatedMemory;
        conversationHistory.push({role:'user',content:message},{role:'assistant',content:data.historyReply});
        if(loadingId)removeMessage(loadingId);
        updateRelationshipStatus();
        
        const messages = data.displayReply.split('<NEXT_MESSAGE>').filter(m => m.trim().length > 0);
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i].trim();
            addMessage(chatBox, currentCharacter, msg, (i === 0) ? data.audio : null, false, null, (i === messages.length - 1) ? data.mediaUrl : null, (i === messages.length - 1) ? data.mediaType : null);
            if (i < messages.length - 1) await new Promise(resolve => setTimeout(resolve, 800 + msg.length * 30));
        }
        
        if (source === 'text') saveHistory();

    } catch(error){console.error("Lỗi gửi tin nhắn:",error);if(loadingId)removeMessage(loadingId);addMessage(document.getElementById("chatBox"),currentCharacter,"Xin lỗi, có lỗi kết nối mất rồi!");}
    finally { if(source!=='call')setProcessing(false); }
}

function addMessage(chatBox,sender,text,audioBase64=null,isLoading=false,imageBase64=null,mediaUrl=null,mediaType=null){
    const id=`msg-${Date.now()}-${Math.random()}`;
    const msgClass=sender==="Bạn"?"user":"mera";
    const loadingClass=isLoading?"loading":"";
    const displayName=currentCharacter==='mera'?'Mera San':'Trương Thắng';
    const audioBtn=(audioBase64&&!isLoading)?`<button class="replay-btn" onclick='new Audio(\`${audioBase64}\`).play()'>🔊</button>`:'';
    let mediaHtml='';
    if(mediaUrl&&mediaType){
        switch(mediaType){
            case'image':mediaHtml=`<img src="${mediaUrl}" alt="Kỷ niệm" class="chat-image"/>`;break;
            case'audio':mediaHtml=`<audio controls class="chat-audio" src="${mediaUrl}"></audio>`;break;
            case'video':mediaHtml=`<video controls playsinline muted class="chat-video" src="${mediaUrl}"></video>`;break;
        }
    }
    let html;
    if(sender==="Bạn"){
        html=`<div id="${id}" class="message ${msgClass}"><p>${text}</p></div>`;
    } else {
        html=`<div id="${id}" class="message ${msgClass} ${loadingClass}"><p>${text.replace(/\n/g,"<br>")}</p>${mediaHtml}${audioBtn}</div>`;
    }
    if(chatBox){
        chatBox.insertAdjacentHTML('beforeend',html);
        chatBox.scrollTop=chatBox.scrollHeight;
    }
    return id;
}

function removeMessage(id){
    const el=document.getElementById(id);
    if(el)el.remove();
}