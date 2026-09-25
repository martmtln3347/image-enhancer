/**
 * upscale.js
 * Upscale par IA (UpscalerJS / ESRGAN sur TensorFlow.js) avec une chaîne
 * de fallbacks pour que ça marche "quoi qu'il arrive" :
 *
 *  1. Moteur de calcul : WebGL (GPU) -> WASM (CPU rapide) -> CPU pur JS
 *  2. Tentatives IA   : modèle choisi -> tuiles plus petites -> modèle Rapide
 *                       -> (si ×4) IA ×2 + agrandissement classique ×2
 *  3. Dernier recours : agrandissement classique sans IA (classic-upscale.js)
 *
 * Tout tourne dans le navigateur : la photo ne quitte jamais l'appareil.
 */
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import Upscaler from 'upscaler';
import slimX2 from '@upscalerjs/esrgan-slim/2x';
import slimX4 from '@upscalerjs/esrgan-slim/4x';
import mediumX2 from '@upscalerjs/esrgan-medium/2x';
import mediumX4 from '@upscalerjs/esrgan-medium/4x';
import { classicUpscale, toImage, resizeToCanvas } from './classic-upscale.js';

/* ---------- Catalogue des modèles (auto-hébergés dans public/models) ---------- */
const MODELS = {
  'slim-2': { def: slimX2, path: '/models/esrgan-slim/x2/model.json' },
  'slim-4': { def: slimX4, path: '/models/esrgan-slim/x4/model.json' },
  'medium-2': { def: mediumX2, path: '/models/esrgan-medium/x2/model.json' },
  'medium-4': { def: mediumX4, path: '/models/esrgan-medium/x4/model.json' },
};

const LABELS = { slim: 'Rapide', medium: 'Détaillé' };

/* =========================================================
   1. Choix du moteur de calcul (une seule fois par session)
   ========================================================= */
const BACKENDS = ['webgl', 'wasm', 'cpu'];
let backendPromise = null;

/** Initialise TensorFlow sur le meilleur moteur dispo. Renvoie son nom. */
export function initBackend() {
  return (backendPromise ??= pickBackend());
}

async function pickBackend() {
  setWasmPaths('/tfjs-wasm/'); // binaires servis par le site (voir copy-assets)

  for (const name of BACKENDS) {
    try {
      if (!(await tf.setBackend(name))) continue;
      await tf.ready();
      // Petit calcul de test : certains GPU "acceptent" WebGL puis plantent
      tf.tidy(() => tf.add(tf.scalar(1), tf.scalar(1)).dataSync());
      return name;
    } catch (err) {
      console.warn(`[Image Enhancer] Moteur ${name} indisponible`, err);
    }
  }
  throw new Error('Aucun moteur TensorFlow disponible');
}

/* =========================================================
   2. Gestion de l'upscaler (un seul modèle en mémoire)
   ========================================================= */
let current = { key: null, upscaler: null };
let aborted = false;

async function getUpscaler(model, scale) {
  const key = `${model}-${scale}`;
  if (current.key === key) return current.upscaler;

  await releaseUpscaler();
  const { def, path } = MODELS[key];
  const upscaler = new Upscaler({ model: { ...def, path } });
  await upscaler.getModel(); // charge le modèle tout de suite
  current = { key, upscaler };
  return upscaler;
}

async function releaseUpscaler() {
  try {
    await current.upscaler?.dispose();
  } catch {
    /* rien à faire, on repart de zéro */
  }
  current = { key: null, upscaler: null };
}

/** Annule un traitement en cours. */
export function abortUpscale() {
  aborted = true;
  current.upscaler?.abort();
}

const isAbort = (err) => aborted || err?.name === 'AbortError';

/* =========================================================
   3. Plan de tentatives
   ========================================================= */

/**
 * Construit la liste ordonnée des tentatives IA, de la meilleure à la plus sûre.
 * Chaque tentative : { model, aiScale, patchSize }
 */
