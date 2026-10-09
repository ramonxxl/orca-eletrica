// Geração dos PDFs (orçamento/proposta e recibo) com jsPDF + AutoTable, tudo no próprio aparelho
function hexRgb(hex) {
  const h = (hex || '#1b2a41').replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0);
}

function tipoImagem(dataUrl) { return /^data:image\/png/.test(dataUrl) ? 'PNG' : 'JPEG'; }

const PDF = { W: 210, M: 14, H_TOPO: 38 };

// Ícone do Instagram desenhado com formas (as fontes padrão do PDF não têm emoji)
function iconeInsta(doc, x, y, s, rgb) {
  doc.setDrawColor(...rgb); doc.setFillColor(...rgb); doc.setLineWidth(s * 0.11);
  doc.roundedRect(x, y, s, s, s * 0.28, s * 0.28, 'S');
  doc.circle(x + s / 2, y + s / 2, s * 0.22, 'S');
  doc.circle(x + s * 0.77, y + s * 0.23, s * 0.06, 'F');
  doc.setLineWidth(0.2);
}

// Linhas de contato da empresa: [texto, temIconeInsta]
function contatosEmpresa(cfg) {
  const ig = igUsuario(cfg.instagram);
  return [
    cfg.documento && ['CPF/CNPJ: ' + cfg.documento],
    [cfg.telefone && ('WhatsApp: ' + cfg.telefone), cfg.email].filter(Boolean).join('   '),
    ig && ['@' + ig + (cfg.site ? '   ' + cfg.site : ''), true],
    !ig && cfg.site && [cfg.site],
    [cfg.endereco, cfg.cidade].filter(Boolean).join(' - ')
  ].filter(Boolean).map(l => Array.isArray(l) ? l : [l]);
}

