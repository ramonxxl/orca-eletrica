// Telas e navegação do app
carregar();

const $ = s => document.querySelector(s);
const view = $('#view');
let filtroStatus = 'todos', buscaOrc = '', buscaCat = '', tipoCat = 'servico';

const STATUS = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600);
}

function topo(titulo, { voltar = false, acao = null } = {}) {
  $('#titulo').textContent = titulo;
  $('#btnVoltar').hidden = !voltar;
  const b = $('#btnAcaoTopo');
  b.hidden = !acao;
  if (acao) { b.textContent = acao.texto; b.onclick = acao.fn; }
}
$('#btnVoltar').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/orcamentos');

function abrirModal(titulo, html, aoAbrir) {
  $('#modalTitulo').textContent = titulo;
  $('#modalCorpo').innerHTML = html;
  $('#modal').hidden = false;
  aoAbrir && aoAbrir($('#modalCorpo'));
}
function fecharModal() { $('#modal').hidden = true; $('#modalCorpo').innerHTML = ''; }
$('#modalFechar').onclick = fecharModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });

// ---------- Roteador ----------
function rota() {
  const [, tela, id] = (location.hash || '#/orcamentos').split('/');
  document.body.classList.toggle('editor', tela === 'orcamento');
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('ativo', a.dataset.tab === tela));
  document.querySelector('.fab')?.remove();
  window.scrollTo(0, 0);
  ({ orcamentos: telaOrcamentos, orcamento: () => telaEditor(id), clientes: telaClientes, catalogo: telaCatalogo, config: telaConfig }[tela] || telaOrcamentos)();
}
window.addEventListener('hashchange', rota);

function fab(fn) {
  const b = document.createElement('button');
  b.className = 'fab'; b.textContent = '+'; b.setAttribute('aria-label', 'Novo');
  b.onclick = fn; document.body.appendChild(b);
}

// ---------- Lista de orçamentos ----------
function novoOrcamento(base) {
  const c = DB.config;
  const o = base ? JSON.parse(JSON.stringify(base)) : {
    tipoDoc: 'orcamento', clienteId: '', titulo: '', escopo: '', itens: [],
    desconto: 0, descontoTipo: 'R$', prazo: '', pagamento: c.pagamento, garantia: c.garantia, observacoes: c.observacoes
  };
  Object.assign(o, { id: uid(), numero: c.proximoNumero++, data: hoje(), validade: addDias(hoje(), c.validadeDias), status: 'rascunho' });
  DB.orcamentos.unshift(o); salvar();
  location.hash = '#/orcamento/' + o.id;
}

function telaOrcamentos() {
  topo('Orçamentos');
  const termo = buscaOrc.toLowerCase();
  const lista = DB.orcamentos.filter(o =>
    (filtroStatus === 'todos' || o.status === filtroStatus) &&
    (!termo || `${numero(o.numero)} ${clienteDe(o).nome || ''} ${o.titulo}`.toLowerCase().includes(termo)));
  const somar = st => DB.orcamentos.filter(o => o.status === st).reduce((s, o) => s + totais(o).total, 0);

  view.innerHTML = `
    <div class="resumo">
      <div><small>Enviados</small><strong>${fmtBRL(somar('enviado'))}</strong></div>
      <div><small>Aprovados</small><strong>${fmtBRL(somar('aprovado'))}</strong></div>
      <div><small>Total</small><strong>${DB.orcamentos.length}</strong></div>
    </div>
    <input class="busca" type="search" placeholder="Buscar por cliente, nº ou serviço" value="${esc(buscaOrc)}" id="buscaOrc">
    <div class="filtros">${['todos', ...Object.keys(STATUS)].map(s =>
      `<button data-s="${s}" class="${s === filtroStatus ? 'ativo' : ''}">${s === 'todos' ? 'Todos' : STATUS[s]}</button>`).join('')}</div>
    <div id="listaOrc">${lista.length ? lista.map(o => `
      <a class="lista-item" href="#/orcamento/${o.id}">
        <div class="info">
          <div class="t">${esc(clienteDe(o).nome || 'Sem cliente')}</div>
          <div class="s"><span class="num-badge">Nº ${numero(o.numero)}</span> · ${fmtData(o.data)}${o.titulo ? ' · ' + esc(o.titulo) : ''}</div>
          <span class="chip ${o.status}">${STATUS[o.status]}</span>
        </div>
        <div class="v">${fmtBRL(totais(o).total)}</div>
      </a>`).join('') : `<div class="vazio"><b>📄</b>${DB.orcamentos.length ? 'Nenhum orçamento encontrado.' : 'Nenhum orçamento ainda.<br>Toque no <strong>+</strong> para criar o primeiro.'}</div>`}
    </div>
    ${DB.config.empresa === CONFIG_PADRAO.empresa ? `<div class="card"><h3>Primeiro passo</h3>Cadastre o nome, telefone e logo da sua empresa para aparecerem no PDF.<div class="botoes"><a class="btn amarelo" href="#/config">Configurar empresa</a></div></div>` : ''}`;
  $('#buscaOrc').oninput = e => { buscaOrc = e.target.value; const pos = e.target.selectionStart; telaOrcamentos(); const i = $('#buscaOrc'); i.focus(); i.setSelectionRange(pos, pos); };
  view.querySelectorAll('.filtros button').forEach(b => b.onclick = () => { filtroStatus = b.dataset.s; telaOrcamentos(); });
  fab(() => novoOrcamento());
}

