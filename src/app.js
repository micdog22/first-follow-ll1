// Interface da página: lê a gramática, mostra conjuntos, tabelas, traços e árvores.
import {
  EPSILON,
  analisar,
  analisarLL1,
  analisarSLR,
  codificarParaLink,
  colecaoLR0,
  decodificarLink,
  eliminarRecursaoEsquerda,
  fatorarEsquerda,
  gramaticaParaTexto,
  lerGramatica,
  ordenarSimbolos,
  recursaoEsquerda,
  tabelaLL1,
  tabelaSLR,
  textoAcao,
  textoItem,
  textoProducao,
} from './gramatica.js';
import { EXEMPLOS } from './exemplos.js';
import { layoutArvore } from './arvore.js';

const CHAVE = 'first-follow-ll1:gramatica';
const MAX_LINHAS_TRACO = 400;
const MAX_NOS_ARVORE = 600;
const SVG = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const estado = { g: null, conjuntos: null, ll1: null, colecao: null, slr: null, transformada: null };

// Cria um elemento; textos viram nós de texto (nunca HTML).
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    e.append(typeof f === 'string' ? document.createTextNode(f) : f);
  }
  return e;
}

function limpar(no) {
  while (no.firstChild) no.removeChild(no.firstChild);
}

function lerArmazenado() {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function salvar(texto) {
  try {
    localStorage.setItem(CHAVE, texto);
  } catch {
    // armazenamento indisponível (modo privado, por exemplo): segue sem salvar
  }
}

function conjuntoTexto(conj) {
  return `{ ${ordenarSimbolos(conj, estado.g).join(', ')} }`;
}

// ---------------------------------------------------------------- resumo

function renderResumo() {
  const g = estado.g;
  const alvo = $('resumo');
  limpar(alvo);
  if (g.erros.length) {
    alvo.append(el('ul', { class: 'erros', role: 'alert' }, g.erros.map((e) => el('li', { text: e }))));
    return;
  }
  alvo.append(
    el('p', { class: 'resumo-linha' },
      el('strong', { text: 'Símbolo inicial: ' }), el('code', { text: g.inicial }), ' · ',
      el('strong', { text: 'Não terminais: ' }), g.naoTerminais.join(', '), ' · ',
      el('strong', { text: 'Terminais: ' }), g.terminais.length ? g.terminais.join(' ') : 'nenhum',
    ),
    el('div', { class: 'selos' },
      el('span', { class: `selo ${estado.ll1.ehLL1 ? 'sim' : 'nao'}`, text: estado.ll1.ehLL1 ? 'É LL(1)' : 'Não é LL(1)' }),
      el('span', { class: `selo ${estado.slr.ehSLR ? 'sim' : 'nao'}`, text: estado.slr.ehSLR ? 'É SLR(1)' : 'Não é SLR(1)' }),
    ),
    el('ul', { class: 'avisos' }, g.avisos.map((a) => el('li', { text: a }))),
  );
}

// ---------------------------------------------------------------- FIRST e FOLLOW

function renderConjuntos() {
  const { g } = estado;
  const { anulaveis, first, follow } = estado.conjuntos;
  const tabela = $('conjuntos');
  limpar(tabela);
  tabela.append(
    el('caption', { class: 'sr-only', text: 'FIRST e FOLLOW de cada não terminal' }),
    el('thead', {}, el('tr', {}, ['Não terminal', 'Anulável', 'FIRST', 'FOLLOW'].map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, g.naoTerminais.map((a) => el('tr', {},
      el('th', { scope: 'row', text: a }),
      el('td', { text: anulaveis.has(a) ? 'sim' : 'não' }),
      el('td', { text: conjuntoTexto(first.get(a)) }),
      el('td', { text: conjuntoTexto(follow.get(a)) }),
    ))),
  );
}

// ---------------------------------------------------------------- recursão e transformações

function renderRecursao() {
  const r = recursaoEsquerda(estado.g, estado.conjuntos.anulaveis);
  const alvo = $('recursao');
  limpar(alvo);
  if (!r.tem) {
    alvo.append(el('p', { class: 'veredito sim', text: 'Sem recursão à esquerda.' }));
    return;
  }
  const itens = [];
  if (r.diretas.length) itens.push(el('li', {}, el('strong', { text: 'Direta: ' }), r.diretas.join(', ')));
  if (r.ocultas.length) itens.push(el('li', {}, el('strong', { text: 'Escondida por símbolos anuláveis: ' }), r.ocultas.join(', ')));
  for (const ciclo of r.indiretas) itens.push(el('li', {}, el('strong', { text: 'Indireta: ' }), ciclo.join(' ⇒ ')));
  alvo.append(el('p', { class: 'veredito nao', text: 'A gramática tem recursão à esquerda (um analisador LL(1) entraria em laço):' }), el('ul', {}, itens));
}

function mostrarTransformada(titulo, resultado) {
  estado.transformada = gramaticaParaTexto(resultado.gramatica);
  $('transformada').hidden = false;
  $('transformada-titulo').textContent = titulo;
  $('transformada-texto').textContent = estado.transformada || '(vazia)';
  const passos = $('transformada-passos');
  limpar(passos);
  if (resultado.passos.length === 0) passos.append(el('li', { text: 'Nada a fazer: a gramática já estava assim.' }));
  for (const p of resultado.passos) passos.append(el('li', { text: p }));
  const avisos = $('transformada-avisos');
  limpar(avisos);
  for (const a of resultado.avisos ?? []) avisos.append(el('li', { text: a }));
}

// ---------------------------------------------------------------- tabela LL(1)

function renderTabelaLL1() {
  const { g, ll1 } = estado;
  const status = $('ll1-status');
  status.className = `veredito ${ll1.ehLL1 ? 'sim' : 'nao'}`;
  status.textContent = ll1.ehLL1
    ? 'Sem conflitos: a gramática é LL(1).'
    : `${ll1.conflitos.length} ${ll1.conflitos.length === 1 ? 'célula com conflito' : 'células com conflito'} (em vermelho): a gramática não é LL(1).`;
  const tabela = $('tabela-ll1');
  limpar(tabela);
  tabela.append(
    el('caption', { class: 'sr-only', text: 'Tabela de análise LL(1): linhas são não terminais, colunas são terminais' }),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'M' }), ll1.colunas.map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, g.naoTerminais.map((a) => el('tr', {},
      el('th', { scope: 'row', text: a }),
      ll1.colunas.map((t) => {
        const lista = ll1.celulas.get(a).get(t);
        if (lista.length === 0) return el('td', { class: 'vazia', text: '' });
        const conflito = lista.length > 1;
        return el('td', { class: conflito ? 'conflito' : null, title: conflito ? 'conflito' : null },
          lista.map((i) => el('span', { text: textoProducao(g.producoes[i]) })));
      }),
    ))),
  );
}