function cabecalho(doc, titulo, numeroTxt, linhasDir) {
  const cfg = DB.config, cor = hexRgb(cfg.cor), { W, M, H_TOPO } = PDF;
  doc.setFillColor(...cor);
  doc.rect(0, 0, W, H_TOPO, 'F');
  let xTexto = M;
  if (cfg.logo) {
    try {
      const p = doc.getImageProperties(cfg.logo);
      let h = 28, w = p.width * h / p.height;
      if (w > 48) { w = 48; h = p.height * w / p.width; }
      // logo clara (branca) fica direto sobre a faixa colorida; as demais ganham uma placa branca
      if (!cfg.logoClara) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(M - 2, 3.5, w + 4, 31, 2.5, 2.5, 'F');
      }
      doc.addImage(cfg.logo, tipoImagem(cfg.logo), M, 5 + (28 - h) / 2, w, h);
      xTexto = M + w + 7;
    } catch (e) { /* logo inválida: ignora */ }
  }
  const larguraTexto = W - M - 52 - xTexto;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(doc.splitTextToSize(cfg.empresa || '', larguraTexto)[0], xTexto, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
  contatosEmpresa(cfg).slice(0, 5).forEach(([l, insta], i) => {
    const yl = 16.5 + i * 4.2;
    if (insta) { iconeInsta(doc, xTexto, yl - 2.6, 3, [255, 255, 255]); doc.text(l, xTexto + 4.2, yl); }
    else doc.text(doc.splitTextToSize(l, larguraTexto)[0], xTexto, yl);
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
  doc.text(titulo, W - M, 11, { align: 'right' });
  doc.setFontSize(18);
  doc.text(numeroTxt, W - M, 19.5, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3);
  linhasDir.forEach((l, i) => doc.text(l, W - M, 26 + i * 4.3, { align: 'right' }));
}

function rodape(doc, texto) {
  const cfg = DB.config, { W, M } = PDF, n = doc.getNumberOfPages(), ig = igUsuario(cfg.instagram);
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(225, 228, 234); doc.line(M, 286, W - M, 286);
    doc.setFontSize(7.5); doc.setTextColor(140, 140, 140); doc.setFont('helvetica', 'normal');
    doc.text(texto, M, 290.5);
    if (ig) {
      const w = doc.getTextWidth('@' + ig);
      const x = W / 2 + 18 - w / 2;
      iconeInsta(doc, x - 4, 288.2, 2.6, [140, 140, 140]);
      doc.text('@' + ig, x, 290.5);
    }
    doc.text(`Página ${p} de ${n}`, W - M, 290.5, { align: 'right' });
  }
}

function caixaCliente(doc, cli, y, rotulo = 'CLIENTE') {
  const { W, M } = PDF, CW = W - 2 * M;
  const linhas = [
    [cli.telefone && ('Telefone: ' + fmtFone(cli.telefone)), cli.email && ('E-mail: ' + cli.email)].filter(Boolean).join('     '),
    cli.documento && ('CPF/CNPJ: ' + cli.documento),
    cli.endereco && ('Endereço: ' + cli.endereco)
  ].filter(Boolean);
  const h = 11 + linhas.length * 4.6;
  doc.setDrawColor(220, 224, 230); doc.setFillColor(246, 248, 251);
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 116, 130);
  doc.text(rotulo, M + 4, y + 5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
  doc.text(cli.nome || '—', M + 4, y + 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  linhas.forEach((l, i) => doc.text(doc.splitTextToSize(l, CW - 8)[0], M + 4, y + 15 + i * 4.6));
  return y + h;
}

function gerarPDF(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cfg = DB.config;
  const cor = hexRgb(cfg.cor);
  const cli = clienteDe(o);
  const t = totais(o);
  const { W, M } = PDF, CW = W - 2 * M;
  const tituloDoc = o.tipoDoc === 'proposta' ? 'PROPOSTA COMERCIAL' : 'ORÇAMENTO';

  cabecalho(doc, tituloDoc, 'Nº ' + numero(o.numero), ['Emissão: ' + fmtData(o.data), 'Válido até: ' + fmtData(o.validade)]);
  let y = caixaCliente(doc, cli, PDF.H_TOPO + 7) + 7;

  const secao = (titulo) => {
    if (y > 262) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...cor);
    doc.text(titulo.toUpperCase(), M, y);
    doc.setDrawColor(...cor); doc.setLineWidth(0.4); doc.line(M, y + 1.5, W - M, y + 1.5);
    doc.setLineWidth(0.2);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
  };
  const paragrafo = (texto) => {
    doc.splitTextToSize(String(texto), CW).forEach(l => {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(l, M, y); y += 4.6;
    });
    y += 3;
  };

  // ---------- Título / escopo ----------
  if (o.titulo || o.escopo) {
    secao(o.tipoDoc === 'proposta' ? 'Objeto e escopo do serviço' : 'Descrição do serviço');
    if (o.titulo) { doc.setFont('helvetica', 'bold'); paragrafo(o.titulo); doc.setFont('helvetica', 'normal'); if (o.escopo) y -= 2; else y += 2; }
    if (o.escopo) paragrafo(o.escopo);
  }

  // ---------- Tabelas ----------
  const estilos = {
    margin: { left: M, right: M, bottom: 16 },
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2, textColor: [40, 40, 40], lineColor: [225, 228, 234] },
    headStyles: { fillColor: cor, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [238, 241, 246], textColor: [30, 30, 30], fontStyle: 'bold' }
  };
  const tabela = (titulo, itens, subtotal) => {
    if (!itens.length) return;
    secao(titulo);
    doc.autoTable({
      ...estilos, startY: y,
      head: [['#', 'Descrição', 'Qtd', 'Un', 'Valor unit.', 'Total']],
      body: itens.map((i, n) => [n + 1, i.desc, fmtNum(i.qtd), i.un, fmtBRL(i.preco), fmtBRL(parseNum(i.qtd) * parseNum(i.preco))]),
      foot: [['', '', '', '', 'Subtotal', fmtBRL(subtotal)]],
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 11, halign: 'center' },
        4: { cellWidth: 27, halign: 'right' }, 5: { cellWidth: 29, halign: 'right' }
      },
      didParseCell: d => { if (d.section !== 'body' && d.column.index >= 4) d.cell.styles.halign = 'right'; }
    });
    y = doc.lastAutoTable.finalY + 8;
  };
  const valido = i => i.desc || parseNum(i.preco);
  const serv = o.itens.filter(i => i.tipo === 'servico' && valido(i));
  const mat = o.itens.filter(i => i.tipo === 'material' && valido(i));
  tabela('Serviços (mão de obra)', serv, t.servicos);
  if (o.materiaisCliente) {
    if (mat.length) {
      secao('Lista de materiais (compra por conta do cliente)');
      doc.autoTable({
        ...estilos, startY: y,
        head: [['#', 'Descrição', 'Qtd', 'Un']],
        body: mat.map((i, n) => [n + 1, i.desc, fmtNum(i.qtd), i.un]),
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 14, halign: 'center' } }
      });
      y = doc.lastAutoTable.finalY + 4;
      doc.setFontSize(8.5); doc.setTextColor(110, 116, 130);
      paragrafo('Os materiais acima não estão inclusos no valor. Quantidades estimadas; marcas e modelos podem ser combinados com o eletricista.');
      y += 2;
    }
  } else {
    tabela('Materiais', mat, t.materiais);
  }

  // ---------- Totais ----------
  const linhasTot = [];
  if (serv.length && mat.length && !o.materiaisCliente) {
    linhasTot.push(['Mão de obra', fmtBRL(t.servicos)], ['Materiais', fmtBRL(t.materiais)]);
  }
  if (t.desconto > 0) {
    linhasTot.push(['Subtotal', fmtBRL(t.subtotal)]);
    linhasTot.push(['Desconto' + (o.descontoTipo === '%' ? ` (${fmtNum(o.desconto)}%)` : ''), '- ' + fmtBRL(t.desconto)]);
  }
  const hTot = linhasTot.length * 5.5 + 14;
  if (y + hTot > 282) { doc.addPage(); y = 18; }
  const xT = W - M - 80;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 60, 60);
  linhasTot.forEach(([a, b]) => { doc.text(a, xT + 3, y); doc.text(b, W - M - 3, y, { align: 'right' }); y += 5.5; });
  doc.setFillColor(...cor);
  doc.roundedRect(xT, y - 3, 80, 11, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(o.materiaisCliente ? 'TOTAL MÃO DE OBRA' : 'TOTAL', xT + 4, y + 4.2);
  doc.text(fmtBRL(t.total), W - M - 4, y + 4.2, { align: 'right' });
  y += 17;
  doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'normal');

  // ---------- Condições ----------
  const cond = [
    o.prazo && ['Prazo de execução', o.prazo],
    o.pagamento && ['Forma de pagamento', o.pagamento + (cfg.pix ? `\nChave Pix: ${cfg.pix}` : '')],
    o.garantia && ['Garantia', o.garantia],
    o.observacoes && ['Observações', o.observacoes]
  ].filter(Boolean);
  if (cond.length) {
    secao('Condições');
    cond.forEach(([k, v]) => {
      if (y > 276) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.text(k + ':', M, y); y += 4.6;
      doc.setFont('helvetica', 'normal'); paragrafo(v); y -= 1;
    });
  }

  // ---------- Assinaturas ----------
  if (y > 252) { doc.addPage(); y = 30; } else y += 14;
  assinaturas(doc, y, cfg.empresa || 'Prestador', 'De acordo: ' + (cli.nome || 'Cliente'), true);

  rodape(doc, `${tituloDoc} Nº ${numero(o.numero)} · ${cfg.empresa || ''}`);
  return doc;
}

