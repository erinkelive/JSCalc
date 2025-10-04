// ui.js
// Conecta os controles da interface com as funções da calculadora.

import { generateReport, updateReport, addRow, removeRow, toggleMenu, downloadCSV, saveHTML } from './calculadora.js';
import { savePrefs, clearPrefs, loadPrefs } from './profiles.js';

document.addEventListener('DOMContentLoaded', () => {
  const gerarBtn = document.getElementById('gerarBtn');
  const atualizarBtn = document.getElementById('atualizarBtn');
  const addRowBtn = document.getElementById('addRowBtn');
  const removeRowBtn = document.getElementById('removeRowBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const saveBtn = document.getElementById('saveBtn');
  const toggleBtn = document.getElementById('toggleButton');
  const savePrefsBtn = document.getElementById('savePrefsBtn');
  const clearPrefsBtn = document.getElementById('clearPrefsBtn');
  
  if (gerarBtn) gerarBtn.addEventListener('click', generateReport);
  if (atualizarBtn) atualizarBtn.addEventListener('click', updateReport);
  if (addRowBtn) addRowBtn.addEventListener('click', addRow);
  if (removeRowBtn) removeRowBtn.addEventListener('click', removeRow);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadCSV);
  if (saveBtn) saveBtn.addEventListener('click', saveHTML);
  if (toggleBtn) toggleBtn.addEventListener('click', toggleMenu);
  if (savePrefsBtn) savePrefsBtn.addEventListener('click', savePrefs);
  if (clearPrefsBtn) clearPrefsBtn.addEventListener('click', clearPrefs);

  // Carrega preferências automaticamente, se existirem
  loadPrefs();
});