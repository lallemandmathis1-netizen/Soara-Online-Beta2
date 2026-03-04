# Archive Legacy Combat

Ce dossier contient des modules combat legacy retires du runtime actif.

## Fichiers archives
- `ui_combatScreen.legacy.js`
- `features_combatTutorialUI.legacy.js`

## Motif
- Le runtime actif utilise `public/js/features/combatScreen.js` (nouveau flux).
- Les modules archives dependaient d'exports de compatibilite (`resolvePair` placeholder) et pouvaient creer des regressions s'ils etaient reutilises par erreur.

## Regle
- Ne pas rebrancher ces fichiers sans migration explicite vers le moteur combat runtime actuel.