function buildPlan({ quality, scale }, backend) {
  const gpu = backend === 'webgl';
  const plan = [];

  // Sans GPU, le modèle Détaillé est trop lent : on passe direct en Rapide
  if (gpu) {
    plan.push({ model: quality, aiScale: scale, patchSize: 64 });
    plan.push({ model: quality, aiScale: scale, patchSize: 32 }); // moins de mémoire
  }
  plan.push({ model: 'slim', aiScale: scale, patchSize: 32 });
  if (scale === 4) plan.push({ model: 'slim', aiScale: 2, patchSize: 32 }); // IA ×2 + classique ×2

  // Supprime les doublons (ex. quality déjà "slim")
  const seen = new Set();
  return plan.filter((s) => {
    const id = `${s.model}-${s.aiScale}-${s.patchSize}`;
    return seen.has(id) ? false : seen.add(id);
  });
}

/** Exécute une tentative IA. Complète en classique si aiScale < scale. */
async function runStep(source, step, scale, onProgress) {
  const upscaler = await getUpscaler(step.model, step.aiScale);

  const dataUrl = await upscaler.upscale(source, {
    output: 'base64',
    patchSize: step.patchSize, // découpe en tuiles : limite la mémoire GPU
    padding: 4,                // chevauchement : pas de coutures visibles
    awaitNextFrame: true,      // laisse respirer l'UI entre deux tuiles
    progress: (ratio) => onProgress?.(ratio),
  });

  if (step.aiScale === scale) return dataUrl;

  // Complément classique pour atteindre le facteur demandé
  const img = await toImage(dataUrl);
  return resizeToCanvas(img, scale / step.aiScale).toDataURL('image/png');
}

/* =========================================================
   4. Point d'entrée
   ========================================================= */

/**
 * Agrandit une image en essayant les méthodes les unes après les autres.
 * @param {HTMLImageElement|string} source
 * @param {{ quality:'slim'|'medium', scale:2|4,
 *           onProgress?:(ratio:number)=>void,
 *           onStatus?:(text:string)=>void }} options
 * @returns {Promise<{ dataUrl:string, method:string, degraded:boolean }>}
 */
export async function upscaleImage(source, { quality, scale, onProgress, onStatus }) {
  aborted = false;

  // Étape 1 : moteur de calcul
  let backend;
  try {
    onStatus?.('Préparation du moteur IA…');
    backend = await initBackend();
  } catch (err) {
    console.warn('[Image Enhancer] IA indisponible, passage en classique', err);
    return classicResult(source, scale, onStatus);
  }

  // Étape 2 : tentatives IA successives
  const plan = buildPlan({ quality, scale }, backend);

  for (const [index, step] of plan.entries()) {
    if (aborted) throw abortError();

    const isFirst = index === 0;
    onProgress?.(0);
    onStatus?.(
      isFirst
        ? `Chargement du modèle ${LABELS[step.model]}… (quelques secondes la 1re fois)`
        : `Nouvel essai avec un réglage plus léger (${index + 1}/${plan.length})…`
    );

    try {
      const dataUrl = await runStep(source, step, scale, onProgress);
      const exact = step.model === quality && step.aiScale === scale;
      return {
        dataUrl,
        method: describe(step, scale, backend),
        degraded: !exact,
      };
    } catch (err) {
      if (isAbort(err)) throw abortError();
      console.warn(`[Image Enhancer] Échec tentative ${index + 1}`, step, err);
      await releaseUpscaler(); // libère la mémoire avant le prochain essai
    }
  }

  // Étape 3 : plus aucune IA ne passe
  return classicResult(source, scale, onStatus);
}

/* ---------- Helpers ---------- */
async function classicResult(source, scale, onStatus) {
  onStatus?.('IA indisponible sur cet appareil, agrandissement classique…');
  return {
    dataUrl: await classicUpscale(source, scale),
    method: 'Agrandissement classique (sans IA)',
    degraded: true,
  };
}

function describe(step, scale, backend) {
  const engine = { webgl: 'GPU', wasm: 'WASM', cpu: 'CPU' }[backend];
  const ai = `IA ${LABELS[step.model]} ×${step.aiScale}`;
  const extra = step.aiScale < scale ? ` + classique ×${scale / step.aiScale}` : '';
  return `${ai}${extra} (${engine})`;
}

function abortError() {
  const err = new Error('Traitement annulé');
  err.name = 'AbortError';
  return err;
}
