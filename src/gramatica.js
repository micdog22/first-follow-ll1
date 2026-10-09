// Gramáticas livres de contexto: leitura, FIRST, FOLLOW, tabela LL(1), recursão
// à esquerda, fatoração, análise LL(1), itens LR(0) e tabela SLR(1).
// Módulo sem DOM: usado pela página e pelos testes.

export const EPSILON = 'ε';
export const FIM = '$';

const VAZIOS = new Set(['ε', 'eps', 'epsilon', '&', 'λ']);
const SETAS = ['->', '::=', '→'];
const LIMITE_PASSOS = 10000;

// ---------------------------------------------------------------- leitura

/**
 * Lê o texto da gramática. Cada linha tem a forma "A -> alfa | beta"; linhas que
 * começam com "|" continuam a regra anterior. Os não terminais são os lados
 * esquerdos; todo o resto é terminal. Vazio: ε, eps, epsilon, & ou λ.
 * Terminais entre aspas ('|', "->") podem conter qualquer coisa, menos espaço.
 */
export function lerGramatica(texto) {
  const erros = [];
  const avisos = [];
  const brutas = [];
  const naoTerminais = [];
  let cabecaAtual = null;

  texto.split(/\r?\n/).forEach((original, indice) => {
    const linha = original.trim();
    const numero = indice + 1;
    if (!linha || linha.startsWith('#') || linha.startsWith('//')) return;
    let cabeca;
    let resto;
    if (linha.startsWith('|')) {
      if (!cabecaAtual) {
        erros.push(`linha ${numero}: alternativa começando com | sem uma regra antes`);
        return;
      }
      cabeca = cabecaAtual;
      resto = linha.slice(1);
    } else {
      let pos = -1;
      let seta = '';
      for (const s of SETAS) {
        const p = linha.indexOf(s);
        if (p >= 0 && (pos < 0 || p < pos)) {
          pos = p;
          seta = s;
        }
      }
      if (pos < 0) {
        erros.push(`linha ${numero}: falta a seta (->, ::= ou →) entre o não terminal e as alternativas`);
        return;
      }
      cabeca = linha.slice(0, pos).trim();
      resto = linha.slice(pos + seta.length);
      if (!cabeca) {
        erros.push(`linha ${numero}: falta o não terminal antes da seta`);
        return;
      }
      if (/\s/.test(cabeca) || cabeca.includes('|')) {
        erros.push(`linha ${numero}: o lado esquerdo deve ser um único não terminal, mas é "${cabeca}"`);
        return;
      }
      if (cabeca === FIM || VAZIOS.has(cabeca)) {
        erros.push(`linha ${numero}: "${cabeca}" não pode ser um não terminal`);
        return;
      }
      cabecaAtual = cabeca;
      if (!naoTerminais.includes(cabeca)) naoTerminais.push(cabeca);
    }
    for (const alternativa of dividirAlternativas(resto)) {
      if (alternativa.vazia && !alternativa.explicita) {
        avisos.push(`linha ${numero}: alternativa vazia de ${cabeca} lida como ε (escreva ε, eps ou & para deixar claro)`);
      }
      if (alternativa.vazioMisturado) {
        avisos.push(`linha ${numero}: ε no meio de outros símbolos foi ignorado`);
      }
      brutas.push({ cabeca, simbolos: alternativa.simbolos, linha: numero });
    }
  });

  const ehNaoTerminal = new Set(naoTerminais);
  const terminais = [];
  const producoes = [];
  const chaves = new Set();
  for (const b of brutas) {
    const corpo = [];
    for (const s of b.simbolos) {
      if (s.texto === FIM) {
        erros.push(`linha ${b.linha}: o símbolo $ é reservado para o fim da entrada`);
        continue;
      }
      if (s.citado && ehNaoTerminal.has(s.texto)) {
        erros.push(`linha ${b.linha}: o terminal '${s.texto}' tem o mesmo nome de um não terminal`);
        continue;
      }
      if (!ehNaoTerminal.has(s.texto) && !terminais.includes(s.texto)) terminais.push(s.texto);
      corpo.push(s.texto);
    }
    const chave = `${b.cabeca}\u0000${corpo.join('\u0000')}`;
    if (chaves.has(chave)) {
      avisos.push(`linha ${b.linha}: a produção ${textoProducao({ cabeca: b.cabeca, corpo })} aparece repetida`);
      continue;
    }
    chaves.add(chave);
    producoes.push({ id: producoes.length, cabeca: b.cabeca, corpo, linha: b.linha });
  }
  if (producoes.length === 0 && erros.length === 0) erros.push('a gramática está vazia');

  const g = { inicial: naoTerminais[0] ?? null, naoTerminais, terminais, producoes, avisos, erros };
  if (erros.length === 0) avisos.push(...avisosDeQualidade(g));
  return g;
}

