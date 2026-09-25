/**
 * compare-slider.js
 * Comparateur avant / après réutilisable.
 *
 * HTML attendu :
 *   <div class="compare">
 *     <img class="compare__after">
 *     <div class="compare__before"><img></div>
 *     <input class="compare__range" type="range" min="0" max="100">
 *   </div>
 *
 * Le curseur est un vrai <input type="range"> : accessible au clavier
 * et aux lecteurs d'écran sans effort.
 */
export function initCompareSlider(root) {
  const range = root.querySelector('.compare__range');

  const update = () => root.style.setProperty('--pos', `${range.value}%`);
  range.addEventListener('input', update);
  update();

  return {
    /** Remet le curseur au milieu (quand on charge une nouvelle image). */
    reset() {
      range.value = 50;
      update();
    },
  };
}
