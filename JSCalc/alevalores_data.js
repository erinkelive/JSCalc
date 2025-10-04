// retp_data.js
// Tabela de valores do RETP (Revezamento Especial de Trabalho Policial).
// Para cada data inicial de vigência, indique o valor correspondente.
// O sistema usará o valor mais recente cujo início seja anterior ou igual à data da linha.
export const aleValues = [
  { date: '2010-01-01', value: 975.00 },
  { date: '2014-06-01', value: 989.75 },
  { date: '2018-03-01', value: 1068.93 },
  { date: '2019-11-01', value: 1111.69 },
  { date: '2022-03-01', value: 1167.27 },
  { date: '2023-06-01', value: 1400.73 },
];

export default aleValues;