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
  const lg = $('#logoTopo');
  lg.hidden = !DB.config.logo || voltar;
  if (DB.config.logo && lg.src !== DB.config.logo) lg.src = DB.config.logo;
  $('#titulo').classList.toggle('com-logo', !lg.hidden);
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
  let [, tela, id] = (location.hash || '#/orcamentos').split('/');
  if (!DB.config.configurado) tela = 'boasvindas';
  document.body.classList.toggle('editor', tela === 'orcamento');
  document.body.classList.toggle('boasvindas', tela === 'boasvindas');
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('ativo', a.dataset.tab === tela));
  document.querySelector('.fab')?.remove();
  window.scrollTo(0, 0);
  ({ orcamentos: telaOrcamentos, orcamento: () => telaEditor(id), clientes: telaClientes, catalogo: telaCatalogo, config: telaConfig, boasvindas: telaBoasVindas }[tela] || telaOrcamentos)();
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
  const cont = st => DB.orcamentos.filter(o => o.status === st).length;
  const decididos = cont('aprovado') + cont('recusado') + cont('enviado');
  const taxa = decididos ? Math.round(cont('aprovado') * 100 / decididos) + '%' : '—';

  view.innerHTML = `
    <div class="resumo">
      <div><small>Enviados</small><strong>${fmtBRL(somar('enviado'))}</strong></div>
      <div><small>Aprovados</small><strong>${fmtBRL(somar('aprovado'))}</strong></div>
      <div><small>Aprovação</small><strong>${taxa}</strong></div>
    </div>
    <input class="busca" type="search" placeholder="Buscar por cliente, nº ou serviço" value="${esc(buscaOrc)}" id="buscaOrc">
    <div class="filtros">${['todos', ...Object.keys(STATUS)].map(s =>
      `<button data-s="${s}" class="${s === filtroStatus ? 'ativo' : ''}">${s === 'todos' ? 'Todos' : STATUS[s]}</button>`).join('')}</div>
    <div id="listaOrc">${lista.length ? lista.map(o => `
      <a class="lista-item" href="#/orcamento/${o.id}">
        <div class="info">
          <div class="t">${esc(clienteDe(o).nome || 'Sem cliente')}</div>
          <div class="s"><span class="num-badge">Nº ${numero(o.numero)}</span> · ${fmtData(o.data)}${o.titulo ? ' · ' + esc(o.titulo) : ''}</div>
          <span class="chip ${o.status}">${STATUS[o.status]}</span>${aguardando(o)}
        </div>
        <div class="v">${fmtBRL(totais(o).total)}</div>
      </a>`).join('') : `<div class="vazio"><b>📄</b>${DB.orcamentos.length ? 'Nenhum orçamento encontrado.' : 'Nenhum orçamento ainda.<br>Toque no <strong>+</strong> para criar o primeiro.'}</div>`}
    </div>
    ${!DB.config.logo ? `<div class="card dica"><h3>Deixe seus orçamentos com a sua cara</h3>Coloque a logo da sua empresa: ela aparece no topo de todo PDF enviado.<div class="botoes"><a class="btn amarelo" href="#/config">Colocar minha logo</a></div></div>` : ''}`;
  $('#buscaOrc').oninput = e => { buscaOrc = e.target.value; const pos = e.target.selectionStart; telaOrcamentos(); const i = $('#buscaOrc'); i.focus(); i.setSelectionRange(pos, pos); };
  view.querySelectorAll('.filtros button').forEach(b => b.onclick = () => { filtroStatus = b.dataset.s; telaOrcamentos(); });
  fab(() => novoOrcamento());
}

