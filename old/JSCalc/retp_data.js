// retp_data.js
// Armazena os valores históricos do RETP.
// O sistema usará o valor correspondente à data mais recente que seja
// igual ou anterior à data da linha de cálculo.
// Formato da data: 'AAAA-MM-DD'

const retpValues = [
  { date: '2010-01-01', value: 925.00 },
  { date: '2014-06-01', value: 989.75 },
  { date: '2018-03-01', value: 1068.93 },
  { date: '2019-11-01', value: 1111.69 },
  { date: '2022-03-01', value: 1167.27 },
  { date: '2023-06-01', value: 1400.73 }
  // Adicione mais entradas aqui conforme necessário...
  // Ex: { date: '2025-02-01', value: 1500.00 },
];