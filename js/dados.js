// Armazenamento local (no próprio celular) + valores padrão + utilitários
const CHAVE = 'orca-eletrica-v1';

const CATALOGO_PADRAO = [
  // Serviços (mão de obra) — preços de referência, ajuste para sua região
  ['servico', 'Visita técnica / diagnóstico', 'un', 120],
  ['servico', 'Instalação de tomada simples (ponto existente)', 'pt', 45],
  ['servico', 'Instalação de ponto novo de tomada (com passagem de fio)', 'pt', 90],
  ['servico', 'Instalação de interruptor', 'pt', 45],
  ['servico', 'Instalação de ponto de luz novo', 'pt', 90],
  ['servico', 'Instalação de luminária / plafon', 'un', 60],
  ['servico', 'Instalação de lustre / pendente', 'un', 120],
  ['servico', 'Instalação de fita / perfil de LED', 'm', 35],
  ['servico', 'Instalação de chuveiro elétrico', 'un', 90],
  ['servico', 'Troca de resistência de chuveiro', 'un', 60],
  ['servico', 'Instalação de ventilador de teto', 'un', 150],
  ['servico', 'Troca de disjuntor', 'un', 60],
  ['servico', 'Instalação de DR (diferencial residual)', 'un', 120],
  ['servico', 'Instalação de DPS', 'un', 90],
  ['servico', 'Montagem de quadro de distribuição (até 12 circuitos)', 'un', 650],
  ['servico', 'Troca de quadro de distribuição', 'un', 450],
  ['servico', 'Circuito dedicado para ar-condicionado', 'un', 350],
  ['servico', 'Ponto para cooktop / forno elétrico', 'un', 300],
  ['servico', 'Passagem de cabo / fiação', 'm', 8],
  ['servico', 'Instalação de eletroduto aparente', 'm', 18],
  ['servico', 'Padrão de entrada (mão de obra)', 'un', 900],
  ['servico', 'Aterramento (haste + conexões)', 'un', 280],
  ['servico', 'Instalação de sensor de presença', 'un', 70],
  ['servico', 'Instalação de interfone / campainha', 'un', 150],
  ['servico', 'Revisão geral da instalação elétrica', 'un', 350],
  ['servico', 'Diária de eletricista', 'dia', 350],
  // Materiais
  ['material', 'Cabo flexível 1,5 mm² (rolo 100 m)', 'rl', 160],
  ['material', 'Cabo flexível 2,5 mm² (rolo 100 m)', 'rl', 250],
  ['material', 'Cabo flexível 4 mm² (rolo 100 m)', 'rl', 400],
  ['material', 'Cabo flexível 6 mm² (rolo 100 m)', 'rl', 600],
  ['material', 'Cabo flexível 2,5 mm²', 'm', 3],
  ['material', 'Tomada 2P+T 10 A com placa', 'un', 18],
  ['material', 'Tomada 2P+T 20 A com placa', 'un', 22],
  ['material', 'Interruptor simples com placa', 'un', 16],
  ['material', 'Disjuntor DIN monopolar 10–32 A', 'un', 18],
  ['material', 'Disjuntor DIN bipolar 25–50 A', 'un', 65],
  ['material', 'DR bipolar 40 A 30 mA', 'un', 160],
  ['material', 'DPS 275 V 20 kA', 'un', 45],
  ['material', 'Quadro de distribuição 12 disjuntores', 'un', 95],
  ['material', 'Eletroduto corrugado 3/4" (rolo 50 m)', 'rl', 75],
  ['material', 'Caixa 4x2', 'un', 3],
  ['material', 'Fita isolante', 'un', 8],
  ['material', 'Conector de emenda (Wago)', 'un', 3],
  ['material', 'Haste de aterramento 2,4 m com conector', 'un', 70],
  ['material', 'Materiais diversos (pequenos)', 'vb', 50]
];

const CONFIG_PADRAO = {
  empresa: 'Seu Nome Eletricista',
  documento: '',
  telefone: '',
  email: '',
  instagram: '',
  site: '',
  endereco: '',
  cidade: '',
  pix: '',
  logo: '',
  cor: '#1b2a41',
  validadeDias: 15,
  pagamento: 'Pix, dinheiro ou cartão. 50% na aprovação e 50% na conclusão do serviço.',
  garantia: '90 dias sobre a mão de obra, conforme o Código de Defesa do Consumidor. Materiais conforme garantia do fabricante.',
  observacoes: 'Serviços executados conforme a norma ABNT NBR 5410. Não inclui obras civis (quebra/reparo de alvenaria, pintura), salvo se descrito acima.',
  proximoNumero: 1,
  configurado: false
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function estadoInicial() {
  return {
    config: { ...CONFIG_PADRAO },
    clientes: [],
    catalogo: CATALOGO_PADRAO.map(([tipo, desc, un, preco]) => ({ id: uid(), tipo, desc, un, preco })),
    orcamentos: []
  };
}

let DB;
function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    DB = bruto ? JSON.parse(bruto) : estadoInicial();
    DB.config = { ...CONFIG_PADRAO, ...DB.config };
    DB.clientes ||= []; DB.catalogo ||= []; DB.orcamentos ||= [];
    // quem já tinha personalizado o nome antes desta versão não vê a tela de boas-vindas
    if (bruto && !DB.config.configurado && DB.config.empresa !== 'Seu Nome Eletricista') DB.config.configurado = true;
  } catch (e) {
    DB = estadoInicial();
  }
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(DB)); }
  catch (e) { alert('Não foi possível salvar: memória do navegador cheia. Use uma logo menor ou faça backup e limpe orçamentos antigos.'); }
}

// ---------- utilitários ----------
const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
function parseNum(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const hoje = () => new Date().toISOString().slice(0, 10);
function addDias(iso, d) { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + Number(d || 0)); return x.toISOString().slice(0, 10); }
const fmtData = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '';
const numero = n => String(n).padStart(4, '0');
const soDigitos = s => String(s || '').replace(/\D/g, '');
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function totais(o) {
  const servicos = o.itens.filter(i => i.tipo === 'servico').reduce((s, i) => s + parseNum(i.qtd) * parseNum(i.preco), 0);
  const materiais = o.itens.filter(i => i.tipo === 'material').reduce((s, i) => s + parseNum(i.qtd) * parseNum(i.preco), 0);
  const subtotal = servicos + (o.materiaisCliente ? 0 : materiais);
  const d = parseNum(o.desconto);
  const desconto = Math.min(subtotal, o.descontoTipo === '%' ? subtotal * d / 100 : d);
  return { servicos, materiais, subtotal, desconto, total: subtotal - desconto };
}

function clienteDe(o) { return DB.clientes.find(c => c.id === o.clienteId) || o.cliente || {}; }

// "12988887777" -> "(12) 98888-7777"; outros formatos ficam como foram digitados
function fmtFone(s) {
  const d = soDigitos(s).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(s || '').trim();
}

// Telefone para link do WhatsApp (assume Brasil se não houver DDI)
function foneWhats(tel) {
  let d = soDigitos(tel);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d.replace(/^0+/, '');
  return d;
}

// Aceita "@perfil", "perfil" ou o link do perfil e devolve só "perfil"
function igUsuario(s) {
  return String(s || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@+/, '').split(/[/?#\s]/)[0];
}
