// Geração do PDF do orçamento/proposta (jsPDF + AutoTable), tudo no próprio aparelho
function hexRgb(hex) {
  const h = (hex || '#1b2a41').replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0);
}

function tipoImagem(dataUrl) { return /^data:image\/png/.test(dataUrl) ? 'PNG' : 'JPEG'; }

function gerarPDF(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cfg = DB.config;
  const cor = hexRgb(cfg.cor);
  const cli = clienteDe(o);
  const t = totais(o);
  const W = 210, M = 14, CW = W - 2 * M;
  const tituloDoc = o.tipoDoc === 'proposta' ? 'PROPOSTA COMERCIAL' : 'ORÇAMENTO';

  // ---------- Cabeçalho ----------
  doc.setFillColor(...cor);
  doc.rect(0, 0, W, 34, 'F');
  let xTexto = M;
  if (cfg.logo) {
    try {
      const p = doc.getImageProperties(cfg.logo);
      let h = 24, w = p.width * h / p.height;
      if (w > 40) { w = 40; h = p.height * w / p.width; }
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M - 1, 5, w + 2, 26, 2, 2, 'F');
      doc.addImage(cfg.logo, tipoImagem(cfg.logo), M, 6 + (24 - h) / 2, w, h);
      xTexto = M + w + 6;
    } catch (e) { /* logo inválida: ignora */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(cfg.empresa || '', xTexto, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const linhasEmp = [
    cfg.documento && ('CPF/CNPJ: ' + cfg.documento),
    [cfg.telefone && ('Tel/WhatsApp: ' + cfg.telefone), cfg.email].filter(Boolean).join('   '),
    [cfg.endereco, cfg.cidade].filter(Boolean).join(' - ')
  ].filter(Boolean);
  linhasEmp.forEach((l, i) => doc.text(doc.splitTextToSize(l, 110)[0], xTexto, 19 + i * 4.3));

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(tituloDoc, W - M, 12, { align: 'right' });
  doc.setFontSize(18);
  doc.text('Nº ' + numero(o.numero), W - M, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('Emissão: ' + fmtData(o.data), W - M, 26, { align: 'right' });
  doc.text('Válido até: ' + fmtData(o.validade), W - M, 30.3, { align: 'right' });

  // ---------- Cliente ----------
  let y = 42;
  doc.setTextColor(40, 40, 40);
  doc.setDrawColor(220, 224, 230);
  doc.setFillColor(246, 248, 251);
  const linhasCli = [
    [cli.telefone && ('Telefone: ' + cli.telefone), cli.email && ('E-mail: ' + cli.email)].filter(Boolean).join('     '),
    cli.documento && ('CPF/CNPJ: ' + cli.documento),
    cli.endereco && ('Endereço: ' + cli.endereco)
  ].filter(Boolean);
  const hCli = 11 + linhasCli.length * 4.6;
  doc.roundedRect(M, y, CW, hCli, 2, 2, 'FD');
  doc.setFontSize(7.5); doc.setTextColor(110, 116, 130);
  doc.text('CLIENTE', M + 4, y + 5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
  doc.text(cli.nome || '—', M + 4, y + 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  linhasCli.forEach((l, i) => doc.text(doc.splitTextToSize(l, CW - 8)[0], M + 4, y + 15 + i * 4.6));
  y += hCli + 7;

  const secao = (titulo) => {
    if (y > 265) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...cor);
    doc.text(titulo.toUpperCase(), M, y);
    doc.setDrawColor(...cor); doc.setLineWidth(0.4); doc.line(M, y + 1.5, W - M, y + 1.5);
    doc.setLineWidth(0.2);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
  };
  const paragrafo = (texto) => {
    const linhas = doc.splitTextToSize(String(texto), CW);
    linhas.forEach(l => {
      if (y > 282) { doc.addPage(); y = 18; }
      doc.text(l, M, y); y += 4.6;
    });
    y += 3;
  };

  // ---------- Título / escopo ----------
  if (o.titulo || o.escopo) {
    secao(o.tipoDoc === 'proposta' ? 'Objeto e escopo do serviço' : 'Descrição do serviço');
    if (o.titulo) { doc.setFont('helvetica', 'bold'); paragrafo(o.titulo); doc.setFont('helvetica', 'normal'); y -= 2; }
    if (o.escopo) paragrafo(o.escopo);
  }

  // ---------- Tabelas ----------
  const tabela = (titulo, itens, subtotal) => {
    if (!itens.length) return;
    secao(titulo);
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      head: [['#', 'Descrição', 'Qtd', 'Un', 'Valor unit.', 'Total']],
      body: itens.map((i, n) => [n + 1, i.desc, fmtNum(i.qtd), i.un, fmtBRL(i.preco), fmtBRL(parseNum(i.qtd) * parseNum(i.preco))]),
      foot: [['', '', '', '', 'Subtotal', fmtBRL(subtotal)]],
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 2, textColor: [40, 40, 40], lineColor: [225, 228, 234] },
      headStyles: { fillColor: cor, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [238, 241, 246], textColor: [30, 30, 30], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 11, halign: 'center' },
        4: { cellWidth: 27, halign: 'right' }, 5: { cellWidth: 29, halign: 'right' }
      },
      didParseCell: d => { if (d.section !== 'body' && d.column.index >= 4) d.cell.styles.halign = 'right'; }
    });
    y = doc.lastAutoTable.finalY + 8;
  };
  const serv = o.itens.filter(i => i.tipo === 'servico' && (i.desc || parseNum(i.preco)));
  const mat = o.itens.filter(i => i.tipo === 'material' && (i.desc || parseNum(i.preco)));
  tabela('Serviços (mão de obra)', serv, t.servicos);
  tabela('Materiais', mat, t.materiais);

  // ---------- Totais ----------
  const linhasTot = [];
  if (serv.length && mat.length) {
    linhasTot.push(['Mão de obra', fmtBRL(t.servicos)], ['Materiais', fmtBRL(t.materiais)]);
  }
  if (t.desconto > 0) {
    linhasTot.push(['Subtotal', fmtBRL(t.subtotal)]);
    linhasTot.push(['Desconto' + (o.descontoTipo === '%' ? ` (${fmtNum(o.desconto)}%)` : ''), '- ' + fmtBRL(t.desconto)]);
  }
  const hTot = linhasTot.length * 5.5 + 14;
  if (y + hTot > 285) { doc.addPage(); y = 18; }
  const xT = W - M - 80;
  doc.setFontSize(9.5); doc.setTextColor(60, 60, 60);
  linhasTot.forEach(([a, b]) => { doc.text(a, xT + 3, y); doc.text(b, W - M - 3, y, { align: 'right' }); y += 5.5; });
  doc.setFillColor(...cor);
  doc.roundedRect(xT, y - 3, 80, 11, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('TOTAL', xT + 4, y + 4.2);
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
      if (y > 278) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.text(k + ':', M, y); y += 4.6;
      doc.setFont('helvetica', 'normal'); paragrafo(v); y -= 1;
    });
  }

  // ---------- Assinaturas ----------
  if (y > 255) { doc.addPage(); y = 30; } else y += 14;
  doc.setDrawColor(120, 120, 120);
  const wa = 78;
  doc.line(M, y, M + wa, y); doc.line(W - M - wa, y, W - M, y);
  doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  doc.text(cfg.empresa || 'Prestador', M + wa / 2, y + 4.5, { align: 'center' });
  doc.text('De acordo: ' + (cli.nome || 'Cliente'), W - M - wa / 2, y + 4.5, { align: 'center' });
  doc.text('Data: ____/____/______', W - M - wa / 2, y + 9, { align: 'center' });

  // ---------- Rodapé em todas as páginas ----------
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
    doc.text(`${tituloDoc} Nº ${numero(o.numero)} · ${cfg.empresa || ''}`, M, 291);
    doc.text(`Página ${p} de ${n}`, W - M, 291, { align: 'right' });
  }
  return doc;
}

function nomeArquivo(o) {
  const cli = clienteDe(o);
  const base = `${o.tipoDoc === 'proposta' ? 'Proposta' : 'Orcamento'}_${numero(o.numero)}_${cli.nome || 'cliente'}`;
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_') + '.pdf';
}
