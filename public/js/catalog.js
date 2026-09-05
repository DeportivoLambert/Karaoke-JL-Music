// ============================================================
// CATALOG SERVICE & UI (KARAOKE JL MUSIC)
// ============================================================

class CatalogService {
  constructor() {
    this.songs = window.KARAOKE_CATALOGO_PREDETERMINADO || [];
    this.filteredSongs = [...this.songs];
    this.selectedGenre = 'Todos';
    this.searchQuery = '';
    this.currentPage = 1;
    this.pageSize = 24;
    this.selectedSongForOrder = null;
    
    this.init();
  }

  async init() {
    // Si Supabase está configurado, intentar traer canciones remotas
    if (window.SupabaseService && window.SupabaseService.isConfigured && window.SupabaseService.client) {
      try {
        const { data, error } = await window.SupabaseService.client
          .from('canciones')
          .select('*')
          .order('numero', { ascending: true });
        
        if (!error && data && data.length > 0) {
          this.songs = data;
          this.filteredSongs = [...this.songs];
        }
      } catch (e) {
        console.log('Usando catálogo local');
      }
    }

    this.renderGenreFilters();
    this.applyFilters();
    this.updateStats();
  }

  getSongById(id) {
    return this.songs.find(s => s.id == id || s.numero == id);
  }

  getAllGenres() {
    const genres = new Set();
    this.songs.forEach(s => {
      if (s.genero) genres.add(s.genero);
    });
    return ['Todos', ...Array.from(genres).sort()];
  }

  renderGenreFilters() {
    const container = document.getElementById('genre-filters-scroll');
    const heroFilterContainer = document.getElementById('hero-genre-filters');
    if (!container) return;

    const genres = this.getAllGenres();
    
    const html = genres.map(g => {
      const count = g === 'Todos' ? this.songs.length : this.songs.filter(s => s.genero === g).length;
      const activeClass = this.selectedGenre === g ? 'active' : '';
      return `<button class="genre-chip ${activeClass}" onclick="window.CatalogService.filterByGenre('${g}')">${g} (${count})</button>`;
    }).join('');

    container.innerHTML = html;
    if (heroFilterContainer) {
      // Show top 6 genres in hero
      const topGenres = genres.slice(0, 7);
      heroFilterContainer.innerHTML = topGenres.map(g => {
        const activeClass = this.selectedGenre === g ? 'active' : '';
        return `<button class="genre-chip ${activeClass}" onclick="window.CatalogService.filterByGenre('${g}'); window.App.switchView('catalog');">${g}</button>`;
      }).join('');
    }
  }

  filterByGenre(genre) {
    this.selectedGenre = genre;
    this.currentPage = 1;
    this.renderGenreFilters();
    this.applyFilters();
  }

