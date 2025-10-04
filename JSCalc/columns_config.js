// columns_config.js
// Lista de colunas exibidas no relatório e mapeamento de propriedades
// do objeto de linha (`row`) gerado em calculadora.js para cabeçalhos e
// formatação. Cada coluna possui:
//   key: nome da propriedade no objeto `row`.
//   header: título exibido na tabela.
//   isMoney: true para formatar como valor monetário com 2 casas decimais,
//            false para números genéricos ou strings.

export const columnsConfig = [
  { key: 'id', header: 'ID', isMoney: false, decimals: 0 },
  { key: 'data', header: 'Data', isMoney: false },
  { key: 'valor', header: 'Valor', isMoney: true, decimals: 2 },
  { key: 'ale', header: 'ALE', isMoney: true, decimals: 2 },
  { key: 'piso', header: 'Piso', isMoney: true, decimals: 2 },
  { key: 'quinque_pct', header: 'Quinq %', isMoney: false },
  { key: 'quinque_val', header: 'Quinq (R$)', isMoney: true, decimals: 2 },
  { key: 'sexta', header: 'Sexta Parte', isMoney: true, decimals: 2 },
  { key: 'retp', header: 'RETP', isMoney: true, decimals: 2 },
  { key: 'sub_base', header: 'SubBase', isMoney: true, decimals: 2 },
  { key: 'ind_corr', header: 'Ind. Corr.', isMoney: false, decimals: 6 },
  { key: 'ind_hoje', header: 'Ind. Atual', isMoney: false, decimals: 6 },
  { key: 'val_atual', header: 'Val. Atual', isMoney: true, decimals: 2 },
  { key: 'ferias', header: 'Férias', isMoney: true, decimals: 2 },
  { key: 'terco', header: '1/3', isMoney: true, decimals: 2 },
  { key: 'decimo', header: '13º', isMoney: true, decimals: 2 },
  { key: 'licenca', header: 'Licença', isMoney: true, decimals: 2 },
  { key: 'sub_total', header: 'SubTotal', isMoney: true, decimals: 2 },
  { key: 'poup_acum', header: 'Fator Poup. (acum)', isMoney: false, decimals: 4 },
  { key: 'poup_val', header: 'Juros Poup.', isMoney: true, decimals: 2 },
  { key: 'sub_total_poup', header: 'SubTotal Poup.', isMoney: true, decimals: 2 },
  { key: 'selic_acum', header: 'Fator SELIC (acum)', isMoney: false, decimals: 6 },
  { key: 'selic_val', header: 'Juros SELIC', isMoney: true, decimals: 2 },
  { key: 'sub_total_selic', header: 'SubTotal SELIC', isMoney: true, decimals: 2 },
  { key: 'descPrev_val', header: 'Desc. Prev.', isMoney: true, decimals: 2 },
  { key: 'honor_val', header: 'Honor.', isMoney: true, decimals: 2 },
  { key: 'custas_val', header: 'Custas', isMoney: true, decimals: 2 },
  { key: 'total', header: 'Total', isMoney: true, decimals: 2 }
];

export default columnsConfig;