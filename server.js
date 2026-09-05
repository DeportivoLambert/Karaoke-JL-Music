const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Obtener IPs locales de red para compartir el código QR móvil
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Ruta para obtener la IP del servidor y URL para móviles
app.get('/api/server-info', (req, res) => {
  const localIp = getLocalIPAddress();
  res.json({
    localIp,
    port: PORT,
    mobileUrl: `http://${localIp}:${PORT}`
  });
});

// Ruta para obtener catálogo de canciones
app.get('/api/canciones', (req, res) => {
  const jsonPath = path.join(__dirname, 'data', 'canciones.json');
  if (fs.existsSync(jsonPath)) {
    const data = fs.readFileSync(jsonPath, 'utf-8');
    res.json(JSON.parse(data));
  } else {
    res.json([]);
  }
});

// Almacén en memoria de cola para modo local (cuando no se use Supabase)
let localQueue = [];
let djPin = '1234'; // PIN predeterminado para el DJ / Anfitrión
let sseClients = []; // Clientes conectados a Server-Sent Events para reacciones y control en tiempo real

// Endpoint para verificar PIN de DJ
app.post('/api/dj/auth', (req, res) => {
  const { pin } = req.body;
  if (pin === djPin) {
    res.json({ success: true, message: 'Autenticación DJ exitosa' });
  } else {
    res.status(401).json({ success: false, error: 'PIN incorrecto' });
  }
});

// Endpoint para cambiar PIN de DJ (requiere PIN actual)
app.post('/api/dj/change-pin', (req, res) => {
  const { currentPin, newPin } = req.body;
  if (currentPin === djPin && newPin && newPin.length >= 4) {
    djPin = newPin;
    res.json({ success: true, message: 'PIN de DJ actualizado correctamente' });
  } else {
    res.status(400).json({ success: false, error: 'PIN actual incorrecto o nuevo PIN inválido' });
  }
});

// Obtener cola completa
app.get('/api/cola', (req, res) => {
  res.json(localQueue);
});

// Agregar pedido a la cola
app.post('/api/cola', (req, res) => {
  const { cancion_id, nombre_usuario, autoAprobar } = req.body;
  const jsonPath = path.join(__dirname, 'data', 'canciones.json');
  let cancion = null;
  if (fs.existsSync(jsonPath)) {
    const songs = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    cancion = songs.find(s => s.id == cancion_id || s.numero == cancion_id);
  }

  // Verificar si hay duplicados recientes (misma canción en últimos 5 pedidos)
  const esDuplicada = localQueue.some(q => q.cancion_id == cancion_id && (q.estado === 'pendiente' || q.estado === 'solicitado' || q.estado === 'sonando'));

  const nuevoPedido = {
    id: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    cancion_id,
    nombre_usuario: (nombre_usuario || 'Cantante Anónimo').trim(),
    estado: autoAprobar === false ? 'solicitado' : 'pendiente',
    es_duplicada: esDuplicada,
    creado_en: new Date().toISOString(),
    cancion: cancion || { titulo: 'Canción #' + cancion_id, artista: 'Artista' }
  };

  localQueue.push(nuevoPedido);
  broadcastSSE({ type: 'queue_update', data: localQueue });
  res.status(201).json(nuevoPedido);
});

// Aprobar solicitud entrante (Modo Moderación)
app.post('/api/cola/:id/approve', (req, res) => {
  const { id } = req.params;
  const item = localQueue.find(q => q.id === id);
  if (item) {
    item.estado = 'pendiente';
    broadcastSSE({ type: 'queue_update', data: localQueue });
    res.json({ success: true, item });
  } else {
    res.status(404).json({ error: 'Pedido no encontrado' });
  }
});

// Rechazar solicitud entrante
app.post('/api/cola/:id/reject', (req, res) => {
  const { id } = req.params;
  const item = localQueue.find(q => q.id === id);
  if (item) {
    item.estado = 'rechazado';
    broadcastSSE({ type: 'queue_update', data: localQueue });
    res.json({ success: true, item });
  } else {
    res.status(404).json({ error: 'Pedido no encontrado' });
  }
});