  search(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters() {
    this.filteredSongs = this.songs.filter(song => {
      const matchesGenre = this.selectedGenre === 'Todos' || song.genero === this.selectedGenre;
      if (!matchesGenre) return false;

      if (!this.searchQuery) return true;

      const numStr = String(song.numero || song.id);
      const titleStr = (song.titulo || '').toLowerCase();
      const artistStr = (song.artista || '').toLowerCase();
      const genreStr = (song.genero || '').toLowerCase();

      return numStr === this.searchQuery ||
             numStr.includes(this.searchQuery) ||
             titleStr.includes(this.searchQuery) ||
             artistStr.includes(this.searchQuery) ||
             genreStr.includes(this.searchQuery);
    });

    this.renderSongGrid();
    this.renderPagination();
    this.updateCounters();
  }

  updateStats() {
    const totalCountEl = document.getElementById('stat-total-songs');
    if (totalCountEl) {
      totalCountEl.innerText = this.songs.length;
    }
  }

  updateCounters() {
    const countBadge = document.getElementById('catalog-results-count');
    if (countBadge) {
      countBadge.innerText = `${this.filteredSongs.length} canciones encontradas`;
    }
  }

  renderSongGrid() {
    const grid = document.getElementById('song-grid-container');
    if (!grid) return;

    if (this.filteredSongs.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
          <h3 style="font-size: 1.3rem; color: #fff; margin-bottom: 0.5rem;">No se encontraron canciones</h3>
          <p>Prueba buscando con otro término, nombre de artista o selecciona otro género.</p>
        </div>
      `;
      return;
    }

    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const currentSongs = this.filteredSongs.slice(start, end);

    grid.innerHTML = currentSongs.map(song => {
      return `
        <div class="song-card" data-id="${song.id}">
          <div>
            <div class="song-card-header">
              <span class="song-num-badge">
                <span>#</span>${song.numero || song.id}
              </span>
              <span class="song-genre-tag">${song.genero || 'Variado'}</span>
            </div>
            <h3 class="song-title" title="${song.titulo}">${song.titulo}</h3>
            <p class="song-artist" title="${song.artista}">🎤 ${song.artista}</p>
          </div>
          <div class="song-actions">
            <button class="btn-order-song" onclick="window.CatalogService.openOrderModal(${song.numero || song.id})">
              <span>🎤</span> Cantar Esta
            </button>
            <button class="btn-preview-song" title="Reproducir en Escenario" onclick="window.StageService.playDirectSong(${song.numero || song.id})">
              ▶
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderPagination() {
    const paginationWrap = document.getElementById('catalog-pagination');
    if (!paginationWrap) return;

    const totalPages = Math.ceil(this.filteredSongs.length / this.pageSize);
    if (totalPages <= 1) {
      paginationWrap.innerHTML = '';
      return;
    }

    let html = `
      <button class="btn-glass" ${this.currentPage === 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="window.CatalogService.goToPage(${this.currentPage - 1})">
        ◀ Anterior
      </button>
      <span style="font-weight: 700; color: var(--neon-cyan); padding: 0 0.5rem;">
        Página ${this.currentPage} de ${totalPages}
      </span>
      <button class="btn-glass" ${this.currentPage === totalPages ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="window.CatalogService.goToPage(${this.currentPage + 1})">
        Siguiente ▶
      </button>
    `;

    paginationWrap.innerHTML = html;
  }

  goToPage(page) {
    const totalPages = Math.ceil(this.filteredSongs.length / this.pageSize);
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.renderSongGrid();
      this.renderPagination();
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  openOrderModal(songId) {
    const song = this.getSongById(songId);
    if (!song) return;

    this.selectedSongForOrder = song;
    
    document.getElementById('modal-song-num').innerText = `#${song.numero || song.id}`;
    document.getElementById('modal-song-title').innerText = song.titulo;
    document.getElementById('modal-song-artist').innerText = song.artista;
    document.getElementById('modal-song-genre').innerText = song.genero || 'Variado';
    
    const nameInput = document.getElementById('modal-singer-name');
    if (nameInput) {
      nameInput.value = localStorage.getItem('karaoke_last_singer_name') || '';
      setTimeout(() => nameInput.focus(), 150);
    }

    document.getElementById('order-modal-backdrop').classList.add('active');
  }

  closeOrderModal() {
    document.getElementById('order-modal-backdrop').classList.remove('active');
    this.selectedSongForOrder = null;
  }

  async submitOrder() {
    if (!this.selectedSongForOrder) return;
    
    const nameInput = document.getElementById('modal-singer-name');
    const singerName = nameInput ? nameInput.value.trim() : '';

    if (!singerName) {
      window.App.showToast('Por favor escribe tu nombre para el pedido', 'error');
      nameInput?.focus();
      return;
    }

    localStorage.setItem('karaoke_last_singer_name', singerName);

    const songId = this.selectedSongForOrder.numero || this.selectedSongForOrder.id;
    
    const submitBtn = document.getElementById('modal-submit-order-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Enviando...';
    }

    try {
      await window.SupabaseService.addQueueOrder(songId, singerName);
      this.closeOrderModal();
      window.App.showToast(`¡Listo ${singerName}! Canción añadida a la cola 🎤`, 'success');
      window.App.switchView('queue');
    } catch (e) {
      window.App.showToast('Error al enviar el pedido', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Confirmar Pedido 🎤';
      }
    }
  }
}

window.CatalogService = new CatalogService();
