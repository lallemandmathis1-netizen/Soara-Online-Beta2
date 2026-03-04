export function runTutorialDialogue({ modal, playerState, onDone }) {
  const steps = [
    {
      text: "Tutoriel Soara: chaque tour commence par une intention claire.",
      choices: [
        { label: "Continuer", apply: (s) => { s.player.profile.objectif = "decision"; } }
      ]
    },
    {
      text: "L'energie est la contrainte centrale: depense, regenere, anticipe.",
      choices: [
        { label: "Compris", apply: (s) => { s.player.profile.temperament = "cadence"; } }
      ]
    },
    {
      text: "Le log de combat doit te permettre d'expliquer chaque consequence.",
      choices: [
        { label: "Pret", apply: (s) => { s.player.profile.style = "lisible"; } }
      ]
    }
  ];
  let idx = 0;

  function render() {
    const step = steps[idx];
    modal.open("Tutoriel Campagne", `
      <div class="card">
        <div>${step.text}</div>
        <div style="height:10px"></div>
        ${step.choices.map((c, i) => `<button class="btn tutorChoice" data-i="${i}" style="width:100%;margin-bottom:6px;">${c.label}</button>`).join("")}
      </div>
    `);
    for (const b of document.querySelectorAll(".tutorChoice")) {
      b.onclick = () => {
        const i = Number(b.getAttribute("data-i"));
        playerState.patch((s) => step.choices[i].apply(s));
        idx += 1;
        if (idx >= steps.length) {
          playerState.grantStarterKit();
          playerState.patch((s) => { s.campaign.tutorialDialogueDone = true; });
          modal.close();
          onDone?.();
          return;
        }
        render();
      };
    }
  }

  render();
}
