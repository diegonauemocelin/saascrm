import { MessageCircleIcon, SparklesIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'
import { usePageTitle } from '@/lib/page-title'

/** O que cada sistema sob consulta faz (a tela que aparece para quem ainda não contratou). */
const INFO: Record<string, { title: string; text: string; items: string[] }> = {
  ecommerce: {
    title: 'Integração com e-commerce',
    text: 'Liga o CRM à sua loja virtual: produtos, pedidos e carrinhos abandonados entram sozinhos, viram leads e oportunidades de venda.',
    items: ['Catálogo de produtos com os números da loja', 'Carrinhos abandonados com o contato do cliente', 'SEO dos produtos com sugestões da IA', 'Pedidos ligados aos leads e às campanhas'],
  },
  erp: {
    title: 'Integração com ERP',
    text: 'Liga o CRM ao sistema de gestão da empresa: a equipe consulta produtos, estoque e preço sem sair do atendimento.',
    items: ['Busca por código, referência e aplicação', 'Estoque e preço atualizados', 'Consulta direto do atendimento e do chat'],
  },
}
const SYSTEM_OF: Record<string, string> = { catalogo: 'ecommerce', carrinhos: 'ecommerce', seo_ecommerce: 'ecommerce', consulta_produtos: 'erp' }

export function SobConsultaPage() {
  const [params] = useSearchParams()
  const { me } = useAuth()
  const branding = useBranding()
  const info = INFO[SYSTEM_OF[params.get('modulo') ?? ''] ?? 'ecommerce']!
  usePageTitle(info.title)
  const contact = branding.supportEmail
  const text = encodeURIComponent(`Olá! Quero saber mais sobre a ${info.title} para a empresa ${me?.company?.name ?? ''}.`)
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-8">
      <p className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
        <SparklesIcon className="size-3.5" /> Sob consulta
      </p>
      <h1 className="text-2xl font-semibold">{info.title}</h1>
      <p className="text-muted-foreground">{info.text}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {info.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p className="text-sm">Cada integração é feita para o sistema que a sua empresa usa. Fale com a SG Multiconecta para ver se o seu sistema é compatível e receber a proposta.</p>
      <div className="flex flex-wrap gap-2">
        {contact && (
          <Button asChild>
            <a href={`mailto:${contact}?subject=${encodeURIComponent(info.title)}&body=${text}`}>
              <MessageCircleIcon /> Falar com a SG Multiconecta
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
