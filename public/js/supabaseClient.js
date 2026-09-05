// ============================================================
// SUPABASE CLIENT & REALTIME SYNC & SSE (KARAOKE JL MUSIC)
// ============================================================

class SupabaseService {
  constructor() {
    this.client = null;
    this.channel = null;
    this.reactionChannel = null;
    this.eventSource = null;
    this.isConfigured = false;
    this.isOnline = false;
    this.onQueueChangeCallbacks = [];
    this.onReactionCallbacks = [];
    this.onStageControlCallbacks = [];
    
    // Cargar credenciales guardadas en LocalStorage o valores por defecto
    const DEFAULT_SUPABASE_URL = 'https://hmutnmerrrvbkaqccyfg.supabase.co';
    const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdXRubWVycnJ2YmthcWNjeWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODU4MDcsImV4cCI6MjEwNDE2MTgwN30.ofX28HFGnipchRTw7T0kVvx829iiJSvr0h3y8ve2xm8';
    this.supabaseUrl = localStorage.getItem('karaoke_supabase_url') || DEFAULT_SUPABASE_URL;
    this.supabaseKey = localStorage.getItem('karaoke_supabase_key') || DEFAULT_SUPABASE_KEY;
    
    this.init();
    this.initSSE();
  }

  init() {
    if (this.supabaseUrl && this.supabaseKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        this.isConfigured = true;
        this.subscribeRealtime();
        this.checkConnection();
      } catch (err) {
        console.warn('Error inicializando Supabase:', err);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
    }
  }

  // Conectar a Server-Sent Events (SSE) del servidor local
  initSSE() {
    if (typeof EventSource !== 'undefined') {
      try {
        if (this.eventSource) this.eventSource.close();
        this.eventSource = new EventSource('/api/events');
        
        this.eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'queue_update') {
              this.notifyQueueChange();
            } else if (data.type === 'reaccion') {
              this.notifyReaction(data.emoji, data.sender);
            } else if (data.type === 'stage_control') {
              this.notifyStageControl(data.action, data.payload);
            }
          } catch (err) {
            // Mensajes simples de conexión
          }
        };

