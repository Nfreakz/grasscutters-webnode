#!/usr/bin/env python3
"""Valida un JSON normalizado de Guía Motorsport antes del preview/apply."""
import argparse, json, sys
from urllib.parse import unquote, urlparse

MEDIA_TYPES = {'foto', 'plano', 'mapa', 'layout', 'logo', 'referencia', 'oficial'}
IMAGE_TYPES = {'foto', 'plano', 'mapa', 'layout', 'logo'}
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.svg')


def norm_id(v):
    if v is None or v == '':
        return None
    raw = str(v).strip()
    return raw.split('.')[0] if raw.replace('.', '', 1).lstrip('-').isdigit() and raw.endswith('.0') else raw


def valid_url(u):
    if not u:
        return False
    if str(u).startswith('/'):
        return True
    p = urlparse(str(u))
    return p.scheme in ('http', 'https') and bool(p.netloc)


def direct_image_url(u):
    if str(u).startswith('/'):
        return True
    p = urlparse(str(u))
    path = unquote(p.path).lower()
    return path.endswith(IMAGE_EXTENSIONS)


def image_url_allowed(u):
    if not valid_url(u):
        return False
    raw = str(u)
    if raw.startswith('/'):
        return True
    p = urlparse(raw)
    host = p.netloc.lower()
    path = unquote(p.path)
    lower_path = path.lower()
    if host == 'upload.wikimedia.org':
        return True
    if host == 'commons.wikimedia.org':
        if lower_path.startswith('/wiki/file:'):
            return False
        return lower_path.startswith('/wiki/special:filepath/') or direct_image_url(raw)
    if host.endswith('wikipedia.org') and lower_path.startswith('/wiki/'):
        return False
    return direct_image_url(raw)


def check(path):
    d = json.load(open(path, encoding='utf-8'))
    issues = []
    warnings = []
    for key in ('circuits', 'layouts', 'series', 'people', 'vehicles', 'constructors', 'glossary'):
        seen = set()
        for x in d.get(key, []):
            slug = x.get('slug')
            if slug in seen:
                issues.append(f'slug duplicado en {key}: {slug}')
            if slug:
                seen.add(slug)
    for key, rows in d.items():
        if isinstance(rows, list):
            seen = set()
            for x in rows:
                if not isinstance(x, dict):
                    continue
                i = x.get('id')
                if i in seen:
                    issues.append(f'id duplicado en {key}: {i}')
                if i:
                    seen.add(i)
    circuit_ids = {norm_id(c.get('id')) for c in d.get('circuits', [])}
    for c in d.get('circuits', []):
        if not c.get('name') or not c.get('slug'):
            issues.append(f"circuito sin nombre/slug: {c.get('id')}")
    for l in d.get('layouts', []):
        if norm_id(l.get('circuit_id')) not in circuit_ids:
            issues.append(f"layout con circuito inexistente: {l.get('id')}")
    for r in d.get('records', []):
        if norm_id(r.get('circuit_id')) not in circuit_ids:
            issues.append(f"record con circuito inexistente: {r.get('id')}")
    covers = {}
    for m in d.get('media', []):
        mt = m.get('media_type') or m.get('type')
        u = m.get('url')
        if mt not in MEDIA_TYPES:
            issues.append(f'tipo de media inválido: {m.get("id")} -> {mt}')
        if not valid_url(u):
            issues.append(f'URL de media inválida: {m.get("id")} -> {u}')
        if mt in IMAGE_TYPES and not image_url_allowed(u):
            issues.append(f'URL no válida como imagen publicable: {m.get("id")} -> {u}')
        if mt in ('referencia', 'oficial') and m.get('is_primary'):
            issues.append(f'referencia/oficial marcada como portada: {m.get("id")}')
        if mt in ('referencia', 'oficial') and m.get('is_publicable'):
            warnings.append(f'referencia/oficial marcada como publicable; no contará como imagen: {m.get("id")}')
        if mt in IMAGE_TYPES and m.get('entity_type') == 'circuit':
            entity_id = norm_id(m.get('entity_id'))
            if entity_id not in circuit_ids:
                issues.append(f'media de circuito con entity_id inexistente: {m.get("id")} -> {m.get("entity_id")}')
            elif image_url_allowed(u):
                covers.setdefault(entity_id, []).append(m)
    for cid, media in covers.items():
        ordered = sorted(media, key=lambda x: (0 if x.get('media_type') == 'foto' and x.get('is_primary') else 1 if x.get('media_type') == 'foto' else 2 if x.get('is_primary') else 3, x.get('sort_order') or 0, x.get('url') or ''))
        if len(ordered) > 1 and ordered[0].get('url') == ordered[1].get('url'):
            warnings.append(f'portada no ambigua pero hay URL duplicada en circuito {cid}')
    print('Resumen Guía Motorsport')
    for k in ('circuits', 'layouts', 'records', 'media', 'series', 'people', 'vehicles', 'glossary'):
        print(f'- {k}: {len(d.get(k, []))}')
    for w in warnings:
        print('WARNING:', w)
    for i in issues:
        print('ERROR:', i)
    return 1 if issues else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('json_path')
    args = ap.parse_args()
    sys.exit(check(args.json_path))
