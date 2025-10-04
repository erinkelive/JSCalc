// profiles.js
// Funções para salvar, carregar e limpar preferências de cálculo (perfis).
// Armazena as configurações do usuário no localStorage para uso futuro.

import { generateReport, editOverrides } from './calculadora.js';

const PREFS_KEY = 'jsCalcPlusPrefs';

// Lista de IDs de campos que salvaremos. Se alterar ou adicionar campos
// no HTML, atualize esta lista também.
const FIELD_IDS = [
  'startDate', 'endDate', 'limitTJSP', 'limitPoup', 'limitSelic',
  'baseValue', 'pisoValue', 'quinValue', 'taxaPrev', 'taxaHonor', 'taxaCustas'
  , 'retpBasedOn'
];
const CHECKBOX_IDS = [
  'includePrincipal', 'includeAle', 'includePiso', 'includeQuinq', 'includeSexta',
  'includeRetp', 'includeFerias', 'includeTerco', 'includeDecimo', 'includeLic', 'halfAle'
];

/**
 * Coleta as preferências atuais da interface e retorna um objeto.
 */
function collectPrefs() {
  const prefs = {};
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) prefs[id] = el.value;
  });
  CHECKBOX_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) prefs[id] = el.checked;
  });
  // Colunas ocultas
  const hidden = [];
  document.querySelectorAll('#reportContainer [data-col]').forEach(cell => {
    if (cell.style.display === 'none') {
      const col = cell.getAttribute('data-col');
      if (!hidden.includes(col)) hidden.push(col);
    }
  });
  prefs.hiddenCols = hidden;
  // Também salva as edições manuais para restaurar posteriormente
  prefs.editOverrides = JSON.parse(JSON.stringify(editOverrides));
  return prefs;
}

/**
 * Aplica preferências salvas à interface.
 * @param {object} prefs
 */
function applyPrefs(prefs) {
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && prefs[id] !== undefined) el.value = prefs[id];
  });
  CHECKBOX_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && prefs[id] !== undefined) el.checked = !!prefs[id];
  });
}

/**
 * Esconde as colunas cujos nomes estão na lista hidden.
 * @param {string[]} hidden
 */
function applyHiddenCols(hidden) {
  if (!hidden || hidden.length === 0) return;
  hidden.forEach(col => {
    const cells = document.querySelectorAll(`#reportContainer [data-col="${col}"]`);
    cells.forEach(cell => { cell.style.display = 'none'; });
    const menuInput = document.querySelector(`#toggleMenu input[data-col="${col}"]`);
    if (menuInput) menuInput.checked = false;
  });
}

export function savePrefs() {
  try {
    const prefs = collectPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    alert('Preferências salvas.');
  } catch (e) {
    console.warn('Erro ao salvar preferências:', e);
  }
}

export function clearPrefs() {
  localStorage.removeItem(PREFS_KEY);
  alert('Preferências removidas.');
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    applyPrefs(prefs);
    // Restaura overrides salvos antes de gerar o relatório
    if (prefs.editOverrides) {
      // Limpa overrides atuais
      Object.keys(editOverrides).forEach(k => delete editOverrides[k]);
      Object.assign(editOverrides, prefs.editOverrides);
    }
    // Gera relatório e aplica colunas ocultas
    generateReport();
    setTimeout(() => {
      applyHiddenCols(prefs.hiddenCols || []);
    }, 0);
  } catch (e) {
    console.warn('Erro ao carregar preferências:', e);
  }
}