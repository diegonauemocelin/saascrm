import { ArrowRightIcon, GraduationCapIcon, ShieldCheckIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useVersion } from '@/components/layout/app-footer'
import { formatDateTime, PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { PrimeirosPassos } from '@/components/primeiros-passos'
import { MinhaFila } from './minha-fila'

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

      <PrimeirosPassos className="mt-6" />
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/trilha">
          <GraduationCapIcon /> Trilha de conhecimento
        </Link>
      </Button>
    </div>
  )
}
