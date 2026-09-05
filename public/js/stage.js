// ============================================================
// STAGE & AUTOMATED VIDEO PLAYER & APLAUSÓMETRO (KARAOKE JL MUSIC)
// ============================================================

class StageService {
  constructor() {
    this.videoEl = null;
    this.currentPlayingOrder = null;
    this.currentSong = null;
    this.currentSinger = 'Karaoke Jl Music';
    this.nextOrder = null;
    
    // Aplausómetro y Emojis
    this.hypeScore = 0;
    this.maxHype = 100;
    
    // Automatización
    this.isAutoAdvancing = false;
    this.countdownTimer = null;
    this.nextSingerAlertTriggered = false;
    this.isStandby = true;
    this.ambientAudio = null;
    this.ambientAudioCtx = null;
    this.isAmbientPlaying = false;
    
    // Lista de efectos de DJ disponibles
    this.effects = [
      { id: '100_exito', name: '100 Puntos Éxito', icon: '💯', file: '100 puntos exitos.mp4' },
      { id: '90_aplausos', name: 'Aplausos Bravo', icon: '👏', file: '90 puntos aplausos.mp4' },
      { id: '80_bien', name: '80 Puntos Bien', icon: '👍', file: '80 puntos bien.mp4' },
      { id: '60_risas', name: 'Risas Divertidas', icon: '😂', file: '60 puntos risas.mp4' },
      { id: 'mas_100', name: '¡Más de 100 Pts!', icon: '🏆', file: 'Mas de 100 puntos.mp4' },
      { id: 'intro_show', name: 'Intro Show Lambert', icon: '🎬', file: 'intro nuevo Lambert en transparente.mp4' }
    ];

    this.init();
  }

  init() {
    this.videoEl = document.getElementById('stage-video-player');
    this.renderFXPads();
    this.setupVideoEvents();
    this.setupRealtimeListeners();
  }

  setupVideoEvents() {
    if (!this.videoEl) return;

    // 1. Detección automática del FIN de la canción (ended)
    this.videoEl.addEventListener('ended', () => {
      this.handleSongEnded();
    });

    // 2. Detección de los últimos 15 segundos para el aviso "Próximo a Cantar"
    this.videoEl.addEventListener('timeupdate', () => {
      if (!this.videoEl || !this.videoEl.duration) return;
      const timeLeft = this.videoEl.duration - this.videoEl.currentTime;

      if (timeLeft <= 15 && timeLeft > 0 && !this.nextSingerAlertTriggered && this.nextOrder) {
        this.showNextSingerHUD(true);
        this.nextSingerAlertTriggered = true;
      }
    });

    // Al comenzar a reproducir
    this.videoEl.addEventListener('play', () => {
      this.stopAmbientMusic();
      this.setStandbyVisual(false);
    });
  }

  setupRealtimeListeners() {
    // Escuchar reacciones (emojis) en tiempo real
    if (window.SupabaseService) {
      window.SupabaseService.onReaction((emoji, sender) => {
        this.spawnFloatingEmoji(emoji, sender);
        this.incrementHypeScore(5);
      });

      // Escuchar comandos remotos del DJ
      window.SupabaseService.onStageControl((action, payload) => {
        this.handleRemoteControl(action, payload);
      });
    }
  }

  updateStageInfo(currentPlaying, nextSinger) {
    this.currentPlayingOrder = currentPlaying;
    this.nextOrder = nextSinger;

    if (currentPlaying) {
      const song = currentPlaying.cancion || (window.CatalogService ? window.CatalogService.getSongById(currentPlaying.cancion_id) : null);
      this.currentSinger = currentPlaying.nombre_usuario;
      this.currentSong = song;
      this.isStandby = false;
      this.setStandbyVisual(false);
      
      const badgeEl = document.getElementById('stage-current-singer');
      if (badgeEl) badgeEl.innerText = this.currentSinger;
      
      const songInfoEl = document.getElementById('stage-current-song-info');
      if (songInfoEl && song) {
        songInfoEl.innerText = `${song.titulo} - ${song.artista}`;
      }
    } else {
      this.currentSinger = 'Karaoke Jl Music';
      this.currentSong = null;
      this.isStandby = true;

      const badgeEl = document.getElementById('stage-current-singer');
      if (badgeEl) badgeEl.innerText = 'Escenario Disponible';
      const songInfoEl = document.getElementById('stage-current-song-info');
      if (songInfoEl) songInfoEl.innerText = '¡Pide tu canción favorita!';

      if (!this.videoEl || this.videoEl.paused || this.videoEl.ended) {
        this.setStandbyVisual(true);
      }
    }

    // Actualizar texto del siguiente cantante
    const nextEl = document.getElementById('stage-next-singer-text');
    if (nextSinger) {
      const s = nextSinger.cancion || (window.CatalogService ? window.CatalogService.getSongById(nextSinger.cancion_id) : null);
      if (nextEl) {
        nextEl.innerHTML = `A continuación: <span class="next-name">${nextSinger.nombre_usuario}</span> ${s ? '(' + s.titulo + ')' : ''}`;
      }
      this.updateHUDContent(nextSinger, s);
    } else {
      if (nextEl) {
        nextEl.innerHTML = `A continuación: <span class="next-name">Nadie en espera</span>`;
      }
      this.showNextSingerHUD(false);
    }
  }

