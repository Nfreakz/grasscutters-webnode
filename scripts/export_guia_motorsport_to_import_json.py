#!/usr/bin/env python3
"""Exporta una Guía Motorsport local (ZIP, carpeta o SQLite) a JSON normalizado.

Acepta un ZIP separado por categorías, una carpeta extraída o un SQLite maestro.
Usa solo librería estándar de Python.
"""
import argparse, csv, hashlib, json, math, re, sqlite3, tempfile, unicodedata, zipfile
from pathlib import Path

TABLE_MAP = {
    'guia_continentes': 'continents', 'guia_paises': 'countries', 'guia_circuitos': 'circuits',
    'guia_layouts': 'layouts', 'guia_curvas': 'corners', 'guia_series': 'series',
    'guia_personas': 'people', 'guia_constructores': 'constructors', 'guia_vehiculos': 'vehicles',
    'guia_records': 'records', 'guia_media': 'media', 'guia_aliases': 'aliases',
    'guia_relaciones': 'relations', 'guia_glosario': 'glossary', 'guia_fuentes': 'sources',
    'guia_circuitos_series': 'circuitSeries', 'guia_quality_issues': 'qualityIssues',
    'guia_import_batches': 'sourceBatches', 'guia_diccionario_campos': 'fieldDictionary'
}
MEDIA_TYPES = {'foto', 'plano', 'mapa', 'layout', 'logo', 'referencia', 'oficial'}
OUT_KEYS = ['continents', 'countries', 'circuits', 'layouts', 'corners', 'series', 'circuitSeries',
            'people', 'constructors', 'vehicles', 'records', 'media', 'aliases', 'relations',
            'glossary', 'sources', 'qualityIssues', 'sourceBatches', 'fieldDictionary']
ID_KEYS = {'id', 'legacy_id', 'pais_id', 'continente_id', 'country_id', 'continent_id', 'circuito_id',
           'circuit_id', 'layout_id', 'curva_id', 'corner_id', 'persona_id', 'person_id', 'vehiculo_id',
           'vehicle_id', 'constructor_id', 'serie_id', 'campeonato_id', 'series_id', 'entidad_id',
           'entity_id', 'target_id', 'objetivo_id', 'destino_id'}
ENTITY_TYPES = {
    'circuito': 'circuit', 'circuitos': 'circuit', 'circuit': 'circuit',
    'layout': 'layout', 'layouts': 'layout',
    'curva': 'corner', 'curvas': 'corner', 'corner': 'corner',
    'persona': 'person', 'personas': 'person', 'piloto': 'person', 'pilotos': 'person', 'person': 'person',
    'vehiculo': 'vehicle', 'vehículo': 'vehicle', 'vehiculos': 'vehicle', 'vehículos': 'vehicle', 'vehicle': 'vehicle',
    'constructor': 'constructor', 'constructores': 'constructor',
    'serie': 'series', 'series': 'series', 'campeonato': 'series', 'campeonatos': 'series',
}
TRUE_VALUES = {'1', 'true', 'yes', 'si', 'sí', 'y', 't'}


def first(row, *keys):
    for key in keys:
        value = row.get(key)
        if value is not None and value != '':
            return value
    return None


