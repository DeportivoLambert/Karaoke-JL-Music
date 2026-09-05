// ============================================================
// MAIN APP CONTROLLER & ROUTER (KARAOKE JL MUSIC)
// ============================================================

class AppController {
  constructor() {
    this.currentView = 'home';
    this.serverInfo = { localIp: 'localhost', port: 3000, mobileUrl: '' };
    
    this.init();
  }

  async init() {
    this.setupNavigation();
    this.setupModals();
    this.fetchServerInfo();
    this.loadSavedSettings();
  }

  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn[data-view]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        this.switchView(view);
      });
    });
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Actualizar botones del nav
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Actualizar secciones de vista
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const targetSection = document.getElementById(`${viewName}-section`);
    if (targetSection) {
      targetSection.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Acciones especiales por vista
    if (viewName === 'queue') {
      window.QueueService?.fetchQueue();
    } else if (viewName === 'catalog') {
      const searchInput = document.getElementById('catalog-search-input');
      if (searchInput && !searchInput.value) {
        setTimeout(() => searchInput.focus(), 200);
      }
    }
  }

  async fetchServerInfo() {
    try {
      const res = await fetch('/api/server-info');
      if (res.ok) {
        this.serverInfo = await res.json();
        this.updateMobileQR();
      }
    } catch (e) {
      console.log('Modo standalone o sin servidor Node');
    }
  }

  updateMobileQR() {
    const mobileUrl = this.serverInfo.mobileUrl || window.location.origin;
    const urlDisplay = document.getElementById('mobile-url-display');
    if (urlDisplay) urlDisplay.innerText = mobileUrl;

    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) {
      qrContainer.innerHTML = '';
      if (window.QRCode) {
        new window.QRCode(qrContainer, {
          text: mobileUrl,
          width: 180,
          height: 180,
          colorDark: '#07090e',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } else {
        // Fallback imagen QR vía API pública
        qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}" alt="QR Code" style="width:180px;height:180px;display:block;" />`;
      }
    }
  }

  setupModals() {
    // Cerrar modales con tecla ESC o backdrop
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this.closeAllModals();
        }
      });
    });
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.classList.remove('active'));
  }

  // ============================================================
  // GESTIÓN DE PIN Y MODO DJ
  // ============================================================
  handleDJPillClick() {
    if (window.QueueService && window.QueueService.isDJUnlocked) {
      if (confirm('¿Deseas bloquear el modo DJ y volver a modo visitante?')) {
        window.QueueService.lockDJ();
      }
    } else {
      this.openDJModal();
    }
  }

  openDJModal() {
    const input = document.getElementById('dj-pin-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 150);
    }
    document.getElementById('dj-pin-modal-backdrop')?.classList.add('active');
  }

  closeDJModal() {
    document.getElementById('dj-pin-modal-backdrop')?.classList.remove('active');
  }

  async submitDJPin() {
    const input = document.getElementById('dj-pin-input');
    const pin = input ? input.value.trim() : '';

    if (!pin) {
      this.showToast('Por favor escribe el PIN de DJ', 'error');
      input?.focus();
      return;
    }

    if (window.QueueService) {
      const success = await window.QueueService.verifyDJPin(pin);
      if (success) {
        this.closeDJModal();
        this.showToast('¡Modo DJ Desbloqueado! Tienes control total 🎧', 'success');
      } else {
        this.showToast('PIN de DJ incorrecto. Intenta con 1234', 'error');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    }
  }

  // ============================================================
  // REACCIONES EN VIVO (APLAUSÓMETRO)
  // ============================================================
  sendReaction(emoji) {
    const sender = localStorage.getItem('karaoke_last_singer_name') || 'Público';
    if (window.SupabaseService) {
      window.SupabaseService.sendReaction(emoji, sender);
    }
    this.showToast(`¡Reacción enviada: ${emoji}! 🔥`, 'info');
  }

  // Modales generales
  openQRModal() {
    this.updateMobileQR();
    document.getElementById('qr-modal-backdrop')?.classList.add('active');
  }

  closeQRModal() {
    document.getElementById('qr-modal-backdrop')?.classList.remove('active');
  }

  openSettingsModal() {
    const urlInput = document.getElementById('settings-supabase-url');
    const keyInput = document.getElementById('settings-supabase-key');
    
    if (urlInput) urlInput.value = localStorage.getItem('karaoke_supabase_url') || window.SupabaseService?.supabaseUrl || 'https://hmutnmerrrvbkaqccyfg.supabase.co';
    if (keyInput) keyInput.value = localStorage.getItem('karaoke_supabase_key') || window.SupabaseService?.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdXRubWVycnJ2YmthcWNjeWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODU4MDcsImV4cCI6MjEwNDE2MTgwN30.ofX28HFGnipchRTw7T0kVvx829iiJSvr0h3y8ve2xm8';

    document.getElementById('settings-modal-backdrop')?.classList.add('active');
  }

  closeSettingsModal() {
    document.getElementById('settings-modal-backdrop')?.classList.remove('active');
  }

  loadSavedSettings() {
    const url = localStorage.getItem('karaoke_supabase_url');
    const key = localStorage.getItem('karaoke_supabase_key');
    if (url && key) {
      console.log('Supabase configurado desde almacenamiento local.');
    }
  }

  async saveSupabaseSettings() {
    const urlInput = document.getElementById('settings-supabase-url');
    const keyInput = document.getElementById('settings-supabase-key');

    const url = urlInput ? urlInput.value.trim() : '';
    const key = keyInput ? keyInput.value.trim() : '';

    if (!url || !key) {
      window.SupabaseService.clearConfig();
      this.showToast('Configuración guardada en Modo Local Offline', 'info');
      this.closeSettingsModal();
      return;
    }

    window.SupabaseService.saveConfig(url, key);
    this.showToast('Verificando conexión con Supabase...', 'info');

    const connected = await window.SupabaseService.checkConnection();
    if (connected) {
      this.showToast('¡Conectado exitosamente a Supabase Realtime! 🚀', 'success');
      this.closeSettingsModal();
    } else {
      this.showToast('No se pudo conectar a Supabase. Revisa las credenciales.', 'error');
    }
  }

  async syncCatalogToSupabase() {
    const btn = document.getElementById('btn-sync-catalog');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Sincronizando 557 canciones...';
    }

    try {
      const songs = window.CatalogService.songs;
      await window.SupabaseService.syncCatalogToSupabase(songs);
      this.showToast('¡557 Canciones sincronizadas en Supabase correctamente! ✨', 'success');
    } catch (e) {
      this.showToast('Error al sincronizar: ' + (e.message || 'Verifica la consola'), 'error');
      console.error(e);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Sincronizar Catálogo a Supabase (557 Canciones)';
      }
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 3800);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.App = new AppController();
});