function dividirAlternativas(texto) {
  // Símbolos são separados por espaços. Um símbolo entre aspas ('|', "->") é
  // sempre terminal; fora de aspas, apóstrofos fazem parte do nome (E', T'').
  // '|' fora de aspas separa alternativas, mesmo sem espaços em volta ("a|b").
  const citado = (s) => s.length >= 3 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0];
  const tokens = [];
  for (const pedaco of texto.trim().split(/\s+/).filter(Boolean)) {
    if (citado(pedaco)) {
      tokens.push({ texto: pedaco.slice(1, -1), citado: true });
      continue;
    }
    for (const parte of pedaco.split(/(\|)/).filter(Boolean)) {
      tokens.push(citado(parte) ? { texto: parte.slice(1, -1), citado: true } : { texto: parte, citado: false });
    }
  }
  const alternativas = [];
  let atual = [];
  let explicita = false;
  const fechar = () => {
    const simbolos = atual.filter((t) => t.citado || !VAZIOS.has(t.texto));
    const temVazio = atual.some((t) => !t.citado && VAZIOS.has(t.texto));
    alternativas.push({
      simbolos,
      vazia: simbolos.length === 0,
      explicita: explicita || temVazio,
      vazioMisturado: temVazio && simbolos.length > 0,
    });
    atual = [];
    explicita = false;
  };
  for (const t of tokens) {
    if (!t.citado && t.texto === '|') fechar();
    else atual.push(t);
  }
  fechar();
  return alternativas;
}

function avisosDeQualidade(g) {
  const avisos = [];
  // Alcançáveis a partir do símbolo inicial.
  const alcancados = new Set([g.inicial]);
  const fila = [g.inicial];
  while (fila.length) {
    const a = fila.shift();
    for (const p of g.producoes) {
      if (p.cabeca !== a) continue;
      for (const s of p.corpo) {
        if (g.naoTerminais.includes(s) && !alcancados.has(s)) {
          alcancados.add(s);
          fila.push(s);
        }
      }
    }
  }
  for (const a of g.naoTerminais) {
    if (!alcancados.has(a)) avisos.push(`${a} não é alcançável a partir de ${g.inicial}`);
  }
  // Produtivos: geram alguma cadeia só de terminais.
  const produtivos = new Set();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of g.producoes) {
      if (!produtivos.has(p.cabeca) && p.corpo.every((s) => !g.naoTerminais.includes(s) || produtivos.has(s))) {
        produtivos.add(p.cabeca);
        mudou = true;
      }
    }
  }
  for (const a of g.naoTerminais) {
    if (!produtivos.has(a)) avisos.push(`${a} não gera nenhuma cadeia só de terminais`);
  }
  // Símbolos colados, como "E+T": provavelmente faltou espaço.
  for (const t of g.terminais) {
    const colado = g.naoTerminais.find((a) => t !== a && t.length > a.length && t.includes(a) && a.length >= 1 && /[^A-Za-z0-9_']/.test(t));
    if (colado) {
      avisos.push(`o símbolo "${t}" contém o não terminal ${colado}; separe os símbolos com espaços`);
    }
  }
  return avisos;
}

// ---------------------------------------------------------------- texto

export function textoProducao(p) {
  return `${p.cabeca} → ${p.corpo.length ? p.corpo.join(' ') : EPSILON}`;
}

// Terminais que só sobrevivem à volta pelo texto se ficarem entre aspas.
function precisaAspas(s) {
  if (s === "'" || s === '"') return false;  // aspas soltas já são lidas como terminal
  return s.includes('|') || VAZIOS.has(s) || SETAS.some((a) => s.includes(a));
}

/** Gramática como texto que pode ser colado de volta na caixa de edição. */
export function gramaticaParaTexto(g) {
  const linhas = [];
  for (const a of g.naoTerminais) {
    const corpos = g.producoes
      .filter((p) => p.cabeca === a)
      .map((p) => (p.corpo.length ? p.corpo.map((s) => (g.naoTerminais.includes(s) || !precisaAspas(s) ? s : `'${s}'`)).join(' ') : EPSILON));
    if (corpos.length) linhas.push(`${a} -> ${corpos.join(' | ')}`);
  }
  return linhas.join('\n');
}

/** Ordena um conjunto de terminais na ordem em que aparecem na gramática (ε e $ no fim). */
export function ordenarSimbolos(conjunto, g) {
  const ordem = new Map(g.terminais.map((t, i) => [t, i]));
  return [...conjunto].sort((a, b) => peso(a) - peso(b));
  function peso(s) {
    if (s === EPSILON) return 1e9;
    if (s === FIM) return 1e9 + 1;
    return ordem.has(s) ? ordem.get(s) : 1e8;
  }
}

// ---------------------------------------------------------------- FIRST e FOLLOW

const ehNT = (g, s) => g.naoTerminais.includes(s);

/** Não terminais que derivam a cadeia vazia (ponto fixo). */
export function calcularAnulaveis(g) {
  const anulaveis = new Set();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of g.producoes) {
      if (!anulaveis.has(p.cabeca) && p.corpo.every((s) => anulaveis.has(s))) {
        anulaveis.add(p.cabeca);
        mudou = true;
      }
    }
  }
  return anulaveis;
}

