# SOARA - Specification UI Carte (version cible)

Date: 2026-03-07  
Statut: specification fonctionnelle (sans changement code)

## Objectif
Definir le fonctionnement cible de l'UI carte pour la prochaine iteration, sans modifier le runtime actuel dans ce document.

## Structure de l'ecran Carte

## 1) Panneau haut (HUD actions)
Le joueur a acces en haut de l'ecran a un panneau de boutons avec les entrees suivantes:
- Parametres
- Fiche personnage
- Catalogue des techniques
- Historique
- Inventaire

Comportement attendu:
- Le panneau reste visible pendant la navigation carte.
- Chaque bouton ouvre son panneau/modal associe.
- Ce panneau ne doit pas bloquer la lecture de la carte en arriere-plan.
- Cas admin (`Alkane`): un sous-outil de placement manuel des pins peut etre expose depuis `Parametres`.

## 2) Zone carte (arriere-plan interactif)
La carte et les pins sont visibles en arriere-plan.

Comportement attendu:
- Le joueur peut se deplacer sur la carte comme sur une carte interactive.
- Le deplacement carte actuel est conserve (zoom/dezoom/deplacement).
- Les pins restent selectionnables.

## 3) Boite de dialogue (bas ecran)
Un rectangle appele "boite de dialogue" est affiche en bas de l'ecran, centre horizontalement.

Comportement attendu:
- Position: centre bas de l'ecran joueur.
- Role: afficher les informations detaillees liees au pin selectionne.
- Etat par defaut: message neutre tant qu'aucun pin n'est clique.

## Types de boite de dialogue
- `dialogue`: version agrandie, separee en 2 panneaux (entite gauche / entite droite).
- `carte`: informations de pin + actions disponibles.
- `tutoriel`: explications de prise en main pour le joueur.
- `info`: fallback de texte simple.

Regle de rendu `dialogue`:
- Le texte du panneau gauche est aligne a gauche.
- Le joueur est affiche dans le panneau de gauche (entite droite = interlocuteur/cible).

## Regles d'interaction des pins

## A) Survol souris (hover)
Quand le joueur passe la souris sur un pin:
- seul le nom du pin apparait.
- aucune ouverture de flux narratif complet.
- la boite de dialogue n'affiche pas encore les details complets du contenu.

## B) Clic pin
Quand le joueur clique sur un pin:
- la boite de dialogue se met a jour avec toutes les informations utiles pour le joueur.
- les choix interactifs sont affiches dans la boite de dialogue.
- les choix doivent etre du texte cliquable en bleu.

## C) Choix dans la boite de dialogue
Les choix presentes dans la boite de dialogue:
- sont cliquables directement depuis la boite.
- utilisent une couleur bleue coherente pour indiquer l'action.
- declenchent le flux associe au pin (narratif, combat, etc.) selon les regles metier du pin.

## Contraintes UX
- Priorite lisibilite: le joueur comprend immediatement la difference entre hover (nom seul) et clic (contenu complet).
- Le positionnement de la boite de dialogue ne doit pas masquer le panneau haut.
- Les textes d'action doivent rester courts, clairs et orienter vers la consequence.

## Hors perimetre de ce document
- Aucun changement code applique ici.
- Aucune modification de logique metier pin/runtime.
- Ce document sert de reference pour implementation ulterieure.