// ---------------------------------------------------------------- SLR(1)

function renderSLR() {
  const { g, colecao, slr } = estado;
  const status = $('slr-status');
  status.className = `veredito ${slr.ehSLR ? 'sim' : 'nao'}`;
  if (slr.ehSLR) {
    status.textContent = `${colecao.estados.length} estados, sem conflitos: a gramática é SLR(1).`;
  } else {
    const desc = slr.conflitos.map((c) => `${c.tipo} no estado ${c.estado} com ${c.terminal}`).join('; ');
    status.textContent = `${colecao.estados.length} estados e ${slr.conflitos.length} ${slr.conflitos.length === 1 ? 'conflito' : 'conflitos'}: ${desc}.`;
  }
  $('resumo-itens').textContent = `Conjuntos de itens LR(0) (${colecao.estados.length} estados)`;

  const estadosEmConflito = new Set(slr.conflitos.map((c) => c.estado));
  const itens = $('itens-lr0');
  limpar(itens);
  for (const e of colecao.estados) {
    const lista = el('ul', {}, e.itens.map((it, k) => el('li', { class: k < e.nucleo ? 'nucleo' : null, text: textoItem(colecao, it) })));
    const trans = [...colecao.transicoes[e.id]].map(([x, d]) => `${x} → I${d}`).join(', ');
    itens.append(el('div', { class: `estado${estadosEmConflito.has(e.id) ? ' conflito' : ''}` },
      el('h3', { text: `I${e.id}${estadosEmConflito.has(e.id) ? ' (conflito)' : ''}` }),
      lista,
      trans ? el('p', { class: 'transicoes', text: `com ${trans}` }) : null,
    ));
  }

  const tabela = $('tabela-slr');
  limpar(tabela);
  const nts = g.naoTerminais;
  tabela.append(
    el('caption', { class: 'sr-only', text: 'Tabela SLR(1): ACTION para terminais e GOTO para não terminais' }),
    el('thead', {},
      el('tr', {},
        el('th', { scope: 'col', rowspan: 2, text: 'Estado' }),
        el('th', { scope: 'colgroup', colspan: slr.colunas.length, class: 'grupo', text: 'ACTION' }),
        el('th', { scope: 'colgroup', colspan: nts.length, class: 'grupo', text: 'GOTO' }),
      ),
      el('tr', {}, slr.colunas.map((t) => el('th', { scope: 'col', text: t })), nts.map((a) => el('th', { scope: 'col', text: a }))),
    ),
    el('tbody', {}, colecao.estados.map((e) => el('tr', {},
      el('th', { scope: 'row', text: String(e.id) }),
      slr.colunas.map((t) => {
        const lista = slr.acao[e.id].get(t);
        if (lista.length === 0) return el('td', { class: 'vazia', text: '' });
        const titulo = lista.map((a) => descreverAcao(a)).join('; ');
        return el('td', { class: lista.length > 1 ? 'conflito' : null, title: titulo },
          lista.map((a) => el('span', { text: textoAcao(colecao, a) })));
      }),
      nts.map((a) => {
        const d = slr.desvio[e.id].get(a);
        return el('td', { class: d === undefined ? 'vazia' : null, text: d === undefined ? '' : String(d) });
      }),
    ))),
  );
  const prods = $('producoes-numeradas');
  limpar(prods);
  prods.setAttribute('start', '0');
  for (const p of colecao.producoes) prods.append(el('li', { text: textoProducao(p) }));
}

