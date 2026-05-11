#!/usr/bin/env python3
"""Valida un JSON normalizado de Guía Motorsport antes del preview/apply."""
import argparse, json, sys
from urllib.parse import urlparse
MEDIA_TYPES={'foto','plano','mapa','layout','logo','referencia','oficial'}
BAD_IMAGE_HOSTS=('wikipedia.org','wikimedia.org')
def valid_url(u):
    if not u: return False
    if str(u).startswith('/'): return True
    p=urlparse(str(u)); return p.scheme in ('http','https') and bool(p.netloc)
def check(path):
    d=json.load(open(path,encoding='utf-8')); issues=[]; warnings=[]
    for key in ('circuits','layouts','series','people','vehicles','constructors','glossary'):
        seen=set()
        for x in d.get(key,[]):
            slug=x.get('slug')
            if slug in seen: issues.append(f'slug duplicado en {key}: {slug}')
            if slug: seen.add(slug)
    for key, rows in d.items():
        if isinstance(rows,list):
            seen=set()
            for x in rows:
                if not isinstance(x,dict): continue
                i=x.get('id')
                if i in seen: issues.append(f'id duplicado en {key}: {i}')
                if i: seen.add(i)
    circuit_ids={c.get('id') for c in d.get('circuits',[])}
    for c in d.get('circuits',[]):
        if not c.get('name') or not c.get('slug'): issues.append(f"circuito sin nombre/slug: {c.get('id')}")
    for l in d.get('layouts',[]):
        if l.get('circuit_id') not in circuit_ids: issues.append(f"layout con circuito inexistente: {l.get('id')}")
    for r in d.get('records',[]):
        if r.get('circuit_id') not in circuit_ids: issues.append(f"record con circuito inexistente: {r.get('id')}")
    covers={}
    for m in d.get('media',[]):
        mt=m.get('media_type') or m.get('type')
        u=m.get('url')
        if mt not in MEDIA_TYPES: issues.append(f'tipo de media inválido: {m.get("id")} -> {mt}')
        if not valid_url(u): issues.append(f'URL de media inválida: {m.get("id")} -> {u}')
        host=urlparse(str(u)).netloc.lower()
        if mt in ('foto','plano','mapa','layout','logo') and any(b in host for b in BAD_IMAGE_HOSTS): issues.append(f'URL de referencia usada como imagen: {m.get("id")} -> {u}')
        if mt in ('referencia','oficial') and m.get('is_primary'): issues.append(f'referencia/oficial marcada como portada: {m.get("id")}')
        if m.get('entity_type')=='circuit' and mt in ('foto','plano','mapa','layout') and valid_url(u):
            covers.setdefault(m.get('entity_id'),[]).append(m)
    for cid, media in covers.items():
        ordered=sorted(media,key=lambda x:(0 if x.get('media_type')=='foto' and x.get('is_primary') else 1 if x.get('media_type')=='foto' else 2 if x.get('is_primary') else 3, x.get('sort_order') or 0, x.get('url') or ''))
        if len(ordered)>1 and ordered[0].get('url')==ordered[1].get('url'): warnings.append(f'portada no ambigua pero hay URL duplicada en circuito {cid}')
    print('Resumen Guía Motorsport')
    for k in ('circuits','layouts','records','media','series','people','vehicles','glossary'): print(f'- {k}: {len(d.get(k,[]))}')
    for w in warnings: print('WARNING:',w)
    for i in issues: print('ERROR:',i)
    return 1 if issues else 0
if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('json_path'); args=ap.parse_args(); sys.exit(check(args.json_path))