// ---------- Editor de orçamento ----------
function telaEditor(id) {
  const o = DB.orcamentos.find(x => x.id === id);
  if (!o) { location.hash = '#/orcamentos'; return; }
  topo((o.tipoDoc === 'proposta' ? 'Proposta' : 'Orçamento') + ' Nº ' + numero(o.numero), {
    voltar: true, acao: { texto: 'Mais', fn: () => menuOrcamento(o) }
  });

  const opcoesCli = DB.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome))
    .map(c => `<option value="${c.id}" ${c.id === o.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

  view.innerHTML = `
    <div class="card">
      <div class="seg" id="segTipo">
        <button data-v="orcamento" class="${o.tipoDoc !== 'proposta' ? 'ativo' : ''}">Orçamento</button>
        <button data-v="proposta" class="${o.tipoDoc === 'proposta' ? 'ativo' : ''}">Proposta comercial</button>
      </div>
      <label>Status</label>
      <select data-f="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>

    <div class="card">
      <h3>Cliente</h3>
      <div class="linha" style="align-items:flex-end">
        <div><select id="selCliente"><option value="">— Selecione o cliente —</option>${opcoesCli}</select></div>
        <button class="btn sec" style="flex:0 0 auto" id="btnNovoCli">+ Novo</button>
      </div>
      <div id="cliInfo" class="ajuda"></div>
    </div>

    <div class="card">
      <h3>Serviço</h3>
      <label>Título (resumo)</label>
      <input data-f="titulo" value="${esc(o.titulo)}" placeholder="Ex.: Troca do quadro e instalação de chuveiro">
      <label>${o.tipoDoc === 'proposta' ? 'Escopo detalhado' : 'Descrição (opcional)'}</label>
      <textarea data-f="escopo" placeholder="Descreva o que será feito, local, observações técnicas...">${esc(o.escopo)}</textarea>
    </div>

    <div class="card">
      <h3>Itens</h3>
      <div id="itens"></div>
      <div class="botoes">
        <button class="btn amarelo" id="btnCatalogo">+ Do catálogo</button>
        <button class="btn sec" id="btnAvulso">+ Item avulso</button>
      </div>
    </div>

    <div class="card">
      <h3>Desconto e totais</h3>
      <div class="linha">
        <div><label>Desconto</label><input data-f="desconto" inputmode="decimal" value="${o.desconto ? fmtNum(o.desconto) : ''}" placeholder="0"></div>
        <div><label>Tipo</label><select data-f="descontoTipo"><option ${o.descontoTipo !== '%' ? 'selected' : ''}>R$</option><option ${o.descontoTipo === '%' ? 'selected' : ''}>%</option></select></div>
      </div>
      <div class="totais" id="totais" style="margin-top:12px"></div>
    </div>

    <div class="card">
      <h3>Condições</h3>
      <div class="linha">
        <div><label>Data</label><input type="date" data-f="data" value="${o.data}"></div>
        <div><label>Válido até</label><input type="date" data-f="validade" value="${o.validade}"></div>
      </div>
      <label>Prazo de execução</label>
      <input data-f="prazo" value="${esc(o.prazo)}" placeholder="Ex.: 2 dias úteis após aprovação">
      <label>Forma de pagamento</label>
      <textarea data-f="pagamento">${esc(o.pagamento)}</textarea>
      <label>Garantia</label>
      <textarea data-f="garantia">${esc(o.garantia)}</textarea>
      <label>Observações</label>
      <textarea data-f="observacoes">${esc(o.observacoes)}</textarea>
    </div>

    <div class="barra-acoes">
      <div class="tot"><span>Total</span><strong id="totalBarra"></strong></div>
      <div class="botoes">
        <button class="btn sec" id="btnVerPdf">📄 Ver PDF</button>
        <button class="btn whats" id="btnEnviar">📤 Enviar ao cliente</button>
      </div>
    </div>`;

  let tSalvar;
  const salvarDepois = () => { clearTimeout(tSalvar); tSalvar = setTimeout(salvar, 300); };

  view.querySelectorAll('[data-f]').forEach(el => {
    el.addEventListener('input', () => {
      const f = el.dataset.f;
      o[f] = f === 'desconto' ? parseNum(el.value) : el.value;
      if (f === 'desconto' || f === 'descontoTipo') desenharTotais();
      salvarDepois();
    });
  });
  view.querySelectorAll('#segTipo button').forEach(b => b.onclick = () => { o.tipoDoc = b.dataset.v; salvar(); telaEditor(id); });

  const mostrarCli = () => {
    const c = clienteDe(o);
    $('#cliInfo').innerHTML = o.clienteId ? [c.telefone, c.endereco].filter(Boolean).map(esc).join(' · ') + ` <a href="#" id="editCli">editar</a>` : '';
    const e = $('#editCli'); if (e) e.onclick = ev => { ev.preventDefault(); formCliente(c, () => telaEditor(id)); };
  };
  $('#selCliente').onchange = e => { o.clienteId = e.target.value; salvar(); mostrarCli(); };
  $('#btnNovoCli').onclick = () => formCliente(null, c => { o.clienteId = c.id; salvar(); telaEditor(id); });
  mostrarCli();

  function desenharTotais() {
    const t = totais(o);
    $('#totais').innerHTML = `
      <div><span>Mão de obra</span><span>${fmtBRL(t.servicos)}</span></div>
      <div><span>Materiais</span><span>${fmtBRL(t.materiais)}</span></div>
      ${t.desconto ? `<div><span>Desconto</span><span>- ${fmtBRL(t.desconto)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${fmtBRL(t.total)}</span></div>`;
    $('#totalBarra').textContent = fmtBRL(t.total);
  }

  function desenharItens() {
    const box = $('#itens');
    if (!o.itens.length) { box.innerHTML = '<p class="ajuda">Nenhum item. Adicione serviços e materiais abaixo.</p>'; desenharTotais(); return; }
    box.innerHTML = o.itens.map((i, n) => `
      <div class="item ${i.tipo}" data-n="${n}">
        <span class="tag">${i.tipo === 'servico' ? 'Serviço' : 'Material'}</span>
        <button class="icon-btn rm" data-rm="${n}" aria-label="Remover">✕</button>
        <input data-i="desc" value="${esc(i.desc)}" placeholder="Descrição">
        <div class="linha">
          <div class="qtd"><input data-i="qtd" inputmode="decimal" value="${fmtNum(i.qtd)}" aria-label="Quantidade"></div>
          <div class="un"><input data-i="un" value="${esc(i.un)}" aria-label="Unidade"></div>
          <div><input data-i="preco" inputmode="decimal" value="${parseNum(i.preco).toFixed(2).replace('.', ',')}" aria-label="Valor unitário"></div>
        </div>
        <div class="sub">${fmtBRL(parseNum(i.qtd) * parseNum(i.preco))}</div>
      </div>`).join('');
    box.querySelectorAll('.item').forEach(div => {
      const i = o.itens[div.dataset.n];
      div.querySelectorAll('[data-i]').forEach(inp => inp.addEventListener('input', () => {
        const f = inp.dataset.i;
        i[f] = (f === 'qtd' || f === 'preco') ? parseNum(inp.value) : inp.value;
        div.querySelector('.sub').textContent = fmtBRL(parseNum(i.qtd) * parseNum(i.preco));
        desenharTotais(); salvarDepois();
      }));
    });
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { o.itens.splice(+b.dataset.rm, 1); salvar(); desenharItens(); });
    desenharTotais();
  }
  desenharItens();

  $('#btnAvulso').onclick = () => {
    abrirModal('Item avulso', `
      <div class="seg" id="segAv"><button data-v="servico" class="ativo">Serviço</button><button data-v="material">Material</button></div>
      <p class="ajuda">Será adicionado ao orçamento. Para reutilizar depois, cadastre no Catálogo.</p>
      <div class="botoes"><button class="btn bloco" id="okAv">Adicionar</button></div>`, corpo => {
      let tp = 'servico';
      corpo.querySelectorAll('#segAv button').forEach(b => b.onclick = () => { tp = b.dataset.v; corpo.querySelectorAll('#segAv button').forEach(x => x.classList.toggle('ativo', x === b)); });
      $('#okAv').onclick = () => {
        o.itens.push({ tipo: tp, desc: '', qtd: 1, un: tp === 'servico' ? 'un' : 'un', preco: 0 });
        salvar(); fecharModal(); desenharItens();
        const ins = view.querySelectorAll('#itens [data-i="desc"]'); ins[ins.length - 1]?.focus();
      };
    });
  };
  $('#btnCatalogo').onclick = () => escolherDoCatalogo(itens => { o.itens.push(...itens); salvar(); desenharItens(); toast(itens.length + ' item(ns) adicionado(s)'); });
  $('#btnVerPdf').onclick = () => verPDF(o);
  $('#btnEnviar').onclick = () => enviar(o);
}