  // ============================================================
  // AUTOMATIZACIÓN DE FIN DE CANCIÓN & TRANSICIÓN
  // ============================================================
  async handleSongEnded() {
    if (this.isAutoAdvancing) return;
    this.isAutoAdvancing = true;
    this.showNextSingerHUD(false);

    // 1. Marcar la canción actual como completada
    if (this.currentPlayingOrder) {
      await window.SupabaseService.updateOrderStatus(this.currentPlayingOrder.id, 'completado');
    }

    // 2. Efecto de aplausos automáticos de felicitación
    this.triggerSoundFXOnly('90 puntos aplausos.mp4');
    this.spawnMultipleEmojis('👏', 8);

    // 3. Verificar si hay un siguiente cantante en cola
    const queue = await window.SupabaseService.getQueue();
    const pendientes = queue.filter(q => q.estado === 'pendiente');

    if (pendientes.length > 0) {
      const nextSongOrder = pendientes[0];
      this.startTransitionCountdown(nextSongOrder, 45); // 45 segundos de pausa e interacción
    } else {
      // Cola vacía: activar modo standby y música ambiental
      this.isAutoAdvancing = false;
      this.setStandbyVisual(true);
      this.startAmbientMusic();
      window.App.showToast('¡Escenario disponible! Pide tu canción desde el celular 📱', 'info');
    }
  }

