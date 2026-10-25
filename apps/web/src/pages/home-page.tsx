import { ArrowRightIcon, CircleDashedIcon, GraduationCapIcon, ShieldCheckIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useVersion } from '@/components/layout/app-footer'
import { formatDateTime, PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { MinhaFila } from './minha-fila'

/** Primeiros passos de uma empresa nova: cada um aparece só para quem tem acesso ao módulo. */
const STEPS = [
  { module: 'configuracoes', title: 'Sua marca', text: 'Nome, logo e cores da empresa no sistema e nos e-mails.', to: '/configuracoes' },
  { module: 'usuarios', title: 'Equipe', text: 'Convide os usuários e defina o que cada perfil pode acessar.', to: '/usuarios' },
  { module: 'whatsapp', title: 'WhatsApp', text: 'Conecte os números de atendimento lendo o QR Code no celular.', to: '/configuracoes?secao=whatsapp-numeros' },
  { module: 'leads', title: 'Contatos', text: 'Importe a sua base de leads e clientes por planilha.', to: '/leads' },
]

function greeting() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function HomePage() {
  const { me, can } = useAuth()
  const { data: version } = useVersion()
  if (!me) return null
  // Telas novas: o início é a Minha fila.
  if (me.screens === 'NOVO') return <MinhaFila />

  return (
    <div>
      <PageHeader title={`${greeting()}, ${me.name.split(' ')[0]}!`} description={`Você está conectado como ${me.role.name}.`} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Versão instalada</CardDescription>
            <CardTitle className="text-2xl">{version ? `v${version.version}` : '…'}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/atualizacoes">
                Ver o que mudou <ArrowRightIcon />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Segurança da sua conta</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheckIcon className={cn('size-6', me.totpEnabled ? 'text-emerald-600' : 'text-amber-500')} />
              {me.totpEnabled ? '2FA ativo' : '2FA desativado'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/meu-perfil">
                {me.totpEnabled ? 'Gerenciar' : 'Ativar agora'} <ArrowRightIcon />
              </Link>
            </Button>
          </CardContent>
        </Card>
        {can('usuarios') ? (
          <Card>
            <CardHeader>
              <CardDescription>Administração</CardDescription>
              <CardTitle className="text-2xl">Equipe e acessos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/usuarios">Usuários</Link>
              </Button>
              {can('perfis') && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/perfis">Perfis</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardDescription>Seu acesso atual começou em</CardDescription>
              <CardTitle className="text-2xl">{formatDateTime(me.lastLoginAt)}</CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Primeiros passos</CardTitle>
          <CardDescription>O básico para começar a usar. A Trilha de conhecimento explica cada tela em detalhes.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.filter((s) => can(s.module)).map((s, i) => (
              <li key={s.to} className="rounded-lg border p-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CircleDashedIcon className="size-4 text-muted-foreground" /> Passo {i + 1}
                </span>
                <p className="mt-1 font-medium">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
                <Button asChild variant="link" size="sm" className="h-auto px-0">
                  <Link to={s.to}>
                    Abrir <ArrowRightIcon />
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/trilha">
              <GraduationCapIcon /> Trilha de conhecimento
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
