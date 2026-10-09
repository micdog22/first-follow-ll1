import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EPSILON,
  FIM,
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
  textoItem,
  textoProducao,
  tokenizarEntrada,
} from '../src/gramatica.js';
import { EXEMPLOS } from '../src/exemplos.js';
import { folhas, layoutArvore } from '../src/arvore.js';

const EXPR_LL1 = `E -> T E'
E' -> + T E' | ε
T -> F T'
T' -> * F T' | ε
F -> ( E ) | id`;

const EXPR_LR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

const ELSE = `S -> if E then S | if E then S else S | other
E -> cond`;

const conjunto = (g, s) => ordenarSimbolos(s, g);

test('leitura: setas, vazio, alternativas em várias linhas e aspas', () => {
  const g = lerGramatica(`# comentário
A ::= a A | &
  | eps
B → 'b|c' "->" A | λ
C -> x|y`);
  assert.deepEqual(g.erros, []);
  assert.deepEqual(g.naoTerminais, ['A', 'B', 'C']);
  assert.equal(g.inicial, 'A');
  assert.deepEqual(g.terminais, ['a', 'b|c', '->', 'x', 'y']);
  assert.deepEqual(g.producoes.map(textoProducao), ['A → a A', 'A → ε', 'B → b|c -> A', 'B → ε', 'C → x', 'C → y']);
  // eps repetido como alternativa de A vira aviso de produção repetida
  assert.ok(g.avisos.some((a) => a.includes('repetida')));
  // Ida e volta pelo texto.
  const de_novo = lerGramatica(gramaticaParaTexto(g));
  assert.deepEqual(de_novo.producoes.map(textoProducao), g.producoes.map(textoProducao));
});

test('leitura: erros com o número da linha', () => {
  assert.match(lerGramatica('A -> a\nB a b').erros[0], /linha 2: falta a seta/);
  assert.match(lerGramatica('A B -> c').erros[0], /linha 1: o lado esquerdo deve ser um único não terminal/);
  assert.match(lerGramatica('A -> a $').erros[0], /\$ é reservado/);
  assert.match(lerGramatica('| a').erros[0], /linha 1: alternativa começando com \| sem uma regra antes/);
  assert.match(lerGramatica('   \n# só comentário').erros[0], /vazia/);
});

test('leitura: avisos de símbolos inalcançáveis, improdutivos e colados', () => {
  const g = lerGramatica(`S -> E+T | a
E -> E x
Z -> z`);
  assert.ok(g.avisos.some((a) => a === 'Z não é alcançável a partir de S'));
  assert.ok(g.avisos.some((a) => a === 'E não gera nenhuma cadeia só de terminais'));
  assert.ok(g.avisos.some((a) => a.includes('"E+T" contém o não terminal E')));
});

test('FIRST e FOLLOW da gramática de expressões LL(1)', () => {
  const g = lerGramatica(EXPR_LL1);
  const { anulaveis, first, follow } = analisar(g);
  assert.deepEqual([...anulaveis].sort(), ["E'", "T'"]);
  assert.deepEqual(conjunto(g, first.get('E')), ['(', 'id']);
  assert.deepEqual(conjunto(g, first.get('T')), ['(', 'id']);
  assert.deepEqual(conjunto(g, first.get('F')), ['(', 'id']);
  assert.deepEqual(conjunto(g, first.get("E'")), ['+', EPSILON]);
  assert.deepEqual(conjunto(g, first.get("T'")), ['*', EPSILON]);
  assert.deepEqual(conjunto(g, follow.get('E')), [')', FIM]);
  assert.deepEqual(conjunto(g, follow.get("E'")), [')', FIM]);
  assert.deepEqual(conjunto(g, follow.get('T')), ['+', ')', FIM]);
  assert.deepEqual(conjunto(g, follow.get("T'")), ['+', ')', FIM]);
  assert.deepEqual(conjunto(g, follow.get('F')), ['+', '*', ')', FIM]);
});

test('FIRST e FOLLOW da versão recursiva à esquerda', () => {
  const g = lerGramatica(EXPR_LR);
  const { first, follow } = analisar(g);
  assert.deepEqual(conjunto(g, first.get('E')), ['(', 'id']);
  assert.deepEqual(conjunto(g, follow.get('E')), ['+', ')', FIM]);
  assert.deepEqual(conjunto(g, follow.get('T')), ['+', '*', ')', FIM]);
});

test('FIRST com vários anuláveis em sequência', () => {
  const g = lerGramatica(`S -> A B c | d
A -> a | ε
B -> b | ε`);
  const { first, follow } = analisar(g);
  // Ordem dos terminais = ordem em que aparecem na gramática: c, d, a, b.
  assert.deepEqual(conjunto(g, first.get('S')), ['c', 'd', 'a', 'b']);
  assert.deepEqual(conjunto(g, follow.get('A')), ['c', 'b']);
  assert.deepEqual(conjunto(g, follow.get('B')), ['c']);
});