// Dias desde o envio, para lembrar de cobrar retorno do cliente
function diasDesdeEnvio(o) {
  if (o.status !== 'enviado' || !o.enviadoEm) return 0;
  return Math.floor((new Date(hoje() + 'T12:00:00') - new Date(o.enviadoEm + 'T12:00:00')) / 864e5);
}
function aguardando(o) {
  const d = diasDesdeEnvio(o);
  return d >= 2 ? ` <span class="chip aguardando">⏳ ${d} dias sem resposta</span>` : '';
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
      <label class="check"><input type="checkbox" id="chkMatCli" ${o.materiaisCliente ? 'checked' : ''}> Materiais comprados pelo cliente <small>(o PDF mostra só a lista, sem valores, e o total vira só a mão de obra)</small></label>
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
      if (f === 'status' && el.value === 'enviado' && !o.enviadoEm) o.enviadoEm = hoje();
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

  $('#chkMatCli').onchange = e => { o.materiaisCliente = e.target.checked; salvar(); desenharTotais(); };

  function desenharTotais() {
    const t = totais(o);
    $('#totais').innerHTML = `
      <div><span>Mão de obra</span><span>${fmtBRL(t.servicos)}</span></div>
      <div><span>Materiais${o.materiaisCliente ? ' <small>(cliente compra)</small>' : ''}</span><span ${o.materiaisCliente ? 'style="text-decoration:line-through;color:var(--suave)"' : ''}>${fmtBRL(t.materiais)}</span></div>
      ${t.desconto ? `<div><span>Desconto</span><span>- ${fmtBRL(t.desconto)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${fmtBRL(t.total)}</span></div>`;
    $('#totalBarra').textContent = fmtBRL(t.total);
  }

  function desenharItens() {
    const box = $('#itens');
    if (!o.itens.length) { box.innerHTML = '<p class="ajuda">Nenhum item. Adicione serviços e materiais abaixo.</p>'; desenharTotais(); return; }
    box.innerHTML = o.itens.map((i, n) => `
      <div class="item ${i.tipo}" data-n="${n}">
        <div class="item-topo">
          <span class="tag">${i.tipo === 'servico' ? 'Serviço' : 'Material'}</span>
          <span class="spacer"></span>
          <button class="mini" data-mv="-1" ${n === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button class="mini" data-mv="1" ${n === o.itens.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
          ${DB.catalogo.some(c => c.desc === i.desc && c.tipo === i.tipo) || !i.desc ? '' : '<button class="mini" data-cat aria-label="Salvar no catálogo" title="Salvar no catálogo">★</button>'}
          <button class="mini rm" data-rm="${n}" aria-label="Remover">✕</button>
        </div>
        <textarea data-i="desc" rows="1" placeholder="Descrição">${esc(i.desc)}</textarea>
        <div class="linha">
          <div class="qtd"><input data-i="qtd" inputmode="decimal" value="${fmtNum(i.qtd)}" aria-label="Quantidade"></div>
          <div class="un"><input data-i="un" value="${esc(i.un)}" aria-label="Unidade"></div>
          <div><input data-i="preco" inputmode="decimal" value="${parseNum(i.preco).toFixed(2).replace('.', ',')}" aria-label="Valor unitário"></div>
        </div>
        <div class="sub">${fmtBRL(parseNum(i.qtd) * parseNum(i.preco))}</div>
      </div>`).join('');
    box.querySelectorAll('.item').forEach(div => {
      const n = +div.dataset.n, i = o.itens[n];
      div.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
        const m = n + +b.dataset.mv;
        [o.itens[n], o.itens[m]] = [o.itens[m], o.itens[n]]; salvar(); desenharItens();
      });
      const bc = div.querySelector('[data-cat]');
      if (bc) bc.onclick = () => {
        DB.catalogo.push({ id: uid(), tipo: i.tipo, desc: i.desc.trim(), un: i.un || 'un', preco: parseNum(i.preco) });
        salvar(); bc.remove(); toast('Salvo no catálogo');
      };
      const ta = div.querySelector('textarea');
      const ajustar = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', ajustar); requestAnimationFrame(ajustar);
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
  const enviado = o.status === 'enviado';
  abrirModal('Opções', `
    <div class="botoes" style="flex-direction:column">
      ${enviado ? '<button class="btn whats" id="mCobrar">⏳ Cobrar retorno do cliente</button>' : ''}
      <button class="btn sec" id="mRecibo">🧾 Gerar recibo de pagamento</button>
      <button class="btn sec" id="mDup">📋 Duplicar orçamento</button>
      <button class="btn sec" id="mBaixar">⬇️ Baixar PDF</button>
      <button class="btn sec" id="mWhatsTxt">💬 Mandar resumo em texto no WhatsApp</button>
      <button class="btn perigo" id="mDel">🗑️ Excluir orçamento</button>
    </div>`, () => {
    if (enviado) $('#mCobrar').onclick = () => { fecharModal(); abrirWhatsTexto(o, mensagemCobranca(o)); };
    $('#mRecibo').onclick = () => formRecibo(o);
    $('#mDup').onclick = () => { fecharModal(); novoOrcamento(o); toast('Orçamento duplicado'); };
    $('#mBaixar').onclick = () => { fecharModal(); baixarPDF(o); };
    $('#mWhatsTxt').onclick = () => { fecharModal(); abrirWhatsTexto(o, mensagem(o, true)); };
    $('#mDel').onclick = () => {
      if (!confirm('Excluir este orçamento?')) return;
      DB.orcamentos = DB.orcamentos.filter(x => x.id !== o.id); salvar(); fecharModal();
      location.hash = '#/orcamentos';
    };
  });
}

function formRecibo(o) {
  if (!o.clienteId && !o.cliente) { fecharModal(); toast('Selecione o cliente antes de gerar o recibo.'); return; }
  const t = totais(o);
  abrirModal('Recibo de pagamento', `
    <label>Valor recebido (R$)</label>
    <input id="rValor" inputmode="decimal" value="${t.total.toFixed(2).replace('.', ',')}">
    <div class="botoes" style="margin-top:8px">
      <button class="btn sec peq" data-pct="100">Total</button>
      <button class="btn sec peq" data-pct="50">50% (sinal)</button>
      <button class="btn sec peq" data-pct="30">30%</button>
    </div>
    <label>Forma de pagamento</label>
    <select id="rForma"><option>Pix</option><option>dinheiro</option><option>cartão de crédito</option><option>cartão de débito</option><option>transferência bancária</option><option value="">(não informar)</option></select>
    <label>Referente a</label>
    <input id="rRef" value="${esc(o.titulo || 'serviços elétricos')}">
    <label>Data</label>
    <input type="date" id="rData" value="${hoje()}">
    <div class="botoes"><button class="btn whats bloco" id="rOk">📤 Gerar e enviar recibo</button></div>`, corpo => {
    corpo.querySelectorAll('[data-pct]').forEach(b => b.onclick = () => { $('#rValor').value = (t.total * b.dataset.pct / 100).toFixed(2).replace('.', ','); });
    $('#rOk').onclick = () => {
      const r = { valor: parseNum($('#rValor').value), forma: $('#rForma').value, referente: $('#rRef').value.trim(), data: $('#rData').value || hoje() };
      if (!r.valor) { toast('Informe o valor recebido.'); return; }
      fecharModal();
      const c = clienteDe(o);
      compartilhar(gerarRecibo(o, r), nomeArquivo(o, 'Recibo'), o,
        `Olá${c.nome ? ', ' + c.nome.split(' ')[0] : ''}! Segue o recibo de ${fmtBRL(r.valor)} referente a ${r.referente}. Obrigado pela confiança!${assinaturaMsg()}`);
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
function assinaturaMsg() {
  const cfg = DB.config, ig = igUsuario(cfg.instagram);
  let m = `\n\n${cfg.empresa}${cfg.telefone ? ' – ' + cfg.telefone : ''}`;
  if (ig) m += `\n📸 Veja meus trabalhos no Instagram: instagram.com/${ig}`;
  return m;
}
function mensagem(o, comItens) {
  const c = clienteDe(o), cfg = DB.config, t = totais(o);
  const tipo = o.tipoDoc === 'proposta' ? 'a proposta' : 'o orçamento';
  let m = `Olá${c.nome ? ', ' + c.nome.split(' ')[0] : ''}! Segue ${tipo} Nº ${numero(o.numero)}${o.titulo ? ' – ' + o.titulo : ''}.\n`;
  if (comItens) {
    m += '\n' + o.itens.map(i => `• ${fmtNum(i.qtd)} ${i.un} ${i.desc}` +
      (i.tipo === 'material' && o.materiaisCliente ? '' : ` – ${fmtBRL(parseNum(i.qtd) * parseNum(i.preco))}`)).join('\n') + '\n';
    if (o.materiaisCliente) m += '_(materiais por conta do cliente)_\n';
  }
  if (t.desconto) m += `\nDesconto: ${fmtBRL(t.desconto)}`;
  m += `\n*Total${o.materiaisCliente ? ' da mão de obra' : ''}: ${fmtBRL(t.total)}*\nVálido até ${fmtData(o.validade)}.`;
  if (cfg.pix) m += `\nChave Pix: ${cfg.pix}`;
  m += `\n\nQualquer dúvida estou à disposição.` + assinaturaMsg();
  return m;
}
function mensagemCobranca(o) {
  const c = clienteDe(o);
  return `Olá${c.nome ? ', ' + c.nome.split(' ')[0] : ''}, tudo bem? Passando para saber se conseguiu avaliar ` +
    `${o.tipoDoc === 'proposta' ? 'a proposta' : 'o orçamento'} Nº ${numero(o.numero)}${o.titulo ? ' (' + o.titulo + ')' : ''}, ` +
    `no valor de ${fmtBRL(totais(o).total)}. Ele vale até ${fmtData(o.validade)}. ` +
    `Posso agendar o serviço? Se tiver alguma dúvida ou quiser ajustar algo, é só me falar.` + assinaturaMsg();
}
function abrirWhatsTexto(o, texto) {
  const fone = foneWhats(clienteDe(o).telefone);
  window.open(`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`, '_blank');
}

// Abre o compartilhamento do celular com o PDF anexado; no computador baixa e abre o WhatsApp
async function compartilhar(doc, nome, o, texto) {
  const blob = doc.output('blob');
  const arquivo = new File([blob], nome, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome, text: texto });
      toast('Enviado!');
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  abrirWhatsTexto(o, texto);
  toast('PDF baixado. Anexe-o na conversa do WhatsApp.');
  return true;
}

async function enviar(o) {
  if (!validar(o)) return;
  if (!o.clienteId) { toast('Selecione o cliente antes de enviar.'); return; }
  const ok = await compartilhar(gerarPDF(o), nomeArquivo(o), o, mensagem(o, false));
  if (ok && o.status === 'rascunho') {
    o.status = 'enviado'; o.enviadoEm = hoje(); salvar();
    const s = view.querySelector('[data-f="status"]'); if (s) s.value = 'enviado';
  }
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
      Object.assign(c, { nome, telefone: fmtFone($('#cTel').value), endereco: $('#cEnd').value.trim(), documento: $('#cDoc').value.trim(), email: $('#cEmail').value.trim() });
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

// ---------- Marca: logo, Instagram e cor ----------
const CORES = ['#1b2a41', '#222222', '#1d4ed8', '#0f766e', '#15803d', '#b42318', '#c2410c', '#6d28d9'];

// Recorta as bordas vazias da logo, reduz o tamanho e descobre a cor principal dela
function processarLogo(arquivo) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const k1 = Math.min(1, 1200 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k1)), h = Math.max(1, Math.round(img.height * k1));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      const px = cx.getImageData(0, 0, w, h).data;
      let transp = false;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { transp = true; break; }
      let x0 = w, y0 = h, x1 = -1, y1 = -1, somaLum = 0, nOpaco = 0;
      const hist = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
        // vazio = transparente, ou fundo branco quando a imagem não tem transparência
        if (a < 16 || (!transp && r > 242 && g > 242 && b > 242)) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (a > 200) {
          somaLum += 0.299 * r + 0.587 * g + 0.114 * b; nOpaco++;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          if (sat > 50) { const q = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4); hist.set(q, (hist.get(q) || 0) + 1); }
        }
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k2 = Math.min(1, 600 / Math.max(cw, ch));
      const out = document.createElement('canvas'); out.width = Math.round(cw * k2); out.height = Math.round(ch * k2);
      const ox = out.getContext('2d');
      if (!transp) { ox.fillStyle = '#fff'; ox.fillRect(0, 0, out.width, out.height); }
      ox.drawImage(cv, x0, y0, cw, ch, 0, 0, out.width, out.height);
      // cor predominante (com saturação), escurecida se for clara demais para texto branco
      // entre as cores mais usadas, prefere uma que já seja escura (boa para texto branco)
      const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      const tops = [...hist.entries()].sort((a, b) => b[1] - a[1])
        .filter(([, n], i, arr) => n > nOpaco * 0.03 && n > arr[0][1] * 0.12)
        .map(([q]) => [q >> 8 & 15, q >> 4 & 15, q & 15].map(v => v * 16 + 8));
      let cor = null;
      if (tops.length) {
        let rgb = tops.find(c => lum(c) <= 130) || tops[0];
        while (lum(rgb) > 120) rgb = rgb.map(v => Math.round(v * 0.85));
        cor = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
      }
      ok({
        logo: transp ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.92),
        logoClara: transp && nOpaco > 0 && somaLum / nOpaco > 200,
        cor
      });
    };
    img.onerror = () => falha(new Error('imagem inválida'));
    img.src = URL.createObjectURL(arquivo);
  });
}

function previaCabecalho(c) {
  const ig = igUsuario(c.instagram);
  return `<div class="previa" style="background:${esc(c.cor)}">
    ${c.logo ? `<div class="previa-logo ${c.logoClara ? 'clara' : ''}"><img src="${c.logo}" alt=""></div>` : '<div class="previa-logo vazia">SUA<br>LOGO</div>'}
    <div class="previa-txt">
      <b>${esc(c.empresa || 'Nome da sua empresa')}</b>
      ${c.telefone ? `<span>WhatsApp: ${esc(c.telefone)}</span>` : ''}
      ${ig ? `<span>${ICONE_IG} @${esc(ig)}</span>` : ''}
      ${c.cidade ? `<span>${esc(c.cidade)}</span>` : ''}
    </div>
    <div class="previa-num"><small>ORÇAMENTO</small><b>Nº ${numero(c.proximoNumero)}</b></div>
  </div>`;
}
const ICONE_IG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" style="vertical-align:-2px"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.6" cy="6.4" r="1" fill="currentColor"/></svg>';

// Bloco reaproveitado na tela de boas-vindas e na tela da empresa
function blocoMarca(c, aoMudar) {
  return {
    html: `
      <div class="logo-zona" id="logoZona" role="button" tabindex="0">
        ${c.logo ? `<img src="${c.logo}" alt="Logo" class="${c.logoClara ? 'clara' : ''}">` : '<span class="logo-mais">＋</span><b>Toque para colocar sua logo</b><small>Foto ou imagem da galeria (PNG, JPG)</small>'}
      </div>
      <input type="file" accept="image/*" id="logoArq" hidden>
      ${c.logo ? '<div class="botoes" style="margin-top:8px"><button class="btn sec peq" id="logoTroca">Trocar logo</button><button class="btn perigo peq" id="logoRm">Remover</button></div>' : ''}
      <label>Nome da empresa ou seu nome *</label><input data-c="empresa" value="${esc(c.empresa === CONFIG_PADRAO.empresa ? '' : c.empresa)}" placeholder="Ex.: HSS Instalações Elétricas">
      <label>WhatsApp</label><input data-c="telefone" type="tel" value="${esc(c.telefone)}" placeholder="(12) 99999-9999">
      <label>Instagram</label>
      <div class="campo-ig"><span>@</span><input data-c="instagram" value="${esc(igUsuario(c.instagram))}" placeholder="seuperfil" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
      <label>Cidade / UF</label><input data-c="cidade" value="${esc(c.cidade)}" placeholder="Ex.: Taubaté/SP">
      <label>Cor do PDF</label>
      <div class="cores">${CORES.map(k => `<button class="cor ${k === c.cor ? 'ativa' : ''}" data-cor="${k}" style="background:${k}" aria-label="Cor ${k}"></button>`).join('')}
        <label class="cor outra" title="Outra cor"><input type="color" id="corLivre" value="${c.cor}">🎨</label></div>
      <p class="ajuda" id="dicaCor"></p>
      <label>Prévia do topo do PDF</label>
      <div id="previa">${previaCabecalho(c)}</div>`,
    ligar(raiz, redesenhar) {
      const atualizarPrevia = () => { raiz.querySelector('#previa').innerHTML = previaCabecalho(c); };
      raiz.querySelectorAll('[data-c]').forEach(el => el.addEventListener('input', () => {
        const f = el.dataset.c;
        c[f] = f === 'instagram' ? igUsuario(el.value) : el.value;
        salvar(); atualizarPrevia(); aoMudar && aoMudar();
      }));
      const tel = raiz.querySelector('[data-c="telefone"]');
      tel.addEventListener('change', () => { tel.value = c.telefone = fmtFone(tel.value); salvar(); atualizarPrevia(); });
      const ig = raiz.querySelector('[data-c="instagram"]');
      ig.addEventListener('change', () => { ig.value = igUsuario(ig.value); });
      const escolher = () => raiz.querySelector('#logoArq').click();
      raiz.querySelector('#logoZona').onclick = escolher;
      const tr = raiz.querySelector('#logoTroca'); if (tr) tr.onclick = escolher;
      const rm = raiz.querySelector('#logoRm'); if (rm) rm.onclick = () => { c.logo = ''; c.logoClara = false; salvar(); redesenhar(); };
      raiz.querySelector('#logoArq').onchange = async e => {
        const arq = e.target.files[0]; if (!arq) return;
        try {
          const r = await processarLogo(arq);
          c.logo = r.logo; c.logoClara = r.logoClara;
          if (r.cor && (c.cor === CONFIG_PADRAO.cor || !c.corEscolhida)) c.cor = r.cor;
          salvar(); redesenhar();
          toast(r.cor ? 'Logo salva! Usei a cor da sua logo no PDF.' : 'Logo salva!');
        } catch (er) { toast('Não consegui abrir essa imagem. Tente outra.'); }
      };
      const marcarCor = k => {
        c.cor = k; c.corEscolhida = true; salvar(); atualizarPrevia();
        raiz.querySelectorAll('.cor[data-cor]').forEach(b => b.classList.toggle('ativa', b.dataset.cor === k));
      };
      raiz.querySelectorAll('.cor[data-cor]').forEach(b => b.onclick = () => marcarCor(b.dataset.cor));
      raiz.querySelector('#corLivre').oninput = e => marcarCor(e.target.value);
    }
  };
}

function telaBoasVindas() {
  topo('Bem-vindo');
  const c = DB.config;
  const bloco = blocoMarca(c);
  view.innerHTML = `
    <div class="boas-vindas">
      <div class="bv-icone">⚡</div>
      <h2>Vamos deixar seus orçamentos com a sua marca</h2>
      <p>Preencha uma vez só. Sua logo, WhatsApp e Instagram vão aparecer em todo orçamento, proposta e recibo que você mandar.</p>
    </div>
    <div class="card">${bloco.html}</div>
    <div class="botoes"><button class="btn amarelo bloco" id="bvOk">Começar a fazer orçamentos →</button></div>
    <p class="ajuda" style="text-align:center"><a href="#" id="bvPular">Pular por enquanto</a> · dá para mudar tudo depois na aba Empresa</p>`;
  bloco.ligar(view, telaBoasVindas);
  const concluir = () => { c.configurado = true; salvar(); location.hash = '#/orcamentos'; rota(); };
  $('#bvOk').onclick = () => {
    if (!c.empresa || c.empresa === CONFIG_PADRAO.empresa) { toast('Coloque o nome da empresa ou o seu nome.'); view.querySelector('[data-c="empresa"]').focus(); return; }
    concluir();
  };
  $('#bvPular').onclick = e => { e.preventDefault(); concluir(); };
}

// ---------- Configurações da empresa ----------
function telaConfig() {
  topo('Minha empresa');
  const c = DB.config;
  const bloco = blocoMarca(c, () => { $('#logoTopo').hidden = !c.logo; });
  const campo = (f, rot, extra = '') => `<label>${rot}</label><input data-c2="${f}" value="${esc(c[f])}" ${extra}>`;
  view.innerHTML = `
    <div class="card">
      <h3>Sua marca</h3>
      ${bloco.html}
    </div>
    <div class="card">
      <h3>Outros dados do PDF</h3>
      ${campo('documento', 'CPF ou CNPJ', 'inputmode="numeric"')}
      ${campo('email', 'E-mail', 'type="email"')}
      ${campo('site', 'Site', 'placeholder="www.seusite.com.br" autocapitalize="off"')}
      ${campo('endereco', 'Endereço')}
      ${campo('pix', 'Chave Pix (aparece no PDF e na mensagem)')}
    </div>
    <div class="card">
      <h3>Padrões para novos orçamentos</h3>
      ${campo('validadeDias', 'Validade (dias)', 'inputmode="numeric"')}
      <label>Forma de pagamento</label><textarea data-c2="pagamento">${esc(c.pagamento)}</textarea>
      <label>Garantia</label><textarea data-c2="garantia">${esc(c.garantia)}</textarea>
      <label>Observações</label><textarea data-c2="observacoes">${esc(c.observacoes)}</textarea>
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
  bloco.ligar(view, telaConfig);
  view.querySelectorAll('[data-c2]').forEach(el => el.addEventListener('input', () => {
    const f = el.dataset.c2;
    c[f] = (f === 'validadeDias' || f === 'proximoNumero') ? Math.max(f === 'proximoNumero' ? 1 : 0, parseInt(el.value) || 0) : el.value;
    salvar();
  }));
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
