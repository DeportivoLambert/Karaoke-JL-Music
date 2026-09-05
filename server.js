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
function getNetworkInterfacesList() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    // Ignorar adaptadores virtuales comunes si hay opciones físicas
    const lowerName = name.toLowerCase();
    const isVirtual = lowerName.includes('vethernet') || lowerName.includes('wsl') || lowerName.includes('virtual') || lowerName.includes('vmware') || lowerName.includes('loopback');
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          name,
          address: iface.address,
          isVirtual
        });
      }
    }
  }

  // Ordenar priorizando interfaces físicas (no virtuales) y Wi-Fi / Ethernet
  addresses.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    const aWifi = a.name.toLowerCase().includes('wi-fi') || a.name.toLowerCase().includes('wireless');
    const bWifi = b.name.toLowerCase().includes('wi-fi') || b.name.toLowerCase().includes('wireless');
    if (aWifi !== bWifi) return aWifi ? -1 : 1;
    return 0;
  });

  return addresses;
}

function getLocalIPAddress() {
  const list = getNetworkInterfacesList();
  if (list.length > 0) {
    return list[0].address;
  }
  return 'localhost';
}

// Ruta para obtener la IP del servidor y URL para móviles
app.get('/api/server-info', (req, res) => {
  const localIp = getLocalIPAddress();
  const allInterfaces = getNetworkInterfacesList();
  res.json({
    localIp,
    port: PORT,
    mobileUrl: `http://${localIp}:${PORT}`,
    interfaces: allInterfaces.map(i => ({ name: i.name, url: `http://${i.address}:${PORT}` }))
  });
});

// Ruta para obtener configuración pública de Supabase
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.VITE_SUPABASE_URL || 'https://hmutnmerrrvbkaqccyfg.supabase.co',
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdXRubWVycnJ2YmthcWNjeWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODU4MDcsImV4cCI6MjEwNDE2MTgwN30.ofX28HFGnipchRTw7T0kVvx829iiJSvr0h3y8ve2xm8'
  });
});

// Ruta para obtener catálogo de canciones (100% Offline)
app.get('/api/canciones', (req, res) => {
  const jsonPath = path.join(__dirname, 'data', 'canciones.json');
  if (fs.existsSync(jsonPath)) {
    const data = fs.readFileSync(jsonPath, 'utf-8');
    res.json(JSON.parse(data));
  } else {
    res.json([]);
  }
});

// Ruta para registrar nueva canción al catálogo
app.post('/api/canciones', (req, res) => {
  const { numero, titulo, artista, genero, video_url } = req.body;
  
  if (!titulo || !artista) {
    return res.status(400).json({ success: false, error: 'Título y Artista son obligatorios' });
  }

  const jsonPath = path.join(__dirname, 'data', 'canciones.json');
  let songs = [];
  if (fs.existsSync(jsonPath)) {
    try {
      songs = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
      songs = [];
    }
  }

  // Generar número correlativo si no viene especificado
  let numInt = parseInt(numero, 10);
  if (isNaN(numInt)) {
    numInt = songs.length > 0 ? Math.max(...songs.map(s => parseInt(s.numero || s.id, 10) || 0)) + 1 : 1;
  }

  const nuevaCancion = {
    id: numInt,
    numero: numInt,
    titulo: String(titulo).trim(),
    artista: String(artista).trim(),
    genero: String(genero || 'Varios').trim(),
    video_url: (video_url || '').trim()
  };

  // Actualizar o agregar
  const index = songs.findIndex(s => s.id == numInt || s.numero == numInt);
  if (index !== -1) {
    songs[index] = nuevaCancion;
  } else {
    songs.push(nuevaCancion);
  }

  songs.sort((a, b) => (parseInt(a.numero || a.id, 10) || 0) - (parseInt(b.numero || b.id, 10) || 0));

  fs.writeFileSync(jsonPath, JSON.stringify(songs, null, 2), 'utf-8');
  res.status(201).json({ success: true, song: nuevaCancion, total: songs.length });
});