/**
 * FIRST de cada não terminal: terminais que podem começar uma cadeia derivada
 * dele, mais ε se ele for anulável. Ponto fixo: repete até nada mudar.
 */
export function calcularFirst(g, anulaveis = calcularAnulaveis(g)) {
  const first = new Map(g.naoTerminais.map((a) => [a, new Set()]));
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of g.producoes) {
      const alvo = first.get(p.cabeca);
      const antes = alvo.size;
      for (const s of firstDeSequencia(g, p.corpo, first, anulaveis)) alvo.add(s);
      if (alvo.size !== antes) mudou = true;
    }
  }
  return first;
}

/** FIRST de uma sequência de símbolos; contém ε se todos forem anuláveis (ou se ela for vazia). */
export function firstDeSequencia(g, simbolos, first, anulaveis) {
  const resultado = new Set();
  for (const s of simbolos) {
    if (!ehNT(g, s)) {
      resultado.add(s);
      return resultado;
    }
    for (const t of first.get(s)) if (t !== EPSILON) resultado.add(t);
    if (!anulaveis.has(s)) return resultado;
  }
  resultado.add(EPSILON);
  return resultado;
}

/**
 * FOLLOW de cada não terminal: terminais que podem aparecer logo depois dele
 * em alguma forma sentencial. $ entra no FOLLOW do símbolo inicial. Para cada
 * A -> α B β: FIRST(β) sem ε vai para FOLLOW(B); se β é anulável, FOLLOW(A) também.
 */
export function calcularFollow(g, first = calcularFirst(g), anulaveis = calcularAnulaveis(g)) {
  const follow = new Map(g.naoTerminais.map((a) => [a, new Set()]));
  if (g.inicial) follow.get(g.inicial).add(FIM);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of g.producoes) {
      p.corpo.forEach((s, i) => {
        if (!ehNT(g, s)) return;
        const alvo = follow.get(s);
        const antes = alvo.size;
        const resto = firstDeSequencia(g, p.corpo.slice(i + 1), first, anulaveis);
        for (const t of resto) if (t !== EPSILON) alvo.add(t);
        if (resto.has(EPSILON)) for (const t of follow.get(p.cabeca)) alvo.add(t);
        if (alvo.size !== antes) mudou = true;
      });
    }
  }
  return follow;
}

/** Tudo de uma vez: anuláveis, FIRST e FOLLOW. */
export function analisar(g) {
  const anulaveis = calcularAnulaveis(g);
  const first = calcularFirst(g, anulaveis);
  const follow = calcularFollow(g, first, anulaveis);
  return { anulaveis, first, follow };
}

// ---------------------------------------------------------------- tabela LL(1)

/**
 * M[A, a] recebe A -> α para cada a em FIRST(α) e, se α é anulável, para cada
 * a em FOLLOW(A). Uma célula com mais de uma produção é um conflito: a
 * gramática não é LL(1).
 */
export function tabelaLL1(g, conjuntos = analisar(g)) {
  const { first, follow, anulaveis } = conjuntos;
  const colunas = [...g.terminais, FIM];
  const celulas = new Map(g.naoTerminais.map((a) => [a, new Map(colunas.map((t) => [t, []]))]));
  for (const p of g.producoes) {
    const f = firstDeSequencia(g, p.corpo, first, anulaveis);
    const destinos = new Set([...f].filter((t) => t !== EPSILON));
    if (f.has(EPSILON)) for (const t of follow.get(p.cabeca)) destinos.add(t);
    for (const t of destinos) {
      const lista = celulas.get(p.cabeca).get(t);
      if (!lista.includes(p.id)) lista.push(p.id);
    }
  }
  const conflitos = [];
  for (const a of g.naoTerminais) {
    for (const t of colunas) {
      const lista = celulas.get(a).get(t);
      if (lista.length > 1) conflitos.push({ naoTerminal: a, terminal: t, producoes: [...lista] });
    }
  }
  return { colunas, celulas, conflitos, ehLL1: conflitos.length === 0 };
}

