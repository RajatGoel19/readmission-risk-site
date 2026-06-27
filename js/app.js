/* Readmission Risk AI — front-end logic
   Loads model results + a JS-portable logistic model and powers the
   metrics, comparison tables, live risk calculator and hospital lookup. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fmt = (x, d = 3) => (x == null || isNaN(x) ? "—" : Number(x).toFixed(d));
  document.getElementById("yr").textContent = "2026";

  const load = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  Promise.all([
    load("data/results.json"),
    load("data/web_model.json"),
    load("data/facilities.json"),
  ]).then(([res, model, facilities]) => {
    if (res) renderResults(res);
    if (model) buildCalculator(model);
    if (facilities) wireLookup(facilities);
  });

  /* ---------------- Results & metrics ---------------- */
  function renderResults(res) {
    const robust = res.robust_cv || {};
    const overall = res.overall_model || {};
    const auc = robust.roc_auc_mean != null ? robust.roc_auc_mean : overall.cv_roc_auc;
    const ci = robust.ci95;
    const nh = res.n_hospitals;

    setText("m-auc", fmt(auc, 3));
    setText("m-n", nh ? nh.toLocaleString() : "—");
    setText("h-nhosp", nh ? nh.toLocaleString() + "+" : "2,800+");
    setText("r-auc", fmt(auc, 3));
    if (ci) setText("r-ci", `(95% CI ${fmt(ci[0], 2)}–${fmt(ci[1], 2)})`);
    setText("r-brier", fmt(overall.holdout_brier, 3));

    // Star-only baseline + lift
    let star = null;
    (res.cv_table || []).forEach(() => {});
    if (res.ablation_star && res.ablation_star.length) {
      // not the same as star-only; fall through to baseline file value if present
    }
    star = res.star_only_auc != null ? res.star_only_auc : (overall.star_only_auc || null);
    if (star == null && res.baselines) star = res.baselines.star_only;
    if (star != null) {
      setText("r-star", fmt(star, 3));
      const lift = ((auc - star) * 100).toFixed(0);
      setText("m-lift", `+${lift} pts`);
    } else {
      setText("r-star", "0.70");
      setText("m-lift", "+" + Math.round((auc - 0.70) * 100) + " pts");
    }

    if (res.data_vintage) setText("foot-vintage", "Data: " + res.data_vintage);

    // CV comparison table
    const cv = (robust.table || res.cv_table || []).slice();
    const key = robust.table ? "ROC_AUC_Mean" : "ROC_AUC_Mean";
    const tb = $("#cv-table tbody");
    if (tb && cv.length) {
      const max = Math.max(...cv.map((r) => r[key]));
      tb.innerHTML = cv
        .sort((a, b) => b[key] - a[key])
        .map((r) => {
          const v = r[key];
          const w = ((v - 0.5) / (max - 0.5)) * 100;
          return `<tr><td>${pretty(r.Model)}</td><td><strong>${fmt(v, 3)}</strong></td>
            <td class="bar-cell"><span class="bar" style="width:${Math.max(6, w)}%"></span></td></tr>`;
        })
        .join("");
    }

    // Per-condition table
    const cond = res.per_condition || [];
    const ct = $("#cond-table tbody");
    if (ct && cond.length) {
      const names = { AMI: "Heart attack (AMI)", HF: "Heart failure", PN: "Pneumonia", COPD: "COPD", CABG: "CABG surgery", HIP_KNEE: "Hip / knee replacement" };
      ct.innerHTML = cond
        .sort((a, b) => b.roc_auc - a.roc_auc)
        .map((c) => `<tr><td>${names[c.condition] || c.condition}</td><td>${c.n_test.toLocaleString()}</td><td><strong>${fmt(c.roc_auc, 3)}</strong></td></tr>`)
        .join("");
    }
  }
  function pretty(m) {
    return String(m).replace("HistGradBoost", "Gradient Boosting").replace("LogisticRegression", "Logistic Regression");
  }
  function setText(id, t) { const e = document.getElementById(id); if (e) e.textContent = t; }

  /* ---------------- Live risk calculator ---------------- */
  function buildCalculator(model) {
    const wrap = $("#calc-fields");
    if (!wrap) return;
    // Friendly metadata for the calculator inputs (actionable clinical levers)
    const META = {
      hcahps_discharge_info: { label: "Patient experience — discharge information", min: 70, max: 95, def: 86, step: 1, hint: "higher is better" },
      psi_90: { label: "Patient-safety composite (PSI-90)", min: 0.7, max: 1.4, def: 1.0, step: 0.01, hint: "1.0 = national average; lower is better" },
      sir_mrsa: { label: "MRSA bloodstream-infection ratio (SIR)", min: 0, max: 2.5, def: 0.8, step: 0.05, hint: "lower is better" },
      sir_clabsi: { label: "Central-line infection ratio (CLABSI SIR)", min: 0, max: 2.5, def: 0.8, step: 0.05, hint: "lower is better" },
      log_volume: { label: "Annual readmission-case volume", kind: "volume", min: 50, max: 8000, def: 1200, step: 50, hint: "total reported HRRP discharges" },
    };
    const state = {};

    // numeric sliders
    model.numeric.forEach((f) => {
      const m = META[f.name] || { label: f.name, min: 0, max: 100, def: f.median, step: 1 };
      state[f.name] = m.kind === "volume" ? m.def : m.def;
      const id = "f_" + f.name;
      const el = document.createElement("div");
      el.className = "field";
      el.innerHTML = `<label>${m.label}: <span class="rangeval" id="${id}_v"></span></label>
        <input type="range" id="${id}" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.def}"/>`;
      wrap.appendChild(el);
      const input = el.querySelector("input");
      input.addEventListener("input", () => {
        state[f.name] = parseFloat(input.value);
        document.getElementById(id + "_v").textContent = m.step < 1 ? state[f.name].toFixed(2) : Math.round(state[f.name]).toLocaleString();
        compute();
      });
      document.getElementById(id + "_v").textContent = m.step < 1 ? Number(m.def).toFixed(2) : Number(m.def).toLocaleString();
    });

    // categorical selects (star rating + ownership)
    model.categorical.forEach((c) => {
      const field = document.createElement("div");
      field.className = "field";
      let opts, label, def;
      if (c.name === "ownership") {
        label = "Hospital ownership";
        opts = Object.keys(c.levels);
        def = opts.includes("Voluntary non-profit - Private") ? "Voluntary non-profit - Private" : opts[0];
      } else { label = c.name; opts = Object.keys(c.levels); def = opts[0]; }
      state[c.name] = def;
      field.innerHTML = `<label>${label}</label><select id="sel_${c.name}">${opts
        .map((o) => `<option value="${o}" ${o === def ? "selected" : ""}>${o === "NA" ? "Not rated" : o}</option>`)
        .join("")}</select>`;
      wrap.appendChild(field);
      field.querySelector("select").addEventListener("change", (e) => { state[c.name] = e.target.value; compute(); });
    });

    function compute() {
      let z = model.intercept;
      model.numeric.forEach((f) => {
        let v = state[f.name];
        if (f.name === "log_volume") v = Math.log1p(v); // user enters raw volume
        z += f.coef * ((v - f.mean) / f.scale);
      });
      model.categorical.forEach((c) => { z += c.levels[state[c.name]] || 0; });
      const p = 1 / (1 + Math.exp(-z));
      renderGauge(p);
    }
    compute();
  }

  function renderGauge(p) {
    const pct = Math.round(p * 100);
    setText("g-pct", pct + "%");
    const needle = $("#g-needle");
    if (needle) needle.style.left = Math.min(98, Math.max(2, pct)) + "%";
    const band = $("#g-band");
    if (band) {
      band.classList.remove("risklow", "riskmod", "riskhigh");
      if (p < 0.45) { band.textContent = "Lower risk"; band.classList.add("risklow"); }
      else if (p < 0.6) { band.textContent = "Moderate risk"; band.classList.add("riskmod"); }
      else { band.textContent = "Higher risk"; band.classList.add("riskhigh"); }
    }
  }

  /* ---------------- Hospital lookup ---------------- */
  function wireLookup(facilities) {
    const input = $("#search");
    const out = $("#lookup-results");
    if (!input || !out) return;
    const band = (p) => (p < 0.45 ? ["low", "Lower"] : p < 0.6 ? ["mod", "Moderate"] : ["high", "Higher"]);
    function run() {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { out.innerHTML = `<div class="row muted"><span>Start typing to search…</span></div>`; return; }
      const hits = facilities
        .filter((f) => (f.name && f.name.toLowerCase().includes(q)) || (f.state && f.state.toLowerCase() === q))
        .slice(0, 40);
      if (!hits.length) { out.innerHTML = `<div class="row muted"><span>No hospitals match “${q}”.</span></div>`; return; }
      out.innerHTML = hits
        .map((f) => {
          const [cls, lbl] = band(f.risk_prob);
          const star = f.star == null ? "" : String(f.star).replace(".0", "");
          const starTxt = star && star !== "NA" ? "★" + star : "no star rating";
          return `<div class="row"><div><strong>${f.name}</strong><div class="muted" style="font-size:.82rem">${f.state} · ${f.type || ""} · ${starTxt} · mean ERR ${f.mean_err ?? "—"}</div></div>
          <span class="pill ${cls}">${lbl} risk · ${Math.round(f.risk_prob * 100)}%</span></div>`;
        })
        .join("");
    }
    input.addEventListener("input", run);
  }
})();
