# SOARA V2 - Campagne C01 (Vertical Slice)

Version: 2.0
Statut: Runtime aligne Beta 2

## Objectif
Prouver la promesse Soara en 10-15 minutes:
- ton feodal martial
- combat deterministe lisible
- impact des decisions

## Sequence C01 (runtime actuel)
1. Accueil
- Message d'entree: "Bienvenue sur Soara".
- Passage ensuite a la carte.

2. Carte initiale
- Seul le pin campagne `C-01` est visible.

3. Dialogue C-01
- Validation du dialogue requis.
- Recompense: epee en bois (+2 ATK).
- Deblocage du pin `T`.

4. Combat `T` (tutoriel)
- Combat d'apprentissage.
- Recompense: bouclier bois (+2 DEF).
- Deblocage du pin `U`.

5. Combat `U` (PVE)
- Combat standard PVE.
- Recompense: gants (+1 ESQ).
- Deblocage du pin `N`.

6. Combat `N` (narratif)
- Combat narratif de continuation de campagne.
- Plus de duel d'essai expose au joueur.

## Etats minimum a persister
- tags_profil: [prudence, agressivite, tempo]
- reputation_locale
- historique_c01
- loadout_technique (learnedTechniques, techniquesBySlot, learnedReflexes)

## Conditions de reussite C01
- Le joueur comprend la boucle en un combat.
- Le joueur voit une consequence de ses choix.
- Le joueur veut tester une deuxieme approche.
