// SW-CLIENTE.js
// Service Worker de notificações Web Push — O Rei da Coxinha (PWA unificado)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Converte endereços antigos/relativos para arquivos reais do PWA novo.
// Isso mantém compatibilidade com notificações que ainda possam chegar
// com o endereço antigo gravado no payload.
function normalizarUrlNotificacao(valor) {
  const scope = self.registration.scope;
  if (!valor) return scope;

  try {
    const u = new URL(valor, scope);
    const host = u.hostname;
    const path = u.pathname;

    if (host === 'jefferson8564.github.io') {
      if (path.includes('/itens')) return new URL('itens.html' + u.search + u.hash, scope).href;
      if (path.includes('/Jogos-')) return new URL('jogos.html' + u.search + u.hash, scope).href;
      if (path.includes('/orei-coxinha')) return new URL('cardápio.html' + u.search + u.hash, scope).href;
      if (path.includes('/dino-i.a')) return new URL('pix.html' + u.search + u.hash, scope).href;
    }

    if (host === 'orei-coxinha.vercel.app') {
      return new URL('cardápio.html' + u.search + u.hash, scope).href;
    }

    // Rotas novas: /-/itens, /-/pix e /-/jogos.
    if (path === '/-/itens' || path === '/-/itens/') return new URL('itens.html' + u.search + u.hash, scope).href;
    if (path === '/-/pix' || path === '/-/pix/') return new URL('pix.html' + u.search + u.hash, scope).href;
    if (path === '/-/jogos' || path === '/-/jogos/') return new URL('jogos.html' + u.search + u.hash, scope).href;

    // Caminhos relativos/absolutos do próprio PWA.
    if (u.origin === new URL(scope).origin) {
      if (path === '/' || path === '/-/') return scope;
      if (path.endsWith('/itens')) return new URL('itens.html' + u.search + u.hash, scope).href;
      if (path.endsWith('/pix')) return new URL('pix.html' + u.search + u.hash, scope).href;
      if (path.endsWith('/jogos')) return new URL('jogos.html' + u.search + u.hash, scope).href;
    }

    return u.href;
  } catch (err) {
    return scope;
  }
}

// ─── Recebe o push ───────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let titulo = 'O Rei da Coxinha';
  let mensagem = 'Você tem uma nova notificação.';
  let url = self.registration.scope;

  if (event.data) {
    try {
      const payload = event.data.json();
      titulo = payload.titulo || titulo;
      mensagem = payload.mensagem || mensagem;
      url = normalizarUrlNotificacao(payload.url || url);
    } catch (err) {
      // Payload não é JSON válido — mantém os valores padrão.
    }
  }

  const options = {
    body: mensagem,
    icon: new URL('./icone.png', self.registration.scope).href,
    badge: new URL('./icone.png', self.registration.scope).href,
    data: { url },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(titulo, options));
});

// ─── Trata o clique na notificação ───────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const alvoUrl = normalizarUrlNotificacao(event.notification.data?.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === alvoUrl || client.url.startsWith(alvoUrl + '#')) {
            if ('focus' in client) return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(alvoUrl);
      })
  );
});
