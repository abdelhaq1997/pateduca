(function(){
  if (!('serviceWorker' in navigator)) return;

  let deferredPrompt = null;
  const installBtn = document.createElement('button');
  installBtn.className = 'install-app-btn';
  installBtn.type = 'button';
  installBtn.textContent = 'تثبيت التطبيق';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(installBtn));

  const badge = document.createElement('div');
  badge.className = 'connection-badge';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge));

  function showBadge(text){
    badge.textContent = text;
    badge.classList.add('show');
    clearTimeout(showBadge._t);
    showBadge._t = setTimeout(() => badge.classList.remove('show'), 2400);
  }

  window.addEventListener('online', () => showBadge('تم استرجاع الاتصال'));
  window.addEventListener('offline', () => showBadge('أنت الآن بدون إنترنت'));

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.add('show');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch(e) {}
    deferredPrompt = null;
    installBtn.classList.remove('show');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.classList.remove('show');
    showBadge('تم تثبيت التطبيق');
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.error('SW registration failed:', err);
    });
  });
})();
