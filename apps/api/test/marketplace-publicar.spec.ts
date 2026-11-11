import { describe, expect, it } from 'vitest'
import {
  allowedByFilter,
  buildItemBody,
  type CategoryAttribute,
  cleanPublicar,
  DEFAULT_MEDICINE_WORDS,
  DEFAULT_PUBLICAR,
  draftProblems,
  type DraftLike,
  type ErpProductLike,
  explainMlError,
  listingPrice,
  listingQuantity,
  medicineReason,
  MEDICINE_BLOCK,
  mergeAttributes,
  missingAttributes,
  mlTitle,
  needsUpdate,
  prefillAttributes,
  publishEligibility,
  requiredAttributes,
  retryDelayFor,
} from '../src/marketplaces/publicar/publicar'

const base: ErpProductLike = {
  code: '12345',
  name: 'SHAMPOO ANTICASPA 200ML',
  ean: '7891234567895',
  brand: 'Laboratorio Exemplo',
  department: 'Higiene',
  groupName: 'Cabelos',
  category: 'Shampoo',
  classification: 'Perfumaria',
  typeName: 'Perfumaria',
  activeIngredient: null,
  compounded: false,
}
const cfg = { ...DEFAULT_PUBLICAR, allowedDepartments: ['higiene'] }

describe('Publicar: regra de medicamento', () => {
  it('higiene e perfumaria passam', () => {
    expect(medicineReason(base)).toBeNull()
    expect(publishEligibility(base, cfg)).toEqual({ ok: true })
  })

  it('bloqueia princípio ativo, manipulado e tipos de medicamento', () => {
    expect(medicineReason({ ...base, activeIngredient: 'Paracetamol' })).toMatch(/princípio ativo/)
    expect(medicineReason({ ...base, compounded: true })).toMatch(/manipulado/)
    expect(medicineReason({ ...base, typeName: 'Medicamento' })).toMatch(/tipo/)
    expect(medicineReason({ ...base, department: 'Medicamentos' })).toMatch(/departamento/)
    expect(medicineReason({ ...base, classification: 'Tarja Amarela' })).toMatch(/classificação/)
    expect(medicineReason({ ...base, groupName: 'Genéricos' })).toMatch(/grupo/)
    expect(medicineReason({ ...base, category: 'Similares' })).toMatch(/categoria/)
    expect(medicineReason({ ...base, typeName: 'Ético' })).toMatch(/tipo/)
    expect(medicineReason({ ...base, classification: 'MIP' })).toMatch(/classificação/)
    expect(medicineReason({ ...base, typeName: 'OTC' })).toMatch(/tipo/)
    expect(medicineReason({ ...base, groupName: 'Controlados - Portaria 344' })).toMatch(/grupo/)
  })

  it('palavra só no início de palavra (cosmético não vira ético)', () => {
    expect(medicineReason({ ...base, classification: 'Dermocosméticos' })).toBeNull()
    expect(medicineReason({ ...base, groupName: 'Cosméticos' })).toBeNull()
  })

  it('medicamento fica bloqueado mesmo dentro do filtro da empresa', () => {
    const r = publishEligibility({ ...base, activeIngredient: 'Ibuprofeno' }, cfg)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.medicine).toBe(true)
      expect(r.reason).toContain(MEDICINE_BLOCK)
    }
  })

  it('lista de palavras configurável; vazia volta ao padrão', () => {
    expect(medicineReason({ ...base, groupName: 'Suplementos' }, ['suplemento'])).toMatch(/grupo/)
    expect(cleanPublicar({ medicineWords: [] }).medicineWords).toEqual(DEFAULT_MEDICINE_WORDS)
    expect(cleanPublicar({ medicineWords: ['Remédio X'] }).medicineWords).toEqual(['remedio x'])
  })
})

describe('Publicar: filtro do que pode ser publicado', () => {
  it('nada escolhido = nada aparece', () => {
    expect(allowedByFilter(base, DEFAULT_PUBLICAR)).toBe(false)
    const r = publishEligibility(base, DEFAULT_PUBLICAR)
    expect(r.ok).toBe(false)
  })

  it('departamento, grupo ou categoria, sem diferenciar acentos e maiúsculas', () => {
    expect(allowedByFilter(base, { ...DEFAULT_PUBLICAR, allowedGroups: ['CABELOS'] })).toBe(true)
    expect(allowedByFilter({ ...base, category: 'Higiene Íntima' }, { ...DEFAULT_PUBLICAR, allowedCategories: ['higiene intima'] })).toBe(true)
    expect(allowedByFilter(base, { ...DEFAULT_PUBLICAR, allowedDepartments: ['Perfumaria'] })).toBe(false)
  })
})