test('tabela LL(1) da gramática de expressões, sem conflitos', () => {
  const g = lerGramatica(EXPR_LL1);
  const t = tabelaLL1(g);
  assert.equal(t.ehLL1, true);
  const celula = (a, x) => t.celulas.get(a).get(x).map((i) => textoProducao(g.producoes[i]));
  assert.deepEqual(celula('E', 'id'), ["E → T E'"]);
  assert.deepEqual(celula("E'", '+'), ["E' → + T E'"]);
  assert.deepEqual(celula("E'", ')'), ["E' → ε"]);
  assert.deepEqual(celula("E'", FIM), ["E' → ε"]);
  assert.deepEqual(celula("T'", '+'), ["T' → ε"]);
  assert.deepEqual(celula('F', '('), ['F → ( E )']);
  assert.deepEqual(celula('F', '+'), []);
});

test('conflitos LL(1): recursão à esquerda e else pendente', () => {
  const lr = tabelaLL1(lerGramatica(EXPR_LR));
  assert.equal(lr.ehLL1, false);
  assert.ok(lr.conflitos.some((c) => c.naoTerminal === 'E' && c.terminal === 'id'));
  const g = lerGramatica(`S -> if E then S S' | other
S' -> else S | ε
E -> b`);
  const t = tabelaLL1(g);
  assert.equal(t.conflitos.length, 1);
  assert.equal(t.conflitos[0].naoTerminal, "S'");
  assert.equal(t.conflitos[0].terminal, 'else');
  assert.deepEqual(t.conflitos[0].producoes.map((i) => textoProducao(g.producoes[i])), ["S' → else S", "S' → ε"]);
});

test('detecção de recursão à esquerda direta, indireta e escondida', () => {
  assert.deepEqual(recursaoEsquerda(lerGramatica(EXPR_LR)).diretas, ['E', 'T']);
  assert.equal(recursaoEsquerda(lerGramatica(EXPR_LL1)).tem, false);
  const ind = recursaoEsquerda(lerGramatica(`S -> A a | b
A -> S d | c`));
  assert.deepEqual(ind.diretas, []);
  assert.deepEqual(ind.indiretas, [['S', 'A', 'S']]);
  // A -> B A com B anulável: recursão escondida.
  const oculta = recursaoEsquerda(lerGramatica(`A -> B A x | y
B -> b | ε`));
  assert.deepEqual(oculta.ocultas, ['A']);
});

test('eliminação de recursão à esquerda (direta)', () => {
  const r = eliminarRecursaoEsquerda(lerGramatica(EXPR_LR));
  assert.equal(gramaticaParaTexto(r.gramatica), `E -> T E'
E' -> + T E' | ε
T -> F T'
T' -> * F T' | ε
F -> ( E ) | id`);
  assert.equal(recursaoEsquerda(r.gramatica).tem, false);
  assert.equal(tabelaLL1(r.gramatica).ehLL1, true);
  assert.equal(r.passos.length, 2);
});

test('eliminação de recursão à esquerda indireta (exemplo clássico do livro do dragão)', () => {
  const r = eliminarRecursaoEsquerda(lerGramatica(`S -> A a | b
A -> A c | S d | ε`));
  assert.equal(gramaticaParaTexto(r.gramatica), `S -> A a | b
A -> b d A' | A'
A' -> c A' | a d A' | ε`);
  assert.equal(recursaoEsquerda(r.gramatica).diretas.length, 0);
  assert.ok(r.avisos.some((a) => a.includes('anuláveis')));
});

test('eliminação preserva a linguagem (cadeias curtas aceitas pela SLR antes e pela LL(1) depois)', () => {
  const original = lerGramatica(EXPR_LR);
  const nova = eliminarRecursaoEsquerda(original).gramatica;
  const colecao = colecaoLR0(original);
  const slr = tabelaSLR(original, colecao);
  const ll1 = tabelaLL1(nova);
  const simbolos = ['id', '+', '*', '(', ')'];
  let total = 0;
  const gera = (prefixo, n) => {
    if (n === 0) return;
    for (const s of simbolos) {
      const cadeia = [...prefixo, s];
      const texto = cadeia.join(' ');
      assert.equal(analisarLL1(nova, ll1, texto).aceita, analisarSLR(original, colecao, slr, texto).aceita, texto);
      total++;
      gera(cadeia, n - 1);
    }
  };
  gera([], 5);
  assert.equal(total, 5 + 25 + 125 + 625 + 3125);
});

