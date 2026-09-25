/**
 * classic-upscale.js
 * Dernier filet de sécurité : agrandissement SANS IA (canvas + netteté).
 * Moins bon que l'IA, mais marche partout, même si TensorFlow ne charge pas.
 * Volontairement séparé d'upscale.js pour ne pas dépendre de TensorFlow.
 */

/** Transforme une source (img ou data URL) en HTMLImageElement décodée. */
export async function toImage(source) {
  if (source instanceof HTMLImageElement) return source;
  const img = new Image();
  img.src = source;
  await img.decode();
  return img;
}

/** Agrandit une image d'un facteur donné avec le lissage natif du navigateur. */
export function resizeToCanvas(img, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Accentue la netteté (noyau 3×3 type "unsharp").
 * amount : 0 = rien, 1 = fort. 0.4 reste naturel.
 */
export function sharpenCanvas(canvas, amount = 0.4) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const image = ctx.getImageData(0, 0, w, h);
  const src = image.data;
  const out = new Uint8ClampedArray(src); // copie : on lit l'original, on écrit ici

  const center = 1 + 4 * amount;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) { // R, G, B (on ne touche pas à l'alpha)
        out[i + c] =
          center * src[i + c] -
          amount * (src[i + c - 4] + src[i + c + 4] + src[i + c - w * 4] + src[i + c + w * 4]);
      }
    }
  }

  image.data.set(out);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Agrandissement classique complet.
 * @returns {Promise<string>} data URL PNG
 */
export async function classicUpscale(source, scale, { sharpen = true } = {}) {
  const img = await toImage(source);
  const canvas = resizeToCanvas(img, scale);
  if (sharpen) sharpenCanvas(canvas);
  return canvas.toDataURL('image/png');
}
