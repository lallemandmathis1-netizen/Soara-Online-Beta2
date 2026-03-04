# SOARA V2 - Campagne C01 (Vertical Slice)

Version: 2.0
Statut: Implementable flow

## Objectif
Prouver la promesse Soara en 10-15 minutes:
- ton feodal martial
- combat deterministe lisible
- impact des decisions

## Sequence C01
1. Ouverture: Interrogatoire (taverne)
- UI narrative dominante.
- Choix de reponses (attitude): prudent / frontal / manipulateur.
- Effet: tags initiaux de profil (non cosmetiques).

2. Incident
- Tension monte entre factions locales.
- Introduction d'un Bazéide et d'un Mentor.
- Le Mentor reconnait le "rythme" du joueur.

3. Attribution de style (implante)
- Le mentor valide l'entree en campagne.
- Le joueur choisit une voie:
  - Voie Bazeide
  - Voie Federation
  - Voie Roor
- Chaque voie donne immediatement:
  - 3 techniques de base
  - 1 reflexe
- Le loadout est applique au compte et au state joueur.

4. Tutoriel lisible
- Explication courte: energie, technique, tempo, log.
- Verification: le joueur doit choisir une technique en attente.

5. Combat gobelin basique (1v1)
- But narratif: evaluation, pas execution punitive.
- Mesures observees:
  - gestion energie
  - anticipation
  - regularite des validations

6. Debrief Mentor
- Lecture de style: prudent / brutal / opportuniste.
- Consequence immediate:
  - recommendation de branche technique
  - micro variation de relation faction locale

7. Sortie de C01
- Deblocage carte locale.
- Premiere destination suggeree (sans forcer).

## Etats minimum a persister
- tags_profil: [prudence, agressivite, tempo]
- reputation_locale
- historique_c01
- loadout_technique (learnedTechniques, techniquesBySlot, learnedReflexes)

## Conditions de reussite C01
- Le joueur comprend la boucle en un combat.
- Le joueur voit une consequence de ses choix.
- Le joueur veut tester une deuxieme approche.