function escolherDoCatalogo(cb) {
  let tp = 'servico', termo = '';
  const sel = new Map();
  abrirModal('Adicionar do catálogo', `
    <div class="seg" id="segC"><button data-v="servico" class="ativo">Serviços</button><button data-v="material">Materiais</button></div>
    <input type="search" id="bC" placeholder="Buscar..." style="margin:10px 0">
    <div id="lC"></div>
    <div class="botoes" style="position:sticky;bottom:0"><button class="btn bloco amarelo" id="okC">Adicionar selecionados</button></div>`, corpo => {
    const desenhar = () => {
      const lista = DB.catalogo.filter(c => c.tipo === tp && c.desc.toLowerCase().includes(termo));
      $('#lC').innerHTML = lista.map(c => `
        <div class="lista-item" data-id="${c.id}" style="${sel.has(c.id) ? 'outline:2px solid var(--amarelo)' : ''}">
          <div class="info"><div class="t" style="white-space:normal">${esc(c.desc)}</div><div class="s">${fmtBRL(c.preco)} / ${esc(c.un)}</div></div>
          <div class="v">${sel.has(c.id) ? '✔ ' + fmtNum(sel.get(c.id)) : '+'}</div>
        </div>`).join('') || '<p class="ajuda">Nada encontrado.</p>';
      $('#lC').querySelectorAll('.lista-item').forEach(d => d.onclick = () => {
        const id = d.dataset.id;
        sel.has(id) ? sel.delete(id) : sel.set(id, 1);
        desenhar();
      });
      $('#okC').textContent = sel.size ? `Adicionar ${sel.size} selecionado(s)` : 'Adicionar selecionados';
    };
    corpo.querySelectorAll('#segC button').forEach(b => b.onclick = () => { tp = b.dataset.v; corpo.querySelectorAll('#segC button').forEach(x => x.classList.toggle('ativo', x === b)); desenhar(); });
    $('#bC').oninput = e => { termo = e.target.value.toLowerCase(); desenhar(); };
    $('#okC').onclick = () => {
      const itens = [...sel.keys()].map(id => DB.catalogo.find(c => c.id === id)).map(c => ({ tipo: c.tipo, desc: c.desc, un: c.un, qtd: 1, preco: c.preco }));
      fecharModal(); if (itens.length) cb(itens);
    };
    desenhar();
  });
}