def normalize_id(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        return '1' if value else '0'
    if isinstance(value, (int,)):
        return str(value)
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    raw = str(value).strip()
    if not raw:
        return None
    if re.fullmatch(r'-?\d+\.0+', raw):
        return raw.split('.')[0]
    return raw


def to_int(value):
    value = normalize_id(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def to_float(value):
    if value is None or value == '':
        return None
    try:
        number = float(str(value).replace(',', '.'))
        return None if math.isnan(number) else number
    except (TypeError, ValueError):
        return None


def to_bool(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in TRUE_VALUES


def slugify(value):
    value = str(value or '').strip().lower()
    value = unicodedata.normalize('NFD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^a-z0-9]+', '-', value).strip('-')
    return value or None


def clean_row(row):
    out = {}
    for k, v in dict(row).items():
        key = k.strip().lower()
        if isinstance(v, str):
            v = v.strip()
        if v == '':
            v = None
        if key in ID_KEYS or key.endswith('_id'):
            v = normalize_id(v)
        out[key] = v
    return out


def stable_id(prefix, row, *basis_values):
    basis = next((normalize_id(v) for v in basis_values if normalize_id(v)), None)
    if not basis:
        basis = json.dumps(row, ensure_ascii=False, sort_keys=True)
    return f'{prefix}-{slugify(basis) or hashlib.sha1(str(basis).encode("utf-8")).hexdigest()[:16]}'


def normalize_entity_type(value):
    raw = str(value or '').strip().lower()
    return ENTITY_TYPES.get(raw, raw or None)


def normalize_common(row, key, *basis_values):
    row['id'] = normalize_id(row.get('id')) or stable_id(key.rstrip('s'), row, row.get('slug'), row.get('legacy_id'), *basis_values)
    if not row.get('legacy_id'):
        row['legacy_id'] = row['id']
    return row


def normalize_entity(key, raw_row):
    row = clean_row(raw_row)
    name = first(row, 'name', 'nombre', 'title', 'titulo', 'term', 'termino')

    if key == 'circuits':
        out = {
            **row,
            'id': normalize_id(first(row, 'id', 'circuito_id')),
            'legacy_id': normalize_id(first(row, 'legacy_id', 'id', 'circuito_id')),
            'name': name,
            'slug': first(row, 'slug') or slugify(name),
            'country_id': normalize_id(first(row, 'country_id', 'pais_id')),
            'country': first(row, 'country', 'pais'),
            'continent_id': normalize_id(first(row, 'continent_id', 'continente_id')),
            'continent': first(row, 'continent', 'continente'),
            'location': first(row, 'location', 'ubicacion', 'localidad', 'region'),
            'type': first(row, 'type', 'tipo', 'tipo_catalogo', 'circuit_type'),
            'circuit_type': first(row, 'circuit_type', 'type', 'tipo', 'tipo_catalogo'),
            'turns': to_int(first(row, 'turns', 'curvas')),
            'direction': first(row, 'direction', 'direccion'),
            'surface': first(row, 'surface', 'superficie'),
            'fia_grade': first(row, 'fia_grade', 'fia_grado'),
            'opened_year': to_int(first(row, 'opened_year', 'anio_apertura', 'año_apertura')),
            'latitude': to_float(first(row, 'latitude', 'latitud')),
            'longitude': to_float(first(row, 'longitude', 'longitud')),
            'descriptionShort': first(row, 'descriptionShort', 'description_short', 'descripcion_corta'),
            'description': first(row, 'description', 'descripcion_larga', 'descripcion', 'descriptionLong'),
            'official_url': first(row, 'official_url', 'web_oficial'),
            'wikipedia_url': first(row, 'wikipedia_url', 'url_wikipedia'),
        }
        km = to_float(first(row, 'longitud_km'))
        out['length_meters'] = to_int(first(row, 'length_meters', 'longitud_m', 'longitud_metros')) or (int(round(km * 1000)) if km is not None else None)
        return normalize_common(out, 'circuits', name)

    if key == 'media':
        entity_type = normalize_entity_type(first(row, 'entity_type', 'entidad_tipo'))
        entity_id = normalize_id(first(row, 'entity_id', 'entidad_id'))
        fallbacks = [('circuit', 'circuito_id'), ('layout', 'layout_id'), ('corner', 'curva_id'), ('person', 'persona_id'), ('vehicle', 'vehiculo_id')]
        for fallback_type, fallback_key in fallbacks:
            if not entity_id and row.get(fallback_key):
                entity_type, entity_id = fallback_type, normalize_id(row.get(fallback_key))
        media_type = str(first(row, 'media_type', 'tipo', 'type') or 'referencia').lower()
        if media_type not in MEDIA_TYPES:
            media_type = 'referencia'
        out = {
            **row,
            'id': normalize_id(row.get('id')),
            'legacy_id': normalize_id(first(row, 'legacy_id', 'id')),
            'entity_type': entity_type,
            'entity_id': entity_id,
            'media_type': media_type,
            'url': first(row, 'url_normalizada', 'url', 'src', 'href'),
            'title': first(row, 'title', 'titulo'),
            'alt_text': first(row, 'alt_text', 'alt'),
            'description': first(row, 'description', 'descripcion'),
            'source_url': first(row, 'source_url', 'fuente_url'),
            'author': first(row, 'author', 'autor'),
            'credit': first(row, 'credit', 'autor'),
            'license': first(row, 'license', 'licencia'),
            'is_primary': to_bool(first(row, 'is_primary', 'principal_publica', 'principal')),
            'is_technical_primary': to_bool(first(row, 'is_technical_primary', 'principal_tecnica')),
            'is_publicable': (media_type not in ('referencia', 'oficial')) if first(row, 'es_imagen_publicable') is None else to_bool(first(row, 'es_imagen_publicable')),
            'sort_order': to_int(first(row, 'sort_order', 'orden')) or 0,
        }
        return normalize_common(out, 'media', out.get('url'))

    if key == 'records':
        tipo = first(row, 'tipo_record', 'type', 'tipo')
        categoria = first(row, 'category', 'categoria')
        tiempo = first(row, 'value', 'tiempo', 'time')
        title = first(row, 'title', 'titulo') or ' · '.join(str(x) for x in (tipo, categoria, tiempo) if x)
        out = {
            **row,
            'id': normalize_id(row.get('id')),
            'legacy_id': normalize_id(first(row, 'legacy_id', 'id')),
            'circuit_id': normalize_id(first(row, 'circuit_id', 'circuito_id')),
            'layout_id': normalize_id(first(row, 'layout_id')),
            'vehicle_id': normalize_id(first(row, 'vehicle_id', 'vehiculo_id')),
            'person_id': normalize_id(first(row, 'person_id', 'persona_id')),
            'series_id': normalize_id(first(row, 'series_id', 'serie_id', 'campeonato_id')),
            'title': title or 'Record',
            'category': categoria,
            'value': tiempo,
            'value_ms': to_int(first(row, 'value_ms', 'tiempo_ms')),
            'driver': first(row, 'driver', 'piloto'),
            'vehicle': first(row, 'vehicle', 'vehiculo'),
            'team': first(row, 'team', 'equipo'),
            'year': to_int(first(row, 'year', 'anio', 'año')),
            'record_date': first(row, 'record_date', 'fecha'),
            'source_url': first(row, 'source_url', 'fuente_url'),
        }
        return normalize_common(out, 'records', title, out.get('circuit_id'))

    if key == 'aliases':
        alias = first(row, 'alias', 'name', 'nombre')
        out = {
            **row,
            'id': normalize_id(row.get('id')),
            'entity_type': normalize_entity_type(first(row, 'entity_type', 'entidad_tipo')),
            'entity_id': normalize_id(first(row, 'entity_id', 'entidad_id')),
            'alias': alias,
            'normalized_alias': first(row, 'normalized_alias', 'alias_normalizado') or slugify(alias),
        }
        return normalize_common(out, 'aliases', alias, out.get('entity_id'))


    if key == 'relations':
        out = {
            **row,
            'id': normalize_id(row.get('id')),
            'entity_type': normalize_entity_type(first(row, 'entity_type', 'entidad_tipo')),
            'entity_id': normalize_id(first(row, 'entity_id', 'entidad_id')),
            'target_type': normalize_entity_type(first(row, 'target_type', 'objetivo_tipo', 'target_tipo', 'destino_tipo')),
            'target_id': normalize_id(first(row, 'target_id', 'objetivo_id', 'destino_id')),
            'relation_type': first(row, 'relation_type', 'tipo_relacion', 'tipo') or 'relacionado',
            'description': first(row, 'description', 'descripcion_larga', 'descripcion'),
        }
        return normalize_common(out, 'relations', out.get('entity_id'), out.get('target_id'), out.get('relation_type'))

    if key == 'sources':
        out = {
            **row,
            'id': normalize_id(row.get('id')),
            'entity_type': normalize_entity_type(first(row, 'entity_type', 'entidad_tipo')),
            'entity_id': normalize_id(first(row, 'entity_id', 'entidad_id')),
            'title': first(row, 'title', 'titulo', 'name', 'nombre', 'url'),
            'url': first(row, 'url'),
            'source_type': first(row, 'source_type', 'tipo_fuente', 'tipo'),
        }
        return normalize_common(out, 'sources', out.get('entity_id'), out.get('url'))

    if key == 'people':
        row['name'] = name
        row['slug'] = first(row, 'slug') or slugify(name or row.get('legacy_id') or row.get('id'))
        row['country_id'] = normalize_id(first(row, 'country_id', 'pais_id'))
        row['role'] = first(row, 'role', 'rol', 'tipo')
        row['description'] = first(row, 'description', 'descripcion_larga', 'descripcion')
        row['birth_date'] = first(row, 'birth_date', 'fecha_nacimiento')
        return normalize_common(row, 'people', name)

    if key == 'vehicles':
        row['name'] = name
        row['slug'] = first(row, 'slug') or slugify(name or row.get('legacy_id') or row.get('id'))
        row['constructor_id'] = normalize_id(first(row, 'constructor_id'))
        row['category'] = first(row, 'category', 'categoria')
        row['year'] = to_int(first(row, 'year', 'anio', 'año'))
        row['description'] = first(row, 'description', 'descripcion_larga', 'descripcion')
        return normalize_common(row, 'vehicles', name)

    if key == 'constructors':
        row['name'] = name
        row['slug'] = first(row, 'slug') or slugify(name or row.get('legacy_id') or row.get('id'))
        row['country_id'] = normalize_id(first(row, 'country_id', 'pais_id'))
        row['description'] = first(row, 'description', 'descripcion_larga', 'descripcion')
        return normalize_common(row, 'constructors', name)

    if key == 'series':
        row['name'] = name
        row['slug'] = first(row, 'slug') or slugify(name or row.get('legacy_id') or row.get('id'))
        row['category'] = first(row, 'category', 'categoria')
        row['description'] = first(row, 'description', 'descripcion_larga', 'descripcion')
        return normalize_common(row, 'series', name)

    if key == 'circuitSeries':
        out = {
            **row,
            'id': normalize_id(row.get('id')),
            'circuit_id': normalize_id(first(row, 'circuit_id', 'circuito_id')),
            'series_id': normalize_id(first(row, 'series_id', 'serie_id', 'campeonato_id')),
        }
        return normalize_common(out, 'circuit-series', out.get('circuit_id'), out.get('series_id'))

    if key == 'layouts':
        row['circuit_id'] = normalize_id(first(row, 'circuit_id', 'circuito_id'))
    if key == 'corners':
        row['circuit_id'] = normalize_id(first(row, 'circuit_id', 'circuito_id'))
        row['layout_id'] = normalize_id(first(row, 'layout_id'))
        row['corner_number'] = to_int(first(row, 'corner_number', 'numero', 'orden'))
    if key == 'countries':
        row['continent_id'] = normalize_id(first(row, 'continent_id', 'continente_id'))
        row['iso2'] = first(row, 'iso2', 'country_code', 'codigo_iso2')
    if key in ('series', 'people', 'constructors', 'vehicles', 'layouts', 'corners', 'countries', 'continents'):
        row['name'] = name
        row['slug'] = first(row, 'slug') or slugify(name or row.get('legacy_id') or row.get('id'))
    if key == 'glossary':
        row['term'] = first(row, 'term', 'termino', 'name', 'nombre')
        row['definition'] = first(row, 'definition', 'definicion', 'description', 'descripcion')
        row['slug'] = first(row, 'slug') or slugify(row.get('term'))
    return normalize_common(row, key, name)


def read_sqlite(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    names = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    data = {k: [] for k in OUT_KEYS}
    for table, key in TABLE_MAP.items():
        if table in names:
            rows = con.execute(f'SELECT * FROM "{table}"').fetchall()
            data[key].extend(normalize_entity(key, r) for r in rows)
    con.close()
    return data


def read_csv_folder(folder):
    data = {k: [] for k in OUT_KEYS}
    for file in Path(folder).rglob('*'):
        if file.suffix.lower() not in ('.csv', '.json'):
            continue
        stem = file.stem.lower()
        key = TABLE_MAP.get(stem)
        if not key:
            continue
        if file.suffix.lower() == '.json':
            raw = json.loads(file.read_text(encoding='utf-8'))
            rows = raw if isinstance(raw, list) else raw.get(key) or raw.get(stem) or []
        else:
            with file.open(newline='', encoding='utf-8-sig') as fh:
                rows = list(csv.DictReader(fh))
        data[key].extend(normalize_entity(key, r) for r in rows)
    return data


def merge(a, b):
    for k, v in b.items():
        a.setdefault(k, []).extend(v)
    return a


def export(input_path):
    p = Path(input_path)
    if not p.exists():
        raise SystemExit(f'Ruta de entrada no existe: {input_path}')
    tmp = None
    if zipfile.is_zipfile(p):
        tmp = tempfile.TemporaryDirectory()
        with zipfile.ZipFile(p) as z:
            z.extractall(tmp.name)
        p = Path(tmp.name)
    data = {k: [] for k in OUT_KEYS}
    if p.is_file():
        merge(data, read_sqlite(p))
    else:
        sqlite_files = list(p.rglob('*.sqlite')) + list(p.rglob('*.sqlite3')) + list(p.rglob('*.db'))
        if sqlite_files:
            for db in sqlite_files:
                merge(data, read_sqlite(db))
        merge(data, read_csv_folder(p))
    summary = {k: len(data.get(k, [])) for k in OUT_KEYS}
    summary.update({'source': str(input_path), 'format': 'gc_motorsport_import_v1'})
    return {'version': 1, 'kind': 'gc_motorsport_import', 'summary': summary, **data}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('-o', '--output', default='data/imports/guia_motorsport_import.json')
    args = ap.parse_args()
    payload = export(args.input)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
    print(json.dumps(payload['summary'], ensure_ascii=False, indent=2))
    print(f'JSON generado: {out}')


if __name__ == '__main__':
    main()
