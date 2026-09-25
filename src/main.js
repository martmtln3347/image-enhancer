/**
 * main.js
 * Branche l'interface : choix de la photo, réglages, lancement, résultat.
 * La logique "métier" est dans upscale.js / image-utils.js.
 */
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './style.css';

import { initCompareSlider } from './compare-slider.js';
import { classicUpscale } from './classic-upscale.js';
import {
  validateFile,
  loadImageFromFile,
  fitForScale,
  dataUrlToBlob,
  downloadBlob,
  outputName,
} from './image-utils.js';

/* ---------- Références DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  dropzone: $('dropzone'),
  fileInput: $('file-input'),
  emptyState: $('empty-state'),
  preview: $('preview'),
  message: $('message'),
  controls: $('controls'),
  runBtn: $('run-btn'),
  resetBtn: $('reset-btn'),
  progress: $('progress'),
  progressFill: $('progress-fill'),
  progressLabel: $('progress-label'),
  result: $('result'),
  compare: $('compare'),
  beforeImg: $('before-img'),
  afterImg: $('after-img'),
  resultSize: $('result-size'),
  resultMethod: $('result-method'),
  downloadBtn: $('download-btn'),
};

const slider = initCompareSlider(el.compare);

/**
 * TensorFlow.js pèse ~2 Mo : on ne le charge qu'au premier clic sur
 * "Améliorer", pour que la page s'affiche instantanément.
 */
let upscaleModule = null;
const loadUpscaler = async () => {
  upscaleModule ??= await import('./upscale.js'); // si ça échoue, on réessaiera au prochain clic
  return upscaleModule;
};

/* ---------- État de l'app ---------- */
const state = {
  file: null,        // File choisi
  img: null,         // HTMLImageElement chargé
  objectUrl: null,   // URL blob de l'original (à libérer)
  resultUrl: null,   // data URL du résultat
  busy: false,
};

/* ---------- Helpers UI ---------- */
function showMessage(text, type = 'info') {
  el.message.textContent = text;
  el.message.dataset.type = type;
}

function setBusy(busy) {
  state.busy = busy;
  el.runBtn.disabled = busy;
  el.controls.querySelectorAll('input').forEach((i) => (i.disabled = busy));
  el.progress.hidden = !busy;
}

function setProgress(ratio, label) {
  el.progressFill.style.width = `${Math.round(ratio * 100)}%`;
  if (label) el.progressLabel.textContent = label;
}

function getSettings() {
  const scale = Number(el.controls.querySelector('input[name="scale"]:checked').value);
  const quality = el.controls.querySelector('input[name="quality"]:checked').value;
  return { scale, quality };
}

/* ---------- Actions ---------- */
async function handleFile(file) {
  if (state.busy) return;

  const error = validateFile(file);
  if (error) return showMessage(error, 'error');

  try {
    const { img, url } = await loadImageFromFile(file);
    resetAll({ keepMessage: false });

    state.file = file;
    state.img = img;
    state.objectUrl = url;

    el.preview.src = url;
    el.preview.hidden = false;
    el.emptyState.hidden = true;
    el.dropzone.classList.add('frame--filled');
    el.controls.hidden = false;

    showMessage(`${file.name}, ${img.naturalWidth} × ${img.naturalHeight} px`);
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

async function runUpscale() {
  if (!state.img || state.busy) return;

  const { scale, quality } = getSettings();
  const { source, width, height, resized } = fitForScale(state.img, scale);

  setBusy(true);
  el.result.hidden = true;
  setProgress(0, 'Préparation…');

  try {
    const { dataUrl, method, degraded } = await enhance(source, { scale, quality });

    state.resultUrl = dataUrl;
    showResult(source, dataUrl, width * scale, height * scale);
    el.resultMethod.textContent = method;

    // Message final : on prévient si on a dû dégrader ou réduire
    const notes = [];
    if (degraded) notes.push(`Réglage de secours utilisé : ${method}.`);
    if (resized) notes.push(`Photo réduite à ${width} × ${height} px avant traitement.`);
    showMessage(notes.length ? notes.join(' ') : 'Terminé ✨', notes.length ? 'warning' : 'success');
  } catch (err) {
    // Annulation volontaire (changement de photo) : pas d'erreur à afficher
    if (err?.name !== 'AbortError') {
      console.error(err);
      showMessage("Impossible d'agrandir cette photo. Essaie avec une image plus petite.", 'error');
    }
  } finally {
    setBusy(false);
  }
}

/**
 * Lance l'IA, et si même le module IA ne se charge pas
 * (réseau coupé, vieux navigateur…), bascule sur l'agrandissement classique.
 */
async function enhance(source, { scale, quality }) {
  let mod;
  try {
    mod = await loadUpscaler();
  } catch (err) {
    console.warn('[Image Enhancer] Module IA non chargé', err);
    setProgress(1, 'IA non chargée, agrandissement classique…');
    return {
      dataUrl: await classicUpscale(source, scale),
      method: 'Agrandissement classique (sans IA)',
      degraded: true,
    };
  }

  return mod.upscaleImage(source, {
    scale,
    quality,
    onStatus: (text) => setProgress(0, text),
    onProgress: (ratio) => setProgress(ratio, `Amélioration en cours… ${Math.round(ratio * 100)} %`),
  });
}

function showResult(source, resultUrl, outW, outH) {
  const beforeSrc = typeof source === 'string' ? source : state.objectUrl;

  el.beforeImg.src = beforeSrc;
  el.afterImg.src = resultUrl;
  el.compare.style.setProperty('--ratio', `${outW} / ${outH}`);
  el.resultSize.textContent = `${outW} × ${outH} px`;
  slider.reset();

  el.result.hidden = false;
  el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function downloadResult() {
  if (!state.resultUrl || !state.file) return;
  const { scale } = getSettings();
  downloadBlob(dataUrlToBlob(state.resultUrl), outputName(state.file.name, scale));
}

function resetAll({ keepMessage = false } = {}) {
  if (state.busy) upscaleModule?.abortUpscale();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);

  Object.assign(state, { file: null, img: null, objectUrl: null, resultUrl: null });

  el.preview.hidden = true;
  el.preview.removeAttribute('src');
  el.emptyState.hidden = false;
  el.dropzone.classList.remove('frame--filled');
  el.controls.hidden = true;
  el.result.hidden = true;
  el.fileInput.value = '';
  if (!keepMessage) showMessage('');
}

/* ---------- Événements ---------- */
el.fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
el.runBtn.addEventListener('click', runUpscale);
el.resetBtn.addEventListener('click', () => resetAll());
el.downloadBtn.addEventListener('click', downloadResult);

// Glisser-déposer
['dragenter', 'dragover'].forEach((type) =>
  el.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.add('frame--over');
  })
);
['dragleave', 'drop'].forEach((type) =>
  el.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('frame--over');
  })
);
el.dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

// Coller une image depuis le presse-papier
window.addEventListener('paste', (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (item) handleFile(item.getAsFile());
});
