// SW-CLIENTE.js
// Service Worker de notificações Web Push — O Rei da Coxinha
// Proteção contra notificações duplicadas no mesmo dispositivo/origem.

const DB_NAME = 'rei-coxinha-push';
const DB_VERSION = 1;
const STORE_NAME = 'notificacoes';
const MAX_IDS = 100;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Banco local: guarda IDs de notificações já exibidas ──────────────────────

function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function jaRecebeu(id) {
  try {
    const db = await abrirDB();

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);

      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return false;
  }
}

async function registrarRecebida(id) {
  try {
    const db = await abrirDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id,
        criadaEm: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    // Limita o histórico local para não crescer indefinidamente.
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const registros = [];
      const req = store.openCursor();

      req.onsuccess = () => {
        const cursor = req.result;

        if (cursor) {
          registros.push({
            key: cursor.primaryKey,
            criadaEm: cursor.value?.criadaEm || 0
          });
          cursor.continue();
        } else {
          registros
            .sort((a, b) => a.criadaEm - b.criadaEm)
            .slice(0, Math.max(0, registros.length - MAX_IDS))
            .forEach((item) => store.delete(item.key));

          resolve();
        }
      };

      req.onerror = () => resolve();
    });
  } catch (err) {
    // Se o IndexedDB falhar, não bloqueia o push.
  }
}

// ─── ID de segurança quando o servidor não envia um ID ───────────────────────

function gerarIdFallback(titulo, mensagem, url) {
  const texto = `${titulo}|${mensagem}|${url}`;
  let hash = 2166136261;

  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return `auto-${(hash >>> 0).toString(16)}`;
}

// ─── Recebe o push ───────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let titulo = 'O Rei da Coxinha';
    let mensagem = 'Você tem uma nova notificação.';
    let url = '/';
    let notificationId = null;

    if (event.data) {
      try {
        const payload = event.data.json();

        titulo = payload.titulo || titulo;
        mensagem = payload.mensagem || mensagem;
        url = payload.url || url;

        // O servidor deve, de preferência, mandar um ID único.
        notificationId =
          payload.id ||
          payload.notificationId ||
          payload.pushId ||
          payload.eventId ||
          null;
      } catch (err) {
        try {
          mensagem = event.data.text() || mensagem;
        } catch (_) {}
      }
    }

    // Mesmo push repetido = mesmo ID = não mostra novamente.
    const id = String(
      notificationId || gerarIdFallback(titulo, mensagem, url)
    );

    if (await jaRecebeu(id)) {
      console.log('[SW-CLIENTE] Push duplicado ignorado:', id);
      return;
    }

    await registrarRecebida(id);

    const options = {
      body: mensagem,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',

      // Se o mesmo ID chegar novamente, o navegador substitui a anterior.
      tag: `rei-coxinha-${id}`,
      renotify: false,

      data: {
        url,
        notificationId: id
      },

      requireInteraction: false
    };

    await self.registration.showNotification(titulo, options);
  })());
});

// ─── Clique na notificação ───────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const alvoUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(alvoUrl) && 'focus' in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(alvoUrl);
        }
      })
  );
});
