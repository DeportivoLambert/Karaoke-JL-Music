import json

with open('data/canciones.json', 'r', encoding='utf-8') as f:
    songs = json.load(f)

lines = [
    '-- ============================================================',
    '-- SEED DATA: 557 CANCIONES PARA KARAOKE JL MUSIC',
    '-- ============================================================',
    '',
    'INSERT INTO canciones (id, numero, titulo, artista, genero, video_url) VALUES'
]

val_rows = []
for s in songs:
    num = s['numero']
    title = s['titulo'].replace("'", "''")
    artist = s['artista'].replace("'", "''")
    genre = s['genero'].replace("'", "''")
    vurl = s['video_url'].replace("'", "''")
    val_rows.append(f"({num}, {num}, '{title}', '{artist}', '{genre}', '{vurl}')")

lines.append(',\n'.join(val_rows))
lines.append('ON CONFLICT (numero) DO UPDATE SET titulo = EXCLUDED.titulo, artista = EXCLUDED.artista, genero = EXCLUDED.genero, video_url = EXCLUDED.video_url;')
lines.append('')
lines.append('-- Ajustar secuencia')
lines.append("SELECT setval('canciones_id_seq', coalesce((SELECT max(id) + 1 FROM canciones), 1), false);")

with open('seed_canciones.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f'Generated seed_canciones.sql with {len(songs)} rows.')
