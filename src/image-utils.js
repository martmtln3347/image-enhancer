/**
 * image-utils.js
 * Fonctions utilitaires pour charger, valider et redimensionner les images.
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Taille max du résultat (plus grand côté, en px).
 * Au-delà, les navigateurs mobiles plantent souvent (limite des canvas).
 */
export const MAX_OUTPUT_SIDE = 4096;

/** Vérifie un fichier. Renvoie un message d'erreur, ou null si tout va bien. */
export function validateFile(file) {
  if (!file) return 'Aucun fichier sélectionné.';
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Format non pris en charge. Utilise un JPG, PNG ou WebP.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Fichier trop lourd (20 Mo maximum).';
  }
  return null;
}

/** Charge un File dans un <img> (via une URL blob locale). */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire cette image.'));
    };
    img.src = url;
  });
}

/**
 * Si l'image est trop grande pour le facteur choisi, on la réduit AVANT
 * l'upscale pour que le résultat reste sous MAX_OUTPUT_SIDE.
 * Renvoie un data URL (ou l'image d'origine si pas besoin), + infos de taille.
 */
export function fitForScale(img, scale) {
  const maxInputSide = Math.floor(MAX_OUTPUT_SIDE / scale);
  const { naturalWidth: w, naturalHeight: h } = img;
  const longest = Math.max(w, h);

  if (longest <= maxInputSide) {
    return { source: img, width: w, height: h, resized: false };
  }

  const ratio = maxInputSide / longest;
  const width = Math.round(w * ratio);
  const height = Math.round(h * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return { source: canvas.toDataURL('image/png'), width, height, resized: true };
}

/**
 * Convertit un data URL en Blob (pour un téléchargement propre).
 * On décode à la main plutôt qu'avec fetch(), que la CSP bloque sur "data:".
 */
export function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Déclenche le téléchargement d'un Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "vacances.jpg" + 4 -> "vacances-x4.png" */
export function outputName(originalName, scale) {
  const base = originalName.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}-x${scale}.png`;
}
