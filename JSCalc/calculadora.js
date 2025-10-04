// calculadora.js
// Este módulo gera o relatório de cálculos com base nas configurações
// informadas pelo usuário na interface HTML. O cálculo engloba componentes
// como Valor Base, ALE (Adicional de Local de Exercício), Piso Salarial,
// Quinquênio, Sexta Parte, RETP, férias, 1/3 constitucional, décimo
// terceiro, licença prêmio e juros de poupança/SELIC acumulados.
// Cada coluna é calculada por funções específicas para facilitar a
// manutenção. Funções adicionais replicadas do HTML original permitem
// edição de células, ocultação de colunas, exportação e salvamento.

import { tabelaTJSP } from './tabela_data2.js';
import { selicFactors } from './selic_data.js';
import { poupancaFactors } from './poupanca_data.js';
import { aleValues } from './alevalores_data.js';
import columnsConfig from './columns_config.js';
import CONFIG from './config.js';

// Armazenam os totais e configurações da última geração de relatório para
// uso na construção de metodologia e em preferências. Eles são atualizados
// em generateReport() e renderTable().
export let lastTotals = {};
export let lastSettings = {};

// Armazena edições manuais feitas pelo usuário nas células.
// A chave é o índice da linha (base 0) e o valor é um objeto com
// propriedades (valor, ale, piso, quinque_pct, sexta, retp) substituídas.
export const editOverrides = {};

// === Funções utilitárias ===

/**
 * Converte uma string no formato YYYY-MM-DD em um objeto Date na meia-noite.
 * @param {string} input Data em formato ISO
 * @returns {Date}
 */
function parseDate(input) {
  const [y, m, d] = input.split('-').map(x => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

/**
 * Retorna uma chave no formato YYYY-MM para uso em tabelas.
 * @param {Date} date
 * @returns {string}
 */
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Adiciona um número de meses a uma data e retorna uma nova data no dia 1.
 * @param {Date} date
 * @param {number} count
 * @returns {Date}
 */
function addMonths(date, count) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + count);
  d.setDate(1);
  return d;
}

/**
 * Calcula a diferença em meses inteiros entre duas datas.
 * @param {Date} start
 * @param {Date} end
 * @returns {number}
 */
function diffMonths(start, end) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/**
 * Obtém o índice de correção monetária para um mês (Ind. Corr.) a partir da tabela TJSP.
 * Se a chave não existir, retorna o valor do último índice anterior disponível.
 * @param {string} key Chave no formato YYYY-MM
 * @returns {number}
 */
function getIndCorr(key) {
  if (tabelaTJSP.hasOwnProperty(key)) {
    return tabelaTJSP[key];
  }
  // tentar meses anteriores (máx. 24 meses para trás)
  let [year, month] = key.split('-').map(x => parseInt(x, 10));
  for (let i = 0; i < 24; i++) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const k = `${year}-${String(month).padStart(2, '0')}`;
    if (tabelaTJSP.hasOwnProperty(k)) {
      return tabelaTJSP[k];
    }
  }
  return 1;
}

/**
 * Obtém o valor do ALE mais recente para a data informada.
 * O ALE é definido em uma tabela com datas de início de vigência.
 * @param {Date} date
 * @returns {number}
 */
function getAle(date) {
  let value = 0;
  for (const item of aleValues) {
    const itemDate = parseDate(item.date);
    if (itemDate <= date) {
      value = item.value;
    }
  }
  return value;
}

/**
 * Obtém o fator de poupança para uma chave YYYY-MM. Retorna 0 se não existir.
 * @param {string} key
 * @returns {number}
 */
function getPoupancaFactor(key) {
  for (const item of poupancaFactors) {
    if (item.date.startsWith(key)) {
      return item.factor;
    }
  }
  return 0;
}

/**
 * Obtém o fator SELIC para uma chave YYYY-MM. Retorna 0 se não existir.
 * @param {string} key
 * @returns {number}
 */
function getSelicFactor(key) {
  for (const item of selicFactors) {
    if (item.date.startsWith(key)) {
      return item.factor;
    }
  }
  return 0;
}