  startTransitionCountdown(nextSongOrder, seconds = 45) {
    const overlay = document.getElementById('stage-countdown-overlay');
    const numEl = document.getElementById('countdown-number');
    const textEl = document.getElementById('countdown-next-text');

    if (!overlay || !numEl) {
      this.executeNextSong(nextSongOrder);
      return;
    }

    overlay.classList.add('visible');
    const song = nextSongOrder.cancion || (window.CatalogService ? window.CatalogService.getSongById(nextSongOrder.cancion_id) : null);
    if (textEl) {
      textEl.innerHTML = `<strong>${nextSongOrder.nombre_usuario}</strong> ${song ? ' — 🎵 ' + song.titulo + ' (' + song.artista + ')' : ''}`;
    }

    let remaining = seconds;
    numEl.innerText = remaining;

    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        numEl.innerText = remaining;
      } else {
        clearInterval(this.countdownTimer);
        overlay.classList.remove('visible');
        this.executeNextSong(nextSongOrder);
      }
    }, 1000);
  }

  async executeNextSong(nextSongOrder) {
    this.isAutoAdvancing = false;
    this.nextSingerAlertTriggered = false;
    
    // Cambiar estado a 'sonando'
    await window.SupabaseService.updateOrderStatus(nextSongOrder.id, 'sonando');

    const song = nextSongOrder.cancion || (window.CatalogService ? window.CatalogService.getSongById(nextSongOrder.cancion_id) : null);
    if (song) {
      this.loadSongIntoStage(song, nextSongOrder.nombre_usuario);
    }
  }

  loadSongIntoStage(song, singerName = 'Cantante') {
    this.currentSong = song;
    this.currentSinger = singerName;
    this.nextSingerAlertTriggered = false;
    this.isStandby = false;
    this.setStandbyVisual(false);
    this.resetHypeScore();

    const badgeEl = document.getElementById('stage-current-singer');
    if (badgeEl) badgeEl.innerText = singerName;
    
    const songInfoEl = document.getElementById('stage-current-song-info');
    if (songInfoEl) songInfoEl.innerText = `${song.titulo} - ${song.artista}`;

    if (!this.videoEl) {
      this.videoEl = document.getElementById('stage-video-player');
    }

    if (this.videoEl && song) {
      let videoSrc = song.video_url;
      if (!videoSrc && song.filename) {
        videoSrc = `/video/${encodeURIComponent(song.filename)}`;
      }
      
      if (videoSrc) {
        this.videoEl.src = videoSrc;
        this.videoEl.play().catch(e => {
          console.log('Autoplay requiere interacción de usuario:', e);
        });
      }
    }
  }

  // ============================================================
  // AVISO HUD: "PRÓXIMO A CANTAR" (Últimos 15 segundos)
  // ============================================================
  updateHUDContent(nextOrder, song) {
    const singerEl = document.getElementById('hud-next-singer');
    const songEl = document.getElementById('hud-next-song');
    if (singerEl) singerEl.innerText = nextOrder.nombre_usuario;
    if (songEl && song) songEl.innerText = `🎵 ${song.titulo} - ${song.artista}`;
  }

  showNextSingerHUD(show) {
    const hud = document.getElementById('stage-next-singer-hud');
    if (!hud) return;
    if (show && this.nextOrder) {
      hud.classList.add('visible');
    } else {
      hud.classList.remove('visible');
    }
  }

  // ============================================================
  // SISTEMA DE CALIFICACIÓN / APLAUSÓMETRO & EMOJIS FLOTANTES
  // ============================================================
  spawnFloatingEmoji(emoji, sender) {
    const container = document.getElementById('floating-emojis-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.innerText = emoji;

    // Posición horizontal aleatoria entre 10% y 85%
    const randomLeft = Math.floor(Math.random() * 75) + 10;
    el.style.left = `${randomLeft}%`;

    container.appendChild(el);

    // Eliminar después de que termine la animación
    setTimeout(() => {
      el.remove();
    }, 3600);
  }

  spawnMultipleEmojis(emoji, count = 5) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.spawnFloatingEmoji(emoji), i * 150);
    }
  }

  incrementHypeScore(amount = 5) {
    this.hypeScore = Math.min(this.maxHype, this.hypeScore + amount);
    this.updateHypeUI();

    // Reducción gradual
    if (!this.hypeDecayInterval) {
      this.hypeDecayInterval = setInterval(() => {
        if (this.hypeScore > 0) {
          this.hypeScore = Math.max(0, this.hypeScore - 1);
          this.updateHypeUI();
        }
      }, 800);
    }
  }

  resetHypeScore() {
    this.hypeScore = 0;
    this.updateHypeUI();
  }

  updateHypeUI() {
    const fill = document.getElementById('stage-hype-fill');
    const score = document.getElementById('stage-hype-score');
    if (fill) fill.style.width = `${this.hypeScore}%`;
    if (score) score.innerText = `${this.hypeScore}%`;
  }

  // ============================================================
  // MODO STANDBY / MÚSICA AMBIENTAL DE INTERMEDIO
  // ============================================================
  setStandbyVisual(isStandby) {
    const standbyEl = document.getElementById('stage-standby-screen');
    if (standbyEl) {
      standbyEl.style.display = isStandby ? 'flex' : 'none';
    }
  }

  startAmbientMusic() {
    if (this.isAmbientPlaying) return;
    this.isAmbientPlaying = true;
    
    // Reproducir Intro / loop de fondo o sintetizador ambiental suave
    try {
      if (!this.ambientAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ambientAudioCtx = new AudioCtx();
      }
    } catch (e) {
      console.warn('Web Audio no disponible:', e);
    }
  }

  stopAmbientMusic() {
    this.isAmbientPlaying = false;
    if (this.ambientAudio) {
      this.ambientAudio.pause();
      this.ambientAudio = null;
    }
  }

  // ============================================================
  // CONTROL REMOTO DEL DJ & EFECTOS
  // ============================================================
  handleRemoteControl(action, payload) {
    if (!this.videoEl) this.videoEl = document.getElementById('stage-video-player');
    if (!this.videoEl) return;

    switch (action) {
      case 'play':
        this.videoEl.play().catch(() => {});
        window.App.showToast('DJ reanudó el escenario ▶️', 'info');
        break;
      case 'pause':
        this.videoEl.pause();
        window.App.showToast('DJ pausó el escenario ⏸', 'info');
        break;
      case 'skip':
      case 'next':
        this.handleSongEnded();
        window.App.showToast('DJ saltó la canción ⏭', 'info');
        break;
      case 'mute':
        this.videoEl.muted = !this.videoEl.muted;
        window.App.showToast(this.videoEl.muted ? 'Escenario Silenciado 🔇' : 'Sonido Activado 🔊', 'info');
        break;
      case 'volume':
        if (typeof payload === 'number') {
          this.videoEl.volume = Math.max(0, Math.min(1, payload));
        }
        break;
      case 'effect':
        if (payload && payload.file) {
          this.triggerEffect(payload.file, payload.name);
        }
        break;
    }
  }

  toggleFullScreen() {
    const frame = document.getElementById('stage-video-frame');
    if (!frame) return;

    if (!document.fullscreenElement) {
      if (frame.requestFullscreen) frame.requestFullscreen();
      else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
      else if (frame.msRequestFullscreen) frame.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  renderFXPads() {
    const container = document.getElementById('sound-fx-grid');
    if (!container) return;

    container.innerHTML = this.effects.map(fx => `
      <button class="fx-pad-btn" onclick="window.StageService.triggerEffect('${fx.file}', '${fx.name}')">
        <span class="fx-icon">${fx.icon}</span>
        <span class="fx-label">${fx.name}</span>
      </button>
    `).join('');
  }

  triggerEffect(fileName, name) {
    const fxUrl = `/efectos/${encodeURIComponent(fileName)}`;
    const fxAudio = new Audio(fxUrl);
    fxAudio.volume = 0.95;
    fxAudio.play().catch(e => console.warn('Error reproduciendo efecto:', e));
    
    // Animación visual de fuegos artificiales de emojis
    if (name.includes('100')) {
      this.spawnMultipleEmojis('💯', 6);
    } else if (name.includes('Aplausos')) {
      this.spawnMultipleEmojis('👏', 6);
    }

    window.App.showToast(`Efecto DJ: ${name} 🔊`, 'info');
  }

  triggerSoundFXOnly(fileName) {
    const fxUrl = `/efectos/${encodeURIComponent(fileName)}`;
    const fxAudio = new Audio(fxUrl);
    fxAudio.volume = 0.85;
    fxAudio.play().catch(() => {});
  }
}

window.StageService = new StageService();