function descreverAcao(a) {
  if (a.tipo === 'empilha') return `empilha e vai para o estado ${a.estado}`;
  if (a.tipo === 'aceita') return 'aceita';
  return `reduz por ${textoProducao(estado.colecao.producoes[a.producao])}`;
}

// ---------------------------------------------------------------- traços e árvores

function renderTraco(tabela, resultado) {
  limpar(tabela);
  const passos = resultado.passos;
  const mostrados = passos.slice(0, MAX_LINHAS_TRACO);
  tabela.append(
    el('caption', { class: 'sr-only', text: 'Passos da análise' }),
    el('thead', {}, el('tr', {}, ['Passo', 'Pilha', 'Entrada', 'Ação'].map((t) => el('th', { scope: 'col', text: t })))),
    el('tbody', {}, mostrados.map((p, i) => el('tr', { class: p.acao.startsWith('erro') ? 'erro' : p.acao === 'aceita' ? 'aceita' : null },
      el('td', { class: 'num', text: String(i + 1) }),
      el('td', { text: p.pilha }),
      el('td', { text: p.entrada }),
      el('td', { text: p.acao }),
    ))),
  );
  if (passos.length > mostrados.length) {
    tabela.append(el('tfoot', {}, el('tr', {}, el('td', { colspan: 4, text: `mostrando os primeiros ${MAX_LINHAS_TRACO} de ${passos.length} passos` }))));
  }
}

function contarNos(raiz) {
  let n = 0;
  const pilha = [raiz];
  while (pilha.length) {
    const no = pilha.pop();
    n++;
    pilha.push(...no.filhos);
  }
  return n;
}