/**
 * Soma todos os fatores mensais de um dataset (poupança ou selic) entre duas datas (inclusive).
 * Começa sempre no primeiro dia de cada mês.
 * @param {Date} start Data de início
 * @param {Date} end Data final (inclusiva)
 * @param {function(string): number} getFactor Função que retorna o fator para um key (YYYY-MM)
 * @returns {number}
 */
function sumFactors(start, end, getFactor) {
  if (!(start instanceof Date) || !(end instanceof Date) || start > end) {
    return 0;
  }
  let sum = 0;
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const final = new Date(end.getFullYear(), end.getMonth(), 1);
  while (current <= final) {
    const key = toKey(current);
    sum += getFactor(key);
    current.setMonth(current.getMonth() + 1);
  }
  return sum;
}

/**
 * Formata número como moeda brasileira.
 * @param {number} val
 */
function formatMoney(val, decimals = 2) {
  // Prefixa com "R$ " e formata com número fixo de casas decimais.
  return 'R$ ' + val.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formata valores numéricos genéricos com quatro casas decimais.
 * @param {number} val
 */
function formatValue(val, decimals = 4) {
  return Number.isFinite(val)
    ? val.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })
    : '';
}

// === Cálculos principais ===

/**
 * Calcula a percentagem de quinquênio para uma linha, com base na data inicial
 * e no valor inicial do quinquênio.
 * A cada 60 meses (5 anos), o percentual aumenta em 5 pontos percentuais.
 * @param {Date} startDate Data inicial do cálculo
 * @param {Date} currentDate Data desta linha
 * @param {number} quinInit Percentual inicial definido pelo usuário
 * @returns {number}
 */
function calcQuinquenioPct(startDate, currentDate, quinInit) {
  const months = diffMonths(startDate, currentDate);
  const increments = Math.floor(months / 60) * 5;
  return quinInit + increments;
}

/**
 * Calcula o valor do quinquênio com base na soma (base + ALE + Piso) e no percentual.
 * @param {number} base
 * @param {number} ale
 * @param {number} piso
 * @param {number} pct Percentual (%).
 * @returns {number}
 */
function calcQuinquenioVal(base, ale, piso, pct) {
  return (base + ale + piso) * (pct / 100);
}

/**
 * Calcula o valor da Sexta Parte sobre a soma (base + ALE + Piso + quinquênio).
 * @param {number} base
 * @param {number} ale
 * @param {number} piso
 * @param {number} quinVal
 * @returns {number}
 */
function calcSextaParte(base, ale, piso, quinVal) {
  return (base + ale + piso + quinVal) / 6;
}

/**
 * Obter o índice TJSP para uma data de atualização (data limite TJSP).
 * Se o valor não existir, retorna o último valor conhecido.
 * @param {Date} date
 * @returns {number}
 */
function getIndHoje(date) {
  const key = toKey(date);
  return getIndCorr(key);
}

// --- Função principal: gera linhas e constrói a tabela ---