test('fatoração à esquerda', () => {
  const r = fatorarEsquerda(lerGramatica(`Cmd -> if Exp then Cmd else Cmd | if Exp then Cmd | id := Exp
Exp -> id`));
  assert.equal(gramaticaParaTexto(r.gramatica), `Cmd -> if Exp then Cmd Cmd' | id := Exp
Cmd' -> else Cmd | ε
Exp -> id`);
  const s = fatorarEsquerda(lerGramatica('S -> a b c | a b d | a e | f'));
  // Primeiro sai o maior prefixo comum (a b), depois o menor (a).
  assert.equal(gramaticaParaTexto(s.gramatica), `S -> a S'' | f
S'' -> b S' | e
S' -> c | d`);
  assert.equal(s.passos.length, 2);
});

test('tokenização da entrada', () => {
  const t = ['id', '+', '*', '(', ')', 'i'];
  assert.deepEqual(tokenizarEntrada('id+id*(id)', t).tokens, ['id', '+', 'id', '*', '(', 'id', ')']);
  assert.deepEqual(tokenizarEntrada('  id   +  i ', t).tokens, ['id', '+', 'i']);
  assert.match(tokenizarEntrada('id ? id', t).erro, /desconhecido.*\?/);
});

test('análise LL(1) passo a passo de id + id * id', () => {
  const g = lerGramatica(EXPR_LL1);
  const r = analisarLL1(g, tabelaLL1(g), 'id + id * id');
  assert.equal(r.aceita, true);
  assert.deepEqual(r.passos.slice(0, 6), [
    { pilha: '$ E', entrada: 'id + id * id $', acao: "E → T E'" },
    { pilha: "$ E' T", entrada: 'id + id * id $', acao: "T → F T'" },
    { pilha: "$ E' T' F", entrada: 'id + id * id $', acao: 'F → id' },
    { pilha: "$ E' T' id", entrada: 'id + id * id $', acao: 'casa id' },
    { pilha: "$ E' T'", entrada: '+ id * id $', acao: "T' → ε" },
    { pilha: "$ E'", entrada: '+ id * id $', acao: "E' → + T E'" },
  ]);
  assert.equal(r.passos.length, 17);
  assert.deepEqual(r.passos.at(-1), { pilha: '$', entrada: '$', acao: 'aceita' });
  assert.deepEqual(folhas(r.arvore).filter((s) => s !== EPSILON), ['id', '+', 'id', '*', 'id']);
});

test('análise LL(1) com erro', () => {
  const g = lerGramatica(EXPR_LL1);
  const r = analisarLL1(g, tabelaLL1(g), 'id + * id');
  assert.equal(r.aceita, false);
  assert.match(r.erro, /M\[T, \*\] está vazia; esperava \( id/);
  const r2 = analisarLL1(g, tabelaLL1(g), '( id');
  assert.match(r2.erro, /esperava \), mas encontrou \$/);
});

test('itens LR(0): 12 estados para a gramática de expressões', () => {
  const g = lerGramatica(EXPR_LR);
  const c = colecaoLR0(g);
  assert.equal(c.estados.length, 12);
  assert.equal(c.inicialAumentada, "E'");
  assert.deepEqual(c.estados[0].itens.map((it) => textoItem(c, it)), [
    "E' → • E",
    'E → • E + T',
    'E → • T',
    'T → • T * F',
    'T → • F',
    'F → • ( E )',
    'F → • id',
  ]);
  // Numeração clássica: I1 por E, I2 por T, I3 por F, I4 por (, I5 por id.
  assert.deepEqual([...c.transicoes[0]], [['E', 1], ['T', 2], ['F', 3], ['(', 4], ['id', 5]]);
  assert.deepEqual(c.estados[1].itens.map((it) => textoItem(c, it)), ["E' → E •", 'E → E • + T']);
  const t = tabelaSLR(g, c);
  assert.equal(t.ehSLR, true);
});

test('itens LR(0) da gramática LL(1) de expressões', () => {
  const g = lerGramatica(EXPR_LL1);
  const c = colecaoLR0(g);
  assert.equal(c.estados.length, 16);
  assert.equal(tabelaSLR(g, c).ehSLR, true);
});

test('conflito SLR no else pendente', () => {
  const g = lerGramatica(ELSE);
  const c = colecaoLR0(g);
  const t = tabelaSLR(g, c);
  assert.equal(t.ehSLR, false);
  assert.equal(t.conflitos.length, 1);
  const conflito = t.conflitos[0];
  assert.equal(conflito.terminal, 'else');
  assert.equal(conflito.tipo, 'empilha/reduz');
  const itens = c.estados[conflito.estado].itens.map((it) => textoItem(c, it));
  assert.ok(itens.includes('S → if E then S •'));
  assert.ok(itens.includes('S → if E then S • else S'));
  // Empilhando no conflito (como o yacc), o else fica com o if mais próximo.
  const r = analisarSLR(g, c, t, 'if cond then if cond then other else other');
  assert.equal(r.aceita, true);
  assert.ok(r.passos.some((p) => p.acao.includes('conflito: escolhido empilhar')));
  const raiz = r.arvore;
  assert.equal(raiz.filhos.length, 4);  // if E then S: o else ficou no if de dentro
});

