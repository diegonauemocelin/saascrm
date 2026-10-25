const fs = require('fs')
const opentype = require('opentype.js')
// Gera a marca SG Multiconecta em SVG (texto em curvas, fonte Montserrat) para apps/web/public/marca.
//   npm i --no-save opentype.js@1.3.4 @fontsource/montserrat@5.1.0 && node scripts/marca/gerar-marca.cjs apps/web/public/marca
const D = process.cwd()
const font = (w) => opentype.parse(fs.readFileSync(`${D}/node_modules/@fontsource/montserrat/files/montserrat-latin-${w}-normal.woff`).buffer.slice(0))
const F900 = font(900), F800 = font(800)
const ROXO = '#5b3fd0', AZUL = '#2a9be3', AMARELO = '#ffc21a'

// Marca: três "pessoas" (traço + ponto), roxo no alto, azul à esquerda e amarelo embaixo, como na logo.
const pessoa = (cor, [x1, y1, x2, y2], [cx, cy]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cor}" stroke-width="22" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="14" fill="${cor}"/>`
const marca = pessoa(ROXO, [124, 13, 128, 84], [80, 48]) + pessoa(AZUL, [14, 86, 84, 112], [42, 148]) + pessoa(AMARELO, [77, 160, 99, 194], [120, 208])

const texto = (fnt, s, x, y, size, cor, spacing = 0) => {
  let d = '', cx = x
  for (const ch of s) { const g = fnt.charToGlyph(ch); d += g.getPath(cx, y, size).toPathData(1); cx += (g.advanceWidth / fnt.unitsPerEm) * size + spacing }
  return { svg: `<path d="${d}" fill="${cor}"/>`, w: cx - x - spacing }
}

function logo(corTexto, corFrase) {
  const x = 168
  const sg = texto(F900, 'SG', x - 4, 128, 150, corTexto, -5)
  const mc = texto(F800, 'Multiconecta', x, 196, 82, corTexto, -1.5)
  // A frase ocupa a mesma largura de "Multiconecta".
  const base = texto(F800, 'ATENDIMENTO OMNICHANNEL COM IA', 0, 0, 100, corFrase, 0)
  const fr = texto(F800, 'ATENDIMENTO OMNICHANNEL COM IA', x + 2, 228, (100 * (mc.w - 4)) / base.w, corFrase, 0)
  const w = Math.ceil(x + mc.w + 8)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 ${w} 236" role="img" aria-label="SG Multiconecta">${marca}${sg.svg}${mc.svg}${fr.svg}</svg>`
}

const out = process.argv[2]
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(`${out}/sg-icone.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-41 -4 226 226" role="img" aria-label="SG Multiconecta">${marca}</svg>`)
fs.writeFileSync(`${out}/sg-logo.svg`, logo('#12131c', ROXO))
fs.writeFileSync(`${out}/sg-logo-branco.svg`, logo('#ffffff', '#b9a9ff'))
console.log('ok')
