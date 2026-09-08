// SW-CLIENTE.js
// Service Worker de notificações Web Push — O Rei da Coxinha
// Proteção contra notificações duplicadas no mesmo dispositivo/origem.
// Cache Network First para fotos do GitHub e assets estáticos.

// ─── Configuração de cache ────────────────────────────────────────────────────

const CACHE_FOTOS   = 'rei-fotos-v2';      // imagens do GitHub (network first)
const CACHE_ASSETS  = 'rei-assets-v2';     // shell estático (cache first)

// Domínios cujas imagens usam Network First
const FOTO_ORIGINS = [
  'raw.githubusercontent.com',
  'githubusercontent.com',
  'github.com',
];

// Assets do próprio site que vale cachear (cache first, raramente mudam)
// ⚠️ cardapio.html removido do precache — sempre busca da rede para pegar atualizações
const ASSETS_PRECACHE = [
  '/icone.png',
  '/manifest.json',
];

const DB_NAME = 'rei-coxinha-push';
const DB_VERSION = 1;
const STORE_NAME = 'notificacoes';
const MAX_IDS = 100;

// ─── Install: pré-cacheia shell estático ─────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then((cache) =>
      cache.addAll(ASSETS_PRECACHE).catch(() => {/* falha silenciosa se offline */})
    ).finally(() => self.skipWaiting())
  );
});

// ─── Activate: limpa caches antigos ──────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const validos = [CACHE_FOTOS, CACHE_ASSETS];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !validos.includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: Network First para fotos, Cache First para assets ────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só intercepta GET
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // ── Fotos do GitHub → Network First ──────────────────────────────────────
  const ehFotoGitHub = FOTO_ORIGINS.some((o) => url.hostname.endsWith(o));

  if (ehFotoGitHub) {
    event.respondWith(networkFirstFoto(request));
    return;
  }

  // ── Assets do próprio domínio → Cache First ───────────────────────────────
  const ehAssetLocal =
    url.origin === self.location.origin &&
    (request.destination === 'image' ||
     ASSETS_PRECACHE.includes(url.pathname));

  if (ehAssetLocal) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  // Tudo mais: deixa o navegador resolver normalmente
});

/**
 * Network First com fallback para cache.
 * Sempre atualiza o cache quando a rede responde com sucesso.
 */
async function networkFirstFoto(request) {
  const cache = await caches.open(CACHE_FOTOS);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      cache.put(request, response.clone()); // atualiza em background
    }
    return response;
  } catch {
    // Sem internet → usa o que estiver no cache
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

/**
 * Cache First com atualização em background (stale-while-revalidate).
 * Serve instantaneamente do cache e já busca versão nova para a próxima vez.
 */
async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_ASSETS);
  const cached = await cache.match(request);

  // Atualiza em background independente de ter cache ou não
  const fetchPromise = fetch(request.clone())
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || Response.error();
}

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
    let url = 'https://rei-coxinha.github.io/-/cardapio.html';
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

  const alvoUrl = event.notification.data?.url || 'https://rei-coxinha.github.io/-/cardapio.html';

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
