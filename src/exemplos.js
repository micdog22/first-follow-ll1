// Gramáticas de exemplo da página (originais), com uma entrada para cada.
export const EXEMPLOS = [
  {
    nome: 'Expressões (LL(1))',
    gramatica: `E -> T E'
E' -> + T E' | ε
T -> F T'
T' -> * F T' | ε
F -> ( E ) | id`,
    entrada: 'id + id * id',
    ll1: true,
  },
  {
    nome: 'Expressões (recursiva à esquerda)',
    gramatica: `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`,
    entrada: '( id + id ) * id',
    ll1: false,
  },
  {
    nome: 'Else pendente',
    gramatica: `S -> if E then S | if E then S else S | other
E -> cond`,
    entrada: 'if cond then if cond then other else other',
    ll1: false,
  },
  {
    nome: 'JSON simplificado',
    gramatica: `valor -> objeto | lista | texto | numero | true | false | null
objeto -> { membros }
membros -> par mais_membros | ε
mais_membros -> , par mais_membros | ε
par -> texto : valor
lista -> [ elementos ]
elementos -> valor mais_elementos | ε
mais_elementos -> , valor mais_elementos | ε`,
    entrada: '{ texto : [ numero , true ] , texto : null }',
    ll1: true,
  },
  {
    nome: 'Recursão indireta',
    gramatica: `S -> A a | b
A -> A c | S d | &`,
    entrada: 'b d a',
    ll1: false,
  },
  {
    nome: 'Precisa de fatoração',
    gramatica: `Cmd -> if Exp then Cmd else Cmd | if Exp then Cmd | id := Exp
Exp -> id`,
    entrada: 'if id then id := id else id := id',
    ll1: false,
  },
];
