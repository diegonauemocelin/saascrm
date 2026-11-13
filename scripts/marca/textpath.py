"""Texto em Plus Jakarta Sans -> contornos (com kerning do HarfBuzz) -> path SVG e máscara rasterizada (winding não-zero)."""
import numpy as np
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from skimage.draw import polygon as skpoly

FONTS = {}
def font(path):
    if path not in FONTS:
        blob = hb.Blob.from_file_path(path)
        face = hb.Face(blob)
        FONTS[path] = (TTFont(path), hb.Font(face))
    return FONTS[path]

def shape(path, text, tracking_em=0.0):
    """Lista de (glyphName, x, y) em unidades da fonte (UPEM 1000), e avanço total. tracking em em (ex.: 0.12 = +12%)."""
    tt, hf = font(path)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hf, buf, {'kern': True, 'liga': True})
    upem = tt['head'].unitsPerEm
    order = tt.getGlyphOrder()
    x = 0.0; out = []
    n = len(buf.glyph_infos)
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        out.append((order[info.codepoint], x + pos.x_offset, pos.y_offset))
        x += pos.x_advance + (tracking_em * upem if i < n - 1 else 0)
    return out, x

class FlatPen(BasePen):
    """Achata as curvas em polígonos (lista de contornos)."""
    def __init__(self, glyphSet, steps=12):
        super().__init__(glyphSet); self.contours = []; self.cur = []; self.steps = steps
    def _moveTo(self, p): self.cur = [p]
    def _lineTo(self, p): self.cur.append(p)
    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for t in np.linspace(0, 1, self.steps + 1)[1:]:
            mt = 1 - t
            self.cur.append((mt**3*p0[0]+3*mt*mt*t*p1[0]+3*mt*t*t*p2[0]+t**3*p3[0], mt**3*p0[1]+3*mt*mt*t*p1[1]+3*mt*t*t*p2[1]+t**3*p3[1]))
    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for t in np.linspace(0, 1, self.steps + 1)[1:]:
            mt = 1 - t
            self.cur.append((mt*mt*p0[0]+2*mt*t*p1[0]+t*t*p2[0], mt*mt*p0[1]+2*mt*t*p1[1]+t*t*p2[1]))
    def _closePath(self):
        if self.cur: self.contours.append(self.cur)
        self.cur = []
    _endPath = _closePath

def outline(path, text, tracking_em=0.0, size=1.0, x0=0.0, y0=0.0):
    """Contornos do texto com a linha de base em y0 (coordenadas y para baixo), tamanho em unidades por em."""
    tt, _ = font(path)
    gs = tt.getGlyphSet(); upem = tt['head'].unitsPerEm
    glyphs, adv = shape(path, text, tracking_em)
    s = size / upem
    svg = SVGPathPen(gs, ntos=lambda v: ('%.3f' % v).rstrip('0').rstrip('.'))
    polys = []
    for name, gx, gy in glyphs:
        tr = (s, 0, 0, -s, x0 + gx * s, y0 - gy * s)
        gs[name].draw(TransformPen(svg, tr))
        fp = FlatPen(gs); gs[name].draw(TransformPen(fp, tr)); polys += fp.contours
    return svg.getCommands(), polys, adv * s

def raster(polys, W, H, ss=4):
    """Máscara anti-serrilhada (0..1), winding não-zero, com supersampling."""
    acc = np.zeros((H * ss, W * ss), np.int32)
    for c in polys:
        a = np.array(c)
        if len(a) < 3: continue
        area = 0.5 * np.sum(a[:-1, 0] * a[1:, 1] - a[1:, 0] * a[:-1, 1]) + 0.5 * (a[-1, 0] * a[0, 1] - a[0, 0] * a[-1, 1])
        rr, cc = skpoly(a[:, 1] * ss - 0.5, a[:, 0] * ss - 0.5, shape=acc.shape)
        acc[rr, cc] += 1 if area > 0 else -1
    m = (acc != 0).astype(np.float64)
    return m.reshape(H, ss, W, ss).mean(axis=(1, 3))