export function generateReport() {
  // Ler inputs da interface
  const startDateStr = document.getElementById('startDate').value || CONFIG.startDate;
  const endDateStr = document.getElementById('endDate').value || CONFIG.endDate;
  const limitTJSPStr = document.getElementById('limitTJSP').value || CONFIG.limitTJSP;
  const limitPoupStr = document.getElementById('limitPoup').value || CONFIG.limitPoupanca;
  const limitSelicStr = document.getElementById('limitSelic').value || CONFIG.limitSelic;

  const baseValueInput = parseFloat(document.getElementById('baseValue').value) || CONFIG.baseValue;
  const pisoValueInput = parseFloat(document.getElementById('pisoValue').value) || 0;
  const quinInit = parseFloat(document.getElementById('quinValue').value) || 0;
  
  // Flags de inclusão
  const includePrincipal = document.getElementById('includePrincipal').checked;
  const includeAle = document.getElementById('includeAle').checked;
  const halfAle = document.getElementById('halfAle').checked;
  const includePiso = document.getElementById('includePiso').checked;
  const includeQuinq = document.getElementById('includeQuinq').checked;
  const includeSexta = document.getElementById('includeSexta').checked;
  const includeRetp = document.getElementById('includeRetp').checked;
  const retpBasedOn = document.getElementById('retpBasedOn').value || CONFIG.retpBasedOn;
  const includeFerias = document.getElementById('includeFerias').checked;
  const includeTerco = document.getElementById('includeTerco').checked;
  const includeDecimo = document.getElementById('includeDecimo').checked;
  const includeLic = document.getElementById('includeLic').checked;

  // Deduções / acréscimos
  const taxaPrev = parseFloat(document.getElementById('taxaPrev').value) || CONFIG.taxaPrev;
  const taxaHonor = parseFloat(document.getElementById('taxaHonor').value) || CONFIG.taxaHonor;
  const taxaCustas = parseFloat(document.getElementById('taxaCustas').value) || CONFIG.taxaCustas;

  // Datas
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);
  const limitTJSP = parseDate(limitTJSPStr);
  const limitPoup = parseDate(limitPoupStr);
  const limitSelic = parseDate(limitSelicStr);

  // Prepara índice de hoje (para o TJSP de atualização)
  const indHojeGlobal = getIndHoje(limitTJSP);

  // Salva configurações atuais para uso no texto de metodologia e em perfis
  lastSettings = {
    includePrincipal,
    includeAle,
    halfAle,
    includePiso,
    includeQuinq,
    includeSexta,
    includeRetp,
    includeFerias,
    includeTerco,
    includeDecimo,
    includeLic,
    quinInit,
    retpBasedOn,
    startDate: startDateStr,
    endDate: endDateStr,
    limitTJSP: limitTJSPStr,
    limitPoup: limitPoupStr,
    limitSelic: limitSelicStr,
    baseValue: baseValueInput,
    pisoValue: pisoValueInput,
    taxaPrev,
    taxaHonor,
    taxaCustas,
  };

  // Reseta contadores para férias e licença
  let mesesFerias = 0;
  let mesesLic = 0;
  let currentDate = new Date(startDate.getTime());
  const rows = [];
  let idCounter = 1;

  // Loop mês a mês
  while (currentDate <= endDate) {
    const key = toKey(currentDate);
    const indCorr = getIndCorr(key);

    // Base, ALE e Piso
    let baseVal = includePrincipal ? baseValueInput : 0;
    // ALE: pega valor e aplica metade se configurado
    let aleVal = 0;
    if (includeAle) {
      aleVal = getAle(currentDate);
      if (halfAle) {
        aleVal = aleVal / 2;
      }
    }
    let pisoVal = includePiso ? pisoValueInput : 0;
    let retpVal = 0;
    if (includeRetp) {
      if (retpBasedOn === 'ale') {
        retpVal = aleVal;
      } else if (retpBasedOn === 'piso') {
        retpVal = pisoVal;
      } else {
        // valor base padrão
        retpVal = baseVal;
      }
    }

    // Quinquenio
    let quinPct = includeQuinq ? calcQuinquenioPct(startDate, currentDate, quinInit) : 0;
    let quinVal = includeQuinq ? calcQuinquenioVal(baseValueInput, aleVal, pisoVal, quinPct) : 0;

    // Sexta parte
    let sextaVal = includeSexta ? calcSextaParte(baseValueInput, aleVal, pisoVal, quinVal) : 0;

    // Sobreposições do usuário (edição manual)
    const rowIdx = rows.length;
    if (editOverrides[rowIdx]) {
      const o = editOverrides[rowIdx];
      if (o.baseValue !== undefined) { baseVal = o.baseValue; }
      if (o.ale !== undefined) { aleVal = o.ale; }
      if (o.piso !== undefined) { pisoVal = o.piso; }
      if (o.quinque_pct !== undefined) { quinPct = o.quinque_pct; }
      if (o.quinque_val !== undefined) { quinVal = o.quinque_val; }
      if (o.sexta !== undefined) { sextaVal = o.sexta; }
      if (o.retp !== undefined) { retpVal = o.retp; }
    }

    // SubBase: soma dos componentes antes de índices
    const subBase = baseVal + aleVal + pisoVal + quinVal + sextaVal + retpVal;

    // Atualiza valor pelo TJSP: divide pelo índice antigo e multiplica pelo índice atual (indHojeGlobal)
    const valAtual = indCorr !== 0 ? (subBase / indCorr) * indHojeGlobal : subBase;

    // Férias, 1/3, 13º, Licença
    let feriasVal = 0;
    let tercoVal = 0;
    let decimoVal = 0;
    if (includeFerias || includeTerco || includeDecimo) {
      mesesFerias++;
    }
    const isLastRow = addMonths(currentDate, 1) > endDate;
    if ((mesesFerias >= 12 || isLastRow) && (includeFerias || includeTerco || includeDecimo)) {
      if (includeFerias) { feriasVal = (valAtual / 12) * mesesFerias; }
      if (includeTerco) { tercoVal = feriasVal / 3; }
      if (includeDecimo) { decimoVal = feriasVal; }
      mesesFerias = 0;
    }

    let licVal = 0;
    if (includeLic) {
      mesesLic++;
      if (mesesLic >= 60) {
        licVal = valAtual * 3;
        mesesLic = 0;
      } else if (isLastRow) {
        licVal = valAtual * (mesesLic / 20);
        mesesLic = 0;
      }
    }

    // SubTotal antes dos juros
    const subTotal = valAtual + feriasVal + tercoVal + decimoVal + licVal;

    // Fator acumulado de poupança: soma dos fatores mensais desde data da dívida até limite da poupança
    let poupAcum = 0;
    if (currentDate <= limitPoup) {
      poupAcum = sumFactors(currentDate, limitPoup, (k) => getPoupancaFactor(k));
      //poupAcum = poupAcum * 100;
    }
    const poupVal = subTotal * poupAcum;
    const subTotalPoup = subTotal + poupVal;

    // Fator acumulado de SELIC: soma dos fatores mensais de SELIC a partir da data
    // limite SELIC até a data limite TJSP. Se a linha já for posterior à data
    // limite SELIC, começa a somar a partir da data desta linha. Isso reflete
    // o acúmulo de juros após o prazo da poupança/SELIC informado.
    let selicAcum = 0;
    // Define início da série: se a data da linha for anterior ao limite SELIC,
    // começa no limite SELIC; caso contrário começa na própria linha.
    const selicStart = currentDate < limitSelic ? limitSelic : currentDate;
    // Soma até a data limite TJSP (considerada a data final para correção de juros)
    if (selicStart <= limitTJSP) {
      selicAcum = sumFactors(selicStart, limitTJSP, (k) => getSelicFactor(k));
    }
    const selicVal = subTotalPoup * selicAcum;
    const subTotalSelic = subTotalPoup + selicVal;

    // Descontos e acréscimos
    const descPrevVal = subTotalSelic * (taxaPrev / 100) * -1;
    const honorVal = subTotalSelic * (taxaHonor / 100);
    const custasVal = subTotalSelic * (taxaCustas / 100);
    const totalVal = subTotalSelic + descPrevVal + honorVal + custasVal;

    rows.push({
      id: idCounter++,
      data: key,
      valor: baseVal,
      ale: aleVal,
      piso: pisoVal,
      quinque_pct: quinPct ? `${quinPct}%` : '0%',
      quinque_val: quinVal,
      sexta: sextaVal,
      retp: retpVal,
      sub_base: subBase,
      ind_corr: indCorr,
      ind_hoje: indHojeGlobal,
      val_atual: valAtual,
      ferias: feriasVal,
      terco: tercoVal,
      decimo: decimoVal,
      licenca: licVal,
      sub_total: subTotal,
      poup_acum: poupAcum,
      poup_val: poupVal,
      sub_total_poup: subTotalPoup,
      selic_acum: selicAcum,
      selic_val: selicVal,
      sub_total_selic: subTotalSelic,
      descPrev_val: descPrevVal,
      honor_val: honorVal,
      custas_val: custasVal,
      total: totalVal
    });

    currentDate = addMonths(currentDate, 1);
  }

  // Renderiza a tabela na interface
  renderTable(rows);
}