        this.eventSource.onerror = () => {
          // Reintentará automáticamente
        };
      } catch (err) {
        console.warn('SSE no disponible:', err);
      }
    }
  }

  saveConfig(url, key) {
    this.supabaseUrl = url.trim();
    this.supabaseKey = key.trim();
    localStorage.setItem('karaoke_supabase_url', this.supabaseUrl);
    localStorage.setItem('karaoke_supabase_key', this.supabaseKey);
    this.init();
  }

  clearConfig() {
    this.supabaseUrl = '';
    this.supabaseKey = '';
    localStorage.removeItem('karaoke_supabase_url');
    localStorage.removeItem('karaoke_supabase_key');
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.client = null;
    this.isConfigured = false;
  }

  async checkConnection() {
    if (!this.client) return false;
    try {
      const { data, error } = await this.client.from('cola_pedidos').select('id').limit(1);
      if (!error) {
        this.isOnline = true;
        this.updateStatusBadge(true);
        return true;
      } else {
        console.warn('Supabase test select error:', error);
        this.isOnline = false;
        this.updateStatusBadge(false);
        return false;
      }
    } catch (e) {
      this.isOnline = false;
      this.updateStatusBadge(false);
      return false;
    }
  }

  updateStatusBadge(online) {
    const badge = document.getElementById('realtime-status-badge');
    const text = document.getElementById('realtime-status-text');
    if (badge && text) {
      if (online && this.isConfigured) {
        badge.style.borderColor = 'rgba(6, 214, 160, 0.4)';
        text.innerText = 'Supabase Realtime';
        text.style.color = '#06d6a0';
      } else {
        badge.style.borderColor = 'rgba(0, 240, 255, 0.4)';
        text.innerText = 'Modo Local / Red';
        text.style.color = '#00f0ff';
      }
    }
  }

  subscribeRealtime() {
    if (!this.client) return;
    if (this.channel) {
      this.channel.unsubscribe();
    }

    try {
      this.channel = this.client
        .channel('cola_pedidos_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cola_pedidos' },
          (payload) => {
            console.log('⚡ Supabase Realtime Event:', payload);
            this.notifyQueueChange();
          }
        )
        .on('broadcast', { event: 'reaccion' }, (payload) => {
          if (payload && payload.payload) {
            this.notifyReaction(payload.payload.emoji, payload.payload.sender);
          }
        })
        .on('broadcast', { event: 'stage_control' }, (payload) => {
          if (payload && payload.payload) {
            this.notifyStageControl(payload.payload.action, payload.payload.data);
          }
        })
        .subscribe((status) => {
          console.log('📡 Supabase Realtime Status:', status);
        });
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }

  onQueueChange(cb) {
    this.onQueueChangeCallbacks.push(cb);
  }

  notifyQueueChange() {
    this.onQueueChangeCallbacks.forEach(cb => cb());
  }

  onReaction(cb) {
    this.onReactionCallbacks.push(cb);
  }

  notifyReaction(emoji, sender) {
    this.onReactionCallbacks.forEach(cb => cb(emoji, sender));
  }

  onStageControl(cb) {
    this.onStageControlCallbacks.push(cb);
  }

  notifyStageControl(action, payload) {
    this.onStageControlCallbacks.forEach(cb => cb(action, payload));
  }

  // Enviar Reacción (Emoji flotante)
  async sendReaction(emoji, sender = 'Público') {
    // 1. Vía Supabase Broadcast si está activo
    if (this.isConfigured && this.channel) {
      try {
        this.channel.send({
          type: 'broadcast',
          event: 'reaccion',
          payload: { emoji, sender }
        });
      } catch (e) {
        console.warn('Error Supabase broadcast:', e);
      }
    }

    // 2. Vía API Local Express
    try {
      await fetch('/api/reacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, sender })
      });
    } catch (e) {
      // Notificar localmente en caso de standalone
      this.notifyReaction(emoji, sender);
    }
  }

  // Enviar Control Remoto de Escenario (DJ)
  async sendStageControl(action, payload = null) {
    if (this.isConfigured && this.channel) {
      try {
        this.channel.send({
          type: 'broadcast',
          event: 'stage_control',
          payload: { action, data: payload }
        });
      } catch (e) {}
    }

    try {
      await fetch('/api/stage/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
    } catch (e) {
      this.notifyStageControl(action, payload);
    }
  }

  // Operaciones de Cola
  async getQueue() {
    if (this.isConfigured && this.client) {
      try {
        const { data, error } = await this.client
          .from('cola_pedidos')
          .select(`
            id,
            cancion_id,
            nombre_usuario,
            estado,
            creado_en,
            canciones (
              id,
              numero,
              titulo,
              artista,
              genero,
              video_url
            )
          `)
          .order('creado_en', { ascending: true });

        if (!error && data) {
          return data.map(item => ({
            id: item.id,
            cancion_id: item.cancion_id,
            nombre_usuario: item.nombre_usuario,
            estado: item.estado,
            creado_en: item.creado_en,
            cancion: item.canciones || (window.CatalogService ? window.CatalogService.getSongById(item.cancion_id) : null)
          }));
        }
      } catch (e) {
        console.warn('Error fetching Supabase queue, falling back to local:', e);
      }
    }

    // Modo local fallback
    try {
      const res = await fetch('/api/cola');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Fallback a LocalStorage
      const local = localStorage.getItem('karaoke_local_queue');
      return local ? JSON.parse(local) : [];
    }
    return [];
  }

  async addQueueOrder(cancionId, nombreUsuario, autoAprobar = true) {
    const estado = autoAprobar ? 'pendiente' : 'solicitado';

    if (this.isConfigured && this.client) {
      try {
        const { data, error } = await this.client
          .from('cola_pedidos')
          .insert([
            {
              cancion_id: cancionId,
              nombre_usuario: nombreUsuario,
              estado
            }
          ])
          .select();

        if (!error) {
          this.notifyQueueChange();
          return { success: true, data };
        }
      } catch (e) {
        console.warn('Supabase exception:', e);
      }
    }

    // Modo local fallback
    try {
      const res = await fetch('/api/cola', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancion_id: cancionId, nombre_usuario: nombreUsuario, autoAprobar })
      });
      if (res.ok) {
        this.notifyQueueChange();
        return { success: true, data: await res.json() };
      }
    } catch (e) {
      // LocalStorage
      const local = localStorage.getItem('karaoke_local_queue');
      const queue = local ? JSON.parse(local) : [];
      const song = window.CatalogService ? window.CatalogService.getSongById(cancionId) : null;
      const newItem = {
        id: 'loc-' + Date.now(),
        cancion_id: cancionId,
        nombre_usuario: nombreUsuario,
        estado,
        creado_en: new Date().toISOString(),
        cancion: song
      };
      queue.push(newItem);
      localStorage.setItem('karaoke_local_queue', JSON.stringify(queue));
      this.notifyQueueChange();
      return { success: true, data: newItem };
    }
  }

  async approveOrder(id) {
    return await this.updateOrderStatus(id, 'pendiente');
  }

  async rejectOrder(id) {
    return await this.updateOrderStatus(id, 'rechazado');
  }

  async updateOrderStatus(id, nuevoEstado) {
    if (this.isConfigured && this.client && !String(id).startsWith('loc-')) {
      try {
        const { error } = await this.client
          .from('cola_pedidos')
          .update({ estado: nuevoEstado })
          .eq('id', id);

        if (!error) {
          this.notifyQueueChange();
          return true;
        }
      } catch (e) {
        console.warn('Error updating Supabase:', e);
      }
    }

    // Modo Local
    try {
      await fetch(`/api/cola/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado })
      });
    } catch (e) {
      const local = localStorage.getItem('karaoke_local_queue');
      if (local) {
        const queue = JSON.parse(local);
        const item = queue.find(q => q.id === id);
        if (item) {
          item.estado = nuevoEstado;
          localStorage.setItem('karaoke_local_queue', JSON.stringify(queue));
        }
      }
    }
    this.notifyQueueChange();
    return true;
  }

  async reorderQueue(orderedIds) {
    try {
      await fetch('/api/cola/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
    } catch (e) {
      // LocalStorage reorder
      const local = localStorage.getItem('karaoke_local_queue');
      if (local) {
        let queue = JSON.parse(local);
        const map = new Map(queue.map(i => [i.id, i]));
        const reordered = [];
        orderedIds.forEach(id => {
          if (map.has(id)) {
            reordered.push(map.get(id));
            map.delete(id);
          }
        });
        map.forEach(i => reordered.push(i));
        localStorage.setItem('karaoke_local_queue', JSON.stringify(reordered));
      }
    }
    this.notifyQueueChange();
    return true;
  }

  async deleteOrder(id) {
    if (this.isConfigured && this.client && !String(id).startsWith('loc-')) {
      try {
        const { error } = await this.client
          .from('cola_pedidos')
          .delete()
          .eq('id', id);

        if (!error) {
          this.notifyQueueChange();
          return true;
        }
      } catch (e) {
        console.warn('Error deleting Supabase order:', e);
      }
    }

    // Modo local
    try {
      await fetch(`/api/cola/${id}`, { method: 'DELETE' });
    } catch (e) {
      const local = localStorage.getItem('karaoke_local_queue');
      if (local) {
        let queue = JSON.parse(local);
        queue = queue.filter(q => q.id !== id);
        localStorage.setItem('karaoke_local_queue', JSON.stringify(queue));
      }
    }
    this.notifyQueueChange();
    return true;
  }

  // Sincronizar catálogo local completo a Supabase en lote
  async syncCatalogToSupabase(songs) {
    if (!this.client) throw new Error('Supabase no está configurado');
    
    // Preparar filas
    const rows = songs.map(s => ({
      id: s.id || s.numero,
      numero: s.numero,
      titulo: s.titulo,
      artista: s.artista,
      genero: s.genero,
      video_url: s.video_url || ''
    }));

    // Inserción en lotes de 100
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await this.client
        .from('canciones')
        .upsert(chunk, { onConflict: 'numero' });
      if (error) throw error;
    }
    return true;
  }
}

window.SupabaseService = new SupabaseService();

