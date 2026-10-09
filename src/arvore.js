// Posições dos nós da árvore sintática para o desenho em SVG (sem DOM).
//
// Layout "arrumado" simples: cada subárvore é desenhada sozinha, com o pai a
// meio caminho entre o primeiro e o último filho; depois as subárvores irmãs
// são encostadas lado a lado pelo contorno (a extensão horizontal de cada uma),
// com uma folga entre elas. Assim nenhum rótulo se sobrepõe e cada pai fica
// centrado sobre os filhos.

const PADRAO = { larguraLetra: 8.5, folga: 14, alturaNivel: 58, margem: 16, minimo: 30 };

export function layoutArvore(raiz, opcoes = {}) {
  const o = { ...PADRAO, ...opcoes };
  const nos = [];
  const arestas = [];
  if (!raiz) return { nos, arestas, largura: 0, altura: 0 };

  const larguraRotulo = (no) => Math.max(o.minimo, Array.from(no.simbolo).length * o.larguraLetra + 14);
  // Para cada nó: posição x relativa ao pai e extensão [esq, dir] da subárvore
  // relativa ao próprio nó. Pós-ordem com pilha explícita (árvores fundas não estouram a pilha).
  const relativo = new Map();
  const extensao = new Map();
  const pilha = [{ no: raiz, visitado: false }];
  while (pilha.length) {
    const topo = pilha.pop();
    const no = topo.no;
    if (!topo.visitado) {
      pilha.push({ no, visitado: true });
      for (const f of no.filhos) pilha.push({ no: f, visitado: false });
      continue;
    }
    const meia = larguraRotulo(no) / 2;
    if (no.filhos.length === 0) {
      extensao.set(no, [-meia, meia]);
      continue;
    }
    // Encosta os filhos da esquerda para a direita.
    const xs = [];
    let cursor = 0;
    for (const f of no.filhos) {
      const [esq, dir] = extensao.get(f);
      xs.push(cursor - esq);
      cursor += dir - esq + o.folga;
    }
    const meio = (xs[0] + xs[xs.length - 1]) / 2;
    let esq = -meia;
    let dir = meia;
    no.filhos.forEach((f, i) => {
      const x = xs[i] - meio;
      relativo.set(f, x);
      const [fe, fd] = extensao.get(f);
      esq = Math.min(esq, x + fe);
      dir = Math.max(dir, x + fd);
    });
    extensao.set(no, [esq, dir]);
  }

  const [esqRaiz, dirRaiz] = extensao.get(raiz);
  let profundidade = 0;
  const fila = [{ no: raiz, x: o.margem - esqRaiz, nivel: 0, pai: -1 }];
  while (fila.length) {
    const { no, x, nivel, pai } = fila.shift();
    const id = nos.length;
    nos.push({ id, x, y: o.margem + 14 + nivel * o.alturaNivel, rotulo: no.simbolo, terminal: Boolean(no.terminal), largura: larguraRotulo(no) });
    if (pai >= 0) arestas.push({ de: pai, para: id });
    profundidade = Math.max(profundidade, nivel);
    for (const f of no.filhos) fila.push({ no: f, x: x + relativo.get(f), nivel: nivel + 1, pai: id });
  }
  return {
    nos,
    arestas,
    largura: dirRaiz - esqRaiz + 2 * o.margem,
    altura: 2 * o.margem + 28 + profundidade * o.alturaNivel,
  };
}

/** Folhas da árvore da esquerda para a direita (a "fronteira", que deve ser a entrada). */
export function folhas(raiz) {
  const out = [];
  const pilha = raiz ? [raiz] : [];
  while (pilha.length) {
    const no = pilha.pop();
    if (no.filhos.length === 0) out.push(no.simbolo);
    for (let i = no.filhos.length - 1; i >= 0; i--) pilha.push(no.filhos[i]);
  }
  return out;
}