function menuOrcamento(o) {
  abrirModal('Opções', `
    <div class="botoes" style="flex-direction:column">
      <button class="btn sec" id="mDup">📋 Duplicar orçamento</button>
      <button class="btn sec" id="mBaixar">⬇️ Baixar PDF</button>
      <button class="btn sec" id="mWhatsTxt">💬 Mandar resumo em texto no WhatsApp</button>
      <button class="btn perigo" id="mDel">🗑️ Excluir orçamento</button>
    </div>`, () => {
    $('#mDup').onclick = () => { fecharModal(); novoOrcamento(o); toast('Orçamento duplicado'); };
    $('#mBaixar').onclick = () => { fecharModal(); baixarPDF(o); };
    $('#mWhatsTxt').onclick = () => { fecharModal(); abrirWhats(o, true); };
    $('#mDel').onclick = () => {
      if (!confirm('Excluir este orçamento?')) return;
      DB.orcamentos = DB.orcamentos.filter(x => x.id !== o.id); salvar(); fecharModal();
      location.hash = '#/orcamentos';
    };
  });
}

// ---------- PDF e envio ----------
function validar(o) {
  if (!o.itens.length) { toast('Adicione pelo menos um item.'); return false; }
  return true;
}
function verPDF(o) {
  if (!validar(o)) return;
  const url = gerarPDF(o).output('bloburl');
  const w = window.open(url, '_blank');
  if (!w) baixarPDF(o);
}
function baixarPDF(o) {
  if (!validar(o)) return;
  gerarPDF(o).save(nomeArquivo(o));
}
function mensagem(o, comItens) {
  const c = clienteDe(o), cfg = DB.config, t = totais(o);
  const tipo = o.tipoDoc === 'proposta' ? 'a proposta' : 'o orçamento';
  let m = `Olá${c.nome ? ', ' + c.nome.split(' ')[0] : ''}! Segue ${tipo} Nº ${numero(o.numero)}${o.titulo ? ' – ' + o.titulo : ''}.\n`;
  if (comItens) m += '\n' + o.itens.map(i => `• ${fmtNum(i.qtd)} ${i.un} ${i.desc} – ${fmtBRL(parseNum(i.qtd) * parseNum(i.preco))}`).join('\n') + '\n';
  if (t.desconto) m += `\nDesconto: ${fmtBRL(t.desconto)}`;
  m += `\n*Total: ${fmtBRL(t.total)}*\nVálido até ${fmtData(o.validade)}.`;
  if (cfg.pix) m += `\nChave Pix: ${cfg.pix}`;
  m += `\n\nQualquer dúvida estou à disposição.\n${cfg.empresa}${cfg.telefone ? ' – ' + cfg.telefone : ''}`;
  return m;
}
function abrirWhats(o, comItens) {
  const fone = foneWhats(clienteDe(o).telefone);
  window.open(`https://wa.me/${fone}?text=${encodeURIComponent(mensagem(o, comItens))}`, '_blank');
}
async function enviar(o) {
  if (!validar(o)) return;
  if (!o.clienteId) { toast('Selecione o cliente antes de enviar.'); return; }
  const blob = gerarPDF(o).output('blob');
  const arquivo = new File([blob], nomeArquivo(o), { type: 'application/pdf' });
  const marcarEnviado = () => { if (o.status === 'rascunho') { o.status = 'enviado'; salvar(); const s = view.querySelector('[data-f="status"]'); if (s) s.value = 'enviado'; } };

  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: arquivo.name, text: mensagem(o, false) });
      marcarEnviado(); toast('Enviado!');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  // Sem compartilhamento de arquivo (ex.: computador): baixa o PDF e abre a conversa do cliente
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = arquivo.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  abrirWhats(o, false);
  marcarEnviado();
  toast('PDF baixado. Anexe-o na conversa do WhatsApp.');
}