/**
 * Gera e insere a tabela HTML dentro do contêiner de relatórios. Também
 * constrói os totais no rodapé e aplica formatação. Chamado por
 * generateReport() e updateReport().
 * @param {Array} rows
 */
function renderTable(rows) {
  const container = document.getElementById('reportContainer');
  container.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of columnsConfig) {
    const th = document.createElement('th');
    th.textContent = col.header;
    th.setAttribute('data-col', col.key);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const totals = {};
  columnsConfig.forEach(col => { totals[col.key] = 0; });
  rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    columnsConfig.forEach(col => {
      const td = document.createElement('td');
      td.setAttribute('data-col', col.key);
      let val = row[col.key];
      if (typeof val === 'number') {
        totals[col.key] += val;
        if (col.isMoney) {
          // Usa a quantidade de casas decimais configurada ou padrão 2
          const decs = col.decimals !== undefined ? col.decimals : 2;
          td.textContent = formatMoney(val, decs);
        } else {
          // Campos numéricos genéricos usam decimais configurados ou 6
          const decs = col.decimals !== undefined ? col.decimals : 6;
          td.textContent = formatValue(val, decs);
        }
      } else {
        td.textContent = val;
      }
      // Estilo alinhamento
      if (col.key === 'id' || col.key === 'data') {
        td.style.textAlign = 'center';
      } else {
        td.style.textAlign = 'right';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  // Guarda os totais calculados para uso em metodologia
  lastTotals = totals;
  // Totais
  // Linha de totais: a primeira célula ocupa as duas primeiras colunas (ID e Data).
  const totalRow = document.createElement('tr');
  totalRow.classList.add('total-row');
  for (let idx = 0; idx < columnsConfig.length; idx++) {
    const col = columnsConfig[idx];
    // pular a coluna 1 (Data) porque a célula 'Totais' ocupará as duas primeiras posições
    if (idx === 1) {
      continue;
    }
    const td = document.createElement('td');
    td.setAttribute('data-col', col.key);
    if (idx === 0) {
      td.colSpan = 2;
      td.textContent = 'Totais';
    } else {
      const totVal = totals[col.key];
      if (typeof totVal === 'number') {
        if (col.isMoney) {
          const decs = col.decimals !== undefined ? col.decimals : 2;
          td.textContent = formatMoney(totVal, decs);
        } else {
          const decs = col.decimals !== undefined ? col.decimals : 6;
          td.textContent = formatValue(totVal, decs);
        }
      }
    }
    totalRow.appendChild(td);
  }
  tbody.appendChild(totalRow);

  table.appendChild(tbody);
  container.appendChild(table);

  // Constrói menu de colunas e editores
  buildToggleMenu();
  attachCellEditors(rows);

  // Exibe as tabelas de dados utilizadas (poupança, SELIC, TJSP) e a metodologia
  renderDataTables();
  renderMethodology();
}

/**
 * Renderiza tabelas mostrando os fatores de Poupança, SELIC e os índices TJSP
 * utilizados no cálculo, dentro do intervalo relevante. As tabelas ficam
 * abaixo do relatório principal.
 */
function renderDataTables() {
  const container = document.getElementById('dataTables');
  if (!container) return;
  container.innerHTML = '';

  // Pega as datas atuais do formulário para determinar intervalos
  const startDateStr = document.getElementById('startDate').value;
  const limitPoupStr = document.getElementById('limitPoup').value;
  const limitSelicStr = document.getElementById('limitSelic').value;
  const limitTJSPStr = document.getElementById('limitTJSP').value;
  const startDate = parseDate(startDateStr);
  const limitPoupDate = parseDate(limitPoupStr);
  const limitSelicDate = parseDate(limitSelicStr);
  const limitTJSPDate = parseDate(limitTJSPStr);

  // Helper para construir tabela
  function buildTable(title, fromDate, toDate, getValueFunc, decimals, prefix = '') {
    const div = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = title;
    div.appendChild(h3);
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Data', 'Valor'].forEach(txt => {
      const th = document.createElement('th');
      th.textContent = txt;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    let current = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const final = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    while (current <= final) {
      const key = toKey(current);
      const val = getValueFunc(key);
      const tr = document.createElement('tr');
      const tdDate = document.createElement('td');
      tdDate.textContent = key;
      tdDate.style.textAlign = 'center';
      const tdVal = document.createElement('td');
      if (typeof val === 'number') {
        tdVal.textContent = prefix + formatValue(val, decimals);
        tdVal.style.textAlign = 'right';
      } else {
        tdVal.textContent = val;
      }
      tr.appendChild(tdDate);
      tr.appendChild(tdVal);
      tbody.appendChild(tr);
      current.setMonth(current.getMonth() + 1);
    }
    table.appendChild(tbody);
    div.appendChild(table);
    return div;
  }

  // Tabela de Poupança: do início até limite da poupança
  const poupTable = buildTable(
    `Tabela Poupança (de ${startDateStr} até ${limitPoupStr})`,
    startDate,
    limitPoupDate,
    (k) => getPoupancaFactor(k),
    6,
    ''
  );
  container.appendChild(poupTable);

  // Tabela SELIC: do limite SELIC até limite TJSP (somente se limiteSelic <= limiteTJSP)
  const selicStartDate = limitSelicDate < startDate ? startDate : limitSelicDate;
  if (selicStartDate <= limitTJSPDate) {
    const selicTable = buildTable(
      `Tabela SELIC (de ${toKey(selicStartDate)} até ${toKey(limitTJSPDate)})`,
      selicStartDate,
      limitTJSPDate,
      (k) => getSelicFactor(k),
      6,
      ''
    );
    container.appendChild(selicTable);
  }

  // Tabela TJSP: índices de correção do período
  const tjspTable = buildTable(
    `Índices TJSP (de ${startDateStr} até ${limitTJSPStr})`,
    startDate,
    limitTJSPDate,
    (k) => getIndCorr(k),
    6,
    ''
  );
  container.appendChild(tjspTable);
}

/**
 * Renderiza um texto explicando a metodologia dos cálculos e lista as fontes de dados.
 */
function renderMethodology() {
  const container = document.getElementById('methodology');
  if (!container) return;
  // Gera metodologia dinamicamente com base nas configurações e totais da última execução
  const s = lastSettings;
  const t = lastTotals || {};
  let content = '<h3>Metodologia de Cálculo</h3>';
  // Componentes iniciais
  const comps = [];
  if (s.includePrincipal) comps.push('Valor Base');
  if (s.includeAle) {
    let aleTxt = 'ALE';
    if (s.halfAle) aleTxt += ' (metade)';
    comps.push(aleTxt);
  }
  if (s.includePiso) comps.push('Piso Salarial');
  if (s.includeQuinq) comps.push('Quinquênio');
  if (s.includeSexta) comps.push('Sexta Parte');
  if (s.includeRetp) {
    let baseName = 'Valor Base';
    if (s.retpBasedOn === 'ale') baseName = 'ALE';
    else if (s.retpBasedOn === 'piso') baseName = 'Piso';
    comps.push('RETP (espelhando ' + baseName + ')');
  }
  if (comps.length > 0) {
    content += '<p>Os valores iniciais consideram a soma de: ' + comps.join(', ') + '.</p>';
  } else {
    content += '<p>Não foram selecionados componentes iniciais.</p>';
  }
  // Atualização monetária
  content += '<p>Após a soma, os valores são corrigidos monetariamente pelo índice TJSP de cada mês (Ind. Corr.) e pelo índice da data limite informada (' + s.limitTJSP + ') resultando em valores atualizados.</p>';
  // Benefícios
  const bens = [];
  if (s.includeFerias) bens.push('Férias proporcionais (a cada 12 meses)');
  if (s.includeTerco) bens.push('1/3 constitucional sobre as férias');
  if (s.includeDecimo) bens.push('13º salário');
  if (s.includeLic) bens.push('Licença-prêmio (3 salários a cada 60 meses ou proporcional)');
  if (bens.length > 0) {
    content += '<p>Benefícios aplicados: ' + bens.join(', ') + '.</p>';
  }
  // Juros da poupança
  const poupTot = t.poup_val || 0;
  if (poupTot && s.limitPoup) {
    content += '<p>Juros de poupança: calculados através do fator acumulado entre ' + s.startDate + ' e ' + s.limitPoup + ', resultando em acréscimo de ' + formatMoney(poupTot, 2) + '.</p>';
  }
  // Juros SELIC
  const selicTot = t.selic_val || 0;
  if (selicTot && s.limitSelic && s.limitTJSP) {
    content += '<p>Juros SELIC: calculados através do fator acumulado entre ' + s.limitSelic + ' e ' + s.limitTJSP + ', resultando em acréscimo de ' + formatMoney(selicTot, 2) + '.</p>';
  }
  // Deduções e acréscimos
  const deducoes = [];
  if (s.taxaPrev) deducoes.push(s.taxaPrev + '% de previdência');
  if (s.taxaHonor) deducoes.push(s.taxaHonor + '% de honorários');
  if (s.taxaCustas) deducoes.push(s.taxaCustas + '% de custas');
  if (deducoes.length > 0) {
    content += '<p>Deduções/Acréscimos: ' + deducoes.join(', ') + '.</p>';
  }
  // Fontes
  content += '<h3>Fontes de Dados</h3>';
  content += '<ul>';
  content += '<li>Poupança: <a href="https://api.bcb.gov.br/dados/serie/bcdata.sgs.196/dados?formato=json&dataInicial=01/01/2002&dataFinal=24/09/2025" target="_blank">Banco Central do Brasil – série 196</a></li>';
  content += '<li>SELIC: <a href="https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json&dataInicial=01/01/2019&dataFinal=01/10/2025" target="_blank">Banco Central do Brasil – série 4390</a></li>';
  content += '<li>TJSP Índices: <a href="https://api.tjsp.jus.br/Handlers/Handler/FileFetch.ashx?codigo=171555" target="_blank">Tribunal de Justiça de São Paulo</a></li>';
  content += '</ul>';
  container.innerHTML = content;
}

// === UI Adicionais ===

/**
 * Mostra/esconde o menu de colunas.
 */
export function toggleMenu() {
  const menu = document.getElementById('toggleMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

/**
 * Constrói o menu de ocultar/mostrar colunas. Permite ao usuário
 * alternar a visibilidade de colunas individualmente.
 */
export function buildToggleMenu() {
  const menu = document.getElementById('toggleMenu');
  if (!menu) return;
  menu.innerHTML = '';
  const ths = document.querySelectorAll('#reportContainer th');
  ths.forEach(th => {
    const col = th.getAttribute('data-col');
    if (!col) return;
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.col = col;
    cb.addEventListener('change', (e) => {
      const colName = e.target.dataset.col;
      const cells = document.querySelectorAll(`#reportContainer [data-col="${colName}"]`);
      cells.forEach(cell => {
        cell.style.display = e.target.checked ? '' : 'none';
      });
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + th.textContent));
    menu.appendChild(label);
  });
}

/**
 * Anexa editores de célula (double click) às colunas editáveis. Quando o usuário
 * edita um valor, o resultado é armazenado em editOverrides e a tabela é
 * recalculada. Esta função replica parte da lógica do HTML original.
 * @param {Array} rows
 */
export function attachCellEditors(rows) {
  const table = document.querySelector('#reportContainer table');
  if (!table) return;
  const tbodyRows = table.querySelectorAll('tbody tr');
  tbodyRows.forEach((tr, rIndex) => {
    if (tr.classList.contains('total-row')) return;
    const tds = tr.querySelectorAll('td');
    tds.forEach(td => {
      const col = td.getAttribute('data-col');
      // colunas que podem ser editadas manualmente
      if (['valor','ale','piso','quinque_pct','sexta','retp'].includes(col)) {
        td.style.cursor = 'pointer';
        td.title = 'Duplo clique para editar';
        td.addEventListener('dblclick', () => {
          let currentVal;
          if (col === 'valor') currentVal = rows[rIndex].valor;
          else if (col === 'ale') currentVal = rows[rIndex].ale;
          else if (col === 'piso') currentVal = rows[rIndex].piso;
          else if (col === 'quinque_pct') currentVal = parseFloat(rows[rIndex].quinque_pct);
          else if (col === 'sexta') currentVal = rows[rIndex].sexta;
          else if (col === 'retp') currentVal = rows[rIndex].retp;
          const input = prompt('Novo valor para ' + col + ':', currentVal);
          if (input === null) return;
          const newVal = parseFloat(input.replace(',', '.'));
          if (isNaN(newVal)) { alert('Valor inválido.'); return; }
          // pergunta escopo
          const scope = prompt('Aplicar a partir desta linha?\n- "t" para todas até o fim\n- um número para X meses\n- em branco para apenas esta linha');
          let endIdx = rIndex;
          if (scope) {
            if (scope.toLowerCase() === 't') {
              endIdx = rows.length - 1;
            } else if (!isNaN(parseInt(scope))) {
              endIdx = Math.min(rIndex + parseInt(scope) - 1, rows.length - 1);
            }
          }
          for (let idx = rIndex; idx <= endIdx; idx++) {
            if (!editOverrides[idx]) editOverrides[idx] = {};
            if (col === 'valor') editOverrides[idx].baseValue = newVal;
            else if (col === 'ale') editOverrides[idx].ale = newVal;
            else if (col === 'piso') editOverrides[idx].piso = newVal;
            else if (col === 'quinque_pct') editOverrides[idx].quinque_pct = newVal;
            else if (col === 'sexta') editOverrides[idx].sexta = newVal;
            else if (col === 'retp') editOverrides[idx].retp = newVal;
          }
          // Regera relatório com overrides
          generateReport();
        });
      }
    });
  });
}

/**
 * Exporta a tabela atual para CSV. Converte valores formatados em número
 * bruto (troca . por nada e , por .).
 */
export function downloadCSV() {
  const table = document.querySelector('#reportContainer table');
  if (!table) { alert('Gere a tabela primeiro.'); return; }
  let csv = '';
  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    const cols = row.querySelectorAll('th, td');
    const data = Array.from(cols).map(col => {
      let text = col.innerText.trim();
      // converte milhar e decimal para formato numérico
      text = text.replace(/\./g, '').replace(/,/g, '.');
      return text;
    });
    csv += data.join(';') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relatorio_calculos.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Salva a página HTML gerada (incluindo tabela) para um arquivo.
 */
export function saveHTML() {
  const content = document.documentElement.outerHTML;
  const blob = new Blob([content], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relatorio_calc_plus.html';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Recalcula a tabela mantendo as edições manuais e configurações atuais.
 * Pode ser chamado após alterar datas ou valores da planilha.
 */
export function updateReport() {
  generateReport();
}

/**
 * Adiciona uma linha (mês) ao final do relatório e recalcula.
 */
export function addRow() {
  // A forma mais simples de adicionar uma linha é estender a data final em +1 mês
  const endDateInput = document.getElementById('endDate');
  const endDate = parseDate(endDateInput.value);
  const newEnd = addMonths(endDate, 1);
  endDateInput.value = newEnd.toISOString().split('T')[0];
  generateReport();
}

/**
 * Remove a última linha do relatório (reduzindo um mês) e recalcula.
 */
export function removeRow() {
  const endDateInput = document.getElementById('endDate');
  const endDate = parseDate(endDateInput.value);
  const newEnd = addMonths(endDate, -1);
  endDateInput.value = newEnd.toISOString().split('T')[0];
  // Remove possíveis overrides da última linha
  const rowsCount = Object.keys(editOverrides).length;
  if (rowsCount > 0) {
    const idx = rowsCount - 1;
    delete editOverrides[idx];
  }
  generateReport();
}