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
      if (typeof window.QRCode !== 'undefined') {
        try {
          new window.QRCode(qrContainer, {
            text: mobileUrl,
            width: 180,
            height: 180,
            colorDark: '#07090e',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel.M
          });
        } catch (e) {
          console.warn('Error generando QR local:', e);
          qrContainer.innerHTML = `<div style="padding:1.5rem; text-align:center; color:#00f0ff; font-weight:700; font-size:0.9rem;">Conéctate a:<br><span style="color:#fff; font-size:1.1rem;">${mobileUrl}</span></div>`;
        }
      } else {
        qrContainer.innerHTML = `<div style="padding:1.5rem; text-align:center; color:#00f0ff; font-weight:700; font-size:0.9rem;">Conéctate a:<br><span style="color:#fff; font-size:1.1rem;">${mobileUrl}</span></div>`;
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
  // GESTIÓN DE AUTENTICACIÓN POR ROLES (SUPER ADMIN & DJ)
  // ============================================================
  handleDJPillClick() {
    if (window.QueueService && window.QueueService.currentUser) {
      const user = window.QueueService.currentUser;
      const rolName = user.rol === 'super_admin' ? 'Super Admin' : 'DJ';
      if (confirm(`Sesión activa: ${user.nombre} (${rolName})\n\n¿Deseas cerrar sesión?`)) {
        this.logout();
      }
    } else {
      this.openLoginModal();
    }
  }

  openLoginModal() {
    const cedulaInput = document.getElementById('login-cedula-input');
    const passInput = document.getElementById('login-password-input');
    if (cedulaInput) cedulaInput.value = '';
    if (passInput) passInput.value = '';
    document.getElementById('staff-login-modal-backdrop')?.classList.add('active');
    setTimeout(() => cedulaInput?.focus(), 150);
  }

  closeLoginModal() {
    document.getElementById('staff-login-modal-backdrop')?.classList.remove('active');
  }

  async submitLogin() {
    const cedulaInput = document.getElementById('login-cedula-input');
    const passInput = document.getElementById('login-password-input');

    const cedula = cedulaInput ? cedulaInput.value.trim() : '';
    const password = passInput ? passInput.value.trim() : '';

    if (!cedula || !password) {
      this.showToast('Ingresa tu Cédula y Contraseña', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, password })
      });
      const data = await res.json();

      if (res.ok && data.success && data.user) {
        this.closeLoginModal();
        window.QueueService?.setAuthUser(data.user);
        
        if (data.user.rol === 'super_admin') {
          this.showToast(`¡Bienvenido Super Admin ${data.user.nombre}! 👑 Control Total`, 'success');
        } else {
          this.showToast(`¡Bienvenido DJ ${data.user.nombre}! 🎧 Control de Moderación Activo`, 'success');
        }
      } else {
        this.showToast(data.error || 'Acceso denegado: Credenciales no válidas', 'error');
        if (passInput) {
          passInput.value = '';
          passInput.focus();
        }
      }
    } catch (err) {
      this.showToast('Acceso denegado: Credenciales no válidas', 'error');
    }
  }

  logout() {
    window.QueueService?.logout();
    this.showToast('Has cerrado sesión correctamente 🔒', 'info');
  }

  // ============================================================
  // CAMBIAR CONTRASEÑA DE USUARIO AUTENTICADO
  // ============================================================
  openChangePasswordModal() {
    const cur = document.getElementById('change-current-pass-input');
    const neu = document.getElementById('change-new-pass-input');
    if (cur) cur.value = '';
    if (neu) neu.value = '';
    document.getElementById('change-password-modal-backdrop')?.classList.add('active');
    setTimeout(() => cur?.focus(), 150);
  }

  closeChangePasswordModal() {
    document.getElementById('change-password-modal-backdrop')?.classList.remove('active');
  }

  async submitChangePassword() {
    const curInput = document.getElementById('change-current-pass-input');
    const neuInput = document.getElementById('change-new-pass-input');

    const currentPassword = curInput ? curInput.value.trim() : '';
    const newPassword = neuInput ? neuInput.value.trim() : '';
    const currentUser = window.QueueService?.currentUser;

    if (!currentUser) {
      this.showToast('Debes iniciar sesión primero', 'error');
      return;
    }

    if (!currentPassword || !newPassword) {
      this.showToast('Por favor completa ambos campos', 'error');
      return;
    }

    if (newPassword.length < 4) {
      this.showToast('La nueva contraseña debe tener al menos 4 caracteres', 'error');
      neuInput?.focus();
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cedula: currentUser.cedula,
          currentPassword,
          newPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        this.closeChangePasswordModal();
        this.showToast('¡Contraseña actualizada exitosamente! 🔑', 'success');
      } else {
        this.showToast(data.error || 'Acceso denegado: Credenciales no válidas', 'error');
      }
    } catch (err) {
      this.showToast('Error al conectar con el servidor', 'error');
    }
  }

  // ============================================================
  // PANEL SUPER ADMIN: GESTIÓN DE DJS
  // ============================================================
  async openManageDJsModal() {
    const currentUser = window.QueueService?.currentUser;
    if (!currentUser || currentUser.rol !== 'super_admin') {
      this.showToast('Acceso restringido: Exclusivo para Super Admin 👑', 'error');
      return;
    }

    document.getElementById('manage-djs-modal-backdrop')?.classList.add('active');
    await this.loadDJsList();
  }

  closeManageDJsModal() {
    document.getElementById('manage-djs-modal-backdrop')?.classList.remove('active');
  }

  async loadDJsList() {
    const container = document.getElementById('djs-list-container');
    if (!container) return;

    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:0.5rem;">Cargando lista de DJs...</div>';

    try {
      const res = await fetch('/api/admin/djs');
      const users = await res.json();

      if (!Array.isArray(users) || users.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:0.5rem;">No hay DJs registrados aún.</div>';
        return;
      }

      container.innerHTML = users.map(u => `
        <div style="background:rgba(13,18,29,0.9); border:1px solid ${u.rol === 'super_admin' ? 'var(--neon-gold)' : (u.activo ? 'var(--border-glass)' : 'var(--neon-red)')}; border-radius:var(--radius-sm); padding:0.6rem 0.75rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
          <div>
            <div style="font-size:0.85rem; font-weight:800; color:#fff; display:flex; align-items:center; gap:0.35rem;">
              ${u.rol === 'super_admin' ? '👑' : '🎧'} ${u.nombre}
              ${u.rol === 'super_admin' ? '<span style="font-size:0.65rem; background:rgba(255,209,102,0.2); color:var(--neon-gold); padding:1px 6px; border-radius:var(--radius-full);">SUPER ADMIN</span>' : (u.activo ? '<span style="font-size:0.65rem; background:rgba(6,214,160,0.2); color:var(--neon-green); padding:1px 6px; border-radius:var(--radius-full);">ACTIVO</span>' : '<span style="font-size:0.65rem; background:rgba(239,71,111,0.2); color:var(--neon-red); padding:1px 6px; border-radius:var(--radius-full);">DE BAJA</span>')}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
              Cédula: <strong style="color:var(--neon-cyan);">${u.cedula}</strong>
            </div>
          </div>
          
          ${u.rol !== 'super_admin' ? `
            <div style="display:flex; gap:0.35rem;">
              <button class="btn-glass" style="font-size:0.7rem; padding:0.3rem 0.5rem; ${u.activo ? 'color:var(--neon-gold);' : 'color:var(--neon-green);'}" onclick="window.App.toggleDJStatus('${u.cedula}')">
                ${u.activo ? 'Dar de Baja' : 'Reactivar'}
              </button>
              <button class="btn-glass" style="font-size:0.7rem; padding:0.3rem 0.5rem; color:var(--neon-red);" onclick="window.App.deleteDJ('${u.cedula}')">
                ✕ Eliminar
              </button>
            </div>
          ` : ''}
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<div style="color:var(--neon-red); font-size:0.85rem; padding:0.5rem;">Error al cargar la lista.</div>';
    }
  }

  async submitCreateDJ() {
    const nombreInput = document.getElementById('new-dj-nombre');
    const cedulaInput = document.getElementById('new-dj-cedula');
    const passInput = document.getElementById('new-dj-password');

    const nombre = nombreInput ? nombreInput.value.trim() : '';
    const cedula = cedulaInput ? cedulaInput.value.trim() : '';
    const password = passInput ? passInput.value.trim() : '';

    if (!nombre || !cedula || !password) {
      this.showToast('Nombre, Cédula y Contraseña son obligatorios', 'error');
      return;
    }

    if (password.length < 4) {
      this.showToast('La contraseña debe tener al menos 4 caracteres', 'error');
      passInput?.focus();
      return;
    }

    try {
      const res = await fetch('/api/admin/djs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, cedula, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        this.showToast(`¡DJ ${data.dj.nombre} registrado y autorizado con éxito! 🎧`, 'success');
        if (nombreInput) nombreInput.value = '';
        if (cedulaInput) cedulaInput.value = '';
        if (passInput) passInput.value = '';
        await this.loadDJsList();
      } else {
        this.showToast(data.error || 'Error al registrar el DJ', 'error');
      }
    } catch (err) {
      this.showToast('Error al conectar con el servidor', 'error');
    }
  }

  async toggleDJStatus(cedula) {
    try {
      const res = await fetch(`/api/admin/djs/${encodeURIComponent(cedula)}/toggle`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message, 'info');
        await this.loadDJsList();
      } else {
        this.showToast(data.error || 'Error al actualizar estado', 'error');
      }
    } catch (err) {
      this.showToast('Error de conexión', 'error');
    }
  }

  async deleteDJ(cedula) {
    if (!confirm(`¿Estás seguro de eliminar permanentemente al DJ con cédula ${cedula}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/djs/${encodeURIComponent(cedula)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('DJ eliminado del sistema', 'info');
        await this.loadDJsList();
      } else {
        this.showToast(data.error || 'Error al eliminar', 'error');
      }
    } catch (err) {
      this.showToast('Error de conexión', 'error');
    }
  }

  // ============================================================
  // AGREGAR CANCIÓN AL CATÁLOGO
  // ============================================================
  openAddSongModal() {
    const title = document.getElementById('new-song-title');
    const artist = document.getElementById('new-song-artist');
    const number = document.getElementById('new-song-number');
    const video = document.getElementById('new-song-video');
    
    if (title) title.value = '';
    if (artist) artist.value = '';
    if (number) number.value = '';
    if (video) video.value = '';

    document.getElementById('add-song-modal-backdrop')?.classList.add('active');
    setTimeout(() => title?.focus(), 150);
  }

  closeAddSongModal() {
    document.getElementById('add-song-modal-backdrop')?.classList.remove('active');
  }

  async submitAddSong() {
    const titleInput = document.getElementById('new-song-title');
    const artistInput = document.getElementById('new-song-artist');
    const numberInput = document.getElementById('new-song-number');
    const genreInput = document.getElementById('new-song-genre');
    const videoInput = document.getElementById('new-song-video');

    const titulo = titleInput ? titleInput.value.trim() : '';
    const artista = artistInput ? artistInput.value.trim() : '';
    const numero = numberInput ? numberInput.value.trim() : '';
    const genero = genreInput ? genreInput.value : 'Varios';
    const video_url = videoInput ? videoInput.value.trim() : '';

    if (!titulo || !artista) {
      this.showToast('Título y Artista son obligatorios', 'error');
      titleInput?.focus();
      return;
    }

    try {
      const res = await fetch('/api/canciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero, titulo, artista, genero, video_url })
      });
      const data = await res.json();
      if (data.success) {
        this.closeAddSongModal();
        this.showToast(`¡Canción #${data.song.numero} "${data.song.titulo}" agregada! 🎵`, 'success');
        
        // Recargar catálogo en pantalla
        if (window.CatalogService) {
          await window.CatalogService.loadCatalog();
        }
      } else {
        this.showToast(data.error || 'Error al guardar la canción', 'error');
      }
    } catch (err) {
      this.showToast('Error al conectar con el servidor', 'error');
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

  async copyMobileUrl() {
    const mobileUrl = this.serverInfo?.mobileUrl || window.location.origin;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(mobileUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = mobileUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.showToast('¡Enlace copiado! 📋 Compártelo con los cantantes.', 'success');
    } catch (err) {
      this.showToast(`URL: ${mobileUrl}`, 'info');
    }
  }

  shareViaWhatsApp() {
    const mobileUrl = this.serverInfo?.mobileUrl || window.location.origin;
    const message = `🎤 ¡Pide tus canciones para el Karaoke aquí!: ${mobileUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    this.showToast('Abriendo WhatsApp... 📱', 'info');
  }

  shareViaEmail() {
    const mobileUrl = this.serverInfo?.mobileUrl || window.location.origin;
    const subject = "🎤 ¡Pide tus canciones para el Karaoke en Vivo!";
    const body = `¡Hola!\n\nEntra a este enlace desde tu celular para explorar el catálogo de más de 550 temas y pedir tus canciones en el Karaoke:\n${mobileUrl}\n\n¡Nos vemos en el escenario! 🎶`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    this.showToast('Abriendo cliente de correo... ✉️', 'info');
  }

  async shareViaBluetooth() {
    const mobileUrl = this.serverInfo?.mobileUrl || window.location.origin;
    const shareData = {
      title: 'Karaoke Jl Music',
      text: '🎤 ¡Pide tus canciones para el Karaoke en Vivo!',
      url: mobileUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        this.showToast('¡Compartido vía Bluetooth / Sistema! 📶', 'success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.copyMobileUrl();
        }
      }
    } else {
      this.copyMobileUrl();
      this.showToast('Enlace copiado para compartir por Bluetooth 📶', 'info');
    }
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
