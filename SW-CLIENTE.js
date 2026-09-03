const BASE = new URL('./', self.registration.scope).href;
function normalizarUrl(valor) {
  try {
    const u = new URL(valor || BASE, self.location.origin);
    const p = u.pathname;
    const aliases = {
      '/itens/': 'itens.html', '/itens': 'itens.html',
      '/pix/': 'pix.html', '/pix': 'pix.html',
      '/jogos/': 'jogos.html', '/jogos': 'jogos.html',
      '/cardapio/': 'cardápio.html', '/cardapio': 'cardápio.html',
      '/cardápio/': 'cardápio.html', '/cardápio': 'cardápio.html'
    };
    let path = p;
    if (path.startsWith('/-/')) path = path.slice(3);
    const clean = path.replace(/^\/+/, '');
    const dest = aliases[p] || aliases['/'+clean] || aliases['/'+clean.replace(/\/$/,'')];
    if (dest) { const out = new URL(dest, BASE); out.search = u.search; out.hash = u.hash; return out.href; }
    if (u.hostname === 'orei-coxinha.vercel.app') return new URL('cardápio.html'+u.search+u.hash, BASE).href;
    if (u.hostname === 'jefferson8564.github.io') {
      if (u.pathname.includes('/itens')) return new URL('itens.html'+u.search+u.hash, BASE).href;
      if (u.pathname.includes('/Jogos-')) return new URL('jogos.html'+u.search+u.hash, BASE).href;
      if (u.pathname.includes('/orei-coxinha')) return new URL('cardápio.html'+u.search+u.hash, BASE).href;
      if (u.pathname.includes('/dino-i.a')) return new URL('pix.html'+u.search+u.hash, BASE).href;
    }
    return u.href;
  } catch (_) { return BASE; }
}
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let titulo='O Rei da Coxinha',mensagem='Você tem uma nova notificação.',url=BASE;
  if(event.data){try{const p=event.data.json();titulo=p.titulo||titulo;mensagem=p.mensagem||mensagem;url=normalizarUrl(p.url)}catch(_){} }
  event.waitUntil(self.registration.showNotification(titulo,{body:mensagem,icon:new URL('./icone.png',BASE).href,badge:new URL('./icone.png',BASE).href,data:{url}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const alvo=normalizarUrl(event.notification.data?.url||BASE);event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if(c.url===alvo&&'focus'in c)return c.focus()}if(self.clients.openWindow)return self.clients.openWindow(alvo)}));});
