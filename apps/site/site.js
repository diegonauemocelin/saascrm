// Site de apresentação: demonstrações por segmento, planos (sem preço) e contato vindos do painel da plataforma.
;(function () {
  var SEG = {
    autopecas: 'Rota Autopeças: balcão e oficinas parceiras pedem peças pelo WhatsApp; cada pedido vira um atendimento com o vendedor e o resultado.',
    vitrinemoda: 'Vitrine Moda: clientes chegam pelo Instagram, separam peças para provar e trocam tamanhos pelo WhatsApp; as postagens da coleção saem com aprovação.',
    smashpadel: 'Smash Padel Wear: clubes, escolas e lojas pedem uniformes personalizados e reposição no atacado; o funil acompanha cada orçamento até a venda.',
  }
  var TELA = {
    chat: 'Conversas da equipe no mesmo número, com o histórico do cliente e o atendimento de pré-vendas ao lado.',
    'pre-vendas': 'Cada contato vira um atendimento: origem, vendedor, retorno e venda. O dashboard mostra o resultado da equipe.',
    postagens: 'Calendário do Instagram e do Facebook: feed, stories e reels em várias contas, com aprovação antes de publicar.',
    leads: 'Base de leads com origem, estágio do funil e pontuação de cada contato.',
    dashboard: 'Tempo de resposta, conversas esperando, volume por atendente e metas de primeira resposta.',
  }
  var seg = 'autopecas'
  var tela = 'chat'
  var video = document.getElementById('demo')

  function mostrar(play) {
    video.poster = '/video/' + seg + '-' + tela + '.jpg'
    video.src = '/video/' + seg + '-' + tela + '.mp4'
    document.getElementById('seg-texto').textContent = SEG[seg]
    document.getElementById('legenda').textContent = TELA[tela]
    if (play) video.play().catch(function () {})
  }
  function marcar(lista, atual, attr) {
    lista.forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute(attr) === atual ? 'true' : 'false')
    })
  }
  var segs = Array.prototype.slice.call(document.querySelectorAll('[data-seg]'))
  var telas = Array.prototype.slice.call(document.querySelectorAll('[data-tela]'))
  segs.forEach(function (b) {
    b.addEventListener('click', function () {
      seg = b.getAttribute('data-seg')
      marcar(segs, seg, 'data-seg')
      mostrar(true)
    })
  })
  telas.forEach(function (b) {
    b.addEventListener('click', function () {
      tela = b.getAttribute('data-tela')
      marcar(telas, tela, 'data-tela')
      mostrar(true)
    })
  })
  mostrar(false)
  // O vídeo da demonstração só toca quando aparece na tela (economiza dados no celular).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) video.play().catch(function () {})
        else video.pause()
      })
    }, { threshold: 0.35 }).observe(video)
  }

  document.getElementById('ano').textContent = String(new Date().getFullYear())

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text) n.textContent = text
    return n
  }
  function link(cls, href, text) {
    var a = el('a', cls, text)
    a.href = href
    if (/^https?:/.test(href) && href.indexOf(location.host) < 0) {
      a.target = '_blank'
      a.rel = 'noopener'
    }
    return a
  }
  function whats(numero, texto) {
    var n = numero.replace(/\D/g, '')
    if (n.length <= 11) n = '55' + n
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(texto)
  }

  fetch('/api/public/site', { headers: { Accept: 'application/json' } })
    .then(function (r) {
      return r.ok ? r.json() : null
    })
    .then(function (d) {
      if (!d) return
      if (d.signupUrl) document.querySelectorAll('[data-link=signup]').forEach(function (a) { a.href = d.signupUrl })
      if (d.loginUrl) document.querySelectorAll('[data-link=login]').forEach(function (a) { a.href = d.loginUrl })
      var c = d.contact || {}
      var consultar = function (plano) {
        var msg = plano ? 'Olá! Quero saber os valores de ' + plano + ' da SG Multiconecta.' : 'Olá! Quero saber mais sobre a SG Multiconecta.'
        if (c.whatsapp) return whats(c.whatsapp, msg)
        if (c.email) return 'mailto:' + c.email + '?subject=' + encodeURIComponent('Planos SG Multiconecta') + '&body=' + encodeURIComponent(msg)
        return '#contato'
      }

      var acoes = document.getElementById('contato-acoes')
      if (c.whatsapp) acoes.insertBefore(link('btn btn-whats btn-grande', consultar(''), 'Falar no WhatsApp'), acoes.firstChild)
      if (c.email) acoes.appendChild(link('btn btn-claro btn-grande', 'mailto:' + c.email, c.email))
      var rod = document.getElementById('rodape-contato')
      // Ícone antes de cada contato (WhatsApp, e-mail, Instagram), para saber o que cada link abre.
      var ICONES = {
        whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
        email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
        instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></svg>',
      }
      var contato = function (tipo, href, texto, titulo) {
        var a = link('rodape-contato rodape-' + tipo, href, texto)
        a.insertAdjacentHTML('afterbegin', ICONES[tipo])
        a.title = titulo
        return a
      }
      if (c.whatsapp) rod.appendChild(contato('whatsapp', consultar(''), 'WhatsApp', 'Conversar no WhatsApp'))
      if (c.email) rod.appendChild(contato('email', 'mailto:' + c.email, c.email, 'Enviar e-mail'))
      if (c.instagram) rod.appendChild(contato('instagram', 'https://www.instagram.com/' + encodeURIComponent(c.instagram) + '/', '@' + c.instagram, 'Abrir o Instagram'))

      var brl = function (c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/mês' }
      var preco = function (c) { return d.showPrices && typeof c === 'number' ? brl(c) : 'Sob consulta' }
      var box = document.getElementById('planos-lista')
      var cards = []
      if (d.avulso) {
        cards.push({ name: 'Monte o seu', price: 'Escolha os sistemas', desc: 'Cada sistema tem um valor mensal: contrate só o que a sua empresa precisa.', items: [d.avulso.maxUsers + ' usuário(s) · ' + d.avulso.maxWhatsapp + ' número(s) de WhatsApp'].concat(d.avulso.systems.map(function (s) { return s.label + (d.showPrices && typeof s.priceCents === 'number' ? ' — ' + brl(s.priceCents) : '') })), trial: d.avulso.trialDays, consult: 'os sistemas avulsos', signup: d.signupUrl })
      }
      ;(d.plans || []).forEach(function (p) {
        // O que o plano não inclui aparece riscado de leve (—), como numa comparação.
        var faltam = (d.allSystems || []).filter(function (s) { return (p.systems || []).indexOf(s) < 0 })
        cards.push({ name: p.name, price: preco(p.priceCents), desc: p.description, items: [p.maxUsers + ' usuário(s) · ' + p.maxWhatsapp + ' número(s) de WhatsApp'].concat(p.systems || []), off: faltam, trial: p.trialDays, consult: 'o plano ' + p.name, signup: d.signupUrl ? d.signupUrl + '?plano=' + encodeURIComponent(p.id) : null, destaque: p.complete })
      })
      if (!cards.length) return
      box.textContent = ''
      cards.forEach(function (c) {
        var card = el('article', 'plano' + (c.destaque ? ' plano-destaque' : ''))
        if (c.destaque) card.appendChild(el('span', 'plano-selo', 'Mais completo'))
        card.appendChild(el('h3', '', c.name))
        card.appendChild(el('p', 'plano-preco', c.price))
        if (c.desc) card.appendChild(el('p', 'plano-desc', c.desc))
        var ul = el('ul', 'plano-itens')
        c.items.forEach(function (s) { ul.appendChild(el('li', '', s)) })
        ;(c.off || []).forEach(function (s) { ul.appendChild(el('li', 'fora', s)) })
        card.appendChild(ul)
        var bt = el('div', 'plano-botoes')
        if (!d.showPrices) bt.appendChild(link('btn btn-cor', consultar(c.consult), 'Consultar valores'))
        if (c.signup) bt.appendChild(link(d.showPrices ? 'btn btn-cor' : 'btn btn-linha', c.signup, c.trial ? 'Testar ' + c.trial + ' dias grátis' : 'Contratar'))
        card.appendChild(bt)
        box.appendChild(card)
      })
    })
    .catch(function () {})
})()

