#!/usr/bin/env python3
"""Exporta una Guía Motorsport local (ZIP, carpeta o SQLite) a JSON normalizado."""
import argparse, csv, hashlib, json, os, re, sqlite3, tempfile, zipfile
from pathlib import Path

TABLE_MAP = {
    'guia_continentes':'continents','guia_paises':'countries','guia_circuitos':'circuits','guia_layouts':'layouts','guia_curvas':'corners','guia_series':'series','guia_personas':'people','guia_constructores':'constructors','guia_vehiculos':'vehicles','guia_records':'records','guia_media':'media','guia_aliases':'aliases','guia_relaciones':'relations','guia_glosario':'glossary','guia_fuentes':'sources','guia_circuitos_series':'circuitSeries','guia_quality_issues':'qualityIssues','guia_import_batches':'sourceBatches','guia_diccionario_campos':'fieldDictionary'
}
MEDIA_TYPES = {'foto','plano','mapa','layout','logo','referencia','oficial'}
OUT_KEYS = ['continents','countries','circuits','layouts','corners','series','circuitSeries','people','constructors','vehicles','records','media','aliases','relations','glossary','sources','qualityIssues','sourceBatches','fieldDictionary']

def slugify(value):
    value = str(value or '').strip().lower()
    value = value.encode('ascii','ignore').decode('ascii')
    value = re.sub(r'[^a-z0-9]+','-',value).strip('-')
    return value or None

def clean_row(row):
    out = {}
    for k,v in dict(row).items():
        key = k.strip().lower()
        if isinstance(v, str): v = v.strip()
        if v == '': v = None
        out[key] = v
    return out

def normalize_entity(key, row):
    row = clean_row(row)
    if 'legacy_id' not in row and 'id' in row: row['legacy_id'] = str(row['id'])
    name = row.get('name') or row.get('nombre') or row.get('title') or row.get('titulo') or row.get('term') or row.get('termino')
    if name and 'name' not in row and key not in ('glossary','records','sources','media','aliases','relations','circuitSeries'):
        row['name'] = name
    if key == 'glossary':
        row['term'] = row.get('term') or row.get('termino') or row.get('name') or row.get('nombre')
        row['definition'] = row.get('definition') or row.get('definicion') or row.get('description') or row.get('descripcion')
    if key == 'media':
        row['media_type'] = str(row.get('media_type') or row.get('type') or row.get('tipo') or 'referencia').lower()
        if row['media_type'] not in MEDIA_TYPES: row['media_type'] = 'referencia'
        row['url'] = row.get('url') or row.get('src') or row.get('href')
        row['is_primary'] = str(row.get('is_primary') or row.get('principal') or '').lower() in ('1','true','yes','si','sí')
        row['sort_order'] = int(row.get('sort_order') or row.get('orden') or 0)
    if key == 'aliases':
        row['alias'] = row.get('alias') or row.get('name') or row.get('nombre')
    if key in ('circuits','layouts','series','people','constructors','vehicles'):
        row['slug'] = row.get('slug') or slugify(name or row.get('legacy_id'))
    if key == 'corners':
        row['slug'] = row.get('slug') or slugify(name or row.get('legacy_id'))
    if key == 'countries':
        row['slug'] = row.get('slug') or slugify(name or row.get('iso2') or row.get('country_code'))
        row['iso2'] = row.get('iso2') or row.get('country_code')
    if key == 'continents':
        row['slug'] = row.get('slug') or slugify(name)
    if key == 'glossary':
        row['slug'] = row.get('slug') or slugify(row.get('term'))
    if not row.get('id'):
        basis = row.get('slug') or row.get('legacy_id') or row.get('url') or row.get('alias') or json.dumps(row, sort_keys=True, ensure_ascii=False)
        row['id'] = f"{key[:-1] if key.endswith('s') else key}-{slugify(basis) or hashlib.sha1(str(basis).encode('utf-8')).hexdigest()[:16]}"
    return row

def read_sqlite(path):
    con = sqlite3.connect(path); con.row_factory = sqlite3.Row
    names = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    data = {k: [] for k in OUT_KEYS}
    for table, key in TABLE_MAP.items():
        if table in names:
            rows = con.execute(f'SELECT * FROM "{table}"').fetchall()
            data[key].extend(normalize_entity(key, r) for r in rows)
    con.close(); return data

def read_csv_folder(folder):
    data = {k: [] for k in OUT_KEYS}
    for file in Path(folder).rglob('*'):
        if file.suffix.lower() not in ('.csv','.json'): continue
        stem = file.stem.lower(); key = TABLE_MAP.get(stem)
        if not key: continue
        if file.suffix.lower() == '.json':
            raw = json.loads(file.read_text(encoding='utf-8'))
            rows = raw if isinstance(raw, list) else raw.get(key) or raw.get(stem) or []
        else:
            with file.open(newline='', encoding='utf-8-sig') as fh: rows = list(csv.DictReader(fh))
        data[key].extend(normalize_entity(key, r) for r in rows)
    return data

def merge(a,b):
    for k,v in b.items(): a.setdefault(k,[]).extend(v)
    return a

def export(input_path):
    p = Path(input_path); tmp = None
    if zipfile.is_zipfile(p):
        tmp = tempfile.TemporaryDirectory();
        with zipfile.ZipFile(p) as z: z.extractall(tmp.name)
        p = Path(tmp.name)
    data = {k: [] for k in OUT_KEYS}
    if p.is_file(): merge(data, read_sqlite(p))
    else:
        sqlite_files = list(p.rglob('*.sqlite')) + list(p.rglob('*.sqlite3')) + list(p.rglob('*.db'))
        if sqlite_files:
            for db in sqlite_files: merge(data, read_sqlite(db))
        merge(data, read_csv_folder(p))
    summary = {k: len(data.get(k, [])) for k in OUT_KEYS}
    summary.update({'source': str(input_path), 'format': 'gc_motorsport_import_v1'})
    return {'version': 1, 'kind': 'gc_motorsport_import', 'summary': summary, **data}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('input'); ap.add_argument('-o','--output', default='data/imports/guia_motorsport_import.json')
    args = ap.parse_args(); payload = export(args.input)
    out = Path(args.output); out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding='utf-8')
    print(json.dumps(payload['summary'], ensure_ascii=False, indent=2))
    print(f'JSON generado: {out}')
if __name__ == '__main__': main()