// ---------- Clientes ----------
function formCliente(c, depois) {
  const novo = !c;
  c = c || { id: uid(), nome: '', telefone: '', email: '', documento: '', endereco: '' };
  abrirModal(novo ? 'Novo cliente' : 'Editar cliente', `
    <label>Nome *</label><input id="cNome" value="${esc(c.nome)}" autocomplete="name">
    <label>Telefone / WhatsApp</label><input id="cTel" type="tel" value="${esc(c.telefone)}" placeholder="(12) 99999-9999">
    <label>Endereço da obra</label><input id="cEnd" value="${esc(c.endereco)}" placeholder="Rua, nº, bairro, cidade">
    <div class="linha">
      <div><label>CPF/CNPJ</label><input id="cDoc" value="${esc(c.documento)}" inputmode="numeric"></div>
      <div><label>E-mail</label><input id="cEmail" type="email" value="${esc(c.email)}"></div>
    </div>
    ${'contacts' in navigator && 'ContactsManager' in window ? '<div class="botoes"><button class="btn sec" id="cAgenda">📇 Importar da agenda</button></div>' : ''}
    <div class="botoes">
      ${novo ? '' : '<button class="btn perigo" id="cDel">Excluir</button>'}
      <button class="btn" id="cOk">Salvar</button>
    </div>`, () => {
    const ag = $('#cAgenda');
    if (ag) ag.onclick = async () => {
      try {
        const [p] = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: false });
        if (p) { $('#cNome').value = p.name?.[0] || ''; $('#cTel').value = p.tel?.[0] || ''; $('#cEmail').value = p.email?.[0] || ''; }
      } catch (e) { }
    };
    $('#cOk').onclick = () => {
      const nome = $('#cNome').value.trim();
      if (!nome) { toast('Informe o nome do cliente.'); return; }
      Object.assign(c, { nome, telefone: $('#cTel').value.trim(), endereco: $('#cEnd').value.trim(), documento: $('#cDoc').value.trim(), email: $('#cEmail').value.trim() });
      if (novo) DB.clientes.push(c);
      salvar(); fecharModal(); depois && depois(c);
    };
    const d = $('#cDel');
    if (d) d.onclick = () => {
      if (!confirm('Excluir este cliente? Os orçamentos dele continuam salvos.')) return;
      DB.orcamentos.forEach(o => { if (o.clienteId === c.id) { o.cliente = { ...c }; o.clienteId = ''; } });
      DB.clientes = DB.clientes.filter(x => x.id !== c.id); salvar(); fecharModal(); depois && depois(c);
    };
  });
}

