-- ============================================================
-- KARAOKE JL MUSIC - ESQUEMA DE BASE DE DATOS (SUPABASE)
-- ============================================================

-- 1. Catálogo de Canciones
CREATE TABLE IF NOT EXISTS canciones (
  id BIGSERIAL PRIMARY KEY,
  numero INT UNIQUE NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  artista VARCHAR(255) NOT NULL,
  genero VARCHAR(100),
  video_url TEXT NOT NULL -- Link de YouTube, Drive, archivo local o URL
);

-- Índices para búsqueda ultra rápida
CREATE INDEX IF NOT EXISTS idx_canciones_numero ON canciones(numero);
CREATE INDEX IF NOT EXISTS idx_canciones_titulo ON canciones(titulo);
CREATE INDEX IF NOT EXISTS idx_canciones_artista ON canciones(artista);
CREATE INDEX IF NOT EXISTS idx_canciones_genero ON canciones(genero);

-- 2. Cola de Pedidos en Tiempo Real
CREATE TABLE IF NOT EXISTS cola_pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cancion_id BIGINT REFERENCES canciones(id) ON DELETE CASCADE,
  nombre_usuario VARCHAR(100) NOT NULL,
  estado VARCHAR(20) DEFAULT 'pendiente', -- 'pendiente', 'sonando', 'completado'
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para la cola
CREATE INDEX IF NOT EXISTS idx_cola_estado ON cola_pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_cola_creado_en ON cola_pedidos(creado_en);

-- Habilitar Realtime para la cola de pedidos
ALTER PUBLICATION supabase_realtime ADD TABLE cola_pedidos;

-- ============================================================
-- POLÍTICAS DE SEGURIDAD (ROW LEVEL SECURITY - RLS)
-- ============================================================
-- Habilitar RLS en ambas tablas
ALTER TABLE canciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cola_pedidos ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública de canciones
CREATE POLICY "Permitir lectura publica de canciones" 
  ON canciones FOR SELECT 
  USING (true);

-- Permitir a usuarios anónimos o autenticados insertar pedidos
CREATE POLICY "Permitir insertar pedidos" 
  ON cola_pedidos FOR INSERT 
  WITH CHECK (true);

-- Permitir leer pedidos en tiempo real
CREATE POLICY "Permitir lectura publica de pedidos" 
  ON cola_pedidos FOR SELECT 
  USING (true);

-- Permitir actualizar estado de pedidos (DJ / Admin / Host)
CREATE POLICY "Permitir actualizar pedidos" 
  ON cola_pedidos FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- Permitir eliminar pedidos de la cola
CREATE POLICY "Permitir eliminar pedidos" 
  ON cola_pedidos FOR DELETE 
  USING (true);
