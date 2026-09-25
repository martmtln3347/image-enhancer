# Image Enhancer 📸

Upscaler de photos par IA (ESRGAN), qui tourne **100 % dans le navigateur**.
Pas de serveur, pas de clé API, pas de paiement : la photo ne quitte jamais ton appareil.

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:5173

## Déployer sur Vercel

1. Push le dossier sur un repo GitHub
2. Sur vercel.com : **Add New → Project**, importe le repo
3. Vercel détecte Vite tout seul, clique **Deploy**

Les modèles IA et les binaires WASM sont copiés de `node_modules` vers `public/`
automatiquement au build (`scripts/copy-assets.mjs`).

## Fallbacks 🛟

Si quelque chose lâche, l'app descend d'un cran au lieu de planter :

1. **Moteur de calcul** : WebGL (GPU) → WASM → CPU
2. **Tentatives IA** : réglage choisi → tuiles plus petites (moins de mémoire)
   → modèle Rapide → (en ×4) IA ×2 + agrandissement classique ×2
3. **Dernier recours** : agrandissement classique sans IA (lissage + netteté)
4. Si le module IA ne se charge même pas (réseau), on passe direct au classique

Sans GPU, le modèle Détaillé est sauté automatiquement (trop lent).
L'interface affiche toujours la méthode réellement utilisée.

## Structure

```
index.html               page unique
src/main.js              branchement de l'interface
src/upscale.js           IA + chaîne de fallbacks
src/classic-upscale.js   agrandissement sans IA (filet de sécurité)
src/image-utils.js       validation, redimensionnement, téléchargement
src/compare-slider.js    comparateur avant/après (réutilisable)
src/style.css            styles (clair + sombre)
scripts/copy-assets.mjs  copie des modèles + WASM au build
vercel.json              headers de sécurité (CSP stricte) + cache
```

## Limites

- Résultat plafonné à 4096 px de côté (sinon les navigateurs mobiles plantent).
- La vitesse dépend du GPU de l'appareil.