function telaClientes() {
  topo('Clientes');
  const lista = DB.clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  view.innerHTML = lista.length ? lista.map(c => {
    const qtd = DB.orcamentos.filter(o => o.clienteId === c.id).length;
    return `<div class="lista-item" data-id="${c.id}">
      <div class="info"><div class="t">${esc(c.nome)}</div><div class="s">${esc([c.telefone, c.endereco].filter(Boolean).join(' · ') || 'Sem contato')}</div></div>
      <div class="v" style="font-size:13px;color:var(--suave)">${qtd} orç.</div>
      ${c.telefone ? `<a class="btn whats peq" href="https://wa.me/${foneWhats(c.telefone)}" target="_blank" onclick="event.stopPropagation()">💬</a>` : ''}
    </div>`;
  }).join('') : '<div class="vazio"><b>👤</b>Nenhum cliente cadastrado.<br>Toque no <strong>+</strong> para adicionar.</div>';
  view.querySelectorAll('.lista-item').forEach(d => d.onclick = () => formCliente(DB.clientes.find(c => c.id === d.dataset.id), telaClientes));
  fab(() => formCliente(null, telaClientes));
}

// ---------- Catálogo ----------
function formCatalogo(item, depois) {
  const novo = !item;
  item = item || { id: uid(), tipo: tipoCat, desc: '', un: 'un', preco: 0 };
  abrirModal(novo ? 'Novo item' : 'Editar item', `
    <div class="seg" id="segI"><button data-v="servico" class="${item.tipo === 'servico' ? 'ativo' : ''}">Serviço</button><button data-v="material" class="${item.tipo === 'material' ? 'ativo' : ''}">Material</button></div>
    <label>Descrição *</label><input id="iDesc" value="${esc(item.desc)}">
    <div class="linha">
      <div><label>Unidade</label><input id="iUn" value="${esc(item.un)}" placeholder="un, m, pt, rl"></div>
      <div><label>Preço (R$)</label><input id="iPreco" inputmode="decimal" value="${parseNum(item.preco).toFixed(2).replace('.', ',')}"></div>
    </div>
    <div class="botoes">${novo ? '' : '<button class="btn perigo" id="iDel">Excluir</button>'}<button class="btn" id="iOk">Salvar</button></div>`, corpo => {
    let tp = item.tipo;
    corpo.querySelectorAll('#segI button').forEach(b => b.onclick = () => { tp = b.dataset.v; corpo.querySelectorAll('#segI button').forEach(x => x.classList.toggle('ativo', x === b)); });
    $('#iOk').onclick = () => {
      const desc = $('#iDesc').value.trim();
      if (!desc) { toast('Informe a descrição.'); return; }
      Object.assign(item, { tipo: tp, desc, un: $('#iUn').value.trim() || 'un', preco: parseNum($('#iPreco').value) });
      if (novo) DB.catalogo.push(item);
      salvar(); fecharModal(); depois();
    };
    const d = $('#iDel');
    if (d) d.onclick = () => { if (confirm('Excluir item do catálogo?')) { DB.catalogo = DB.catalogo.filter(x => x.id !== item.id); salvar(); fecharModal(); depois(); } };
  });
}

