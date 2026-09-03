// SW-CLIENTE.js
// Service Worker de notificações Web Push — O Rei da Coxinha (cliente)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Recebe o push ───────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let titulo = 'O Rei da Coxinha';
  let mensagem = 'Você tem uma nova notificação.';
  let url = '/';

  if (event.data) {
    try {
      const payload = event.data.json();
      titulo   = payload.titulo   || titulo;
      mensagem = payload.mensagem || mensagem;
      url      = payload.url      || url;
    } catch (err) {
      // payload não é JSON válido — usa os valores padrão
    }
  }

  const options = {
    body: mensagem,
    icon: '/icons/icon-192.png',   // ajuste o caminho se necessário
    badge: '/icons/badge-72.png',  // ajuste o caminho se necessário
    data: { url },
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(titulo, options)
  );
});

// ─── Trata o clique na notificação ───────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const alvoUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se já há uma aba aberta, foca nela
        for (const client of clientList) {
          if (client.url.includes(alvoUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        // Senão, abre uma nova aba
        if (self.clients.openWindow) {
          return self.clients.openWindow(alvoUrl);
        }
      })
  );
});
