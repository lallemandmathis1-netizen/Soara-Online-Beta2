export function createTurnFlow({
  onPhaseEnter,
  onTick,
  onPhaseEnd,
  onRunTimerTick,
  onResolveTurn,
  unitDurationMs = 1000,
  phaseDurations = {},
  startTurn = 0,
  continuousRunTimer = false,
  requireRollEveryTurn = false
}) {
  let phase = "idle";
  let phaseRemaining = 0;
  let timerId = null;
  let turn = Number.isInteger(startTurn) ? startTurn : 0;
  let timerTick = 0;
  let rollRequested = false;

  // Durations are expressed in "u" (time units), then multiplied by unitDurationMs.
  const durations = {
    askRoll: Math.max(1, Number(phaseDurations.askRoll ?? 5)),
    revealRoll: Math.max(1, Number(phaseDurations.revealRoll ?? 5)),
    runTimer: Math.max(1, Number(phaseDurations.runTimer ?? 20)),
    endWait: Math.max(0, Number(phaseDurations.endWait ?? 0))
  };

  function clear() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  function setPhase(next, seconds) {
    phase = next;
    phaseRemaining = seconds;
    onPhaseEnter?.({ phase, seconds, turn, timerTick });
  }

  function start() {
    clear();
    turn = Number.isInteger(startTurn) ? startTurn : 0;
    rollRequested = false;
    timerTick = 0;
    if (continuousRunTimer) setPhase("runTimer", durations.runTimer);
    else setPhase("askRoll", durations.askRoll);
    timerId = window.setInterval(step, Math.max(50, Number(unitDurationMs) || 1000));
  }

  function stop() {
    clear();
    phase = "idle";
  }

  function handleSpace() {
    if (phase === "askRoll" && (requireRollEveryTurn || turn === 0)) {
      rollRequested = true;
      if (phaseRemaining <= 0) {
        setPhase("revealRoll", durations.revealRoll);
      }
      return true;
    }
    return false;
  }

  function nextTurn() {
    turn += 1;
    rollRequested = false;
    timerTick = 0;
    setPhase("askRoll", durations.askRoll);
  }

  function step() {
    if (phase === "runTimer") {
      timerTick += 1;
      onRunTimerTick?.({ turn, timerTick });
      if (timerTick >= durations.runTimer) {
        onResolveTurn?.({ turn });
        timerTick = 0;
        if (continuousRunTimer) {
          turn += 1;
        } else if (durations.endWait > 0) {
          setPhase("endWait", durations.endWait);
        } else {
          nextTurn();
        }
      }
      onTick?.({ phase, phaseRemaining: Math.max(0, durations.runTimer - timerTick), turn, timerTick });
      return;
    }

    phaseRemaining -= 1;
    onTick?.({ phase, phaseRemaining: Math.max(0, phaseRemaining), turn, timerTick });
    if (phaseRemaining > 0) return;

    onPhaseEnd?.({ phase, turn, rollRequested });

    if (phase === "askRoll") {
      if ((requireRollEveryTurn || turn === 0) && !rollRequested) {
        phaseRemaining = 0;
        onTick?.({ phase, phaseRemaining: 0, turn, timerTick });
        return;
      }
      setPhase("revealRoll", durations.revealRoll);
      return;
    }
    if (phase === "revealRoll") {
      timerTick = 0;
      setPhase("runTimer", durations.runTimer);
      return;
    }
    if (phase === "endWait") {
      nextTurn();
    }
  }

  return { start, stop, setPhase, handleSpace, getState: () => ({ phase, phaseRemaining, turn, timerTick, rollRequested }) };
}
