"""Uso: python3 scripts/marca/gerar_marca.py docs/marca
(precisa de: pip install uharfbuzz fonttools numpy scikit-image)

Gera o pacote da marca SG Multiconecta (manual v1.0): símbolo, logotipos e ícones em SVG (texto em contornos).
Geometria do símbolo na grade de 22 (largura da haste): haste x=15, y -47..-19 (cápsula 22), ponto (-13,-31) r=10,
repetida a 0°, -120° (azul) e 120° (âmbar) em volta do centro (0,0). Conferida contra o manual (IoU ~0,98)."""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from textpath import outline

FONTS = os.path.join(os.path.dirname(__file__), 'fontes')
COR = {'violeta': '#5B3FD6', 'azul': '#1B9FE8', 'ambar': '#FFC220', 'tinta': '#0F1222', 'lilas': '#9485FF', 'nevoa': '#F4F3FB', 'branco': '#FFFFFF', 'cinza': '#5A5F73'}
# esquemas: cores das 3 figuras, do nome e da assinatura
ESQUEMAS = {
    'cores': (COR['violeta'], COR['azul'], COR['ambar'], COR['tinta'], COR['violeta']),
    'negativo': (COR['lilas'], COR['azul'], COR['ambar'], COR['branco'], COR['lilas']),
    'preto': (COR['tinta'],) * 5,
    'branco': (COR['branco'],) * 5,
}
SYM_BBOX = (-59.203, -58.0, 44.203, 47.49)  # x0, y0, x1, y1 (unidades)

def figura(cor, rot):
    t = f' transform="rotate({rot})"' if rot else ''
    return f'<g fill="{cor}"{t}><rect x="4" y="-58" width="22" height="50" rx="11"/><circle cx="-13" cy="-31" r="10"/></g>'

def simbolo(esq, dx=0.0, dy=0.0, k=1.0):
    v, b, a = ESQUEMAS[esq][:3]
    tr = f' transform="translate({dx:.3f} {dy:.3f}){" scale(%g)" % k if k != 1 else ""}"'
    return f'<g{tr}>' + figura(v, 0) + figura(b, -120) + figura(a, 120) + '</g>'

def texto(txt, peso, tamanho, x, base, tracking, cor):
    d, polys, adv = outline(os.path.join(FONTS, f'PJS-{peso}-clean.ttf'), txt, tracking, size=tamanho, x0=x, y0=base)
    xs = [p[0] for c in polys for p in c]; ys = [p[1] for c in polys for p in c]
    return f'<path fill="{cor}" d="{d}"/>', (min(xs), min(ys), max(xs), max(ys))

def svg(conteudo, bbox, margem, titulo='SG Multiconecta', fundo=None):
    x0, y0, x1, y1 = bbox
    x0 -= margem; y0 -= margem; x1 += margem; y1 += margem
    w, h = x1 - x0, y1 - y0
    bg = f'<rect x="{x0:.3f}" y="{y0:.3f}" width="{w:.3f}" height="{h:.3f}" fill="{fundo}"/>' if fundo else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.3f} {y0:.3f} {w:.3f} {h:.3f}" width="{w:.2f}" height="{h:.2f}" role="img" aria-label="{titulo}">'
            f'<title>{titulo}</title>{bg}{conteudo}</svg>')

def uniao(*bbs):
    return (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))

# Medidas tiradas do manual (unidades da grade do símbolo; centro de rotação do símbolo em 0,0)
HORIZ = {'sg': ('ExtraBold', 87.57, 79.19, 2.24, -0.02), 'mc': ('ExtraBold', 37.50, 79.42, 44.27, -0.01), 'sig': ('Bold', 11.10, 81.88, 65.37, 0.035)}
VERT = {'sg': ('ExtraBold', 80.90, 138.57, -0.02), 'mc': ('ExtraBold', 34.59, 177.31, -0.01), 'sig': ('Bold', 10.23, 196.79, 0.035)}
ASSINATURA = 'CRM E ATENDIMENTO EM UM SÓ SISTEMA'

def logo_horizontal(esq, assinatura=True):
    v, b, a, nome, sig = ESQUEMAS[esq]
    partes = [simbolo(esq)]; bbs = [SYM_BBOX]
    for chave, txt, cor in (('sg', 'SG', nome), ('mc', 'Multiconecta', nome)) + ((('sig', ASSINATURA, sig),) if assinatura else ()):
        peso, tam, x, base, tr = HORIZ[chave]
        p, bb = texto(txt, peso, tam, x, base, tr, cor); partes.append(p); bbs.append(bb)
    return ''.join(partes), uniao(*bbs)

def logo_vertical(esq):
    v, b, a, nome, sig = ESQUEMAS[esq]
    partes = [simbolo(esq)]; bbs = [SYM_BBOX]
    for chave, txt, cor in (('sg', 'SG', nome), ('mc', 'Multiconecta', nome), ('sig', ASSINATURA, sig)):
        peso, tam, base, tr = VERT[chave]
        _, bb = texto(txt, peso, tam, 0, base, tr, cor)
        x = -(bb[0] + bb[2]) / 2  # centraliza pela tinta
        p, bb = texto(txt, peso, tam, x, base, tr, cor); partes.append(p); bbs.append(bb)
    return ''.join(partes), uniao(*bbs)

ICON_LADO = 192.7      # lado do quadrado do ícone (símbolo como no manual, centro de rotação no meio)
ICON_RAIO = 0.215      # raio do canto / lado

def icone(fundo, esq, lado=ICON_LADO, redondo=False):
    h = lado / 2
    forma = f'<circle cx="0" cy="0" r="{h:.3f}" fill="{fundo}"/>' if redondo else f'<rect x="{-h:.3f}" y="{-h:.3f}" width="{lado:.3f}" height="{lado:.3f}" rx="{lado * ICON_RAIO:.3f}" fill="{fundo}"/>'
    return forma + simbolo(esq), (-h, -h, h, h)

def gerar(saida):
    os.makedirs(saida, exist_ok=True)
    arquivos = {}
    for esq in ESQUEMAS:
        arquivos[f'simbolo-{esq}.svg'] = svg(simbolo(esq), SYM_BBOX, 0.5, 'SG Multiconecta')
        c, bb = logo_horizontal(esq); arquivos[f'logo-horizontal-{esq}.svg'] = svg(c, bb, 0.5)
        c, bb = logo_horizontal(esq, False); arquivos[f'logo-reduzida-{esq}.svg'] = svg(c, bb, 0.5)
        c, bb = logo_vertical(esq); arquivos[f'logo-vertical-{esq}.svg'] = svg(c, bb, 0.5)
    for nome, fundo, esq, red in (('icone-tinta', COR['tinta'], 'negativo', False), ('icone-violeta', COR['violeta'], 'branco', False),
                                  ('icone-branco', COR['branco'], 'cores', False), ('avatar-tinta', COR['tinta'], 'negativo', True)):
        c, bb = icone(fundo, esq, redondo=red); arquivos[f'{nome}.svg'] = svg(c, bb, 0)
    c, bb = icone(COR['tinta'], 'negativo'); c = c.replace(f'rx="{ICON_LADO * ICON_RAIO:.3f}"', 'rx="0"')
    arquivos['icone-tinta-sangrado.svg'] = svg(c, bb, 0)
    arquivos['selo-branco.svg'] = svg(simbolo('branco'), (-70, -70, 70, 70), 0)
    for n, s in arquivos.items():
        open(os.path.join(saida, n), 'w').write(s)
    return list(arquivos)

if __name__ == '__main__':
    print('\n'.join(gerar(sys.argv[1])))