function telaCatalogo() {
  topo('Catálogo de preços', { acao: { texto: '% Reajustar', fn: reajustar } });
  const termo = buscaCat.toLowerCase();
  const lista = DB.catalogo.filter(c => c.tipo === tipoCat && c.desc.toLowerCase().includes(termo)).sort((a, b) => a.desc.localeCompare(b.desc));
  view.innerHTML = `
    <div class="seg" id="segCat" style="margin-bottom:10px">
      <button data-v="servico" class="${tipoCat === 'servico' ? 'ativo' : ''}">Serviços</button>
      <button data-v="material" class="${tipoCat === 'material' ? 'ativo' : ''}">Materiais</button>
    </div>
    <input class="busca" type="search" id="buscaCat" placeholder="Buscar..." value="${esc(buscaCat)}">
    ${lista.map(c => `<div class="lista-item" data-id="${c.id}"><div class="info"><div class="t" style="white-space:normal">${esc(c.desc)}</div><div class="s">por ${esc(c.un)}</div></div><div class="v">${fmtBRL(c.preco)}</div></div>`).join('') || '<div class="vazio">Nenhum item.</div>'}
    <p class="ajuda">Preços de referência — ajuste para a sua região. Toque num item para editar.</p>`;
  view.querySelectorAll('#segCat button').forEach(b => b.onclick = () => { tipoCat = b.dataset.v; telaCatalogo(); });
  $('#buscaCat').oninput = e => { buscaCat = e.target.value; const p = e.target.selectionStart; telaCatalogo(); const i = $('#buscaCat'); i.focus(); i.setSelectionRange(p, p); };
  view.querySelectorAll('.lista-item').forEach(d => d.onclick = () => formCatalogo(DB.catalogo.find(c => c.id === d.dataset.id), telaCatalogo));
  fab(() => formCatalogo(null, telaCatalogo));
}

function reajustar() {
  abrirModal('Reajustar preços', `
    <label>Percentual de reajuste (%)</label><input id="rPct" inputmode="decimal" placeholder="Ex.: 10 (ou -5 para reduzir)">
    <label>Aplicar em</label>
    <select id="rTipo"><option value="servico">Serviços</option><option value="material">Materiais</option><option value="todos">Todos</option></select>
    <div class="botoes"><button class="btn" id="rOk">Aplicar</button></div>`, () => {
    $('#rTipo').value = tipoCat;
    $('#rOk').onclick = () => {
      const pct = parseNum($('#rPct').value), tp = $('#rTipo').value;
      if (!pct) { toast('Informe o percentual.'); return; }
      DB.catalogo.forEach(c => { if (tp === 'todos' || c.tipo === tp) c.preco = Math.round(c.preco * (1 + pct / 100) * 100) / 100; });
      salvar(); fecharModal(); telaCatalogo(); toast('Preços reajustados em ' + fmtNum(pct) + '%');
    };
  });
}