// ---------------------------------------------------------------- recursão à esquerda

/**
 * Procura recursão à esquerda. Liga A -> B quando A -> X1 ... Xk B ..., com
 * X1..Xk anuláveis (B pode aparecer "no canto esquerdo" de A). Um laço A -> A é
 * recursão direta; laços maiores (componentes fortemente conexos) são indiretos.
 */
export function recursaoEsquerda(g, anulaveis = calcularAnulaveis(g)) {
  const arestas = new Map(g.naoTerminais.map((a) => [a, new Set()]));
  const diretas = [];
  const ocultas = [];
  for (const p of g.producoes) {
    for (let i = 0; i < p.corpo.length; i++) {
      const s = p.corpo[i];
      if (ehNT(g, s)) {
        arestas.get(p.cabeca).add(s);
        if (s === p.cabeca) {
          const alvo = i === 0 ? diretas : ocultas;
          if (!alvo.includes(s)) alvo.push(s);
        }
      }
      if (!anulaveis.has(s)) break;
    }
  }
  // Tarjan para achar os componentes fortemente conexos.
  const indice = new Map();
  const baixo = new Map();
  const naPilha = new Set();
  const pilha = [];
  const componentes = [];
  let contador = 0;
  const visitar = (v) => {
    indice.set(v, contador);
    baixo.set(v, contador);
    contador++;
    pilha.push(v);
    naPilha.add(v);
    for (const w of arestas.get(v)) {
      if (!indice.has(w)) {
        visitar(w);
        baixo.set(v, Math.min(baixo.get(v), baixo.get(w)));
      } else if (naPilha.has(w)) {
        baixo.set(v, Math.min(baixo.get(v), indice.get(w)));
      }
    }
    if (baixo.get(v) === indice.get(v)) {
      const comp = [];
      let w;
      do {
        w = pilha.pop();
        naPilha.delete(w);
        comp.push(w);
      } while (w !== v);
      componentes.push(comp);
    }
  };
  for (const a of g.naoTerminais) if (!indice.has(a)) visitar(a);
  const indiretas = [];
  for (const comp of componentes) {
    if (comp.length < 2) continue;
    // Um ciclo de exemplo dentro do componente, começando pelo primeiro na ordem da gramática.
    const membros = new Set(comp);
    const inicio = g.naoTerminais.find((a) => membros.has(a));
    indiretas.push(cicloAte(inicio, inicio, arestas, membros));
  }
  return { diretas, ocultas, indiretas, tem: diretas.length + ocultas.length + indiretas.length > 0 };
}

function cicloAte(origem, alvo, arestas, membros) {
  // Busca em largura de origem até voltar ao alvo, dentro do componente.
  const anterior = new Map();
  const fila = [];
  for (const w of arestas.get(origem)) {
    if (!membros.has(w)) continue;
    if (w === alvo) return [origem, alvo];
    if (!anterior.has(w)) {
      anterior.set(w, origem);
      fila.push(w);
    }
  }
  while (fila.length) {
    const v = fila.shift();
    for (const w of arestas.get(v)) {
      if (!membros.has(w)) continue;
      if (w === alvo) {
        const caminho = [w, v];
        for (let x = v; x !== origem; x = anterior.get(x)) caminho.push(anterior.get(x));
        return caminho.reverse();
      }
      if (!anterior.has(w)) {
        anterior.set(w, v);
        fila.push(w);
      }
    }
  }
  return [origem];
}

function novoNome(base, usados) {
  let nome = `${base}'`;
  while (usados.has(nome)) nome += "'";
  usados.add(nome);
  return nome;
}

function montarGramatica(inicial, ordem, mapa, terminaisOriginais) {
  const producoes = [];
  const naoTerminais = ordem.filter((a) => (mapa.get(a) ?? []).length > 0 || a === inicial);
  for (const a of naoTerminais) {
    for (const corpo of mapa.get(a) ?? []) producoes.push({ id: producoes.length, cabeca: a, corpo: [...corpo] });
  }
  const nts = new Set(naoTerminais);
  const terminais = [];
  for (const t of terminaisOriginais) if (!terminais.includes(t)) terminais.push(t);
  for (const p of producoes) for (const s of p.corpo) if (!nts.has(s) && !terminais.includes(s)) terminais.push(s);
  const usados = new Set(producoes.flatMap((p) => p.corpo));
  return {
    inicial,
    naoTerminais,
    terminais: terminais.filter((t) => usados.has(t)),
    producoes,
    avisos: [],
    erros: [],
  };
}

