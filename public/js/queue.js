// ============================================================
// QUEUE SERVICE & DJ MODERATION UI (KARAOKE JL MUSIC)
// ============================================================

class QueueService {
  constructor() {
    this.queue = [];
    this.currentPlaying = null;
    this.nextSinger = null;
    this.activeTab = 'aprobadas'; // 'aprobadas' o 'moderacion'
    
    // Usuario autenticado por rol (Super Admin / DJ)
    this.currentUser = null;
    try {
      const stored = localStorage.getItem('karaoke_auth_user');
      if (stored) this.currentUser = JSON.parse(stored);
    } catch (e) {
      this.currentUser = null;
    }
    this.isDJUnlocked = !!this.currentUser;
    
    this.init();
  }

  init() {
    // Escuchar cambios de Supabase Realtime o local
    if (window.SupabaseService) {
      window.SupabaseService.onQueueChange(() => {
        this.fetchQueue();
      });
    }

    this.fetchQueue();
    this.updateDJUI();
  }

  async fetchQueue() {
    try {
      this.queue = await window.SupabaseService.getQueue();
      this.processQueueData();
      this.renderQueueUI();
      this.updateStats();
    } catch (e) {
      console.warn('Error fetching queue:', e);
    }
  }

  processQueueData() {
    // Buscar la canción que está sonando actualmente
    this.currentPlaying = this.queue.find(item => item.estado === 'sonando') || null;
    
    // Lista de aprobados y pendientes ordenada
    const pendientes = this.queue.filter(item => item.estado === 'pendiente');
    this.nextSinger = pendientes.length > 0 ? pendientes[0] : null;

    // Actualizar escenario
    if (window.StageService) {
      window.StageService.updateStageInfo(this.currentPlaying, this.nextSinger);
    }
  }

  updateStats() {
    const pendingCount = this.queue.filter(i => i.estado === 'pendiente').length;
    const requestedCount = this.queue.filter(i => i.estado === 'solicitado').length;
    
    const countBadge = document.getElementById('nav-queue-count');
    if (countBadge) countBadge.innerText = pendingCount;

    const statWaiting = document.getElementById('stat-waiting-singers');
    if (statWaiting) statWaiting.innerText = pendingCount;

    const statCurrent = document.getElementById('stat-current-singer');
    if (statCurrent) {
      statCurrent.innerText = this.currentPlaying ? this.currentPlaying.nombre_usuario : 'Libre';
    }

    const statNext = document.getElementById('stat-next-singer');
    if (statNext) {
      statNext.innerText = this.nextSinger ? this.nextSinger.nombre_usuario : 'Nadie en cola';
    }

    // Actualizar badge de moderación en el panel DJ
    const pendingBadge = document.getElementById('dj-moderation-badge');
    if (pendingBadge) {
      pendingBadge.innerText = requestedCount;
      pendingBadge.style.display = requestedCount > 0 ? 'inline-block' : 'none';
    }

    // Sidebar highlight en vista de cola
    const cshName = document.getElementById('csh-current-name');
    const cshSong = document.getElementById('csh-current-song');
    if (cshName && cshSong) {
      if (this.currentPlaying) {
        cshName.innerText = this.currentPlaying.nombre_usuario;
        const s = this.currentPlaying.cancion;
        cshSong.innerText = s ? `🎵 ${s.titulo} - ${s.artista}` : 'Canción en curso';
      } else {
        cshName.innerText = 'Escenario Disponible';
        cshSong.innerText = '¡Pide tu canción para subir!';
      }
    }
  }

  setTab(tabName) {
    this.activeTab = tabName;
    const tabAprobadas = document.getElementById('tab-btn-aprobadas');
    const tabModeracion = document.getElementById('tab-btn-moderacion');
    if (tabAprobadas && tabModeracion) {
      if (tabName === 'aprobadas') {
        tabAprobadas.classList.add('active');
        tabModeracion.classList.remove('active');
      } else {
        tabAprobadas.classList.remove('active');
        tabModeracion.classList.add('active');
      }
    }
    this.renderQueueUI();
  }

