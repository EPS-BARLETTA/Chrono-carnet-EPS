"use strict";

(() => {

  const KEY = "chronoCarnetEPS_v4";
  const CARNET_URL = "https://carnetentrainementv2.vercel.app/";
  const $ = id => document.getElementById(id);


  /* =========================================================
     BAREMES CCF EXISTANTS — NE PAS MODIFIER
  ========================================================= */

  const PERF_F = [
    [306,.25],[299,.5],[292,.75],[285,1],
    [278,1.25],[272,1.5],[266,1.75],[260,2],
    [254,2.25],[248,2.5],[242,2.75],[236,3],
    [230,3.25],[225,3.5],[220,3.75],[215,4],
    [210,4.25],[205,4.5],[200,4.75],[195,5],
    [190,5.25],[185,5.5],[180,5.75],[175,6]
  ];

  const PERF_M = [
    [242,.25],[237,.5],[232,.75],[227,1],
    [222,1.25],[217,1.5],[212,1.75],[207,2],
    [202,2.25],[197,2.5],[192,2.75],[188,3],
    [184,3.25],[180,3.5],[176,3.75],[172,4],
    [168,4.25],[165,4.5],[162,4.75],[159,5],
    [156,5.25],[153,5.5],[150,5.75],[147,6]
  ];


  /* =========================================================
     ETAT
  ========================================================= */

  const base = () => ({
    mode: "training",
    trainingTool: "simple",
    view: "setup",

    totalDistance: 1000,
    splitDistance: 100,
    displayMode: "both",
    targetMs: null,

    timerDurationChoice: "360",
    timerDurationMs: 360000,

    trackDistanceChoice: "300",
    trackDistance: 300,

    vmaProtocol: "6",
    vmaDurationMs: 360000,

    vmaTrackDistanceChoice: "300",
    vmaTrackDistance: 300,

    runners: [],
    results: [],
    timedRuns: [],

    activeRace: 1,
    activeRunnerId: null,

    recoveryStartedAt: null
  });


  let state;

  try {

    state = {
      ...base(),
      ...JSON.parse(
        localStorage.getItem(KEY) || "{}"
      )
    };

  } catch {

    state = base();

  }


  /* Compatibilité avec les anciennes données */

  if (!["training","ccf"].includes(state.mode)) {
    state.mode = "training";
  }

  if (!["simple","chrono","timer","vma"].includes(state.trainingTool)) {
    state.trainingTool = "simple";
  }

  if (!Array.isArray(state.timedRuns)) {
    state.timedRuns = [];
  }

  if (!state.timerDurationChoice) {
    state.timerDurationChoice =
      [180000,360000,540000,720000,900000,1200000]
        .includes(state.timerDurationMs)
        ? String(state.timerDurationMs / 1000)
        : "custom";
  }

  if (!state.trackDistanceChoice) {
    state.trackDistanceChoice =
      [100,200,250,300,400].includes(state.trackDistance)
        ? String(state.trackDistance)
        : "custom";
  }

  if (!state.vmaProtocol) {
    state.vmaProtocol =
      state.vmaDurationMs === 720000
        ? "12"
        : state.vmaDurationMs === 360000
          ? "6"
          : "custom";
  }

  if (!state.vmaTrackDistanceChoice) {
    state.vmaTrackDistanceChoice =
      [100,200,250,300,400].includes(state.vmaTrackDistance)
        ? String(state.vmaTrackDistance)
        : "custom";
  }


  let running = false;
  let startedAt = 0;
  let elapsedMs = 0;

  let recoveryTimer = null;
  let exportRunnerId = null;

  let timedLapCount = 0;
  let timedFinished = false;
  let timedActualDurationMs = 0;


  /* =========================================================
     UTILITAIRES
  ========================================================= */

  const save = () =>
    localStorage.setItem(
      KEY,
      JSON.stringify(state)
    );


  const uid = () =>
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2,7);


  const esc = v =>
    String(v ?? "")
      .replace(
        /[&<>"']/g,
        c => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[c])
      );


  const fmt = ms => {

    ms = Math.max(
      0,
      Math.round(ms || 0)
    );

    const cs =
      Math.floor(ms % 1000 / 10);

    const s =
      Math.floor(ms / 1000) % 60;

    const m =
      Math.floor(ms / 60000);

    return (
      `${String(m).padStart(2,"0")}:` +
      `${String(s).padStart(2,"0")}.` +
      `${String(cs).padStart(2,"0")}`
    );

  };


  const fmtClock = ms => {

    ms = Math.max(
      0,
      Math.ceil(ms || 0)
    );

    const s =
      Math.floor(ms / 1000) % 60;

    const m =
      Math.floor(ms / 60000);

    return (
      `${String(m).padStart(2,"0")}:` +
      `${String(s).padStart(2,"0")}`
    );

  };


  const short = ms =>
    `${(
      Math.abs(ms || 0) / 1000
    ).toFixed(2)} s`;


  const now = () =>
    elapsedMs +
    (
      running
        ? performance.now() - startedAt
        : 0
    );


  const spd = (distanceM, timeMs) =>
    timeMs
      ? distanceM / (timeMs / 1000) * 3.6
      : 0;


  const signed = v =>
    v == null
      ? "—"
      : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${short(v)}`;


  const isSimple = () =>
    state.mode === "training" &&
    state.trainingTool === "simple";


  const isChrono = () =>
    state.mode === "training" &&
    state.trainingTool === "chrono";


  const isTimed = () =>
    state.mode === "training" &&
    ["timer","vma"].includes(
      state.trainingTool
    );


  function setVisible(id, visible) {

    const el = $(id);

    if (el) {
      el.classList.toggle(
        "hidden",
        !visible
      );
    }

  }


  function parseTime(v) {

    if (!v) {
      return null;
    }

    v =
      String(v)
        .trim()
        .replace(/,/g,".");

    let m =
      v.match(
        /^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/
      );

    if (m) {

      return (
        +m[1] * 60 +
        +m[2]
      ) * 1000;

    }

    m =
      v.match(
        /^(\d+(?:\.\d+)?)$/
      );

    return m
      ? +m[1] * 1000
      : null;

  }


  function stableStudentId(last,first,cls) {

    const s =
      `${String(last).trim().toUpperCase()}|` +
      `${String(first).trim().toUpperCase()}|` +
      `${String(cls).trim().toUpperCase()}`;

    let h = 2166136261;

    for (
      let i = 0;
      i < s.length;
      i++
    ) {

      h ^= s.charCodeAt(i);

      h =
        Math.imul(
          h,
          16777619
        );

    }

    return (
      `STD-${
        (h >>> 0)
          .toString(16)
          .padStart(8,"0")
      }`
    );

  }


  function toast(t) {

    $("toast").textContent = t;
    $("toast").hidden = false;

    clearTimeout(toast.t);

    toast.t =
      setTimeout(
        () =>
          $("toast").hidden = true,
        2200
      );

  }


  /* =========================================================
     RESULTATS CLASSIQUES / CCF
  ========================================================= */

  const rr = (
    id,
    race = state.activeRace
  ) =>
    state.results.filter(
      x =>
        x.runnerId === id &&
        x.race === race
    );


  const requiredSplits = () =>
    Math.floor(
      state.totalDistance /
      state.splitDistance
    );


  const activeRunner = () =>
    state.runners.find(
      r =>
        r.id === state.activeRunnerId
    ) || null;


  const done = (
    id,
    race = state.activeRace
  ) =>
    rr(id,race).length >=
    requiredSplits();


  const allDone = race =>
    state.runners.length > 0 &&
    state.runners.every(
      r =>
        done(r.id,race)
    );


  const timedRunFor = (
    id,
    tool = state.trainingTool
  ) =>
    state.timedRuns.find(
      x =>
        x.runnerId === id &&
        x.tool === tool
    ) || null;


  /* =========================================================
     CCF
  ========================================================= */

  function perfPoints(sex,ms) {

    if (!ms) {
      return 0;
    }

    let p = 0;

    for (
      const [limit,pts]
      of
      (
        sex === "F"
          ? PERF_F
          : PERF_M
      )
    ) {

      if (
        ms / 1000 <= limit
      ) {
        p = pts;
      }

    }

    return p;

  }


  function regularityPoints(ms) {

    if (ms == null) return 0;

    const s = ms / 1000;

    if (s > 21) return 0;
    if (s >= 20) return .5;
    if (s >= 18) return 1;
    if (s >= 16) return 1.5;
    if (s >= 14) return 2;
    if (s >= 12) return 2.5;
    if (s >= 10) return 3;
    if (s >= 9) return 3.5;
    if (s >= 8) return 4;
    if (s >= 7) return 4.5;
    if (s >= 6) return 5;
    if (s >= 5) return 5.5;
    if (s < 4) return 6;

    return 5.5;

  }


  function ccfSummary(r) {

    const a1 = rr(r.id,1);
    const a2 = rr(r.id,2);

    const t1 =
      a1.length === 4
        ? a1.at(-1).cumulativeMs
        : null;

    const t2 =
      a2.length === 4
        ? a2.at(-1).cumulativeMs
        : null;

    const laps = [
      ...a1,
      ...a2
    ].map(
      x => x.lapMs
    );

    const best =
      [t1,t2]
        .filter(Boolean)
        .sort((a,b) => a-b)[0] ||
      null;

    const spread =
      laps.length === 8
        ? Math.max(...laps) -
          Math.min(...laps)
        : null;

    const perf =
      perfPoints(
        r.sex,
        best
      );

    const reg =
      regularityPoints(
        spread
      );

    return {
      t1,
      t2,
      best,
      spread,
      perf,
      reg,
      total: perf + reg,
      complete:
        !!(
          t1 &&
          t2 &&
          laps.length === 8
        )
    };

  }


  /* =========================================================
     CONFIGURATION
  ========================================================= */

  function readConfig() {

    if (
      state.mode === "ccf"
    ) {

      state.totalDistance = 800;
      state.splitDistance = 200;
      state.displayMode = "cumulative";

      return;

    }


    if (
      state.trainingTool === "chrono"
    ) {

      state.totalDistance =
        $("totalDistance").value === "custom"
          ? Math.max(
              1,
              +$("customDistance").value || 1
            )
          : +$("totalDistance").value;


      state.splitDistance =
        $("splitDistance").value === "custom"
          ? Math.max(
              1,
              +$("customSplit").value || 1
            )
          : +$("splitDistance").value;


      state.displayMode =
        $("displayMode").value;


      state.targetMs =
        parseTime(
          $("targetTime").value
        );

    }


    if (
      state.trainingTool === "timer"
    ) {

      state.timerDurationChoice =
        $("timerDuration").value;


      if (
        state.timerDurationChoice ===
        "custom"
      ) {

        state.timerDurationMs =
          Math.max(
            .5,
            +$("customTimerDuration").value ||
            6
          ) * 60000;

      } else {

        state.timerDurationMs =
          +state.timerDurationChoice *
          1000;

      }


      state.trackDistanceChoice =
        $("trackDistance").value;


      if (
        state.trackDistanceChoice ===
        "custom"
      ) {

        state.trackDistance =
          Math.max(
            10,
            +$("customTrackDistance").value ||
            300
          );

      } else {

        state.trackDistance =
          +state.trackDistanceChoice;

      }

    }


    if (
      state.trainingTool === "vma"
    ) {

      state.vmaProtocol =
        $("vmaProtocol").value;


      if (
        state.vmaProtocol === "6"
      ) {

        state.vmaDurationMs =
          360000;

      } else if (
        state.vmaProtocol === "12"
      ) {

        state.vmaDurationMs =
          720000;

      } else {

        state.vmaDurationMs =
          Math.max(
            .5,
            +$("vmaCustomDuration").value ||
            6
          ) * 60000;

      }


      state.vmaTrackDistanceChoice =
        $("vmaTrackDistance").value;


      if (
        state.vmaTrackDistanceChoice ===
        "custom"
      ) {

        state.vmaTrackDistance =
          Math.max(
            10,
            +$("vmaCustomTrackDistance").value ||
            300
          );

      } else {

        state.vmaTrackDistance =
          +state.vmaTrackDistanceChoice;

      }

    }

  }


  /* =========================================================
     PAGE PARAMETRAGE
  ========================================================= */

  function renderSetup() {

    document
      .querySelectorAll(
        '[name="mode"]'
      )
      .forEach(
        x =>
          x.checked =
            x.value === state.mode
      );


    document
      .querySelectorAll(
        '[name="trainingTool"]'
      )
      .forEach(
        x =>
          x.checked =
            x.value === state.trainingTool
      );


    const ccf =
      state.mode === "ccf";


    setVisible(
      "trainingConfig",
      !ccf
    );


    setVisible(
      "ccfConfig",
      ccf
    );


    document
      .querySelectorAll(
        ".ccfRunnerField"
      )
      .forEach(
        x =>
          x.classList.toggle(
            "hidden",
            !ccf
          )
      );


    setVisible(
      "trainingSimpleConfig",
      !ccf &&
      state.trainingTool === "simple"
    );


    setVisible(
      "trainingChronoConfig",
      !ccf &&
      state.trainingTool === "chrono"
    );


    setVisible(
      "trainingTimerConfig",
      !ccf &&
      state.trainingTool === "timer"
    );


    setVisible(
      "trainingVmaConfig",
      !ccf &&
      state.trainingTool === "vma"
    );


    setVisible(
      "runnerSetupBlock",
      ccf ||
      state.trainingTool !== "simple"
    );


    /* Chrono performance */

    $("totalDistance").value =
      [
        100,200,400,600,800,
        1000,1200,1500,2000,3000
      ].includes(state.totalDistance)
        ? String(state.totalDistance)
        : "custom";


    $("customDistance").value =
      state.totalDistance;


    $("splitDistance").value =
      [50,100,150,200,250,400]
        .includes(state.splitDistance)
        ? String(state.splitDistance)
        : "custom";


    $("customSplit").value =
      state.splitDistance;


    $("displayMode").value =
      state.displayMode;


    $("targetTime").value =
      state.targetMs
        ? fmt(state.targetMs)
        : "";


    setVisible(
      "customDistanceWrap",
      $("totalDistance").value === "custom"
    );


    setVisible(
      "customSplitWrap",
      $("splitDistance").value === "custom"
    );


    /* Minuteur */

    $("timerDuration").value =
      state.timerDurationChoice;


    $("customTimerDuration").value =
      Math.max(
        .5,
        state.timerDurationMs /
        60000
      );


    $("trackDistance").value =
      state.trackDistanceChoice;


    $("customTrackDistance").value =
      state.trackDistance;


    setVisible(
      "customTimerDurationWrap",
      state.timerDurationChoice ===
      "custom"
    );


    setVisible(
      "customTrackDistanceWrap",
      state.trackDistanceChoice ===
      "custom"
    );


    $("timerPreviewDuration")
      .textContent =
        fmtClock(
          state.timerDurationMs
        );


    $("timerPreviewTrack")
      .textContent =
        `${state.trackDistance} m`;


    /* VMA */

    $("vmaProtocol").value =
      state.vmaProtocol;


    $("vmaCustomDuration").value =
      Math.max(
        .5,
        state.vmaDurationMs /
        60000
      );


    $("vmaTrackDistance").value =
      state.vmaTrackDistanceChoice;


    $("vmaCustomTrackDistance").value =
      state.vmaTrackDistance;


    setVisible(
      "vmaCustomDurationWrap",
      state.vmaProtocol ===
      "custom"
    );


    setVisible(
      "vmaCustomTrackDistanceWrap",
      state.vmaTrackDistanceChoice ===
      "custom"
    );


    /* Résumé */

    const recap = [];


    if (ccf) {

      recap.push(
        "CCF demi-fond",
        "800 m",
        "200 m / passage"
      );

    } else if (
      state.trainingTool === "simple"
    ) {

      recap.push(
        "Chrono simple",
        "Sans paramétrage"
      );

    } else if (
      state.trainingTool === "chrono"
    ) {

      recap.push(
        "Chrono performance",
        `${state.totalDistance} m`,
        `${state.splitDistance} m / passage`
      );

    } else if (
      state.trainingTool === "timer"
    ) {

      recap.push(
        "Minuteur / Tours",
        fmtClock(
          state.timerDurationMs
        ),
        `Piste ${state.trackDistance} m`
      );

    } else {

      const protocolName =
        state.vmaProtocol === "6"
          ? "Demi-Cooper"
          : state.vmaProtocol === "12"
            ? "Cooper"
            : "Test personnalisé";


      recap.push(
        protocolName,
        fmtClock(
          state.vmaDurationMs
        ),
        `Piste ${state.vmaTrackDistance} m`
      );

    }


    $("configRecap").innerHTML =
      recap
        .map(
          x =>
            `<span>${x}</span>`
        )
        .join("");


    $("launchPerformanceBtn")
      .textContent =

      ccf
        ? "Passer à la prise de performance"

        : state.trainingTool === "simple"
          ? "Ouvrir le chrono"

        : state.trainingTool === "chrono"
          ? "Démarrer la prise de performance"

        : state.trainingTool === "timer"
          ? "Démarrer le minuteur"

        : state.vmaProtocol === "6"
          ? "Démarrer le Demi-Cooper"

        : state.vmaProtocol === "12"
          ? "Démarrer le Cooper"

        : "Démarrer le test VMA";


    renderRunnerSetup();

  }


  /* =========================================================
     COUREURS
  ========================================================= */

  function renderRunnerSetup() {

    const b =
      $("runnerSetupList");

    if (!b) {
      return;
    }


    b.innerHTML =
      state.runners.length

        ? state.runners
          .map(
            r =>

              `<span class="runnerChip">` +

              `<strong>${
                esc(
                  r.last
                    ? r.last.toUpperCase() +
                      " " +
                      r.first
                    : r.name
                )
              }</strong>` +

              `${
                r.classroom
                  ? ` · ${esc(r.classroom)}`
                  : ""
              }` +

              `${
                state.mode === "ccf"
                  ? ` · ${r.sex}` +
                    ` · P1 ${
                      r.project1Ms
                        ? fmt(r.project1Ms)
                        : "—"
                    }` +
                    ` · P2 ${
                      r.project2Ms
                        ? fmt(r.project2Ms)
                        : "—"
                    }`
                  : ""
              }` +

              `<button data-del="${r.id}">×</button>` +

              `</span>`

          )
          .join("")

        : "Aucun coureur ajouté.";


    b.querySelectorAll(
      "[data-del]"
    )
    .forEach(
      x => {

        x.onclick =
          () => {

            if (running) {
              return;
            }


            if (
              state.results.some(
                y =>
                  y.runnerId ===
                  x.dataset.del
              ) ||
              state.timedRuns.some(
                y =>
                  y.runnerId ===
                  x.dataset.del
              )
            ) {

              return toast(
                "Impossible de supprimer un coureur qui a déjà des résultats."
              );

            }


            state.runners =
              state.runners.filter(
                r =>
                  r.id !==
                  x.dataset.del
              );


            if (
              state.activeRunnerId ===
              x.dataset.del
            ) {

              state.activeRunnerId =
                state.runners[0]?.id ||
                null;

            }


            save();

            renderRunnerSetup();

          };

      }
    );

  }


  function estimateMs(prefix) {

    const m =
      $(`${prefix}Min`)?.value;

    const s =
      $(`${prefix}Sec`)?.value;


    if (
      m === "" ||
      s === ""
    ) {

      return null;

    }


    const sec =
      Number(s);


    if (
      !Number.isInteger(sec) ||
      sec < 0 ||
      sec > 59
    ) {

      return null;

    }


    return (
      Number(m) * 60 +
      sec
    ) * 1000;

  }


  function addRunner() {

    const last =
      $("runnerLast")
        ?.value
        .trim() ||
      "";


    const first =
      $("runnerFirst")
        ?.value
        .trim() ||
      "";


    const cls =
      $("runnerClass")
        ?.value
        .trim()
        .toUpperCase() ||
      "";


    const name =
      $("runnerName")
        ?.value
        .trim() ||

      [
        last.toUpperCase(),
        first
      ]
        .filter(Boolean)
        .join(" ");


    if (
      !last ||
      !first
    ) {

      return toast(
        "Nom et prénom sont obligatoires."
      );

    }


    if (
      state.mode === "ccf" &&
      state.runners.length >= 2
    ) {

      return toast(
        "Le mode CCF fonctionne avec deux coureurs maximum."
      );

    }


    if (
      state.mode === "training" &&
      state.runners.length >= 2
    ) {

      return toast(
        "Deux coureurs maximum par séance."
      );

    }


    const p1 =
      state.mode === "ccf"
        ? estimateMs("project1")
        : null;


    const p2 =
      state.mode === "ccf"
        ? estimateMs("project2")
        : null;


    if (
      state.mode === "ccf" &&
      (
        !cls ||
        !p1 ||
        !p2
      )
    ) {

      return toast(
        "Classe et deux estimations valides sont obligatoires."
      );

    }


    const r = {

      id:
        uid(),

      externalId:
        stableStudentId(
          last,
          first,
          cls
        ),

      last,

      first,

      classroom:
        cls,

      name,

      sex:
        $("runnerSex").value,

      project1Ms:
        p1,

      project2Ms:
        p2,

      tone:
        state.runners.length % 2
          ? "blue"
          : "green",

      lockedIdentity:
        state.mode === "ccf"

    };


    state.runners.push(r);


    if (
      !state.activeRunnerId
    ) {

      state.activeRunnerId =
        r.id;

    }


    [
      "runnerLast",
      "runnerFirst",
      "runnerClass",
      "runnerName",
      "project1Min",
      "project1Sec",
      "project2Min",
      "project2Sec"
    ]
    .forEach(
      id => {

        if ($(id)) {
          $(id).value = "";
        }

      }
    );


    save();

    renderRunnerSetup();

  }


  /* =========================================================
     LANCEMENT
  ========================================================= */

  function launch() {

    readConfig();


    if (
      !isSimple() &&
      !state.runners.length
    ) {

      return toast(
        "Ajoute au moins un coureur."
      );

    }


    if (
      (
        state.mode === "ccf" ||
        isChrono()
      ) &&
      (
        state.totalDistance <= 0 ||
        state.splitDistance <= 0 ||
        state.totalDistance %
        state.splitDistance
      )
    ) {

      return toast(
        "Configuration incohérente."
      );

    }


    if (
      isTimed()
    ) {

      const duration =
        currentTimedDuration();

      const track =
        currentTrackDistance();


      if (
        duration <= 0 ||
        track <= 0
      ) {

        return toast(
          "Durée ou longueur de piste invalide."
        );

      }

    }


    if (
      state.mode === "ccf" &&
      state.runners.some(
        r =>
          !r.last ||
          !r.first ||
          !r.classroom ||
          !r.project1Ms ||
          !r.project2Ms
      )
    ) {

      return toast(
        "Identité et estimations incomplètes."
      );

    }


    state.view =
      "performance";


    state.activeRace =
      1;


    if (
      !isSimple()
    ) {

      if (
        isTimed()
      ) {

        state.activeRunnerId =
          state.runners.find(
            r =>
              !timedRunFor(r.id)
          )?.id ||
          state.runners[0]?.id ||
          null;

      } else {

        state.activeRunnerId =
          state.runners.find(
            r =>
              !done(r.id,1)
          )?.id ||
          state.runners[0]?.id ||
          null;

      }

    }


    resetClock();

    resetTimedRuntime();

    save();

    render();

  }


  /* =========================================================
     CHRONO
  ========================================================= */

  function resetClock() {

    running = false;
    startedAt = 0;
    elapsedMs = 0;

  }


  function resetTimedRuntime() {

    timedLapCount = 0;
    timedFinished = false;
    timedActualDurationMs = 0;


    if (
  $("partialDistance")
) {

  $("partialDistance").value = 0;
  $("partialDistance").min = 0;
  $("partialDistance").max =
    Math.max(
      0,
      currentTrackDistance() - 1
    );

}

  }


  function currentTimedDuration() {

    return (
      state.trainingTool === "vma"
        ? state.vmaDurationMs
        : state.timerDurationMs
    );

  }


  function currentTrackDistance() {

    return (
      state.trainingTool === "vma"
        ? state.vmaTrackDistance
        : state.trackDistance
    );

  }


  function start() {

    if (running) {
      return;
    }


    if (
      isSimple()
    ) {

      startedAt = performance.now();
      running = true;

      renderTimer();

      return;

    }


    const r =
      activeRunner();


    if (!r) {

      return toast(
        "Choisis un coureur."
      );

    }


    if (
      isTimed()
    ) {

      if (
        timedRunFor(r.id)
      ) {

        return toast(
          "Un résultat existe déjà pour ce coureur. Réinitialise-le pour recommencer."
        );

      }


      resetTimedRuntime();

      elapsedMs = 0;

      startedAt =
        performance.now();

      running = true;

      renderTimer();

      return;

    }


    if (
      done(r.id)
    ) {

      return toast(
        "Cette course est déjà terminée pour ce coureur."
      );

    }


    elapsedMs = 0;

    startedAt =
      performance.now();

    running = true;

    renderTimer();

  }


  function stopClock() {

    if (running) {

      elapsedMs =
        now();

      running =
        false;

      startedAt =
        0;

    }


    renderTimer();

  }


  function stopAction() {

  if (!running) {
    return;
  }


  if (
    isSimple()
  ) {

    stopClock();

    return;

  }


  if (
    isTimed()
  ) {

    if (
      state.trainingTool === "vma" &&
      (
        state.vmaProtocol === "6" ||
        state.vmaProtocol === "12"
      )
    ) {

      const ok =
        confirm(
          "Interrompre le test ? Aucun résultat VMA ne sera enregistré."
        );

      if (!ok) {
        return;
      }

      resetClock();

      resetTimedRuntime();

      renderPerf();

      toast(
        "Test interrompu · aucun résultat VMA enregistré."
      );

      return;

    }


    finishTimedRun(false);

  }

}
  /* =========================================================
     CHRONO PERFORMANCE / CCF
  ========================================================= */

  function nextRunnerSameRace(
    currentId
  ) {

    return (
      state.runners.find(
        r =>
          r.id !== currentId &&
          !done(
            r.id,
            state.activeRace
          )
      ) ||
      null
    );

  }


  function recordLap() {

    const r =
      activeRunner();


    if (!r) {

      return toast(
        "Choisis un coureur."
      );

    }


    if (!running) {

      return toast(
        "Appuie d’abord sur DÉPART."
      );

    }


    const a =
      rr(r.id);


    const cum =
      now();


    const prev =
      a.length
        ? a.at(-1).cumulativeMs
        : 0;


    const lap =
      cum - prev;


    const pass =
      a.length + 1;


    const dist =
      pass *
      state.splitDistance;


    const delta =
      a.length
        ? lap -
          a.at(-1).lapMs
        : null;


    const target =
      state.mode === "training"
        ? state.targetMs
        : (
            state.activeRace === 1
              ? r.project1Ms
              : r.project2Ms
          );


    state.results.push({

      id:
        uid(),

      runnerId:
        r.id,

      runnerName:
        r.name,

      race:
        state.activeRace,

      passage:
        pass,

      distance:
        dist,

      cumulativeMs:
        cum,

      lapMs:
        lap,

      speed:
        spd(
          state.splitDistance,
          lap
        ),

      deltaMs:
        delta,

      targetDelta:
        target
          ? cum -
            target *
            (
              dist /
              state.totalDistance
            )
          : null

    });


    navigator.vibrate?.(25);


    if (
      pass >=
      requiredSplits()
    ) {

      stopClock();


      if (
        state.mode === "ccf"
      ) {

        const next =
          nextRunnerSameRace(
            r.id
          );


        if (next) {

          state.activeRunnerId =
            next.id;

          resetClock();

          toast(
            `${r.name} terminé · au tour de ${next.name}`
          );

        } else if (
          state.activeRace === 1
        ) {

          toast(
            "800 m n°1 terminés · lance la récupération puis passe au n°2"
          );

        } else {

          toast(
            "Les deux 800 m sont terminés · bilan et QR disponibles"
          );

        }

      } else {

        toast(
          `${r.name} · course terminée`
        );

      }

    }


    save();

    renderPerf();

  }


  /* =========================================================
     MINUTEUR / VMA
  ========================================================= */

  function addTimedLap() {

    if (
      !isTimed()
    ) {
      return;
    }


    if (
      !running
    ) {

      return toast(
        "Appuie d’abord sur DÉPART."
      );

    }


    timedLapCount += 1;

    navigator.vibrate?.(25);

    renderTimer();

  }


  function undoTimedLap() {

    if (
      !isTimed() ||
      timedLapCount <= 0 ||
      timedFinished
    ) {

      return;

    }


    timedLapCount -= 1;

    renderTimer();

  }


  function finishTimedRun(
    auto = true
  ) {

    if (
      !isTimed() ||
      timedFinished
    ) {

      return;

    }


    const duration =
      currentTimedDuration();


    timedActualDurationMs =
      auto
        ? duration
        : Math.min(
            now(),
            duration
          );


    elapsedMs =
      timedActualDurationMs;

    running =
      false;

    startedAt =
      0;

    timedFinished =
      true;


    setVisible(
      "timerFinishPanel",
      true
    );


    renderTimer();

    renderPerf();


    toast(
      auto
        ? "Temps terminé · ajoute la distance partielle"
        : "Test arrêté · ajoute la distance partielle"
    );

  }


  /* =========================================================
     CALCUL VMA
  ========================================================= */

  function calculateVma(
    distanceM,
    durationMs,
    protocol
  ) {

    const averageSpeed =
      spd(
        distanceM,
        durationMs
      );


    /*
      Demi-Cooper :
      sur 6 minutes, la vitesse moyenne
      correspond directement à distance / 100.
    */

    if (
      protocol === "6"
    ) {

      return averageSpeed;

    }


    /*
      Cooper 12 minutes :
      estimation VO2max classique de Cooper,
      puis conversion indicative en VMA
      avec VMA ≈ VO2max / 3,5.
    */

    if (
      protocol === "12"
    ) {

      const vo2max =
        (
          distanceM -
          504.9
        ) /
        44.73;


      if (
        !Number.isFinite(vo2max) ||
        vo2max <= 0
      ) {

        return averageSpeed;

      }


      return (
        vo2max /
        3.5
      );

    }


    /*
  Durée personnalisée :
  pas de protocole VMA standard.
  On ne calcule donc pas de VMA.
*/

return null;
  }


  function validateTimedResult() {

    if (
      !isTimed() ||
      !timedFinished
    ) {

      return;

    }


    const r =
      activeRunner();


    if (!r) {

      return toast(
        "Aucun coureur sélectionné."
      );

    }


    const track =
      currentTrackDistance();


    const partial =
      Math.max(
        0,
        +$("partialDistance").value ||
        0
      );


    if (
      partial >= track
    ) {

      return toast(
        `La distance partielle doit être inférieure à ${track} m.`
      );

    }


    const durationMs =
      timedActualDurationMs ||
      currentTimedDuration();


    const totalDistance =
      timedLapCount *
      track +
      partial;


    if (
      totalDistance <= 0
    ) {

      return toast(
        "Aucune distance enregistrée."
      );

    }


    const speed =
      spd(
        totalDistance,
        durationMs
      );


    const vma =
      state.trainingTool === "vma"
        ? calculateVma(
            totalDistance,
            durationMs,
            state.vmaProtocol
          )
        : null;


    const protocolName =
      state.vmaProtocol === "6"
        ? "Demi-Cooper"
        : state.vmaProtocol === "12"
          ? "Cooper"
          : "Test personnalisé";


    state.timedRuns =
      state.timedRuns.filter(
        x =>
          !(
            x.runnerId === r.id &&
            x.tool ===
            state.trainingTool
          )
      );


    state.timedRuns.push({

      id:
        uid(),

      runnerId:
        r.id,

      runnerName:
        r.name,

      tool:
        state.trainingTool,

      protocol:
        state.trainingTool === "vma"
          ? state.vmaProtocol
          : null,

      protocolName:
        state.trainingTool === "vma"
          ? protocolName
          : null,

      durationMs,

      trackDistance:
        track,

      laps:
        timedLapCount,

      partialDistance:
        partial,

      totalDistance,

      speed,

      vma,

      createdAt:
        new Date().toISOString()

    });


    save();


    setVisible(
      "timerFinishPanel",
      false
    );


    showTimedResult(
      r.id
    );


    const next =
      state.runners.find(
        x =>
          x.id !== r.id &&
          !timedRunFor(x.id)
      );


    if (next) {

      state.activeRunnerId =
        next.id;

      resetClock();

      resetTimedRuntime();

      save();


      toast(
        `${r.name} enregistré · au tour de ${next.name}`
      );

    } else {

      toast(
        "Résultat enregistré."
      );

    }


    renderPerf();

  }


  /* =========================================================
     RESET / SELECTION
  ========================================================= */

  function resetCurrent() {

    if (
      isSimple()
    ) {

      resetClock();

      renderPerf();

      return;

    }


    const r =
      activeRunner();


    if (!r) {
      return;
    }


    if (
      isTimed()
    ) {

      const existing =
        timedRunFor(r.id);


      if (
        (
          existing ||
          timedLapCount ||
          timedFinished
        ) &&
        !confirm(
          `Effacer le résultat de ${r.name} pour ce test ?`
        )
      ) {

        return;

      }


      state.timedRuns =
        state.timedRuns.filter(
          x =>
            !(
              x.runnerId === r.id &&
              x.tool === state.trainingTool
            )
        );


      resetClock();
      resetTimedRuntime();

      save();

      renderPerf();

      return;

    }


    if (
      rr(r.id).length &&
      !confirm(
        `Effacer les temps de ${r.name} pour cette course ?`
      )
    ) {

      return;

    }


    state.results =
      state.results.filter(
        x =>
          !(
            x.runnerId === r.id &&
            x.race === state.activeRace
          )
      );


    resetClock();

    save();

    renderPerf();

  }


  function setActive(id) {

    if (
      running
    ) {

      return toast(
        "Termine la course avant de changer de coureur."
      );

    }


    state.activeRunnerId =
      id;


    resetClock();


    if (
      isTimed()
    ) {

      resetTimedRuntime();

    }


    save();

    renderPerf();

  }


  function setRace(race) {

    if (
      running
    ) {

      return toast(
        "Termine la course en cours."
      );

    }


    if (
      state.mode === "ccf" &&
      race === 2 &&
      !allDone(1)
    ) {

      return toast(
        "Termine d’abord le 800 m n°1 des deux coureurs."
      );

    }


    state.activeRace =
      race;


    state.activeRunnerId =
      state.runners.find(
        r =>
          !done(
            r.id,
            race
          )
      )?.id ||
      state.runners[0]?.id ||
      null;


    resetClock();

    save();

    renderPerf();

  }


  /* =========================================================
     AFFICHAGE CHRONO
  ========================================================= */

  function renderTimer() {

    const r =
      activeRunner();


    if (
      isTimed()
    ) {

      const duration =
        currentTimedDuration();


      const left =
        Math.max(
          0,
          duration -
          now()
        );


      $("mainTime").textContent =
        fmtClock(left);


      if (
        running &&
        left <= 0 &&
        !timedFinished
      ) {

        finishTimedRun(true);

        return;

      }

    } else {

      $("mainTime").textContent =
        fmt(
          now()
        );

    }


    if (
      isSimple()
    ) {

      $("timerLabel").textContent =
        "Chrono simple";


      setVisible(
        "activeRunnerBanner",
        false
      );


      setVisible(
        "timerRunInfo",
        false
      );


      setVisible(
        "startBtn",
        !running
      );


      setVisible(
        "stopBtn",
        running
      );


      setVisible(
        "lapBtn",
        false
      );


      setVisible(
        "timerLapBtn",
        false
      );


      setVisible(
        "undoTimerLapBtn",
        false
      );


      $("startBtn").disabled =
        running;


    } else if (
      isTimed()
    ) {

      $("timerLabel").textContent =

        state.trainingTool === "vma"

          ? state.vmaProtocol === "6"
            ? "Demi-Cooper · 6 min"

            : state.vmaProtocol === "12"
              ? "Cooper · 12 min"

              : "Test VMA personnalisé"

          : "Minuteur";


      setVisible(
        "activeRunnerBanner",
        true
      );


      setVisible(
        "timerRunInfo",
        true
      );


      setVisible(
        "startBtn",
        !running &&
        !timedFinished
      );


      setVisible(
        "stopBtn",
        running
      );


      setVisible(
        "lapBtn",
        false
      );


      setVisible(
        "timerLapBtn",
        true
      );


      $("timerLapBtn").disabled =
        !running;


      $("undoTimerLapBtn").disabled =
        timedLapCount <= 0 ||
        timedFinished;


      setVisible(
        "undoTimerLapBtn",
        true
      );


      $("timerLapCount").textContent =
        String(
          timedLapCount
        );


      const distance =
        timedLapCount *
        currentTrackDistance();


      $("timerDistanceCount").textContent =
        `${distance} m`;


      $("timerSpeedDisplay").textContent =
  running
    ? "Calcul à la fin"
    : "—";

    } else {

      $("timerLabel").textContent =
        "Chronomètre";


      setVisible(
        "activeRunnerBanner",
        true
      );


      setVisible(
        "timerRunInfo",
        false
      );


      setVisible(
        "startBtn",
        true
      );


      setVisible(
        "stopBtn",
        false
      );


      setVisible(
        "lapBtn",
        true
      );


      setVisible(
        "timerLapBtn",
        false
      );


      setVisible(
        "undoTimerLapBtn",
        false
      );


      $("startBtn").textContent =
        running
          ? "EN COURS"
          : "DÉPART";


      $("startBtn").disabled =
        running ||
        !r ||
        done(r.id);


      $("lapBtn").disabled =
        !running ||
        !r;

    }


    const p =
      $("statusPill");


    p.className =
      `statusPill ${
        running
          ? "running"
          : "idle"
      }`;


    p.textContent =
      running
        ? "En cours"
        : timedFinished
          ? "Terminé"
          : "Prêt";


    if (
      !isSimple() &&
      r
    ) {

      let proj =
        null;


      let activity =
        "Course";


      if (
        state.mode === "ccf"
      ) {

        proj =
          state.activeRace === 1
            ? r.project1Ms
            : r.project2Ms;


        activity =
          `800 n°${state.activeRace}`;


      } else if (
        isChrono()
      ) {

        proj =
          state.targetMs;


      } else if (
        state.trainingTool === "timer"
      ) {

        activity =
          `Minuteur · piste ${state.trackDistance} m`;


      } else if (
        state.trainingTool === "vma"
      ) {

        activity =
          `${
            state.vmaProtocol === "6"
              ? "Demi-Cooper"
              : state.vmaProtocol === "12"
                ? "Cooper"
                : "Test VMA"
          } · piste ${state.vmaTrackDistance} m`;

      }


      $("activeRunnerBanner").className =
        `activeRunnerBanner ${
          r.tone ||
          "green"
        }`;


      $("activeRunnerBanner").innerHTML =

        `<strong>${
          esc(
            r.last
              ? r.last.toUpperCase() +
                " " +
                r.first
              : r.name
          )
        }</strong>` +

        `<span>` +

        `${
          r.classroom
            ? esc(r.classroom) +
              " · "
            : ""
        }` +

        `${activity}` +

        `${
          proj
            ? ` · estimation ${fmt(proj)}`
            : ""
        }` +

        `</span>`;

    }

  }


  /* =========================================================
     CARTES COUREURS
  ========================================================= */

  function renderRunners() {

    const g =
      $("runnersGrid");


    if (!g) {
      return;
    }


    g.innerHTML =
      state.runners
        .map(
          (r,i) => {

            const isActive =
              r.id === state.activeRunnerId;


            let metric =
              "Prêt";


            let sub =
              "";


            let meta =
              "Course";


            let isDone =
              false;


            if (
              isTimed()
            ) {

              const tr =
                timedRunFor(r.id);


              isDone =
                !!tr;


              meta =
                state.trainingTool === "vma"

                  ? state.vmaProtocol === "6"
                    ? "Demi-Cooper"

                    : state.vmaProtocol === "12"
                      ? "Cooper"

                      : "Test VMA"

                  : "Minuteur / Tours";


              if (tr) {

                metric =
                  `${tr.totalDistance} m`;


                sub =
                  `${tr.speed.toFixed(1)} km/h` +

                  `${
                    tr.vma != null
                      ? ` · VMA ${tr.vma.toFixed(1)}`
                      : ""
                  }`;

              } else {

                sub =
                  isActive &&
                  timedLapCount

                    ? `${timedLapCount} tour(s) en cours`

                    : "Prêt à démarrer";

              }


            } else {

              const a =
                rr(r.id);


              const last =
                a.at(-1);


              isDone =
                done(r.id);


              const proj =
                state.mode === "training"
                  ? state.targetMs
                  : (
                      state.activeRace === 1
                        ? r.project1Ms
                        : r.project2Ms
                    );


              meta =
                state.mode === "ccf"
                  ? `800 n°${state.activeRace}`
                  : "Course";


              if (proj) {

                meta +=
                  ` · estimation ${fmt(proj)}`;

              }


              metric =
                last
                  ? fmt(last.cumulativeMs)
                  : "Prêt";


              sub =
                isDone
                  ? "Course terminée"
                  : `${a.length}/${requiredSplits()} passages enregistrés`;

            }


            return (

              `<button ` +

              `class="runnerCard runnerSelect ${
                r.tone ||
                (
                  i % 2
                    ? "blue"
                    : "green"
                )
              } ${
                isActive
                  ? "active"
                  : ""
              }" ` +

              `data-runner="${r.id}" ` +

              `${
                running &&
                !isActive
                  ? "disabled"
                  : ""
              }>` +

              `<span class="runnerName">${
                esc(
                  r.last
                    ? r.last.toUpperCase() +
                      " " +
                      r.first
                    : r.name
                )
              }</span>` +

              `<span class="runnerMeta">` +

              `${
                r.classroom
                  ? esc(r.classroom) +
                    " · "
                  : ""
              }` +

              `${meta}` +

              `</span>` +

              `<span class="runnerMainMetric">${metric}</span>` +

              `<span class="runnerSubMetric">${sub}</span>` +

              `</button>`

            );

          }
        )
        .join("");


    g.querySelectorAll(
      "[data-runner]"
    )
    .forEach(
      x =>
        x.onclick =
          () =>
            setActive(
              x.dataset.runner
            )
    );

  }


  /* =========================================================
     RESULTATS CHRONO CLASSIQUE
  ========================================================= */

  function renderResults() {

    const a =
      state.results;


    $("resultsEmpty").hidden =
      !!a.length;


    $("resultsTable")
      .classList
      .toggle(
        "hidden",
        !a.length
      );


    $("resultsBody").innerHTML =

      a
        .map(
          x =>

            `<tr>` +

            `<td><strong>${esc(x.runnerName)}</strong></td>` +

            `<td>${
              state.mode === "training"
                ? "—"
                : x.race
            }</td>` +

            `<td>${x.distance} m</td>` +

            `<td>${fmt(x.lapMs)}</td>` +

            `<td>${fmt(x.cumulativeMs)}</td>` +

            `<td>${x.speed.toFixed(1)} km/h</td>` +

            `<td class="${
              x.deltaMs < 0
                ? "deltaGood"
                : x.deltaMs > 0
                  ? "deltaBad"
                  : ""
            }">${signed(x.deltaMs)}</td>` +

            `</tr>`

        )
        .join("");

  }


  function renderStats() {

    const h =
      state.runners
        .map(
          r => {

            const a =
              state.results.filter(
                x =>
                  x.runnerId ===
                  r.id
              );


            if (!a.length) {
              return "";
            }


            const laps =
              a.map(
                x => x.lapMs
              );


            const last =
              a.at(-1);


            return (

              `<div class="statCard">` +

              `<h3>${esc(r.name)}</h3>` +

              `<div class="statRow">` +
              `<span>Dernier temps</span>` +
              `<strong>${fmt(last.cumulativeMs)}</strong>` +
              `</div>` +

              `<div class="statRow">` +
              `<span>Vitesse moy.</span>` +
              `<strong>${spd(last.distance,last.cumulativeMs).toFixed(1)} km/h</strong>` +
              `</div>` +

              `<div class="statRow">` +
              `<span>Meilleur passage</span>` +
              `<strong>${fmt(Math.min(...laps))}</strong>` +
              `</div>` +

              `<div class="statRow">` +
              `<span>Plus lent</span>` +
              `<strong>${fmt(Math.max(...laps))}</strong>` +
              `</div>` +

              `<div class="statRow">` +
              `<span>Écart</span>` +
              `<strong>${short(Math.max(...laps)-Math.min(...laps))}</strong>` +
              `</div>` +

              `</div>`

            );

          }
        )
        .join("");


    $("statsGrid").innerHTML =
      h;

  }


  /* =========================================================
     RESULTAT VMA / MINUTEUR
  ========================================================= */

  function showTimedResult(
    runnerId =
      state.activeRunnerId
  ) {

    if (
      !isTimed()
    ) {

      setVisible(
        "vmaResultPanel",
        false
      );

      return;

    }


    const tr =
      timedRunFor(
        runnerId
      );


    if (!tr) {

      setVisible(
        "vmaResultPanel",
        false
      );

      return;

    }


    setVisible(
      "vmaResultPanel",
      true
    );


    $("vmaResultDistance").textContent =
      `${tr.totalDistance} m`;


    $("vmaResultDuration").textContent =
      fmtClock(
        tr.durationMs
      );


    $("vmaResultSpeed").textContent =
      `${tr.speed.toFixed(1)} km/h`;


    const main =
      $("vmaResultValue")
        ?.closest(
          ".vmaMainResult"
        );


    if (
      state.trainingTool === "vma"
    ) {

      if (main) {
        main.classList.remove("hidden");
      }


      $("vmaResultValue").textContent =
        `${tr.vma.toFixed(1)} km/h`;


      const v =
        tr.vma;


      $("vmaTrainingSpeeds").innerHTML =

        `<div class="statRow">` +
        `<span>Protocole</span>` +
        `<strong>${esc(tr.protocolName || "Test VMA")}</strong>` +
        `</div>` +

        `<div class="statRow">` +
        `<span>80 % VMA</span>` +
        `<strong>${(v * .80).toFixed(1)} km/h</strong>` +
        `</div>` +

        `<div class="statRow">` +
        `<span>90 % VMA</span>` +
        `<strong>${(v * .90).toFixed(1)} km/h</strong>` +
        `</div>` +

        `<div class="statRow">` +
        `<span>100 % VMA</span>` +
        `<strong>${v.toFixed(1)} km/h</strong>` +
        `</div>` +

        `<div class="statRow">` +
        `<span>105 % VMA</span>` +
        `<strong>${(v * 1.05).toFixed(1)} km/h</strong>` +
        `</div>`;


    } else {

      if (main) {
        main.classList.add("hidden");
      }


      $("vmaTrainingSpeeds").innerHTML =

        `<div class="statRow">` +
        `<span>Tours complets</span>` +
        `<strong>${tr.laps}</strong>` +
        `</div>` +

        `<div class="statRow">` +
        `<span>Distance partielle</span>` +
        `<strong>${tr.partialDistance} m</strong>` +
        `</div>`;

    }

  }


  /* =========================================================
     QR CCF
  ========================================================= */

  function qrPayload(r,race) {

    const a =
      rr(
        r.id,
        race
      );


    if (
      a.length < 4
    ) {

      return null;

    }


    return {

      type:
        "DF_CCF_RESULT",

      v:
        1,

      resultId:
        `${r.externalId}-${race}-${Date.now()}`,

      studentId:
        r.externalId,

      last:
        r.last,

      first:
        r.first,

      classroom:
        r.classroom,

      sex:
        r.sex,

      race,

      project:
        fmt(
          race === 1
            ? r.project1Ms
            : r.project2Ms
        ),

      splits:
        a.map(
          x =>
            Math.round(
              x.cumulativeMs
            )
        ),

      totalMs:
        Math.round(
          a.at(-1).cumulativeMs
        ),

      createdAt:
        new Date().toISOString()

    };

  }


  function ensureQrDialog() {

    if (
      $("teacherQrDialog")
    ) {
      return;
    }


    const d =
      document.createElement(
        "dialog"
      );


    d.id =
      "teacherQrDialog";


    d.innerHTML =

      '<div class="dialogPanel">' +

      '<h3 id="teacherQrTitle">QR professeur</h3>' +

      '<div id="teacherQrBox" style="display:flex;justify-content:center;margin:18px"></div>' +

      '<p>À scanner dans DemiFond Scan CCF.</p>' +

      '<button id="teacherQrClose" class="btn soft full">Fermer</button>' +

      '</div>';


    document.body.appendChild(d);


    $("teacherQrClose").onclick =
      () =>
        d.close();

  }


  function showTeacherQR(
    rid,
    race
  ) {

    const r =
      state.runners.find(
        x =>
          x.id === rid
      );


    const payload =
      r &&
      qrPayload(
        r,
        race
      );


    if (!payload) {

      return toast(
        "Course non terminée."
      );

    }


    ensureQrDialog();


    $("teacherQrTitle").textContent =
      `${r.last.toUpperCase()} ${r.first} · 800 n°${race}`;


    const box =
      $("teacherQrBox");


    box.innerHTML =
      "";


    if (
      window.QRCode
    ) {

      new QRCode(
        box,
        {

          text:
            JSON.stringify(
              payload
            ),

          width:
            260,

          height:
            260,

          correctLevel:
            QRCode.CorrectLevel.M

        }
      );

    } else {

      box.innerHTML =
        '<p>Générateur QR indisponible. Ouvre une fois l’application avec Internet avant le cours.</p>';

    }


    $("teacherQrDialog").showModal();

  }


  function renderTeacherQrActions() {

    const host =
      $("teacherQrActions");


    if (!host) {
      return;
    }


    if (
      state.mode !== "ccf"
    ) {

      host.innerHTML =
        "";

      return;

    }


    host.innerHTML =
      state.runners
        .map(
          r => {

            const buttons =
              [1,2]
                .filter(
                  race =>
                    done(
                      r.id,
                      race
                    )
                )
                .map(
                  race =>

                    `<button ` +
                    `class="btn primary" ` +
                    `data-qr-runner="${r.id}" ` +
                    `data-qr-race="${race}">` +
                    `QR prof · ${esc(r.last.toUpperCase())} · 800 n°${race}` +
                    `</button>`

                )
                .join(" ");


            return buttons
              ? `<div style="margin-top:10px">${buttons}</div>`
              : "";

          }
        )
        .join("");


    host
      .querySelectorAll(
        "[data-qr-runner]"
      )
      .forEach(
        b =>

          b.onclick =
            () =>
              showTeacherQR(
                b.dataset.qrRunner,
                +b.dataset.qrRace
              )

      );

  }


  function renderCCF() {

    const box =
      $("ccfScores");


    if (
      state.mode !== "ccf"
    ) {

      box.classList.add("hidden");

      renderTeacherQrActions();

      return;

    }


    const cards =
      state.runners
        .map(
          r => {

            const s =
              ccfSummary(r);


            return s.complete

              ? `<div class="scoreCard">` +

                `<strong>${esc(r.name)}</strong>` +

                `<span>Meilleur 800 : ${fmt(s.best)}</span>` +

                `<span>Performance : <b>${s.perf.toFixed(2)} / 6</b></span>` +

                `<span>Régularité : <b>${s.reg.toFixed(2)} / 6</b></span>` +

                `<span class="scoreTotal">AFL1 : ${s.total.toFixed(2)} / 12</span>` +

                `</div>`

              : `<div class="scoreCard">` +

                `<strong>${esc(r.name)}</strong>` +

                `<span>En attente des deux 800 m.</span>` +

                `</div>`;

          }
        )
        .join("");


    box.innerHTML =

      `<h3>Note CCF — AFL1</h3>` +

      `<div class="scoreGrid">${cards}</div>`;


    box.classList.remove("hidden");


    $("teacherRevealBtn")
      .classList
      .add("hidden");


    renderTeacherQrActions();

  }


  /* =========================================================
     ECRAN PERFORMANCE
  ========================================================= */

  function renderPerf() {

    const ccf =
      state.mode === "ccf";


    if (
      isSimple()
    ) {

      $("perfRecap").innerHTML =
        `<span>Chrono simple</span>`;


    } else if (
      isTimed()
    ) {

      const toolLabel =

        state.trainingTool === "vma"

          ? state.vmaProtocol === "6"
            ? "Demi-Cooper"

            : state.vmaProtocol === "12"
              ? "Cooper"

              : "Test VMA personnalisé"

          : "Minuteur / Tours";


      $("perfRecap").innerHTML =

        `<span>${toolLabel}</span>` +

        `<span>${fmtClock(currentTimedDuration())}</span>` +

        `<span>Piste ${currentTrackDistance()} m</span>`;


    } else {

      $("perfRecap").innerHTML =

        `<span>${state.totalDistance} m</span>` +

        `<span>Inter. ${state.splitDistance} m</span>` +

        `${
          ccf
            ? `<span>800 n°${state.activeRace}</span>`
            : ""
        }`;

    }


    setVisible(
      "raceTabs",
      ccf
    );


    document
      .querySelectorAll(
        "[data-race]"
      )
      .forEach(
        x =>
          x.classList.toggle(
            "active",
            +x.dataset.race ===
            state.activeRace
          )
      );


    setVisible(
      "runnerPerformanceBlock",
      !isSimple()
    );


    setVisible(
      "resultsSection",
      ccf ||
      isChrono()
    );


    setVisible(
      "exportSection",

      !isSimple() &&
      (
        ccf ||
        isChrono() ||
        state.timedRuns.some(
          x =>
            x.tool ===
            state.trainingTool
        )
      )
    );


    if (
      !timedFinished
    ) {

      setVisible(
        "timerFinishPanel",
        false
      );

    }


    renderTimer();


    if (
      !isSimple()
    ) {

      renderRunners();

    }


    if (
      ccf ||
      isChrono()
    ) {

      renderResults();

      renderStats();

      renderCCF();

    } else {

      setVisible(
        "vmaResultPanel",
        false
      );


      showTimedResult();


      $("ccfScores")
        .classList
        .add("hidden");


      renderTeacherQrActions();

    }

  }


  function render() {

    $("setupPanel")
      .classList
      .toggle(
        "hidden",
        state.view !== "setup"
      );


    $("performancePanel")
      .classList
      .toggle(
        "hidden",
        state.view !== "performance"
      );


    state.view === "setup"
      ? renderSetup()
      : renderPerf();

  }


  /* =========================================================
     EXPORT
  ========================================================= */

  function selectedExportRunner() {

    return (
      state.runners.find(
        r =>
          r.id === exportRunnerId
      ) ||
      activeRunner() ||
      state.runners[0]
    );

  }


  function resultTextFor(r) {

    if (!r) {
      return "";
    }


    const head =

      `${
        r.last
          ? r.last.toUpperCase() +
            " " +
            r.first
          : r.name
      }` +

      `${
        r.classroom
          ? ` · ${r.classroom}`
          : ""
      }`;


    if (
      isTimed()
    ) {

      const tr =
        timedRunFor(
          r.id
        );


      if (!tr) {
        return head;
      }


      return (

        head +

        "\n" +

        `${
          tr.tool === "vma"
            ? tr.protocolName ||
              "Test VMA"
            : "Minuteur / Tours"
        }\n` +

        `Durée : ${fmtClock(tr.durationMs)}\n` +

        `Tours : ${tr.laps}\n` +

        `Distance : ${tr.totalDistance} m\n` +

        `Vitesse moyenne : ${tr.speed.toFixed(1)} km/h` +

        `${
          tr.vma != null
            ? `\nVMA estimée : ${tr.vma.toFixed(1)} km/h`
            : ""
        }`

      );

    }


    return (

      head +

      "\n" +

      state.results
        .filter(
          x =>
            x.runnerId === r.id
        )
        .map(
          x =>

            `${
              state.mode === "ccf"
                ? `800 n°${x.race} · `
                : ""
            }` +

            `${x.distance} m : ${fmt(x.lapMs)} · ` +

            `cumul ${fmt(x.cumulativeMs)} · ` +

            `${x.speed.toFixed(1)} km/h`

        )
        .join("\n")

    );

  }


  function prepareExportDialog() {

    const panel =
      $("carnetDialog")
        .querySelector(
          ".dialogPanel"
        );


    const old =
      $("exportRunnerChoices");


    if (old) {
      old.remove();
    }


    if (
      state.runners.length > 1
    ) {

      const d =
        document.createElement(
          "div"
        );


      d.id =
        "exportRunnerChoices";


      d.innerHTML =

        '<p><strong>Quels résultats veux-tu récupérer ?</strong></p>' +

        state.runners
          .map(
            r =>

              `<button ` +
              `type="button" ` +
              `class="choiceBtn exportRunnerChoice" ` +
              `data-export-runner="${r.id}">` +

              `<strong>${
                esc(
                  r.last
                    ? r.last.toUpperCase() +
                      " " +
                      r.first
                    : r.name
                )
              }</strong>` +

              `<span>${esc(r.classroom || "")}</span>` +

              `</button>`

          )
          .join("");


      panel.insertBefore(
        d,
        $("openCarnetBtn")
      );


      d.querySelectorAll(
        "[data-export-runner]"
      )
      .forEach(
        b => {

          b.onclick =
            () => {

              exportRunnerId =
                b.dataset.exportRunner;


              d.querySelectorAll(
                "button"
              )
              .forEach(
                x =>
                  x.classList.toggle(
                    "active",
                    x === b
                  )
              );

            };

        }
      );


    } else {

      exportRunnerId =
        state.runners[0]?.id ||
        null;

    }

  }


  async function openCarnet() {

    const r =
      selectedExportRunner();


    const text =
      resultTextFor(r);


    if (!r) {

      return toast(
        "Aucun coureur."
      );

    }


    try {

      await navigator
        .clipboard
        .writeText(text);

    } catch {}


    window.open(
      CARNET_URL,
      "_blank"
    );

  }


  function buildSheet() {

    const r =
      selectedExportRunner();


    if (!r) {
      return;
    }


    if (
      isTimed()
    ) {

      const tr =
        timedRunFor(
          r.id
        );


      if (!tr) {

        return toast(
          "Aucun résultat pour ce coureur."
        );

      }


      $("captureSheet").innerHTML =

        `<div class="captureTitle">` +

        `<h2>${
          esc(
            r.last
              ? r.last.toUpperCase() +
                " " +
                r.first
              : r.name
          )
        }</h2>` +

        `<p>${esc(r.classroom || "")} · ${new Date().toLocaleDateString("fr-FR")}</p>` +

        `</div>` +

        `<section class="captureRunner">` +

        `<table class="captureTable">` +

        `<tbody>` +

        `${
          tr.protocolName
            ? `<tr>` +
              `<th>Protocole</th>` +
              `<td>${esc(tr.protocolName)}</td>` +
              `</tr>`
            : ""
        }` +

        `<tr>` +
        `<th>Durée</th>` +
        `<td>${fmtClock(tr.durationMs)}</td>` +
        `</tr>` +

        `<tr>` +
        `<th>Tours</th>` +
        `<td>${tr.laps}</td>` +
        `</tr>` +

        `<tr>` +
        `<th>Distance</th>` +
        `<td>${tr.totalDistance} m</td>` +
        `</tr>` +

        `<tr>` +
        `<th>Vitesse moyenne</th>` +
        `<td>${tr.speed.toFixed(1)} km/h</td>` +
        `</tr>` +

        `${
          tr.vma != null
            ? `<tr>` +
              `<th>VMA estimée</th>` +
              `<td>${tr.vma.toFixed(1)} km/h</td>` +
              `</tr>`
            : ""
        }` +

        `</tbody>` +

        `</table>` +

        `</section>`;


    } else {

      $("captureSheet").innerHTML =

        `<div class="captureTitle">` +

        `<h2>${
          esc(
            r.last
              ? r.last.toUpperCase() +
                " " +
                r.first
              : r.name
          )
        }</h2>` +

        `<p>${esc(r.classroom || "")} · ${new Date().toLocaleDateString("fr-FR")}</p>` +

        `</div>` +

        `<section class="captureRunner">` +

        `<table class="captureTable">` +

        `<thead>` +

        `<tr>` +

        `<th>Course</th>` +

        `<th>Passage</th>` +

        `<th>Tour</th>` +

        `<th>Cumul</th>` +

        `<th>Vitesse</th>` +

        `</tr>` +

        `</thead>` +

        `<tbody>` +

        state.results
          .filter(
            x =>
              x.runnerId === r.id
          )
          .map(
            x =>

              `<tr>` +

              `<td>${
                state.mode === "ccf"
                  ? x.race
                  : "—"
              }</td>` +

              `<td>${x.distance} m</td>` +

              `<td>${fmt(x.lapMs)}</td>` +

              `<td>${fmt(x.cumulativeMs)}</td>` +

              `<td>${x.speed.toFixed(1)} km/h</td>` +

              `</tr>`

          )
          .join("") +

        `</tbody>` +

        `</table>` +

        `</section>`;

    }


    $("carnetDialog").close();

    $("sheetDialog").showModal();

  }


  /* =========================================================
     RECUPERATION CCF
  ========================================================= */

  function updateRecovery() {

    if (
      !state.recoveryStartedAt
    ) {

      $("recoveryDisplay").textContent =
        "";

      return;

    }


    const left =
      Math.max(
        0,
        720000 -
        (
          Date.now() -
          state.recoveryStartedAt
        )
      );


    $("recoveryDisplay").textContent =
      `Récupération : ${fmt(left)}`;


    clearTimeout(
      recoveryTimer
    );


    if (left) {

      recoveryTimer =
        setTimeout(
          updateRecovery,
          500
        );

    }

  }


  /* =========================================================
     EVENEMENTS
  ========================================================= */

  $("addRunnerBtn").onclick =
    addRunner;


  $("launchPerformanceBtn").onclick =
    launch;


  $("backSetupBtn").onclick =
    () => {

      if (running) {

        return toast(
          "Termine la course avant de revenir."
        );

      }


      state.view =
        "setup";


      resetClock();

      resetTimedRuntime();

      save();

      render();

    };


  $("startBtn").onclick =
    start;


  $("stopBtn").onclick =
    stopAction;


  $("lapBtn").onclick =
    recordLap;


  $("timerLapBtn").onclick =
    addTimedLap;


  $("undoTimerLapBtn").onclick =
    undoTimedLap;


  $("validatePartialDistanceBtn").onclick =
    validateTimedResult;


  $("resetBtn").onclick =
    resetCurrent;


  $("newSessionBtn").onclick =
    () => {

      if (
        !confirm(
          "Nouvelle séance ?"
        )
      ) {

        return;

      }


      state =
        base();


      resetClock();

      resetTimedRuntime();

      save();

      render();

    };


  $("undoBtn").onclick =
    () => {

      if (
        isTimed()
      ) {

        return undoTimedLap();

      }


      const r =
        activeRunner();


      const a =
        r
          ? rr(r.id)
          : [];


      if (
        !a.length
      ) {

        return;

      }


      const id =
        a.at(-1).id;


      state.results =
        state.results.filter(
          x =>
            x.id !== id
        );


      save();

      renderPerf();

    };


  $("carnetBtn").onclick =
    () => {

      prepareExportDialog();

      $("carnetDialog").showModal();

    };


  $("openCarnetBtn").onclick =
    openCarnet;


  $("saveLaterBtn").onclick =
    buildSheet;


  $("closeSheetBtn").onclick =
    () =>
      $("sheetDialog").close();


  $("shareSheetBtn").onclick =
    async () => {

      const r =
        selectedExportRunner();


      try {

        await navigator
          .share({

            title:
              "Chrono EPS",

            text:
              resultTextFor(r)

          });

      } catch {}

    };


  $("startRecoveryBtn").onclick =
    () => {

      if (
        state.mode === "ccf" &&
        !allDone(1)
      ) {

        return toast(
          "Termine d’abord le premier 800 des deux coureurs."
        );

      }


      state.recoveryStartedAt =
        Date.now();


      save();

      updateRecovery();

    };


  /* Mode principal */

  document
    .querySelectorAll(
      '[name="mode"]'
    )
    .forEach(
      x => {

        x.onchange =
          () => {

            if (!x.checked) {
              return;
            }


            state.mode =
              x.value;


            if (
              state.mode === "ccf"
            ) {

              state.totalDistance = 800;
              state.splitDistance = 200;
              state.displayMode = "cumulative";

            }


            save();

            renderSetup();

          };

      }
    );


  /* Outil entraînement */

  document
    .querySelectorAll(
      '[name="trainingTool"]'
    )
    .forEach(
      x => {

        x.onchange =
          () => {

            if (!x.checked) {
              return;
            }


            state.trainingTool =
              x.value;


            resetClock();

            resetTimedRuntime();

            save();

            renderSetup();

          };

      }
    );


  /* Chrono performance */

  $("totalDistance").onchange =
    () => {

      readConfig();

      save();

      renderSetup();

    };


  $("splitDistance").onchange =
    () => {

      readConfig();

      save();

      renderSetup();

    };


  [
    "displayMode",
    "targetTime",
    "customDistance",
    "customSplit"
  ]
  .forEach(
    id => {

      $(id).onchange =
        () => {

          readConfig();

          save();

          renderSetup();

        };

    }
  );


  /* Minuteur */

  $("timerDuration").onchange =
    () => {

      state.timerDurationChoice =
        $("timerDuration").value;


      if (
        state.timerDurationChoice !==
        "custom"
      ) {

        state.timerDurationMs =
          +state.timerDurationChoice *
          1000;

      }


      save();

      renderSetup();

    };


  $("customTimerDuration").onchange =
    () => {

      state.timerDurationChoice =
        "custom";


      state.timerDurationMs =
        Math.max(
          .5,
          +$("customTimerDuration").value ||
          6
        ) *
        60000;


      save();

      renderSetup();

    };


  $("trackDistance").onchange =
    () => {

      state.trackDistanceChoice =
        $("trackDistance").value;


      if (
        state.trackDistanceChoice !==
        "custom"
      ) {

        state.trackDistance =
          +state.trackDistanceChoice;

      }


      save();

      renderSetup();

    };


  $("customTrackDistance").onchange =
    () => {

      state.trackDistanceChoice =
        "custom";


      state.trackDistance =
        Math.max(
          10,
          +$("customTrackDistance").value ||
          300
        );


      save();

      renderSetup();

    };


  /* VMA */

  $("vmaProtocol").onchange =
    () => {

      state.vmaProtocol =
        $("vmaProtocol").value;


      if (
        state.vmaProtocol === "6"
      ) {

        state.vmaDurationMs =
          360000;

      } else if (
        state.vmaProtocol === "12"
      ) {

        state.vmaDurationMs =
          720000;

      }


      save();

      renderSetup();

    };


  $("vmaCustomDuration").onchange =
    () => {

      state.vmaProtocol =
        "custom";


      state.vmaDurationMs =
        Math.max(
          .5,
          +$("vmaCustomDuration").value ||
          6
        ) *
        60000;


      save();

      renderSetup();

    };


  $("vmaTrackDistance").onchange =
    () => {

      state.vmaTrackDistanceChoice =
        $("vmaTrackDistance").value;


      if (
        state.vmaTrackDistanceChoice !==
        "custom"
      ) {

        state.vmaTrackDistance =
          +state.vmaTrackDistanceChoice;

      }


      save();

      renderSetup();

    };


  $("vmaCustomTrackDistance").onchange =
    () => {

      state.vmaTrackDistanceChoice =
        "custom";


      state.vmaTrackDistance =
        Math.max(
          10,
          +$("vmaCustomTrackDistance").value ||
          300
        );


      save();

      renderSetup();

    };


  /* Courses CCF */

  document
    .querySelectorAll(
      "[data-race]"
    )
    .forEach(
      x =>

        x.onclick =
          () =>
            setRace(
              +x.dataset.race
            )

    );


  /* Réseau */

  window.addEventListener(
    "online",
    () =>
      $("offlineBadge").textContent =
        "En ligne"
  );


  window.addEventListener(
    "offline",
    () =>
      $("offlineBadge").textContent =
        "Hors ligne prêt"
  );


  /* Service worker */

  if (
    "serviceWorker" in navigator
  ) {

    navigator
      .serviceWorker
      .register(
        "/sw.js"
      );

  }


  /* Boucle chrono */

  function tick() {

    if (
      state.view ===
      "performance"
    ) {

      renderTimer();

    }


    requestAnimationFrame(
      tick
    );

  }


  render();

  tick();

  updateRecovery();

})();