function desenharArvore(alvo, raiz, descricao) {
  limpar(alvo);
  if (!raiz) return;
  if (contarNos(raiz) > MAX_NOS_ARVORE) {
    alvo.append(el('p', { class: 'muted', text: 'Árvore grande demais para desenhar aqui.' }));
    return;
  }
  const l = layoutArvore(raiz);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${l.largura} ${l.altura}`);
  svg.setAttribute('width', String(Math.ceil(l.largura)));
  svg.setAttribute('height', String(Math.ceil(l.altura)));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', descricao);
  const titulo = document.createElementNS(SVG, 'title');
  titulo.textContent = descricao;
  svg.append(titulo);
  const pos = new Map(l.nos.map((n) => [n.id, n]));
  for (const a of l.arestas) {
    const de = pos.get(a.de);
    const para = pos.get(a.para);
    const linha = document.createElementNS(SVG, 'line');
    linha.setAttribute('class', 'aresta');
    linha.setAttribute('x1', String(de.x));
    linha.setAttribute('y1', String(de.y + 12));
    linha.setAttribute('x2', String(para.x));
    linha.setAttribute('y2', String(para.y - 12));
    svg.append(linha);
  }
  for (const n of l.nos) {
    const grupo = document.createElementNS(SVG, 'g');
    grupo.setAttribute('class', n.rotulo === EPSILON ? 'vazio' : n.terminal ? 'terminal' : 'no');
    if (!n.terminal) {
      const r = document.createElementNS(SVG, 'rect');
      r.setAttribute('x', String(n.x - n.largura / 2));
      r.setAttribute('y', String(n.y - 12));
      r.setAttribute('width', String(n.largura));
      r.setAttribute('height', '24');
      r.setAttribute('rx', '7');
      grupo.append(r);
    }
    const t = document.createElementNS(SVG, 'text');
    t.setAttribute('x', String(n.x));
    t.setAttribute('y', String(n.y));
    t.textContent = n.rotulo;
    grupo.append(t);
    svg.append(grupo);
  }
  alvo.append(svg);
}

function mostrarResultado(alvo, r) {
  alvo.className = `resultado ${r.aceita ? 'sim' : 'nao'}`;
  alvo.textContent = r.aceita ? 'Cadeia aceita.' : `Cadeia rejeitada: ${r.erro}.`;
}

function analisarEntradaLL1() {
  if (!estado.ll1) return;
  const texto = $('entrada-ll1').value;
  const r = analisarLL1(estado.g, estado.ll1, texto);
  mostrarResultado($('ll1-resultado'), r);
  renderTraco($('traco-ll1'), r);
  desenharArvore($('arvore-ll1'), r.arvore, `Árvore sintática LL(1) de ${texto || 'cadeia vazia'}`);
}

function analisarEntradaSLR() {
  if (!estado.slr) return;
  const texto = $('entrada-slr').value;
  const r = analisarSLR(estado.g, estado.colecao, estado.slr, texto);
  mostrarResultado($('slr-resultado'), r);
  renderTraco($('traco-slr'), r);
  desenharArvore($('arvore-slr'), r.aceita ? r.arvore : null, `Árvore sintática SLR(1) de ${texto || 'cadeia vazia'}`);
}

// ---------------------------------------------------------------- ciclo principal

function limparAnalises() {
  for (const id of ['conjuntos', 'tabela-ll1', 'tabela-slr', 'itens-lr0', 'traco-ll1', 'traco-slr', 'arvore-ll1', 'arvore-slr', 'recursao', 'producoes-numeradas']) {
    limpar($(id));
  }
  for (const id of ['ll1-status', 'slr-status', 'll1-resultado', 'slr-resultado']) $(id).textContent = '';
  $('ll1-status').textContent = 'Corrija os erros da gramática para ver as tabelas.';
}

function atualizar() {
  const texto = $('gramatica').value;
  salvar(texto);
  $('transformada').hidden = true;
  const g = lerGramatica(texto);
  estado.g = g;
  if (g.erros.length) {
    estado.ll1 = null;
    estado.slr = null;
    renderResumo();
    limparAnalises();
    return;
  }
  estado.conjuntos = analisar(g);
  estado.ll1 = tabelaLL1(g, estado.conjuntos);
  estado.colecao = colecaoLR0(g);
  estado.slr = tabelaSLR(g, estado.colecao, estado.conjuntos);
  renderResumo();
  renderConjuntos();
  renderRecursao();
  renderTabelaLL1();
  renderSLR();
  analisarEntradaLL1();
  analisarEntradaSLR();
}

function marcarExemplo(nome) {
  for (const b of $('exemplos').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.nome === nome));
}

function carregarExemplo(ex) {
  $('gramatica').value = ex.gramatica;
  $('entrada-ll1').value = ex.entrada;
  $('entrada-slr').value = ex.entrada;
  marcarExemplo(ex.nome);
  atualizar();
}

function status(msg) {
  const s = $('status');
  s.textContent = msg;
  setTimeout(() => {
    if (s.textContent === msg) s.textContent = '';
  }, 3000);
}

async function copiarLink() {
  const base = location.href.split('#')[0];
  const link = `${base}#g=${codificarParaLink($('gramatica').value)}&e=${codificarParaLink($('entrada-ll1').value)}`;
  // O link vai sempre para a barra de endereço; a área de transferência pode
  // recusar ou nunca responder (permissão negada, página dentro de um iframe).
  history.replaceState(null, '', link);
  try {
    if (!navigator.clipboard) throw new Error('sem área de transferência');
    await Promise.race([
      navigator.clipboard.writeText(link),
      new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('sem resposta')), 1000)),
    ]);
    status('Link copiado.');
  } catch {
    status('Não deu para copiar automaticamente; o link está na barra de endereço.');
  }
}