describe('Publicar: título, preço e quantidade', () => {
  it('título ≤ 60, sem caixa alta e sem "estoque"', () => {
    expect(mlTitle('SHAMPOO ANTICASPA 200ML')).toBe('Shampoo Anticaspa 200ml')
    expect(mlTitle('Sabonete líquido estoque limitado')).toBe('Sabonete líquido limitado')
    const long = mlTitle('Protetor Solar Facial Toque Seco Com Cor Pele Morena FPS 50 Antioleosidade 50g Embalagem Nova')
    expect(long.length).toBeLessThanOrEqual(60)
    expect(long.endsWith(' ')).toBe(false)
    expect(mlTitle('A'.repeat(80), 60)).toHaveLength(60)
    expect(mlTitle('CREME DE PENTEAR PARA CABELOS')).toBe('Creme de Pentear para Cabelos')
  })

  it('preço com acréscimo e quantidade nunca negativa', () => {
    expect(listingPrice(19.9, 0)).toBe(19.9)
    expect(listingPrice(20, 10)).toBe(22)
    expect(listingPrice(null, 10)).toBeNull()
    expect(listingPrice(0, 10)).toBeNull()
    expect(listingQuantity(-2)).toBe(0)
    expect(listingQuantity(null)).toBe(0)
    expect(listingQuantity(7)).toBe(7)
    expect(cleanPublicar({ markupPct: 500 }).markupPct).toBe(0)
    expect(cleanPublicar({ markupPct: 12.345 }).markupPct).toBe(12.35)
  })
})

const catAttrs: CategoryAttribute[] = [
  { id: 'BRAND', name: 'Marca', tags: { required: true }, values: [{ id: '9', name: 'LABORATORIO EXEMPLO' }] },
  { id: 'GTIN', name: 'Código universal de produto', tags: { required: true } },
  { id: 'MODEL', name: 'Modelo', tags: { catalog_required: true } },
  { id: 'VOLUME', name: 'Volume', tags: { required: true } },
  { id: 'PACKAGE_WEIGHT', name: 'Peso', tags: { required: true, read_only: true } },
]

describe('Publicar: atributos', () => {
  it('obrigatórios por modo', () => {
    expect(requiredAttributes(catAttrs, 'tradicional').map((a) => a.id)).toEqual(['BRAND', 'GTIN', 'MODEL', 'VOLUME'])
    expect(requiredAttributes(catAttrs, 'catalogo').map((a) => a.id)).toEqual(['BRAND', 'GTIN', 'VOLUME'])
  })

  it('preenche marca, GTIN, SKU e pacote (mm → cm, g)', () => {
    const filled = prefillAttributes({ ...base, widthMm: 40, heightMm: 120, depthMm: 25, weightG: 150 }, catAttrs)
    expect(filled.find((a) => a.id === 'BRAND')).toEqual({ id: 'BRAND', value_id: '9', value_name: 'LABORATORIO EXEMPLO' })
    expect(filled.find((a) => a.id === 'GTIN')?.value_name).toBe('7891234567895')
    expect(filled.find((a) => a.id === 'SELLER_SKU')?.value_name).toBe('12345')
    expect(filled.find((a) => a.id === 'SELLER_PACKAGE_HEIGHT')?.value_name).toBe('12 cm')
    expect(filled.find((a) => a.id === 'SELLER_PACKAGE_LENGTH')?.value_name).toBe('3 cm')
    expect(filled.find((a) => a.id === 'SELLER_PACKAGE_WEIGHT')?.value_name).toBe('150 g')
    const missing = missingAttributes(requiredAttributes(catAttrs, 'tradicional'), filled)
    expect(missing.map((m) => m.id)).toEqual(['MODEL', 'VOLUME'])
  })

  it('EAN inválido não vira GTIN; sem medidas, sem pacote', () => {
    const filled = prefillAttributes({ ...base, ean: '7891234567890', widthMm: null, heightMm: null, depthMm: null, weightG: null }, catAttrs)
    expect(filled.some((a) => a.id === 'GTIN')).toBe(false)
    expect(filled.some((a) => a.id.startsWith('SELLER_PACKAGE'))).toBe(false)
  })

  it('junta atributos: o da pessoa vence; vazio remove; id inválido ignorado', () => {
    const r = mergeAttributes([{ id: 'BRAND', value_name: 'A' }, { id: 'MODEL', value_name: 'X' }], [{ id: 'BRAND', value_name: 'B' }, { id: 'MODEL', value_name: '' }, { id: 'bad id', value_name: 'z' }])
    expect(r).toEqual([{ id: 'BRAND', value_name: 'B' }])
  })
})