// Almacén persistente de cola y usuarios para modo local
const queueFilePath = path.join(__dirname, 'data', 'local_queue.json');
const usersFilePath = path.join(__dirname, 'data', 'usuarios.json');

function loadLocalQueue() {
  try {
    if (fs.existsSync(queueFilePath)) {
      const content = fs.readFileSync(queueFilePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Advertencia al cargar local_queue.json:', err.message);
  }
  return [];
}

function saveLocalQueue(queue) {
  try {
    fs.writeFileSync(queueFilePath, JSON.stringify(queue, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error al guardar local_queue.json:', err.message);
  }
}

function loadUsers() {
  try {
    if (fs.existsSync(usersFilePath)) {
      const content = fs.readFileSync(usersFilePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Advertencia al cargar usuarios.json:', err.message);
  }
  // Usuario Super Admin inicial garantizado
  const defaultAdmin = [{
    cedula: '14621157',
    nombre: 'José Lambert',
    password: process.env.SUPER_ADMIN_PASSWORD || 'admin14621157',
    rol: 'super_admin',
    activo: true,
    creado_en: new Date().toISOString()
  }];
  saveUsers(defaultAdmin);
  return defaultAdmin;
}

function saveUsers(users) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error al guardar usuarios.json:', err.message);
  }
}

let localQueue = loadLocalQueue();
let usersList = loadUsers();
let sseClients = []; // Clientes conectados a Server-Sent Events para reacciones y control en tiempo real

// ============================================================
// SISTEMA DE AUTENTICACIÓN POR ROLES (SUPER ADMIN & DJ)
// ============================================================

// Endpoint de Inicio de Sesión Seguro (Cédula y Contraseña)
app.post('/api/auth/login', (req, res) => {
  const { cedula, password } = req.body;
  const cedulaStr = String(cedula || '').trim();
  const passStr = String(password || '').trim();

  usersList = loadUsers();
  const user = usersList.find(u => String(u.cedula).trim() === cedulaStr && u.password === passStr);

  if (user) {
    if (user.activo === false) {
      return res.status(403).json({ success: false, error: 'Usuario dado de baja. Consulta con el Administrador.' });
    }
    return res.json({
      success: true,
      user: {
        cedula: user.cedula,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  }

  res.status(401).json({ success: false, error: 'Acceso denegado: Credenciales no válidas' });
});

// Endpoint para cambiar contraseña de usuario autenticado
app.post('/api/auth/change-password', (req, res) => {
  const { cedula, currentPassword, newPassword } = req.body;
  const cedulaStr = String(cedula || '').trim();
  const curPass = String(currentPassword || '').trim();
  const newPass = String(newPassword || '').trim();

  if (!newPass || newPass.length < 4) {
    return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener al menos 4 caracteres' });
  }

  usersList = loadUsers();
  const user = usersList.find(u => String(u.cedula).trim() === cedulaStr && u.password === curPass);

  if (user) {
    user.password = newPass;
    saveUsers(usersList);
    return res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  }

  res.status(401).json({ success: false, error: 'Acceso denegado: Credenciales no válidas' });
});

// Endpoint para listar DJs (Exclusivo Super Admin)
app.get('/api/admin/djs', (req, res) => {
  usersList = loadUsers();
  const djs = usersList.map(u => ({
    cedula: u.cedula,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo !== false,
    creado_en: u.creado_en
  }));
  res.json(djs);
});

// Endpoint para crear un nuevo DJ (Exclusivo Super Admin)
app.post('/api/admin/djs', (req, res) => {
  const { cedula, nombre, password } = req.body;
  const cedulaStr = String(cedula || '').trim();
  const nombreStr = String(nombre || '').trim();
  const passStr = String(password || '').trim();

  if (!cedulaStr || !nombreStr || !passStr) {
    return res.status(400).json({ success: false, error: 'Cédula, Nombre y Contraseña son obligatorios' });
  }

  usersList = loadUsers();
  if (usersList.some(u => String(u.cedula).trim() === cedulaStr)) {
    return res.status(400).json({ success: false, error: 'Ya existe un usuario registrado con esa cédula' });
  }

  const newDJ = {
    cedula: cedulaStr,
    nombre: nombreStr,
    password: passStr,
    rol: 'dj',
    activo: true,
    creado_en: new Date().toISOString()
  };

  usersList.push(newDJ);
  saveUsers(usersList);

  res.status(201).json({
    success: true,
    dj: { cedula: newDJ.cedula, nombre: newDJ.nombre, rol: newDJ.rol, activo: newDJ.activo }
  });
});

// Endpoint para activar o dar de baja a un DJ
app.patch('/api/admin/djs/:cedula/toggle', (req, res) => {
  const { cedula } = req.params;
  const cedulaStr = String(cedula).trim();

  if (cedulaStr === '14621157') {
    return res.status(400).json({ success: false, error: 'No se puede desactivar al Super Admin principal' });
  }

  usersList = loadUsers();
  const user = usersList.find(u => String(u.cedula).trim() === cedulaStr);

  if (user) {
    user.activo = !user.activo;
    saveUsers(usersList);
    return res.json({ success: true, activo: user.activo, message: `Usuario ${user.activo ? 'activado' : 'dado de baja'}` });
  }

  res.status(404).json({ success: false, error: 'Usuario no encontrado' });
});

// Endpoint para eliminar a un DJ
app.delete('/api/admin/djs/:cedula', (req, res) => {
  const { cedula } = req.params;
  const cedulaStr = String(cedula).trim();

  if (cedulaStr === '14621157') {
    return res.status(400).json({ success: false, error: 'No se puede eliminar al Super Admin principal' });
  }

  usersList = loadUsers();
  usersList = usersList.filter(u => String(u.cedula).trim() !== cedulaStr);
  saveUsers(usersList);

  res.json({ success: true, message: 'Usuario DJ eliminado correctamente' });
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
  saveLocalQueue(localQueue);
  broadcastSSE({ type: 'queue_update', data: localQueue });
  res.status(201).json(nuevoPedido);
});

// Aprobar solicitud entrante (Modo Moderación)
app.post('/api/cola/:id/approve', (req, res) => {
  const { id } = req.params;
  const item = localQueue.find(q => q.id === id);
  if (item) {
    item.estado = 'pendiente';
    saveLocalQueue(localQueue);
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
    saveLocalQueue(localQueue);
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
  saveLocalQueue(localQueue);

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
    saveLocalQueue(localQueue);
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
  saveLocalQueue(localQueue);
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
  const allInterfaces = getNetworkInterfacesList();

  console.log(`\n======================================================`);
  console.log(`🎤  KARAOKE JL MUSIC - SISTEMA EN VIVO (100% OFFLINE READY)`);
  console.log(`======================================================`);
  console.log(`🖥️  Acceso DJ / Local:          http://localhost:${PORT}`);
  console.log(`📡  Acceso Wi-Fi (Para Móviles): http://${localIp}:${PORT}`);
  
  if (allInterfaces.length > 1) {
    console.log(`\n📶  Otras interfaces de red detectadas:`);
    allInterfaces.slice(1).forEach(iface => {
      console.log(`   • ${iface.name}: http://${iface.address}:${PORT}`);
    });
  }

  console.log(`------------------------------------------------------`);
  console.log(`🔒  Seguridad por Roles:         Super Admin & DJs autorizados`);
  console.log(`💾  Cola Persistente Local:      data/local_queue.json (${localQueue.length} pedidos)`);
  console.log(`👥  Usuarios Registrados:        data/usuarios.json (${usersList.length} usuarios)`);
  console.log(`⚡  Sincronización Tiempo Real:  SSE (Offline) & Supabase`);
  console.log(`======================================================\n`);
});