function lerDoEndereco() {
  const params = new URLSearchParams(location.hash.slice(1));
  const g = params.get('g');
  if (!g) return null;
  const texto = decodificarLink(g);
  if (texto === null) return null;
  const e = params.get('e');
  return { gramatica: texto, entrada: e ? decodificarLink(e) ?? '' : '' };
}

function iniciar() {
  const exemplos = $('exemplos');
  for (const ex of EXEMPLOS) {
    exemplos.append(el('button', { type: 'button', 'data-nome': ex.nome, 'aria-pressed': 'false', text: ex.nome }));
  }
  exemplos.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const ex = EXEMPLOS.find((x) => x.nome === b.dataset.nome);
    if (ex) carregarExemplo(ex);
  });

  let espera = 0;
  $('gramatica').addEventListener('input', () => {
    marcarExemplo(null);
    clearTimeout(espera);
    espera = setTimeout(atualizar, 200);
  });
  $('form-ll1').addEventListener('submit', (ev) => {
    ev.preventDefault();
    analisarEntradaLL1();
  });
  $('form-slr').addEventListener('submit', (ev) => {
    ev.preventDefault();
    analisarEntradaSLR();
  });
  $('eliminar').addEventListener('click', () => {
    if (estado.g && !estado.g.erros.length) mostrarTransformada('Sem recursão à esquerda', eliminarRecursaoEsquerda(estado.g));
  });
  $('fatorar').addEventListener('click', () => {
    if (estado.g && !estado.g.erros.length) mostrarTransformada('Fatorada à esquerda', fatorarEsquerda(estado.g));
  });
  $('usar-transformada').addEventListener('click', () => {
    if (!estado.transformada) return;
    $('gramatica').value = estado.transformada;
    marcarExemplo(null);
    atualizar();
    $('gramatica').focus();
    status('Gramática substituída.');
  });
  $('copiar-link').addEventListener('click', copiarLink);

  const doEndereco = lerDoEndereco();
  if (doEndereco) {
    $('gramatica').value = doEndereco.gramatica;
    $('entrada-ll1').value = doEndereco.entrada;
    $('entrada-slr').value = doEndereco.entrada;
    atualizar();
    return;
  }
  const salvo = lerArmazenado();
  if (salvo) {
    const ex = EXEMPLOS.find((x) => x.gramatica === salvo);
    if (ex) {
      carregarExemplo(ex);
    } else {
      $('gramatica').value = salvo;
      atualizar();
    }
    return;
  }
  carregarExemplo(EXEMPLOS[0]);
}

iniciar();