function semRepeticao(corpos) {
  const vistos = new Set();
  return corpos.filter((c) => {
    const k = c.join('\u0000');
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/**
 * Algoritmo clássico (Aho, Lam, Sethi e Ullman): ordena os não terminais
 * A1..An; para cada Ai, substitui Ai -> Aj γ (j < i) pelas alternativas de Aj
 * e então elimina a recursão direta de Ai:
 *     A -> A α | β    vira    A -> β A'    e    A' -> α A' | ε
 * Funciona sempre que a gramática não tem ciclos (A =>+ A) nem produções
 * vazias; nos outros casos o resultado é conferido e um aviso explica o que sobrou.
 */
export function eliminarRecursaoEsquerda(g) {
  const passos = [];
  const avisos = [];
  const anulaveis = calcularAnulaveis(g);
  if (anulaveis.size > 0) {
    avisos.push(`a gramática tem não terminais anuláveis (${[...anulaveis].join(', ')}); o algoritmo pode não remover recursões escondidas por eles`);
  }
  const mapa = new Map(g.naoTerminais.map((a) => [a, g.producoes.filter((p) => p.cabeca === a).map((p) => [...p.corpo])]));
  const ordem = [...g.naoTerminais];
  const usados = new Set([...g.naoTerminais, ...g.terminais]);
  const originais = [...g.naoTerminais];
  for (let i = 0; i < originais.length; i++) {
    const ai = originais[i];
    for (let j = 0; j < i; j++) {
      const aj = originais[j];
      const novos = [];
      let trocou = false;
      for (const corpo of mapa.get(ai)) {
        if (corpo[0] === aj) {
          trocou = true;
          for (const delta of mapa.get(aj)) novos.push([...delta, ...corpo.slice(1)]);
        } else {
          novos.push(corpo);
        }
      }
      if (trocou) {
        mapa.set(ai, semRepeticao(novos));
        passos.push(`Substituindo ${aj} no início das alternativas de ${ai}: ${ai} → ${mapa.get(ai).map(corpoTexto).join(' | ')}`);
      }
    }
    const corpos = mapa.get(ai);
    const alfas = corpos.filter((c) => c[0] === ai).map((c) => c.slice(1));
    if (alfas.length === 0) continue;
    if (alfas.some((a) => a.length === 0)) {
      avisos.push(`${ai} → ${ai} não deriva nada novo e foi removida`);
    }
    const alfasUteis = alfas.filter((a) => a.length > 0);
    const betas = corpos.filter((c) => c[0] !== ai);
    if (alfasUteis.length === 0) {
      mapa.set(ai, betas);
      continue;
    }
    const linha = novoNome(ai, usados);
    if (betas.length === 0) avisos.push(`${ai} só tem alternativas recursivas e não gera cadeias de terminais`);
    mapa.set(ai, betas.map((b) => [...b, linha]));
    mapa.set(linha, [...alfasUteis.map((a) => [...a, linha]), []]);
    ordem.splice(ordem.indexOf(ai) + 1, 0, linha);
    passos.push(`Eliminando a recursão direta de ${ai}: ${ai} → ${mapa.get(ai).map(corpoTexto).join(' | ')} e ${linha} → ${mapa.get(linha).map(corpoTexto).join(' | ')}`);
  }
  const resultado = montarGramatica(g.inicial, ordem, mapa, g.terminais);
  const sobra = recursaoEsquerda(resultado);
  if (sobra.tem) {
    avisos.push('ainda há recursão à esquerda no resultado (efeito de produções vazias ou ciclos)');
  }
  return { gramatica: resultado, passos, avisos };
}

/**
 * Fatoração à esquerda: enquanto duas ou mais alternativas de A começarem com
 * o mesmo prefixo α, troca A -> α β1 | α β2 | γ por A -> α A' | γ e A' -> β1 | β2.
 */
export function fatorarEsquerda(g) {
  const passos = [];
  const mapa = new Map(g.naoTerminais.map((a) => [a, g.producoes.filter((p) => p.cabeca === a).map((p) => [...p.corpo])]));
  const ordem = [...g.naoTerminais];
  const usados = new Set([...g.naoTerminais, ...g.terminais]);
  let mudou = true;
  let voltas = 0;
  while (mudou && voltas++ < 1000) {
    mudou = false;
    for (const a of [...ordem]) {
      const corpos = mapa.get(a);
      let melhor = [];
      for (let i = 0; i < corpos.length; i++) {
        for (let j = i + 1; j < corpos.length; j++) {
          const p = prefixoComum(corpos[i], corpos[j]);
          if (p.length > melhor.length) melhor = p;
        }
      }
      if (melhor.length === 0) continue;
      const comPrefixo = corpos.filter((c) => comeca(c, melhor));
      const linha = novoNome(a, usados);
      const novos = [];
      let colocado = false;
      for (const c of corpos) {
        if (comeca(c, melhor)) {
          if (!colocado) novos.push([...melhor, linha]);
          colocado = true;
        } else {
          novos.push(c);
        }
      }
      mapa.set(a, novos);
      mapa.set(linha, semRepeticao(comPrefixo.map((c) => c.slice(melhor.length))));
      ordem.splice(ordem.indexOf(a) + 1, 0, linha);
      passos.push(`${a}: as alternativas ${comPrefixo.map(corpoTexto).join(' | ')} começam com "${melhor.join(' ')}"; ${a} → ${novos.map(corpoTexto).join(' | ')} e ${linha} → ${mapa.get(linha).map(corpoTexto).join(' | ')}`);
      mudou = true;
    }
  }
  return { gramatica: montarGramatica(g.inicial, ordem, mapa, g.terminais), passos };
}

function prefixoComum(a, b) {
  const p = [];
  for (let i = 0; i < a.length && i < b.length && a[i] === b[i]; i++) p.push(a[i]);
  return p;
}

function comeca(corpo, prefixo) {
  return prefixo.every((s, i) => corpo[i] === s);
}

function corpoTexto(c) {
  return c.length ? c.join(' ') : EPSILON;
}

// ---------------------------------------------------------------- entrada

/**
 * Separa a cadeia de entrada em terminais. Com espaços, cada pedaço é um
 * terminal; pedaços sem espaço são quebrados pelo terminal mais longo que
 * casar ("id+id" vira id + id).
 */
export function tokenizarEntrada(texto, terminais) {
  const tokens = [];
  const ordenados = [...terminais].sort((a, b) => b.length - a.length);
  for (const pedaco of texto.trim().split(/\s+/).filter(Boolean)) {
    if (terminais.includes(pedaco)) {
      tokens.push(pedaco);
      continue;
    }
    let i = 0;
    while (i < pedaco.length) {
      const t = ordenados.find((x) => x.length > 0 && pedaco.startsWith(x, i));
      if (!t) return { tokens: null, erro: `símbolo desconhecido na entrada: "${pedaco.slice(i)}"` };
      tokens.push(t);
      i += t.length;
    }
  }
  return { tokens, erro: null };
}

// ---------------------------------------------------------------- análise LL(1)

function novoNo(simbolo, terminal) {
  return { simbolo, terminal, filhos: [] };
}

/**
 * Analisador preditivo com pilha: no topo, um terminal precisa casar com a
 * entrada; um não terminal é trocado pela produção indicada em M[topo, entrada].
 * Devolve os passos (pilha, entrada, ação) e a árvore sintática.
 */
export function analisarLL1(g, tabela, texto) {
  const { tokens, erro } = tokenizarEntrada(texto, g.terminais);
  if (erro) return { passos: [], aceita: false, erro, arvore: null };
  const entrada = [...tokens, FIM];
  const raiz = novoNo(g.inicial, false);
  const pilha = [{ simbolo: FIM, no: null }, { simbolo: g.inicial, no: raiz }];
  const passos = [];
  let i = 0;
  const foto = () => ({ pilha: pilha.map((x) => x.simbolo).join(' '), entrada: entrada.slice(i).join(' ') });
  while (passos.length < LIMITE_PASSOS) {
    const topo = pilha[pilha.length - 1];
    const a = entrada[i];
    const estado = foto();
    if (topo.simbolo === FIM && a === FIM) {
      passos.push({ ...estado, acao: 'aceita' });
      return { passos, aceita: true, erro: null, arvore: raiz };
    }
    if (topo.simbolo === FIM || !ehNT(g, topo.simbolo)) {
      if (topo.simbolo === a) {
        passos.push({ ...estado, acao: `casa ${a}` });
        pilha.pop();
        i++;
        continue;
      }
      const msg = topo.simbolo === FIM
        ? `sobrou entrada a partir de ${a}`
        : `esperava ${topo.simbolo}, mas encontrou ${a}`;
      passos.push({ ...estado, acao: `erro: ${msg}` });
      return { passos, aceita: false, erro: msg, arvore: raiz };
    }
    const lista = tabela.celulas.get(topo.simbolo).get(a) ?? [];
    if (lista.length === 0) {
      const esperados = tabela.colunas.filter((t) => tabela.celulas.get(topo.simbolo).get(t).length > 0);
      const msg = `M[${topo.simbolo}, ${a}] está vazia; esperava ${esperados.join(' ')}`;
      passos.push({ ...estado, acao: `erro: ${msg}` });
      return { passos, aceita: false, erro: msg, arvore: raiz };
    }
    const p = g.producoes[lista[0]];
    const extra = lista.length > 1 ? ' (conflito: usada a primeira produção)' : '';
    passos.push({ ...estado, acao: `${textoProducao(p)}${extra}` });
    pilha.pop();
    if (p.corpo.length === 0) {
      topo.no.filhos.push(novoNo(EPSILON, true));
    } else {
      const filhos = p.corpo.map((s) => novoNo(s, !ehNT(g, s)));
      topo.no.filhos.push(...filhos);
      for (let k = p.corpo.length - 1; k >= 0; k--) pilha.push({ simbolo: p.corpo[k], no: filhos[k] });
    }
  }
  return { passos, aceita: false, erro: 'limite de passos atingido (a gramática pode ter recursão à esquerda)', arvore: raiz };
}

// ---------------------------------------------------------------- LR(0) e SLR(1)

/**
 * Gramática aumentada (S' -> S) e coleção canônica de conjuntos de itens LR(0).
 * Um item é uma produção com um ponto: [A -> α • β]. closure acrescenta
 * [B -> • γ] sempre que o ponto está antes de um não terminal B; goto(I, X)
 * anda o ponto sobre X. Os estados são numerados na ordem em que aparecem.
 */
export function colecaoLR0(g) {
  const usados = new Set([...g.naoTerminais, ...g.terminais]);
  const inicialAumentada = novoNome(g.inicial, usados);
  const producoes = [{ id: 0, cabeca: inicialAumentada, corpo: [g.inicial] }, ...g.producoes.map((p, i) => ({ ...p, id: i + 1 }))];
  const nts = new Set([inicialAumentada, ...g.naoTerminais]);
  const porCabeca = new Map();
  for (const p of producoes) {
    if (!porCabeca.has(p.cabeca)) porCabeca.set(p.cabeca, []);
    porCabeca.get(p.cabeca).push(p);
  }
  const chave = (it) => `${it.p}.${it.d}`;
  const posPonto = (it) => producoes[it.p].corpo[it.d];

  const closure = (nucleo) => {
    const itens = [...nucleo];
    const vistos = new Set(itens.map(chave));
    for (let k = 0; k < itens.length; k++) {
      const b = posPonto(itens[k]);
      if (b === undefined || !nts.has(b)) continue;
      for (const p of porCabeca.get(b) ?? []) {
        const novo = { p: p.id, d: 0 };
        if (!vistos.has(chave(novo))) {
          vistos.add(chave(novo));
          itens.push(novo);
        }
      }
    }
    return itens;
  };

  const estados = [];
  const indicePorNucleo = new Map();
  const transicoes = [];
  const adicionar = (nucleo) => {
    const k = nucleo.map(chave).sort().join(' ');
    if (indicePorNucleo.has(k)) return indicePorNucleo.get(k);
    const id = estados.length;
    indicePorNucleo.set(k, id);
    estados.push({ id, nucleo: nucleo.length, itens: closure(nucleo) });
    transicoes.push(new Map());
    return id;
  };
  adicionar([{ p: 0, d: 0 }]);
  for (let e = 0; e < estados.length; e++) {
    const simbolos = [];
    for (const it of estados[e].itens) {
      const x = posPonto(it);
      if (x !== undefined && !simbolos.includes(x)) simbolos.push(x);
    }
    for (const x of simbolos) {
      const nucleo = estados[e].itens.filter((it) => posPonto(it) === x).map((it) => ({ p: it.p, d: it.d + 1 }));
      transicoes[e].set(x, adicionar(nucleo));
    }
  }
  return { inicialAumentada, producoes, estados, transicoes, naoTerminais: [...nts] };
}

export function textoItem(colecao, item) {
  const p = colecao.producoes[item.p];
  const corpo = [...p.corpo];
  corpo.splice(item.d, 0, '•');
  return `${p.cabeca} → ${corpo.join(' ')}`;
}

/**
 * Tabela SLR(1): em cada estado, "empilha j" para cada transição por terminal;
 * "reduz A -> α" em cada terminal de FOLLOW(A) quando o item [A -> α •] está no
 * estado; "aceita" em $ com [S' -> S •]. Mais de uma ação na mesma célula é um
 * conflito empilha/reduz ou reduz/reduz.
 */
export function tabelaSLR(g, colecao = colecaoLR0(g), conjuntos = analisar(g)) {
  const { follow } = conjuntos;
  const colunas = [...g.terminais, FIM];
  const acao = colecao.estados.map(() => new Map(colunas.map((t) => [t, []])));
  const desvio = colecao.estados.map(() => new Map());
  colecao.estados.forEach((estado, e) => {
    for (const [x, destino] of colecao.transicoes[e]) {
      if (ehNT(g, x)) desvio[e].set(x, destino);
      else acao[e].get(x).push({ tipo: 'empilha', estado: destino });
    }
    for (const it of estado.itens) {
      const p = colecao.producoes[it.p];
      if (it.d !== p.corpo.length) continue;
      if (it.p === 0) {
        acao[e].get(FIM).push({ tipo: 'aceita' });
        continue;
      }
      for (const t of follow.get(p.cabeca)) acao[e].get(t).push({ tipo: 'reduz', producao: it.p });
    }
  });
  const conflitos = [];
  acao.forEach((linha, e) => {
    for (const [t, lista] of linha) {
      if (lista.length < 2) continue;
      const reducoes = lista.filter((x) => x.tipo === 'reduz').length;
      conflitos.push({ estado: e, terminal: t, tipo: lista.some((x) => x.tipo === 'empilha') ? 'empilha/reduz' : 'reduz/reduz', reducoes, acoes: lista });
    }
  });
  return { colunas, acao, desvio, conflitos, ehSLR: conflitos.length === 0 };
}

export function textoAcao(colecao, a) {
  if (a.tipo === 'empilha') return `e${a.estado}`;
  if (a.tipo === 'aceita') return 'aceita';
  return `r${a.producao}`;
}

/**
 * Analisador SLR(1): a pilha guarda estados; "empilha" consome um terminal,
 * "reduz" desempilha |α| estados e segue o desvio de A. Em conflito empilha/reduz
 * empilha (como o yacc faz); em reduz/reduz usa a produção que vem primeiro.
 */
export function analisarSLR(g, colecao, tabela, texto) {
  const { tokens, erro } = tokenizarEntrada(texto, g.terminais);
  if (erro) return { passos: [], aceita: false, erro, arvore: null };
  const entrada = [...tokens, FIM];
  const estados = [0];
  const simbolos = [];
  const nos = [];
  const passos = [];
  let i = 0;
  const foto = () => {
    let s = String(estados[0]);
    for (let k = 0; k < simbolos.length; k++) s += ` ${simbolos[k]} ${estados[k + 1]}`;
    return { pilha: s, entrada: entrada.slice(i).join(' ') };
  };
  while (passos.length < LIMITE_PASSOS) {
    const e = estados[estados.length - 1];
    const a = entrada[i];
    const lista = tabela.acao[e].get(a) ?? [];
    const estado = foto();
    if (lista.length === 0) {
      const esperados = tabela.colunas.filter((t) => tabela.acao[e].get(t).length > 0);
      const msg = `ACTION[${e}, ${a}] está vazia; esperava ${esperados.join(' ')}`;
      passos.push({ ...estado, acao: `erro: ${msg}` });
      return { passos, aceita: false, erro: msg, arvore: null };
    }
    let escolhida = lista.find((x) => x.tipo === 'empilha') ?? lista[0];
    if (lista.length > 1 && !lista.some((x) => x.tipo === 'empilha')) {
      escolhida = lista.reduce((m, x) => (x.producao < m.producao ? x : m));
    }
    const extra = lista.length > 1 ? ` (conflito: escolhido ${escolhida.tipo === 'empilha' ? 'empilhar' : 'reduzir pela primeira produção'})` : '';
    if (escolhida.tipo === 'aceita') {
      passos.push({ ...estado, acao: 'aceita' });
      return { passos, aceita: true, erro: null, arvore: nos[0] ?? null };
    }
    if (escolhida.tipo === 'empilha') {
      passos.push({ ...estado, acao: `empilha ${a} e vai para o estado ${escolhida.estado}${extra}` });
      estados.push(escolhida.estado);
      simbolos.push(a);
      nos.push(novoNo(a, true));
      i++;
      continue;
    }
    const p = colecao.producoes[escolhida.producao];
    const n = p.corpo.length;
    const filhos = n ? nos.splice(nos.length - n, n) : [novoNo(EPSILON, true)];
    estados.splice(estados.length - n, n);
    simbolos.splice(simbolos.length - n, n);
    const topo = estados[estados.length - 1];
    const destino = tabela.desvio[topo].get(p.cabeca);
    passos.push({ ...estado, acao: `reduz por ${textoProducao(p)}, desvio para ${destino}${extra}` });
    const no = novoNo(p.cabeca, false);
    no.filhos = filhos;
    estados.push(destino);
    simbolos.push(p.cabeca);
    nos.push(no);
  }
  return { passos, aceita: false, erro: 'limite de passos atingido', arvore: null };
}

// ---------------------------------------------------------------- compartilhamento

/** Codifica texto em base64url (UTF-8), para usar no endereço da página. */
export function codificarParaLink(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodificarLink(codigo) {
  try {
    const b64 = codigo.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