// Mapa de integrações: posiciona cada item e desenha as linhas curvas até o centro (no celular vira grade, sem linhas).
;(function () {
  var hub = document.getElementById('hub')
  if (!hub) return
  var svg = hub.querySelector('.hub-linhas')
  var NS = 'http://www.w3.org/2000/svg'
  var itens = hub.querySelectorAll('.hub-itens li')
  itens.forEach(function (li, i) {
    var x = Number(li.getAttribute('data-x'))
    var y = Number(li.getAttribute('data-y'))
    li.style.left = x + '%'
    li.style.top = y + '%'
    // Curva suave do item até o centro (50, 50); algumas linhas mostram o "dado passando".
    var cx = (x + 50) / 2
    var d = 'M' + x + ' ' + (y - 4) + ' C ' + cx + ' ' + (y - 4) + ', ' + cx + ' 50, 50 50'
    var base = document.createElementNS(NS, 'path')
    base.setAttribute('d', d)
    svg.appendChild(base)
    if (i % 3 === 0) {
      var vivo = document.createElementNS(NS, 'path')
      vivo.setAttribute('d', d)
      vivo.setAttribute('class', 'vivo')
      vivo.setAttribute('pathLength', '100')
      vivo.style.animationDelay = (i * 0.35) + 's'
      svg.appendChild(vivo)
    }
  })
})()
