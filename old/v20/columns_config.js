// Configuração de colunas para o relatório.
// Cada coluna possui uma chave (key), um título (header) e uma função formula
// que recebe o objeto da linha (row) e o índice da linha (i) e retorna o valor
// a ser exibido. Para valores numéricos, a função generateReport cuidará da
// formatação monetária.

const columnsConfig = [
  { key: 'id', header: 'ID', formula: (row, i) => row.id },
  { key: 'data', header: 'Data', formula: (row, i) => row.dateString },
  { key: 'valor', header: 'Valor', formula: (row, i) => row.baseValue },
  { key: 'sexta', header: 'Sexta Parte', formula: (row, i) => row.sextaParte },
  { key: 'quinque_pct', header: 'Quinq %', formula: (row, i) => row.quinquenioPct ? row.quinquenioPct.toFixed(2) + '%' : '' },
  //{ key: 'quinque_val', header: 'Val Quinq', formula: (row, i) => row.quinquenioVal },
{ key: 'quinque_val', header: 'Quinq (R$)', formula: (row, i) => row.quinquenioVal },

  { key: 'ind_corr', header: 'Ind. Corr.', formula: (row, i) => row.indCorr, isMoney: false, decimals: 6 },
  { key: 'ind_hoje', header: 'Ind. Hoje', formula: (row, i) => row.indHoje, isMoney: false, decimals: 6 },
  { key: 'val_atual', header: 'Val. Atual', formula: (row, i) => row.valAtual },
  { key: 'ferias', header: 'Férias', formula: (row, i) => row.ferias },
  { key: 'terco', header: '1/3', formula: (row, i) => row.terco },
  { key: 'decimo', header: '13º', formula: (row, i) => row.decimo },
  { key: 'lic', header: 'Lic. Prêmio', formula: (row, i) => row.lic },
  { key: 'sub', header: 'SubTotal', formula: (row, i) => row.subTotal },
  //{ key: 'fator_selic', header: 'Fator Selic', formula: (row, i) => row.fatorSelic },
{ key: 'fator_selic', header: 'Fator Selic', formula: (row) => row.fatorSelic, isMoney: false, decimals: 6 },
  { key: 'val_selic', header: 'Val. Selic', formula: (row, i) => row.valSelic },
  { key: 'total', header: 'Val. Total', formula: (row, i) => row.total },
// Componentes somados para formar a base (principal+6ª+quinq, conforme seleção)
{ key: 'comp_base', header: 'Base Selecionada', formula: (row) => row.componentesBase },

// Fator de juros (pode ser SELIC ou Poupança, conforme data/opção)
//{ key: 'fator_juros', header: 'Fator Juros', formula: (row) => row.fatorJuros },
{ key: 'fator_juros', header: 'Fator Juros', formula: (row) => row.fatorJuros, isMoney: false, decimals: 6 },

// Valor dos juros aplicado ao subtotal
{ key: 'val_juros', header: 'Val. Juros', formula: (row) => row.valJuros },

];