  renderQueueUI() {
    const listContainer = document.getElementById('queue-items-container');
    if (!listContainer) return;

    const sonandoItems = this.queue.filter(q => q.estado === 'sonando');
    const pendienteItems = this.queue.filter(q => q.estado === 'pendiente');
    const solicitadoItems = this.queue.filter(q => q.estado === 'solicitado');
    const completadoItems = this.queue.filter(q => q.estado === 'completado').slice(-5);

    if (this.activeTab === 'moderacion') {
      // Pestaña de Moderación (Solicitudes por aprobar)
      if (solicitadoItems.length === 0) {
        listContainer.innerHTML = `
          <div class="empty-queue-box">
            <div class="empty-queue-icon">✨</div>
            <h3 style="color:#fff; font-size:1.2rem; margin-bottom:0.5rem;">No hay solicitudes pendientes de moderación</h3>
            <p style="color:var(--text-muted); font-size:0.9rem;">Todas las canciones entrantes han sido revisadas o están aprobadas.</p>
          </div>
        `;
        return;
      }

      let html = `
        <div style="font-size:0.85rem; color:var(--neon-gold); margin-bottom:0.75rem; font-weight:700;">
          🛡️ Solicitudes entrantes por revisar (Filtro Anti-Bromas y Duplicados):
        </div>
      `;
      html += solicitadoItems.map((item, idx) => this.buildModerationItemHTML(item, idx + 1)).join('');
      listContainer.innerHTML = html;
      return;
    }

    // Pestaña Regular: Cola Aprobada
    if (sonandoItems.length === 0 && pendienteItems.length === 0 && completadoItems.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-queue-box">
          <div class="empty-queue-icon">🎤</div>
          <h3 style="color:#fff; font-size:1.3rem; margin-bottom:0.5rem;">La cola de canciones está vacía</h3>
          <p style="margin-bottom:1.5rem;">Sé el primero en pedir un tema para comenzar la fiesta.</p>
          <button class="btn-neon-primary" onclick="window.App.switchView('catalog')">
            Explorar Catálogo 🎵
          </button>
        </div>
      `;
      return;
    }

    let html = '';

    // Renderizar canción sonando
    if (sonandoItems.length > 0) {
      html += sonandoItems.map(item => this.buildItemHTML(item, 'sonando', 1)).join('');
    }

    // Renderizar pendientes
    if (pendienteItems.length > 0) {
      html += pendienteItems.map((item, idx) => this.buildItemHTML(item, 'pendiente', idx + 1, idx, pendienteItems.length)).join('');
    }

    // Renderizar completados
    if (completadoItems.length > 0) {
      html += `
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed var(--border-glass);">
          <div style="font-size:0.8rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.75rem;">
            ✅ Canciones Cantadas Recientemente
          </div>
        </div>
      `;
      html += completadoItems.map(item => this.buildItemHTML(item, 'completado', null)).join('');
    }

    listContainer.innerHTML = html;
  }

  buildItemHTML(item, tipo, pos, indexInPending = null, totalPending = 0) {
    const song = item.cancion || (window.CatalogService ? window.CatalogService.getSongById(item.cancion_id) : null) || {
      numero: item.cancion_id,
      titulo: 'Canción #' + item.cancion_id,
      artista: 'Artista'
    };

    const isPlaying = tipo === 'sonando';
    const isCompleted = tipo === 'completado';
    let posLabel = isPlaying ? '🎤' : (isCompleted ? '✓' : `#${pos}`);

    // Comprobar si es duplicada
    const duplicateBadge = item.es_duplicada ? `
      <span class="duplicate-warning-badge" title="Esta canción ya se encuentra pedida recientemente">
        ⚠️ Repetida
      </span>
    ` : '';

    // Acciones de Reordenar (Solo visibles para DJ en pendientes)
    let reorderHTML = '';
    if (this.isDJUnlocked && tipo === 'pendiente') {
      reorderHTML = `
        <div style="display:flex; flex-direction:column; gap:2px; margin-right:4px;">
          <button class="queue-reorder-btn" title="Subir Turno" ${indexInPending === 0 ? 'disabled style="opacity:0.3;"' : ''} onclick="window.QueueService.moveItem('${item.id}', -1)">▲</button>
          <button class="queue-reorder-btn" title="Bajar Turno" ${indexInPending === totalPending - 1 ? 'disabled style="opacity:0.3;"' : ''} onclick="window.QueueService.moveItem('${item.id}', 1)">▼</button>
        </div>
      `;
    }

    // Acciones DJ vs Usuario
    let actionsHTML = '';
    if (this.isDJUnlocked) {
      actionsHTML = `
        ${!isPlaying && !isCompleted ? `
          <button class="btn-queue-action play" title="Poner en Escenario Ahora" onclick="window.QueueService.startPlaying('${item.id}')">
            ▶ Sonar
          </button>
        ` : ''}

        ${isPlaying ? `
          <button class="btn-queue-action done" title="Marcar como Completada" onclick="window.QueueService.markAsDone('${item.id}')">
            ✓ Terminar
          </button>
        ` : ''}

        <button class="btn-queue-action delete" title="Eliminar de la lista (DJ)" onclick="window.QueueService.removeItem('${item.id}')">
          ✕
        </button>
      `;
    } else {
      // Modo visitante / público general: Solo ver orden
      actionsHTML = `
        <div style="font-size:0.75rem; color:var(--text-dim); padding:0 0.5rem;">
          ${isPlaying ? 'En vivo' : 'En espera'}
        </div>
      `;
    }

    return `
      <div class="queue-item ${isPlaying ? 'sonando' : ''}" style="${isCompleted ? 'opacity:0.55;' : ''}" data-id="${item.id}">
        <div class="queue-item-left">
          ${reorderHTML}
          <div class="queue-pos-badge">${posLabel}</div>
          <div class="queue-item-meta">
            <div class="queue-singer-name">
              ${item.nombre_usuario}
              ${isPlaying ? '<span class="crown-icon">👑</span>' : ''}
              ${duplicateBadge}
            </div>
            <div class="queue-song-info">
              🎵 ${song.titulo}
            </div>
            <div class="queue-song-artist">
              #${song.numero || song.id} • ${song.artista}
            </div>
          </div>
        </div>

        <div class="queue-item-actions">
          ${actionsHTML}
        </div>
      </div>
    `;
  }

  buildModerationItemHTML(item, pos) {
    const song = item.cancion || (window.CatalogService ? window.CatalogService.getSongById(item.cancion_id) : null) || {
      numero: item.cancion_id,
      titulo: 'Canción #' + item.cancion_id,
      artista: 'Artista'
    };

    return `
      <div class="queue-item" data-id="${item.id}" style="border-left: 3px solid var(--neon-gold);">
        <div class="queue-item-left">
          <div class="queue-pos-badge" style="background:rgba(255,209,102,0.2); color:var(--neon-gold);">#${pos}</div>
          <div class="queue-item-meta">
            <div class="queue-singer-name">
              👤 ${item.nombre_usuario}
              ${item.es_duplicada ? '<span class="duplicate-warning-badge">⚠️ Repetida</span>' : ''}
            </div>
            <div class="queue-song-info">
              🎵 ${song.titulo}
            </div>
            <div class="queue-song-artist">
              #${song.numero || song.id} • ${song.artista}
            </div>
          </div>
        </div>

        <div class="queue-item-actions">
          <button class="btn-queue-action play" title="Aprobar para el Escenario" onclick="window.QueueService.approveItem('${item.id}')">
            ✓ Aprobar
          </button>
          <button class="btn-queue-action delete" title="Rechazar Pedido" onclick="window.QueueService.rejectItem('${item.id}')">
            ✕ Rechazar
          </button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // GESTIÓN DE SEGURIDAD Y ROLES (SUPER ADMIN & DJ)
  // ============================================================
  setAuthUser(user) {
    this.currentUser = user;
    this.isDJUnlocked = !!user;
    if (user) {
      localStorage.setItem('karaoke_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('karaoke_auth_user');
    }
    this.updateDJUI();
    this.renderQueueUI();
  }

  logout() {
    this.setAuthUser(null);
    window.App?.showToast('Sesión cerrada 🔒', 'info');
  }

  updateDJUI() {
    const pill = document.getElementById('dj-auth-status-pill');
    const text = document.getElementById('dj-auth-status-text');
    const djControls = document.getElementById('dj-remote-toolbar');
    const btnManageDJs = document.getElementById('btn-admin-manage-djs');
    
    if (pill && text) {
      if (this.currentUser) {
        pill.classList.add('unlocked');
        if (this.currentUser.rol === 'super_admin') {
          text.innerText = `👑 Super Admin`;
        } else {
          text.innerText = `🎧 DJ: ${this.currentUser.nombre.split(' ')[0]}`;
        }
        pill.title = 'Sesión activa. Haz clic para opciones';
      } else {
        pill.classList.remove('unlocked');
        text.innerText = '🔒 Acceso Restringido';
        pill.title = 'Iniciar Sesión (Super Admin & DJ)';
      }
    }

    if (djControls) {
      djControls.style.display = this.isDJUnlocked ? 'flex' : 'none';
    }

    if (btnManageDJs) {
      btnManageDJs.style.display = (this.currentUser && this.currentUser.rol === 'super_admin') ? 'block' : 'none';
    }
  }

  // ============================================================
  // ACCIONES DE MODERACIÓN Y COLA
  // ============================================================
  async approveItem(id) {
    await window.SupabaseService.approveOrder(id);
    window.App.showToast('Solicitud aprobada e ingresada a la cola ✅', 'success');
  }

  async rejectItem(id) {
    await window.SupabaseService.rejectOrder(id);
    window.App.showToast('Solicitud rechazada ✕', 'info');
  }

  async moveItem(id, direction) {
    const pendientes = this.queue.filter(q => q.estado === 'pendiente');
    const idx = pendientes.findIndex(q => q.id === id);
    if (idx < 0) return;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= pendientes.length) return;

    // Intercambiar posiciones
    const temp = pendientes[idx];
    pendientes[idx] = pendientes[targetIdx];
    pendientes[targetIdx] = temp;

    // Crear lista de IDs completa preservando otros estados
    const otherItems = this.queue.filter(q => q.estado !== 'pendiente');
    const allOrderedIds = [
      ...otherItems.filter(q => q.estado === 'sonando').map(q => q.id),
      ...pendientes.map(q => q.id),
      ...otherItems.filter(q => q.estado !== 'sonando').map(q => q.id)
    ];

    await window.SupabaseService.reorderQueue(allOrderedIds);
  }

  async startPlaying(id) {
    const item = this.queue.find(q => q.id === id);
    if (!item) return;

    // Marcar canción actual como completada
    if (this.currentPlaying && this.currentPlaying.id !== id) {
      await window.SupabaseService.updateOrderStatus(this.currentPlaying.id, 'completado');
    }

    // Actualizar estado a sonando
    await window.SupabaseService.updateOrderStatus(id, 'sonando');
    
    // Cargar en el escenario
    const song = item.cancion || (window.CatalogService ? window.CatalogService.getSongById(item.cancion_id) : null);
    if (window.StageService && song) {
      window.StageService.loadSongIntoStage(song, item.nombre_usuario);
      window.App.switchView('stage');
    }
  }

  async markAsDone(id) {
    await window.SupabaseService.updateOrderStatus(id, 'completado');
    window.App.showToast('Canción finalizada 👏', 'success');
  }

  async removeItem(id) {
    await window.SupabaseService.deleteOrder(id);
    window.App.showToast('Pedido eliminado de la cola', 'info');
  }
}

window.QueueService = new QueueService();
