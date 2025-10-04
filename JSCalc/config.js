// config.js
// Define valores padrão e configurações gerais para o cálculo.
// Estes valores podem ser lidos e sobrepostos pelos controles na interface
// HTML. Manter tudo em um objeto exportado facilita futuras expansões.

export const CONFIG = {
  // Período padrão de cálculo. Formato YYYY-MM-DD.
  startDate: '2013-03-01',
  endDate: '2013-12-01',

  // Datas limites para índices e juros. O usuário pode alterá-las via inputs.
  limitTJSP: new Date().toISOString().split('T')[0], // data atual
  limitPoupanca: '2021-11-30',
  limitSelic: '2021-12-01',

  // Valor base inicial. Se o usuário definir 0 e optar por usar apenas ALE/Piso,
  // o cálculo considerará apenas esses componentes.
  baseValue: 0,

  // Configuração padrão para o RETP: pode espelhar o Valor Base ("base"),
  // o ALE ("ale") ou o Piso ("piso").
  retpBasedOn: 'base',

  // Se verdadeiro, o valor de ALE será dividido por 2 antes de ser somado.
  useHalfAle: false,

  // Percentuais de deduções e acréscimos padrão (em %).
  taxaPrev: 11,
  taxaHonor: 0,
  taxaCustas: 0,
};

export default CONFIG;