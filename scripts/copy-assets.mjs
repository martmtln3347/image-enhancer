/**
 * Copie les fichiers lourds depuis node_modules vers public/ au build :
 *  - les poids des modèles IA  -> public/models
 *  - les binaires WebAssembly  -> public/tfjs-wasm (backend de secours sans GPU)
 * Le site sert tout lui-même : aucun CDN externe, CSP stricte possible.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

function copy(from, to) {
  if (!existsSync(from)) {
    console.error(`❌ Introuvable : ${from} (as-tu lancé npm install ?)`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true }); // crée le dossier parent si besoin
  cpSync(from, to, { recursive: true });
}

// 1. Modèles IA
for (const model of ['esrgan-slim', 'esrgan-medium']) {
  for (const scale of ['x2', 'x4']) {
    copy(
      resolve('node_modules/@upscalerjs', model, 'models', scale),
      resolve('public/models', model, scale)
    );
  }
}

// 2. Binaires WASM de TensorFlow.js
const wasmDir = resolve('node_modules/@tensorflow/tfjs-backend-wasm/dist');
const wasmOut = resolve('public/tfjs-wasm');
for (const file of readdirSync(wasmDir).filter((f) => f.endsWith('.wasm'))) {
  copy(join(wasmDir, file), join(wasmOut, file));
}

console.log('✅ Modèles et binaires WASM copiés dans public/');