function assinaturas(doc, y, esq, dir, comData) {
  const { W, M } = PDF, wa = 78;
  doc.setDrawColor(120, 120, 120);
  if (esq) doc.line(M, y, M + wa, y);
  if (dir) doc.line(W - M - wa, y, W - M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  if (esq) doc.text(esq, M + wa / 2, y + 4.5, { align: 'center' });
  if (dir) doc.text(dir, W - M - wa / 2, y + 4.5, { align: 'center' });
  if (comData) doc.text('Data: ____/____/______', W - M - wa / 2, y + 9, { align: 'center' });
}

// ---------- Recibo ----------
function gerarRecibo(o, r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cfg = DB.config, cor = hexRgb(cfg.cor), cli = clienteDe(o);
  const { W, M } = PDF, CW = W - 2 * M;

  cabecalho(doc, 'RECIBO', fmtBRL(r.valor), ['Ref. ' + (o.tipoDoc === 'proposta' ? 'proposta' : 'orçamento') + ' Nº ' + numero(o.numero), 'Data: ' + fmtData(r.data)]);
  let y = caixaCliente(doc, cli, PDF.H_TOPO + 7, 'PAGADOR') + 12;

  const ref = o.titulo || 'serviços elétricos';
  const texto = `Recebi de ${cli.nome || '____________________'}${cli.documento ? ', CPF/CNPJ ' + cli.documento : ''}, a importância de ` +
    `${fmtBRL(r.valor)} (${extenso(r.valor)}), referente a ${r.referente || ref}` +
    `${r.forma ? ', pago via ' + r.forma : ''}.`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.setTextColor(30, 30, 30);
  doc.splitTextToSize(texto, CW).forEach(l => { doc.text(l, M, y); y += 6.5; });
  y += 4;

  const t = totais(o);
  if (r.valor < t.total - 0.005) {
    doc.setFontSize(9.5); doc.setTextColor(90, 90, 90);
    doc.text(`Valor total do serviço: ${fmtBRL(t.total)}   ·   Restante a pagar: ${fmtBRL(t.total - r.valor)}`, M, y);
    y += 8;
  }
  doc.setFontSize(9.5); doc.setTextColor(90, 90, 90);
  doc.text('Para maior clareza, firmo o presente recibo, dando plena quitação do valor acima.', M, y);
  y += 10;
  doc.setTextColor(30, 30, 30); doc.setFontSize(10.5);
  doc.text(`${cfg.cidade ? cfg.cidade + ', ' : ''}${dataExtenso(r.data)}.`, M, y);

  y += 30;
  const wa = 100;
  doc.setDrawColor(120, 120, 120); doc.line(W / 2 - wa / 2, y, W / 2 + wa / 2, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(cfg.empresa || '', W / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  if (cfg.documento) doc.text('CPF/CNPJ: ' + cfg.documento, W / 2, y + 9.5, { align: 'center' });

  doc.setDrawColor(...cor); doc.setLineWidth(0.6);
  doc.roundedRect(M - 4, PDF.H_TOPO + 3, CW + 8, y + 16 - PDF.H_TOPO, 3, 3, 'S');
  doc.setLineWidth(0.2);

  rodape(doc, `RECIBO · ${cfg.empresa || ''}`);
  return doc;
}

// ---------- Valores por extenso ----------
function extenso(valor) {
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => {
    if (n === 100) return 'cem';
    const p = [];
    if (n >= 100) p.push(c[Math.floor(n / 100)]);
    const r = n % 100;
    if (r >= 20) { p.push(d[Math.floor(r / 10)]); if (r % 10) p.push(u[r % 10]); }
    else if (r) p.push(u[r]);
    return p.join(' e ');
  };
  const inteiro = n => {
    if (n === 0) return 'zero';
    const mi = Math.floor(n / 1e6), mil = Math.floor(n / 1000) % 1000, resto = n % 1000;
    const p = [];
    if (mi) p.push(mi === 1 ? 'um milhão' : ate999(mi) + ' milhões');
    if (mil) p.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
    if (resto) p.push(ate999(resto));
    if (p.length === 1) return p[0];
    const ult = p.pop();
    return p.join(', ') + ((resto && (resto < 100 || resto % 100 === 0)) ? ' e ' : ' ') + ult;
  };
  const tot = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(tot / 100), cent = tot % 100;
  const partes = [];
  if (reais) partes.push(inteiro(reais) + (reais === 1 ? ' real' : ((reais % 1e6 === 0) ? ' de reais' : ' reais')));
  if (cent) partes.push(inteiro(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return partes.join(' e ') || 'zero reais';
}

function dataExtenso(iso) {
  const m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const x = new Date(iso + 'T12:00:00');
  return `${x.getDate()} de ${m[x.getMonth()]} de ${x.getFullYear()}`;
}

function nomeArquivo(o, prefixo) {
  const cli = clienteDe(o);
  const base = `${prefixo || (o.tipoDoc === 'proposta' ? 'Proposta' : 'Orcamento')}_${numero(o.numero)}_${cli.nome || 'cliente'}`;
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_') + '.pdf';
}
