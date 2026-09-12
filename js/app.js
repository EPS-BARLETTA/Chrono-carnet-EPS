"use strict";
(() => {
  const CARNET_URL = "https://carnetentrainementv2.vercel.app/";
  const STORAGE_KEY = "chronoCarnetEPS_v1";
  const $ = (id) => document.getElementById(id);
  const nowMs = () => performance.now();

  const state = loadState();
  let rafId = null;

  function baseState() {
    return {
      started: false,
      running: false,
      startedAt: 0,
      accumulatedMs: 0,
      runners: [],
      results: [],
      sessionLabel: "Séance chrono"
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return baseState();
      const parsed = JSON.parse(raw);
      return {
        ...baseState(),
        ...parsed,
        running: false,
        startedAt: 0,
        runners: Array.isArray(parsed.runners) ? parsed.runners : [],
        results: Array.isArray(parsed.results) ? parsed.results : []
      };
    } catch {
      return baseState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      running: false,
      startedAt: 0
    }));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function elapsedMs() {
    return state.accumulatedMs + (state.running ? nowMs() - state.startedAt : 0);
  }

  function formatTime(ms) {
    ms = Math.max(0, Math.round(ms));
    const cs = Math.floor((ms % 1000) / 10);
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  function formatDateTime(ts) {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(ts));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function renderTimer() {
    $("mainTime").textContent = formatTime(elapsedMs());
    $("startBtn").textContent = state.running ? "En cours…" : (state.started ? "Reprendre" : "Démarrer");
    $("startBtn").disabled = state.running;
    $("pauseBtn").disabled = !state.running;
    const pill = $("statusPill");
    pill.className = `statusPill ${state.running ? "running" : state.started ? "paused" : "idle"}`;
    pill.textContent = state.running ? "En cours" : state.started ? "En pause" : "Prêt";
  }

  function tick() {
    renderTimer();
    rafId = requestAnimationFrame(tick);
  }

  function startTimer() {
    if (state.running) return;
    state.started = true;
    state.running = true;
    state.startedAt = nowMs();
    renderTimer();
  }

  function pauseTimer() {
    if (!state.running) return;
    state.accumulatedMs += nowMs() - state.startedAt;
    state.startedAt = 0;
    state.running = false;
    saveState();
    renderTimer();
  }

  function resetTimer() {
    if (state.results.length && !confirm("Remettre le chrono à zéro ? Les passages déjà enregistrés restent conservés.")) return;
    state.started = false;
    state.running = false;
    state.startedAt = 0;
    state.accumulatedMs = 0;
    saveState();
    renderTimer();
  }

  function renderRunners() {
    const grid = $("runnersGrid");
    if (!state.runners.length) {
      grid.innerHTML = '<div class="empty compact">Ajoute au moins un coureur.</div>';
      return;
    }
    grid.innerHTML = state.runners.map((runner) => {
      const count = state.results.filter((r) => r.runnerId === runner.id).length;
      const last = [...state.results].reverse().find((r) => r.runnerId === runner.id);
      return `
        <button class="runnerCard" data-runner="${runner.id}">
          <span class="runnerName">${escapeHtml(runner.name)}</span>
          <span class="runnerMeta">${count} passage${count > 1 ? "s" : ""}${last ? ` · ${formatTime(last.cumulativeMs)}` : ""}</span>
          <span class="runnerTap">Enregistrer passage</span>
        </button>`;
    }).join("");

    grid.querySelectorAll("[data-runner]").forEach((button) => {
      button.addEventListener("click", () => recordPassage(button.dataset.runner));
    });
  }

  function addRunner() {
    const input = $("runnerName");
    const name = input.value.trim();
    if (!name) return;
    state.runners.push({ id: uid(), name });
    input.value = "";
    saveState();
    renderRunners();
  }

  function clearRunners() {
    if (!state.runners.length) return;
    if (!confirm("Supprimer tous les coureurs de cette séance ?")) return;
    state.runners = [];
    state.results = [];
    saveState();
    renderAll();
  }

  function recordPassage(runnerId) {
    const runner = state.runners.find((r) => r.id === runnerId);
    if (!runner) return;
    if (!state.started) startTimer();
    const cumulativeMs = elapsedMs();
    const runnerResults = state.results.filter((r) => r.runnerId === runnerId);
    const previous = runnerResults.length ? runnerResults[runnerResults.length - 1].cumulativeMs : 0;
    const lapMs = cumulativeMs - previous;
    state.results.push({
      id: uid(),
      runnerId,
      runnerName: runner.name,
      passage: runnerResults.length + 1,
      cumulativeMs,
      lapMs,
      recordedAt: Date.now()
    });
    saveState();
    renderRunners();
    renderResults();
    if (navigator.vibrate) navigator.vibrate(18);
  }

  function undoLast() {
    if (!state.results.length) return showToast("Aucun passage à annuler.");
    state.results.pop();
    saveState();
    renderRunners();
    renderResults();
    showToast("Dernier passage annulé.");
  }

  function renderResults() {
    const empty = $("resultsEmpty");
    const table = $("resultsTable");
    const body = $("resultsBody");
    if (!state.results.length) {
      empty.hidden = false;
      table.classList.add("hidden");
      body.innerHTML = "";
      return;
    }
    empty.hidden = true;
    table.classList.remove("hidden");
    body.innerHTML = state.results.map((result, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(result.runnerName)}</strong></td>
        <td>${result.passage}</td>
        <td>${formatTime(result.cumulativeMs)}</td>
        <td><strong>${formatTime(result.lapMs)}</strong></td>
      </tr>`).join("");
  }

  function buildCarnetContent() {
    const generated = new Date();
    const groups = state.runners.map((runner) => ({
      runner,
      results: state.results.filter((r) => r.runnerId === runner.id)
    })).filter((group) => group.results.length);

    const title = `Résultats chronométrés · ${generated.toLocaleDateString("fr-FR")}`;
    const rows = groups.flatMap(({ runner, results }, runnerIndex) => results.map((result, idx) => {
      const zebra = runnerIndex % 2 === 0 ? "#f8fafc" : "#ffffff";
      return `<tr style="background-color:${zebra}">
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:${idx === 0 ? "bold" : "normal"}">${escapeHtml(runner.name)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${result.passage}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center">${formatTime(result.cumulativeMs)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#15803d">${formatTime(result.lapMs)}</td>
      </tr>`;
    })).join("");

    const html = `
<h3 style="color:#4338ca;font-size:20px">${escapeHtml(title)}</h3>
<p><strong style="color:#0f172a">Séance :</strong> ${escapeHtml(state.sessionLabel)}</p>
<p><strong style="color:#0f172a">Chrono au moment de l’export :</strong> <span style="font-weight:bold;color:#15803d">${formatTime(elapsedMs())}</span></p>
<hr style="border:1px solid #e2e8f0">
<table style="border-collapse:collapse;width:100%;max-width:760px">
  <thead>
    <tr>
      <th style="background:linear-gradient(90deg,#4f46e5,#3b82f6);color:#ffffff;padding:8px 10px;text-align:left;border:1px solid #4338ca;font-weight:bold">Élève</th>
      <th style="background:linear-gradient(90deg,#4f46e5,#3b82f6);color:#ffffff;padding:8px 10px;text-align:center;border:1px solid #4338ca;font-weight:bold">Passage</th>
      <th style="background:linear-gradient(90deg,#4f46e5,#3b82f6);color:#ffffff;padding:8px 10px;text-align:center;border:1px solid #4338ca;font-weight:bold">Temps cumulé</th>
      <th style="background:linear-gradient(90deg,#4f46e5,#3b82f6);color:#ffffff;padding:8px 10px;text-align:center;border:1px solid #4338ca;font-weight:bold">Tour</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p><small style="color:#64748b">Exporté depuis Chrono Carnet EPS le ${escapeHtml(formatDateTime(generated.getTime()))}.</small></p>`.trim();

    const textLines = [
      title,
      `Séance : ${state.sessionLabel}`,
      `Chrono au moment de l’export : ${formatTime(elapsedMs())}`,
      ""
    ];
    groups.forEach(({ runner, results }) => {
      textLines.push(runner.name);
      results.forEach((result) => {
        textLines.push(`Passage ${result.passage} — cumulé ${formatTime(result.cumulativeMs)} — tour ${formatTime(result.lapMs)}`);
      });
      textLines.push("");
    });
    return { html, text: textLines.join("\n").trim() };
  }

  function copyToClipboard(html, text) {
    function handler(event) {
      event.clipboardData.setData("text/plain", text);
      event.clipboardData.setData("text/html", `<!--CARNET_RESULTS_V1-->${html}`);
      event.preventDefault();
    }
    document.addEventListener("copy", handler);
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", handler);
    return ok;
  }

  async function openCarnet() {
    if (!state.results.length) return showToast("Aucun résultat à copier.");
    const { html, text } = buildCarnetContent();
    let ok = copyToClipboard(html, text);
    if (!ok) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {}
    }
    $("carnetDialog").close();
    if (ok) showToast("Résultats copiés. Ouvre un champ du Carnet puis touche Coller.");
    window.open(CARNET_URL, "_blank");
  }

  function exportToFile(html, text, label) {
    const payload = {
      format: "carnet-contenu-externe",
      version: 1,
      generatedAt: new Date().toISOString(),
      html,
      text
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const safeLabel = (label || "contenu").replace(/[^a-z0-9-]+/gi, "-");
    const fileName = `carnet-${safeLabel}-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveForLater() {
    if (!state.results.length) return showToast("Aucun résultat à enregistrer.");
    const { html, text } = buildCarnetContent();
    exportToFile(html, text, "resultats-chrono");
    $("carnetDialog").close();
    showToast("Fichier enregistré. Importe-le plus tard dans le Carnet.");
  }

  function openCarnetDialog() {
    if (!state.results.length) return showToast("Enregistre au moins un passage.");
    $("carnetDialog").showModal();
  }

  function newSession() {
    if ((state.runners.length || state.results.length) && !confirm("Créer une nouvelle séance ? Les données actuelles seront effacées.")) return;
    Object.assign(state, baseState());
    saveState();
    renderAll();
  }

  function renderAll() {
    renderTimer();
    renderRunners();
    renderResults();
  }

  function bind() {
    $("startBtn").addEventListener("click", startTimer);
    $("pauseBtn").addEventListener("click", pauseTimer);
    $("resetBtn").addEventListener("click", resetTimer);
    $("addRunnerBtn").addEventListener("click", addRunner);
    $("runnerName").addEventListener("keydown", (event) => {
      if (event.key === "Enter") addRunner();
    });
    $("clearRunnersBtn").addEventListener("click", clearRunners);
    $("undoBtn").addEventListener("click", undoLast);
    $("carnetBtn").addEventListener("click", openCarnetDialog);
    $("openCarnetBtn").addEventListener("click", openCarnet);
    $("saveLaterBtn").addEventListener("click", saveForLater);
    $("newSessionBtn").addEventListener("click", newSession);
    window.addEventListener("beforeunload", () => {
      if (state.running) {
        state.accumulatedMs += nowMs() - state.startedAt;
        state.startedAt = 0;
        state.running = false;
      }
      saveState();
    });
  }

  bind();
  renderAll();
  tick();
})();
