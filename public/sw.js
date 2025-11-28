// Service Worker cho Push Notifications
const CACHE_NAME = 'yorluv-chat-v1';
const APP_URL = '/';

// Install event - cache app files
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker installing...');
    self.skipWaiting(); // Activate ngay lập tức
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim(); // Take control of all pages immediately
        })
    );
});

// Push event - nhận push notification từ server
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received:', event);
    
    let notificationData = {
        title: 'Yorluv Chat',
        body: 'Bạn có tin nhắn mới từ Mera',
        icon: '/mera_avatar.png',
        badge: '/yorluv-logo.png',
        tag: 'auto-message',
        requireInteraction: false,
        data: {
            url: APP_URL
        }
    };
    
    // Parse notification data nếu có
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                tag: data.tag || notificationData.tag,
                requireInteraction: data.requireInteraction || false,
                data: {
                    url: data.url || APP_URL,
                    character: data.character || 'mera',
                    messageId: data.messageId || null
                }
            };
        } catch (e) {
            // Nếu không parse được JSON, dùng text
            notificationData.body = event.data.text() || notificationData.body;
        }
    }
    
    // Tạo notification với style giống Messenger
    const notificationOptions = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        tag: notificationData.tag || 'yorluv-chat',
        requireInteraction: notificationData.requireInteraction || false,
        data: notificationData.data,
        vibrate: [200, 100, 200], // Rung khi có notification
        silent: notificationData.silent || false,
        // Thêm image cho Android (Messaging style)
        image: notificationData.image || notificationData.icon,
        // Actions (nếu browser hỗ trợ)
        actions: [
            {
                action: 'open',
                title: 'Mở chat',
                icon: '/icons/icon-send.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationOptions)
    );
});

// Notification click event - mở app khi click vào notification
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || APP_URL;
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Tìm xem có tab nào đang mở app không
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    // Nếu có tab đang mở, focus vào tab đó
                    return client.focus();
                }
            }
            // Nếu không có tab nào mở, mở tab mới
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Background sync - để sync data khi có internet
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    // Logic để sync messages khi có internet
    console.log('[SW] Syncing messages...');
}

