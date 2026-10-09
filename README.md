# First e Follow

Calcule FIRST, FOLLOW e as tabelas LL(1) e SLR(1) de qualquer gramática, direto no navegador. Feito para quem está cursando Compiladores ou Linguagens Formais: além dos conjuntos e das tabelas, a página detecta e elimina recursão à esquerda, fatora, mostra os conjuntos de itens LR(0), aponta os conflitos e analisa uma cadeia passo a passo, com a pilha, a entrada, a ação e a árvore sintática desenhada.

**Acesse online:** https://micdog22.github.io/first-follow-ll1/

## Recursos

- **Entrada flexível**: `A -> α | β`, também com `::=` ou `→`; vazio como `ε`, `eps` ou `&` (a notação de muitos livros brasileiros); alternativas em várias linhas começando com `|`; terminais especiais entre aspas (`'|'`, `'->'`).
- **Conjuntos**: anuláveis, FIRST e FOLLOW de cada não terminal.
- **Tabela LL(1)** com as células em conflito destacadas e a lista de conflitos.
- **Recursão à esquerda**: detecta a direta, a indireta (com o ciclo, como `S ⇒ A ⇒ S`) e a escondida atrás de símbolos anuláveis; elimina com o algoritmo clássico e mostra cada passo.
- **Fatoração à esquerda**, também passo a passo. A gramática transformada pode ser usada na hora com um clique.
- **Análise LL(1) passo a passo**: tabela com pilha, entrada e ação, e a árvore sintática em SVG.
- **SLR(1)**: coleção canônica de itens LR(0) (com núcleo destacado e transições), tabela ACTION/GOTO com conflitos empilha/reduz e reduz/reduz marcados, e análise passo a passo com árvore.
- **Mensagens úteis**: erros com o número da linha; avisos para símbolos inalcançáveis, não terminais que não geram nada e símbolos colados (como `E+T` sem espaços).
- **Exemplos originais**: expressões (LL(1) e recursiva à esquerda), else pendente, JSON simplificado, recursão indireta e uma gramática que precisa de fatoração.
- **Link para compartilhar** a gramática e a cadeia, e a última gramática fica salva no navegador.

## Como usar

1. Digite a gramática, uma regra por linha. O primeiro lado esquerdo é o símbolo inicial; todo símbolo que aparece em algum lado esquerdo é não terminal; o resto é terminal. Separe os símbolos com espaços.

   ```
   E -> T E'
   E' -> + T E' | ε
   T -> F T'
   T' -> * F T' | ε
   F -> ( E ) | id
   ```

2. Os conjuntos e as tabelas aparecem na hora:

   | Não terminal | Anulável | FIRST | FOLLOW |
   | --- | --- | --- | --- |
   | E | não | { (, id } | { ), $ } |
   | E' | sim | { +, ε } | { ), $ } |
   | T | não | { (, id } | { +, ), $ } |
   | T' | sim | { *, ε } | { +, ), $ } |
   | F | não | { (, id } | { +, *, ), $ } |

3. Em **Análise LL(1) passo a passo**, digite a cadeia (`id + id * id`; sem espaços também funciona, como `id+id*id`) e veja cada passo:

   | Passo | Pilha | Entrada | Ação |
   | --- | --- | --- | --- |
   | 1 | $ E | id + id * id $ | E → T E' |
   | 2 | $ E' T | id + id * id $ | T → F T' |
   | 3 | $ E' T' F | id + id * id $ | F → id |
   | 4 | $ E' T' id | id + id * id $ | casa id |
   | 5 | $ E' T' | + id * id $ | T' → ε |
   | ... | | | |
   | 17 | $ | $ | aceita |

4. Se a gramática tiver recursão à esquerda, use **Eliminar recursão à esquerda** e depois **Usar esta gramática**. Com `E -> E + T | T`, `T -> T * F | F` e `F -> ( E ) | id`, o resultado é exatamente a gramática do passo 1.

Para a gramática do else pendente (`S -> if E then S | if E then S else S | other`), a página mostra o conflito clássico: "10 estados e 1 conflito: empilha/reduz no estado 7 com else". O estado 7 tem os itens `S → if E then S •` (reduzir) e `S → if E then S • else S` (empilhar o else). Na análise, a página escolhe empilhar, como o yacc, e o else fica com o if mais próximo.

## Como rodar localmente

Não há dependências nem etapa de build. Como a página usa módulos JavaScript, ela precisa ser servida por HTTP:

```
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Testes

```
npm test
```

(ou `node --test`). Os testes cobrem, entre outros:

- FIRST(E) = { (, id }, FOLLOW(E) = { ), $ }, FOLLOW(T) = { +, ), $ } e os demais conjuntos da gramática de expressões, nas versões LL(1) e recursiva à esquerda, e uma gramática com vários anuláveis em sequência;
- a tabela LL(1) célula por célula, os conflitos da versão recursiva à esquerda e o conflito em M[S', else] do else pendente;
- detecção de recursão direta, indireta e escondida; a eliminação nas expressões e no exemplo clássico com recursão indireta (S -> A a | b, A -> A c | S d | ε); e uma prova de que a linguagem não muda: todas as 3.905 cadeias de até 5 símbolos são aceitas pela LL(1) da gramática transformada exatamente quando a SLR(1) da original as aceita;
- fatoração à esquerda, com o maior prefixo comum saindo primeiro;
- 12 estados LR(0) para a gramática de expressões (com a numeração dos livros) e 16 para a versão LL(1), o conflito empilha/reduz do else pendente e um conflito reduz/reduz;
- traços completos das análises LL(1) e SLR(1), inclusive mensagens de erro;
- o layout da árvore (pais centrados sobre os filhos, rótulos do mesmo nível sem sobreposição) e o link de compartilhamento com acentos.

## Como funciona

### FIRST, FOLLOW e anuláveis

Os três são calculados por **ponto fixo**: começam vazios e as regras são aplicadas em todas as produções, repetidamente, até nenhum conjunto mudar. Como os conjuntos só crescem e são finitos, o processo sempre termina.

- **Anulável**: A é anulável se tem uma produção cujo corpo inteiro é anulável (o corpo vazio, ε, é anulável).
- **FIRST(X1 X2 ... Xn)**: entra FIRST(X1) sem ε; se X1 é anulável, entra também FIRST(X2), e assim por diante. Se todos forem anuláveis, entra ε. FIRST de um terminal é ele mesmo.
- **FOLLOW**: o símbolo inicial recebe $ (o fim da entrada). Para cada produção A → α B β, FIRST(β) sem ε vai para FOLLOW(B); se β é anulável (ou vazio), tudo de FOLLOW(A) também vai para FOLLOW(B).

### Tabela LL(1)

Para cada produção A → α: coloque A → α em M[A, a] para todo terminal a em FIRST(α); se α é anulável, coloque também em M[A, b] para todo b em FOLLOW(A). A gramática é **LL(1)** se nenhuma célula recebeu mais de uma produção. Duas situações clássicas que geram conflito:

- **Recursão à esquerda**: em E → E + T | T, as duas alternativas começam com o que E começa, então FIRST das duas é igual.
- **Prefixo comum**: em `Cmd -> if Exp then Cmd else Cmd | if Exp then Cmd`, as duas alternativas começam com `if`.

### Eliminação de recursão à esquerda

Recursão direta: A → A α | β gera β α α α..., então pode ser reescrita como

```
A  -> β A'
A' -> α A' | ε
```

Para a indireta (S → A a, A → S d), o algoritmo de Aho, Lam, Sethi e Ullman ordena os não terminais A1, ..., An e, para cada Ai, substitui toda produção Ai → Aj γ com j < i pelas alternativas de Aj; depois disso, qualquer recursão que sobrou em Ai é direta e sai com a regra acima. O algoritmo pressupõe que não há ciclos (A ⇒+ A) nem produções vazias; quando a gramática tem anuláveis, a página avisa e confere o resultado de novo.

A **detecção** monta um grafo com uma aresta A → B quando B pode aparecer no canto esquerdo de A (em A → X1 ... Xk B ..., com X1..Xk anuláveis). Um laço A → A é recursão direta (ou escondida, se passou por anuláveis); componentes fortemente conexos maiores, achados com o algoritmo de Tarjan, são recursão indireta.

### Fatoração à esquerda

Enquanto duas ou mais alternativas de A começarem com o mesmo prefixo α (o maior possível), troca

```
A -> α β1 | α β2 | γ      por      A -> α A' | γ      e      A' -> β1 | β2
```

### Análise LL(1)

A pilha começa com `$ S`. A cada passo: se o topo é um terminal, ele precisa ser igual ao próximo símbolo da entrada (casa e avança); se é um não terminal A, a tabela M[A, a] diz por qual produção trocá-lo, empilhando o corpo de trás para frente. Aceita quando a pilha e a entrada chegam juntas ao $. A árvore sintática cresce a cada troca: o não terminal ganha como filhos os símbolos da produção.

### Itens LR(0) e SLR(1)

Um **item** é uma produção com um ponto marcando o quanto dela já foi reconhecido: `E → E • + T`. A gramática é aumentada com S' → S e:

- **closure(I)**: para cada item com o ponto antes de um não terminal B, acrescenta todos os itens B → • γ, até não entrar mais nada;
- **goto(I, X)**: anda o ponto sobre X nos itens que esperam X e tira o closure.

A coleção canônica começa em closure({S' → • S}) e aplica goto com todos os símbolos até não surgirem estados novos. Os estados são numerados na ordem em que aparecem, o que reproduz a numeração dos livros (12 estados para a gramática de expressões).

A tabela **SLR(1)**: no estado i, "empilha j" com o terminal a se goto(Ii, a) = Ij; "reduz A → α" com cada terminal de FOLLOW(A) se o item A → α • está em Ii; "aceita" com $ se S' → S • está em Ii; e GOTO[i, A] = j para os não terminais. Duas ações na mesma célula são um conflito **empilha/reduz** (como no else pendente) ou **reduz/reduz**. Usar FOLLOW para decidir as reduções é o que diferencia o SLR do LR(0) puro; o LALR(1) e o LR(1) canônico usam conjuntos de lookahead mais precisos.

Na análise, a pilha guarda estados: "empilha" consome um terminal e empilha o estado; "reduz por A → α" desempilha |α| estados e segue o GOTO de A a partir do estado que ficou no topo.

### Árvore em SVG

Cada subárvore é desenhada sozinha, com o pai no meio entre o primeiro e o último filho; depois as subárvores irmãs são encostadas lado a lado pela extensão horizontal de cada uma, com uma folga. Assim nenhum rótulo encosta em outro do mesmo nível.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
