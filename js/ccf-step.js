(() => {
  const KEY = 'chronoCarnetEPS_v4';

  const opened = new Set();

  function readState() {
    try {
      return JSON.parse(
        localStorage.getItem(KEY) || '{}'
      );
    } catch {
      return {};
    }
  }

  function checkFinishedCourses() {
    const state = readState();

    if (
      state.mode !== 'ccf' ||
      state.view !== 'performance'
    ) {
      return;
    }

    const runners = Array.isArray(state.runners)
      ? state.runners
      : [];

    const results = Array.isArray(state.results)
      ? state.results
      : [];

    runners.forEach(runner => {
      [1, 2].forEach(race => {
        const rows = results.filter(
          row =>
            row.runnerId === runner.id &&
            Number(row.race) === race
        );

        if (rows.length < 4) {
          return;
        }

        const lastRow =
          rows[rows.length - 1];

        const totalMs =
          Math.round(
            Number(
              lastRow?.cumulativeMs || 0
            )
          );

        const key =
          `${runner.id}-${race}-${totalMs}`;

        if (opened.has(key)) {
          return;
        }

        opened.add(key);

        window.dispatchEvent(
          new CustomEvent(
            'ccf-course-finished',
            {
              detail: {
                runner,
                race,
                rows
              }
            }
          )
        );
      });
    });
  }

  setInterval(
    checkFinishedCourses,
    300
  );
})();