test('conflito reduz/reduz', () => {
  const g = lerGramatica(`S -> A | B
A -> x
B -> x`);
  const t = tabelaSLR(g);
  assert.equal(t.conflitos.length, 1);
  assert.equal(t.conflitos[0].tipo, 'reduz/reduz');
});

test('análise SLR passo a passo de id * id', () => {
  const g = lerGramatica(EXPR_LR);
  const c = colecaoLR0(g);
  const r = analisarSLR(g, c, tabelaSLR(g, c), 'id * id');
  assert.equal(r.aceita, true);
  assert.deepEqual(r.passos.map((p) => [p.pilha, p.entrada, p.acao]), [
    ['0', 'id * id $', 'empilha id e vai para o estado 5'],
    ['0 id 5', '* id $', 'reduz por F → id, desvio para 3'],
    ['0 F 3', '* id $', 'reduz por T → F, desvio para 2'],
    ['0 T 2', '* id $', 'empilha * e vai para o estado 7'],
    ['0 T 2 * 7', 'id $', 'empilha id e vai para o estado 5'],
    ['0 T 2 * 7 id 5', '$', 'reduz por F → id, desvio para 10'],
    ['0 T 2 * 7 F 10', '$', 'reduz por T → T * F, desvio para 2'],
    ['0 T 2', '$', 'reduz por E → T, desvio para 1'],
    ['0 E 1', '$', 'aceita'],
  ]);
  assert.deepEqual(folhas(r.arvore), ['id', '*', 'id']);
  const erro = analisarSLR(g, c, tabelaSLR(g, c), 'id id');
  assert.equal(erro.aceita, false);
  assert.match(erro.erro, /ACTION\[5, id\] está vazia/);
});

test('exemplos da página: todos carregam sem erro e aceitam a entrada de exemplo', () => {
  for (const ex of EXEMPLOS) {
    const g = lerGramatica(ex.gramatica);
    assert.deepEqual(g.erros, [], ex.nome);
    if (ex.ll1) assert.equal(tabelaLL1(g).ehLL1, true, ex.nome);
    const c = colecaoLR0(g);
    assert.equal(analisarSLR(g, c, tabelaSLR(g, c), ex.entrada).aceita, true, ex.nome);
  }
});

test('JSON simplificado é LL(1) e reconhece um objeto aninhado', () => {
  const ex = EXEMPLOS.find((e) => e.nome.startsWith('JSON'));
  const g = lerGramatica(ex.gramatica);
  const r = analisarLL1(g, tabelaLL1(g), '{ texto : [ numero , true ] , texto : null }');
  assert.equal(r.aceita, true);
  assert.equal(analisarLL1(g, tabelaLL1(g), '{ texto : }').aceita, false);
});

test('layout da árvore: pais centrados e folhas sem sobreposição', () => {
  const g = lerGramatica(EXPR_LL1);
  const { arvore } = analisarLL1(g, tabelaLL1(g), '( id + id ) * id');
  const l = layoutArvore(arvore);
  const porId = new Map(l.nos.map((n) => [n.id, n]));
  const filhos = new Map();
  for (const a of l.arestas) {
    if (!filhos.has(a.de)) filhos.set(a.de, []);
    filhos.get(a.de).push(porId.get(a.para));
  }
  for (const [pai, lista] of filhos) {
    const p = porId.get(pai);
    const centro = (lista[0].x + lista.at(-1).x) / 2;
    assert.ok(Math.abs(p.x - centro) < 1e-6);
    for (const f of lista) assert.ok(f.y > p.y);
  }
  // Nós do mesmo nível: rótulos não se encostam.
  const niveis = new Map();
  for (const n of l.nos) {
    if (!niveis.has(n.y)) niveis.set(n.y, []);
    niveis.get(n.y).push(n);
  }
  for (const lista of niveis.values()) {
    lista.sort((a, b) => a.x - b.x);
    for (let i = 1; i < lista.length; i++) {
      assert.ok(lista[i].x - lista[i].largura / 2 >= lista[i - 1].x + lista[i - 1].largura / 2);
    }
  }
  assert.ok(l.largura > 0 && l.altura > 0);
});

test('link de compartilhamento com acentos', () => {
  const texto = "Expr -> Termo Expr'\nExpr' -> + Termo Expr' | ε";
  const codigo = codificarParaLink(texto);
  assert.match(codigo, /^[A-Za-z0-9_-]+$/);
  assert.equal(decodificarLink(codigo), texto);
  assert.equal(decodificarLink('%%%'), null);
});
