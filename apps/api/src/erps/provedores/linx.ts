/**
 * Linx para farmácias (Linx Big / Linx Farma) e Linx para indústria de confecção e moda (Linx ERP): a Linx não publica
 * a API de consulta de produtos desses sistemas (a do varejo de moda, o SAPI, é ativada e operada pela própria Linx,
 * com VPN até o banco do cliente). A tela guarda os dados de acesso que a Linx entregar; a leitura dos produtos é
 * concluída pela SG Multiconecta com a documentação fornecida pela Linx ao cliente. Nada de rota inventada.
 */
import type { ErpDef } from '../erps'
import type { ErpAdapter } from './tipos'

const fields: ErpDef['fields'] = [
  { key: 'baseUrl', label: 'Endereço da API fornecido pela Linx', url: true, placeholder: 'https://...' },
  { key: 'usuario', label: 'Usuário', optional: true },
  { key: 'senha', label: 'Senha ou token', secret: true },
  { key: 'empresa', label: 'Código da empresa / CNPJ na Linx', optional: true },
]

const pending = (name: string) =>
  `A integração com ${name} depende da documentação da API que a Linx fornece ao cliente (a Linx não a publica). Salve os dados de acesso e envie a documentação para a SG Multiconecta concluir a leitura dos produtos.`

function linxAdapter(key: 'linx_farma' | 'linx_moda', name: string, segment: string): ErpAdapter {
  return {
    def: {
      key,
      name,
      segment,
      module: `erp_${key}`,
      howTo: `Peça à Linx (ou à franquia Linx que atende sua empresa) a liberação e a documentação da API de produtos, preço e estoque do seu sistema, e informe aqui os dados de acesso. ${pending(name)}`,
      fields,
    },
    async test() {
      throw new Error(pending(name))
    },
    async sync() {
      throw new Error(pending(name))
    },
  }
}

export const linxFarma = linxAdapter('linx_farma', 'Linx (farmácias)', 'ERP Linx para farmácias')
export const linxModa = linxAdapter('linx_moda', 'Linx (indústria de moda)', 'ERP Linx para indústria de confecção e moda')
