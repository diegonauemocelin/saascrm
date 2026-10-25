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
      if (c.whatsapp) rod.appendChild(link('', consultar(''), 'WhatsApp'))
      if (c.email) rod.appendChild(link('', 'mailto:' + c.email, c.email))
      if (c.instagram) rod.appendChild(link('', 'https://instagram.com/' + c.instagram, '@' + c.instagram))

      var brl = function (c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/mês' }
      var preco = function (c) { return d.showPrices && typeof c === 'number' ? brl(c) : 'Sob consulta' }
      var box = document.getElementById('planos-lista')
      var cards = []
      if (d.avulso) {
        cards.push({ name: 'Monte o seu', price: 'Escolha os sistemas', desc: 'Cada sistema tem um valor mensal: contrate só o que a sua empresa precisa.', items: [d.avulso.maxUsers + ' usuário(s) · ' + d.avulso.maxWhatsapp + ' número(s) de WhatsApp'].concat(d.avulso.systems.map(function (s) { return s.label + (d.showPrices && typeof s.priceCents === 'number' ? ' — ' + brl(s.priceCents) : '') })), trial: d.avulso.trialDays, consult: 'os sistemas avulsos', signup: d.signupUrl })
      }
      ;(d.plans || []).forEach(function (p) {
        cards.push({ name: p.name, price: preco(p.priceCents), desc: p.description, items: [p.maxUsers + ' usuário(s) · ' + p.maxWhatsapp + ' número(s) de WhatsApp'].concat(p.systems || []), trial: p.trialDays, consult: 'o plano ' + p.name, signup: d.signupUrl ? d.signupUrl + '?plano=' + encodeURIComponent(p.id) : null, destaque: p.complete })
      })
      if (!cards.length) return
      box.textContent = ''
      cards.forEach(function (c) {
        var card = el('article', 'plano' + (c.destaque ? ' plano-destaque' : ''))
        card.appendChild(el('h3', '', c.name))
        card.appendChild(el('p', 'plano-preco', c.price))
        if (c.desc) card.appendChild(el('p', 'plano-desc', c.desc))
        var ul = el('ul', 'plano-itens')
        c.items.forEach(function (s) { ul.appendChild(el('li', '', s)) })
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