// Reordenar posiciones de la cola (Mover arriba o abajo)
app.post('/api/cola/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'Formato inválido para orderedIds' });
  }

  const map = new Map(localQueue.map(item => [item.id, item]));
  const reordered = [];
  
  orderedIds.forEach(id => {
    if (map.has(id)) {
      reordered.push(map.get(id));
      map.delete(id);
    }
  });

  // Agregar cualquier elemento restante
  map.forEach(item => reordered.push(item));
  localQueue = reordered;

  broadcastSSE({ type: 'queue_update', data: localQueue });
  res.json({ success: true, queue: localQueue });
});

// Actualizar estado de pedido
app.patch('/api/cola/:id', (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const item = localQueue.find(q => q.id === id);
  if (item) {
    if (estado) item.estado = estado;
    broadcastSSE({ type: 'queue_update', data: localQueue });
    res.json(item);
  } else {
    res.status(404).json({ error: 'Pedido no encontrado' });
  }
});

// Eliminar pedido
app.delete('/api/cola/:id', (req, res) => {
  const { id } = req.params;
  localQueue = localQueue.filter(q => q.id !== id);
  broadcastSSE({ type: 'queue_update', data: localQueue });
  res.json({ success: true });
});

// ============================================================
// SISTEMA DE REACCIONES Y APLAUSÓMETRO EN TIEMPO REAL (SSE)
// ============================================================
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Enviar estado inicial
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

function broadcastSSE(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(c => {
    try {
      c.res.write(data);
    } catch (e) {
      // Ignorar errores de escritura en sockets cerrados
    }
  });
}

// Endpoint para enviar reacciones en vivo desde móviles / clientes
app.post('/api/reacciones', (req, res) => {
  const { emoji, sender } = req.body;
  const validEmojis = ['🔥', '👏', '❤️', '⭐', '🥳', '💯', '🎤', '🙌'];
  const safeEmoji = validEmojis.includes(emoji) ? emoji : '👏';
  
  const reaccionEvent = {
    type: 'reaccion',
    emoji: safeEmoji,
    sender: (sender || 'Público').trim(),
    timestamp: Date.now()
  };

  broadcastSSE(reaccionEvent);
  res.json({ success: true, received: reaccionEvent });
});

// Endpoint para Control Remoto del Escenario por parte del DJ
app.post('/api/stage/control', (req, res) => {
  const { action, payload } = req.body; // 'play', 'pause', 'skip', 'mute', 'volume', 'next'
  broadcastSSE({
    type: 'stage_control',
    action,
    payload,
    timestamp: Date.now()
  });
  res.json({ success: true, action });
});

// Streamer de Videos con soporte de byte-range (para MP4 y MOV)
function streamMediaFile(filePath, req, res) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Archivo no encontrado');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.mov') contentType = 'video/quicktime';
  else if (ext === '.mpg' || ext === '.mpeg') contentType = 'video/mpeg';
  else if (ext === '.3gp') contentType = 'video/3gpp';
  else if (ext === '.mp3') contentType = 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

// Ruta para servir videos de canciones
app.get('/video/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(__dirname, 'Canciones kareoke', filename);
  streamMediaFile(filePath, req, res);
});

// Ruta para servir efectos de sonido
app.get('/efectos/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(__dirname, 'EFECTOS', filename);
  streamMediaFile(filePath, req, res);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIPAddress();
  console.log(`\n======================================================`);
  console.log(`🎤  KARAOKE JL MUSIC - SISTEMA PROFESIONAL EN VIVO`);
  console.log(`======================================================`);
  console.log(`🌐 Acceso Local:         http://localhost:${PORT}`);
  console.log(`📱 Acceso Red / Móviles: http://${localIp}:${PORT}`);
  console.log(`🎧 Modo DJ Moderador:   PIN por defecto: 1234`);
  console.log(`⚡ Aplausómetro, SSE & Supabase Realtime Listos`);
  console.log(`======================================================\n`);
});