const draft: DraftLike = {
  mode: 'tradicional',
  title: 'Shampoo Anticaspa 200ml',
  categoryId: 'MLB1234',
  catalogProductId: null,
  listingType: 'gold_special',
  price: 21.9,
  quantity: 5,
  freeShipping: false,
  attributes: [{ id: 'BRAND', value_name: 'X' }],
  pictures: [{ id: '123-MLB456_112021' }],
}

describe('Publicar: corpo do anúncio', () => {
  it('tradicional', () => {
    const b = buildItemBody(draft, { userProductSeller: false })
    expect(b).toMatchObject({ site_id: 'MLB', title: draft.title, category_id: 'MLB1234', price: 21.9, currency_id: 'BRL', available_quantity: 5, buying_mode: 'buy_it_now', condition: 'new', listing_type_id: 'gold_special', pictures: [{ id: '123-MLB456_112021' }] })
    expect(b.catalog_listing).toBeUndefined()
    expect(b.shipping).toBeUndefined()
  })

  it('catálogo usa as fotos do catálogo; User Products manda family_name', () => {
    const b = buildItemBody({ ...draft, mode: 'catalogo', catalogProductId: 'MLB999', pictures: [], freeShipping: true, quantity: 0 }, { userProductSeller: true })
    expect(b).toMatchObject({ catalog_product_id: 'MLB999', catalog_listing: true, pictures: [], family_name: draft.title, available_quantity: 0, shipping: { mode: 'me2', free_shipping: true } })
    expect(b.title).toBeUndefined()
  })

  it('pendências em português', () => {
    expect(draftProblems(draft, [])).toEqual([])
    const p = draftProblems({ ...draft, categoryId: null, pictures: [], price: null }, [{ id: 'VOLUME', name: 'Volume' }])
    expect(p.join(' ')).toMatch(/categoria/)
    expect(p.join(' ')).toMatch(/foto/)
    expect(p.join(' ')).toMatch(/preço/)
    expect(p.join(' ')).toMatch(/Volume/)
    expect(draftProblems({ ...draft, mode: 'catalogo', catalogProductId: 'MLB1', pictures: [] }, [])).toEqual([])
  })
})

describe('Publicar: envio e sincronização', () => {
  it('criação só repete em 429; atualização também em 5xx', () => {
    expect(retryDelayFor('create')(429, 0)).toBe(2000)
    expect(retryDelayFor('create')(500, 0)).toBeNull()
    expect(retryDelayFor('update')(503, 1)).toBe(3000)
    expect(retryDelayFor('update')(429, 3)).toBeNull()
    expect(retryDelayFor('update')(400, 0)).toBeNull()
  })

  it('detecta mudança de preço e estoque', () => {
    expect(needsUpdate({ desiredPrice: 10, desiredQuantity: 3, sentPrice: 10, sentQuantity: 3 }).any).toBe(false)
    expect(needsUpdate({ desiredPrice: 10.5, desiredQuantity: 3, sentPrice: 10, sentQuantity: 3 })).toEqual({ price: true, quantity: false, any: true })
    expect(needsUpdate({ desiredPrice: 10, desiredQuantity: 0, sentPrice: 10, sentQuantity: 3 })).toEqual({ price: false, quantity: true, any: true })
    expect(needsUpdate({ desiredPrice: null, desiredQuantity: null, sentPrice: 10, sentQuantity: 3 }).any).toBe(false)
  })

  it('explica erros do Mercado Livre', () => {
    expect(explainMlError('O Mercado Livre respondeu 400: item.attribute.missing.seller.package.dimensions')).toMatch(/medidas do pacote/)
    expect(explainMlError('O Mercado Livre respondeu 400: item.catalog_listing.not_eligible')).toMatch(/elegível/)
    expect(explainMlError('qualquer coisa')).toBe('qualquer coisa')
  })
})