// ---------- Configurações da empresa ----------
function telaConfig() {
  topo('Minha empresa');
  const c = DB.config;
  const campo = (f, rot, extra = '') => `<label>${rot}</label><input data-c="${f}" value="${esc(c[f])}" ${extra}>`;
  view.innerHTML = `
    <div class="card">
      <h3>Dados que aparecem no PDF</h3>
      ${campo('empresa', 'Nome / empresa *')}
      ${campo('documento', 'CPF ou CNPJ', 'inputmode="numeric"')}
      ${campo('telefone', 'Telefone / WhatsApp', 'type="tel"')}
      ${campo('email', 'E-mail', 'type="email"')}
      ${campo('endereco', 'Endereço')}
      ${campo('cidade', 'Cidade / UF')}
      ${campo('pix', 'Chave Pix (aparece no PDF e na mensagem)')}
      <label>Logo</label>
      <div class="logo-prev">${c.logo ? `<img src="${c.logo}" alt="Logo">` : ''}
        <input type="file" accept="image/*" id="logoArq" style="flex:1">
      </div>
      ${c.logo ? '<div class="botoes"><button class="btn perigo peq" id="logoRm">Remover logo</button></div>' : ''}
      <label>Cor do PDF</label><input type="color" data-c="cor" value="${c.cor}" style="height:48px;padding:4px">
    </div>
    <div class="card">
      <h3>Padrões para novos orçamentos</h3>
      ${campo('validadeDias', 'Validade (dias)', 'inputmode="numeric"')}
      <label>Forma de pagamento</label><textarea data-c="pagamento">${esc(c.pagamento)}</textarea>
      <label>Garantia</label><textarea data-c="garantia">${esc(c.garantia)}</textarea>
      <label>Observações</label><textarea data-c="observacoes">${esc(c.observacoes)}</textarea>
      ${campo('proximoNumero', 'Próximo número de orçamento', 'inputmode="numeric"')}
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="ajuda" style="margin-top:0">Os dados ficam salvos só neste aparelho. Faça backup de vez em quando ou para passar para outro celular.</p>
      <div class="botoes">
        <button class="btn sec" id="bkExp">⬇️ Exportar backup</button>
        <label class="btn sec" style="margin:0;color:var(--azul)">⬆️ Importar<input type="file" accept=".json,application/json" id="bkImp" hidden></label>
      </div>
    </div>`;
  view.querySelectorAll('[data-c]').forEach(el => el.addEventListener('input', () => {
    const f = el.dataset.c;
    c[f] = (f === 'validadeDias' || f === 'proximoNumero') ? Math.max(f === 'proximoNumero' ? 1 : 0, parseInt(el.value) || 0) : el.value;
    salvar();
  }));
  $('#logoArq').onchange = e => {
    const arq = e.target.files[0]; if (!arq) return;
    const img = new Image();
    img.onload = () => {
      const max = 400, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      c.logo = cv.toDataURL('image/png'); salvar(); telaConfig(); toast('Logo salva');
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(arq);
  };
  const rm = $('#logoRm'); if (rm) rm.onclick = () => { c.logo = ''; salvar(); telaConfig(); };
  $('#bkExp').onclick = () => {
    const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-orcamentos-${hoje()}.json`; a.click();
  };
  $('#bkImp').onchange = e => {
    const arq = e.target.files[0]; if (!arq) return;
    arq.text().then(txt => {
      try {
        const d = JSON.parse(txt);
        if (!d.config || !Array.isArray(d.orcamentos)) throw new Error();
        if (!confirm('Substituir os dados deste aparelho pelo backup?')) return;
        localStorage.setItem(CHAVE, txt); carregar(); toast('Backup restaurado'); telaConfig();
      } catch (er) { toast('Arquivo de backup inválido.'); }
    });
  };
}

// ---------- Início ----------
rota();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
