(() => {
  /*
   * Chrono Carnet EPS
   * QR automatique de fin de course CCF
   *
   * IMPORTANT :
   * Ce module ne génère plus aucun QR lui-même.
   * Il déclenche le QR professeur déjà généré par app.js,
   * afin d'utiliser exactement le même payload et le même rendu
   * que le QR du récapitulatif.
   */

  const opened = new Set();

  function findTeacherQrButton(runnerId, race) {
    return document.querySelector(
      `[data-qr-runner="${runnerId}"][data-qr-race="${race}"]`
    );
  }

  function openTeacherQr(detail, attempt = 0) {
    const runner = detail?.runner;
    const race = Number(detail?.race);

    if (!runner?.id || !race) return;

    const button = findTeacherQrButton(runner.id, race);

    if (button) {
      button.click();
      return;
    }

    /*
     * renderPerf() peut être en train de reconstruire
     * les boutons QR au moment où l'événement est reçu.
     * On attend donc brièvement leur apparition.
     */
    if (attempt < 15) {
      setTimeout(() => {
        openTeacherQr(detail, attempt + 1);
      }, 100);
    } else {
      console.warn(
        "CCF : bouton QR professeur introuvable",
        runner.id,
        race
      );
    }
  }

  window.addEventListener("ccf-course-finished", event => {
    const detail = event.detail || {};
    const runner = detail.runner;
    const race = Number(detail.race);

    if (!runner?.id || !race) return;

    const rows = detail.rows || [];
    const totalMs = rows.length
      ? Math.round(rows[rows.length - 1].cumulativeMs || 0)
      : 0;

    /*
     * Empêche la réouverture du QR toutes les 500 ms,
     * puisque ccf-step.js surveille régulièrement le stockage.
     */
    const key = `${runner.id}-${race}-${totalMs}`;

    if (opened.has(key)) return;
    opened.add(key);

    /*
     * Laisse app.js terminer renderPerf()
     * et créer le bouton du QR récapitulatif.
     */
    setTimeout(() => {
      openTeacherQr(detail);
    }, 100);
  });
})();
