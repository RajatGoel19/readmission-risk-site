/* SafeStay Hospital Check, patient-facing front-end
   Helps patients compare hospitals on avoidable 30-day readmissions, overall
   and by condition, using official CMS data. Plus a browser-side educational
   risk calculator. No data leaves the device. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fmt = (x, d = 3) => (x == null || isNaN(x) ? "…" : Number(x).toFixed(d));
  $("#yr").textContent = "2026";

  const CONDITIONS = [
    { key: "ALL", label: "All conditions" },
    { key: "HF", label: "Heart failure" },
    { key: "PN", label: "Pneumonia" },
    { key: "COPD", label: "COPD / lung" },
    { key: "AMI", label: "Heart attack" },
    { key: "CABG", label: "Bypass surgery" },
    { key: "HIP_KNEE", label: "Hip / knee replacement" },
  ];
  let selectedCond = "ALL";
  let FAC = [];

  // Full state name -> 2-letter code, so "florida" and "FL" both work
  const STATE_CODES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
    california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
    florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN",
    iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
    montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
    oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
    washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR" };

  function matchHospital(f, q) {
    const code = STATE_CODES[q];
    if (code) return f.state && f.state.toUpperCase() === code;       // full state name
    if (q.length === 2) return f.state && f.state.toLowerCase() === q; // 2-letter state code
    return f.name && f.name.toLowerCase().includes(q);                 // hospital name
  }

  const load = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([load("data/results.json"), load("data/web_model.json"), load("data/facilities.json")])
    .then(([res, model, facilities]) => {
      if (res) renderEvidence(res);
      if (model) buildCalculator(model);
      if (facilities) { FAC = facilities; wireLookup(); }
    });

  /* ---------- evidence / how-it-works numbers ---------- */
  function renderEvidence(res) {
    const robust = res.robust_cv || {};
    const overall = res.overall_model || {};
    const auc = robust.roc_auc_mean != null ? robust.roc_auc_mean : overall.cv_roc_auc;
    const ci = robust.ci95;
    const nh = res.n_hospitals;
    setText("h-nhosp", nh ? nh.toLocaleString() + "+" : "2,800+");
    setText("r-n", nh ? nh.toLocaleString() : "2,833");
    setText("r-auc", fmt(auc, 3));
    if (ci) setText("r-ci", `(95% CI ${fmt(ci[0], 2)}-${fmt(ci[1], 2)})`);
    const star = res.star_only_auc != null ? res.star_only_auc : 0.70;
    setText("r-star", fmt(star, 3));
    if (res.data_vintage) setText("foot-vintage", "Source: " + res.data_vintage);
  }
  function setText(id, t) { const e = document.getElementById(id); if (e) e.textContent = t; }

  /* ---------- hospital lookup (the patient centerpiece) ---------- */
  function ratingBand(ratio) {
    if (ratio == null || isNaN(ratio)) return ["na", "Not reported"];
    if (ratio < 0.97) return ["better", "Better than expected"];
    if (ratio > 1.03) return ["worse", "Worse than expected"];
    return ["avg", "About average"];
  }
  function ratioFor(f, cond) {
    if (cond === "ALL") return f.mean_err;
    return f.cond && f.cond[cond] != null ? f.cond[cond] : null;
  }

  function wireLookup() {
    // condition selector
    const bar = $("#condbar");
    bar.innerHTML = CONDITIONS.map((c) =>
      `<button class="condbtn${c.key === "ALL" ? " active" : ""}" data-k="${c.key}">${c.label}</button>`
    ).join("");
    bar.querySelectorAll(".condbtn").forEach((b) =>
      b.addEventListener("click", () => {
        selectedCond = b.dataset.k;
        bar.querySelectorAll(".condbtn").forEach((x) => x.classList.toggle("active", x === b));
        run();
      })
    );
    $("#search").addEventListener("input", run);
  }

  function run() {
    const out = $("#lookup-results");
    const q = $("#search").value.trim().toLowerCase();
    if (q.length < 2) {
      out.innerHTML = `<div class="row muted"><span>Start typing a hospital name or your state above…</span></div>`;
      return;
    }
    let hits = FAC.filter((f) => matchHospital(f, q));
    if (!hits.length) {
      out.innerHTML = `<div class="row muted"><span>No hospitals match “${q}”. Try a different spelling or your state's 2-letter code.</span></div>`;
      return;
    }
    // sort safest-first by the selected condition; un-reported sink to the bottom
    hits = hits
      .map((f) => ({ f, r: ratioFor(f, selectedCond) }))
      .sort((a, b) => {
        if (a.r == null && b.r == null) return 0;
        if (a.r == null) return 1;
        if (b.r == null) return -1;
        return a.r - b.r;
      })
      .slice(0, 40);

    const condLabel = CONDITIONS.find((c) => c.key === selectedCond).label;
    out.innerHTML = hits
      .map(({ f, r }) => {
        const [cls, lbl] = ratingBand(r);
        const star = f.star && f.star !== "NA" ? "★" + String(f.star) : "no star rating";
        const ratioTxt = r == null
          ? (selectedCond === "ALL" ? "" : `not reported for ${condLabel.toLowerCase()}`)
          : `readmission ratio ${r.toFixed(2)}${r > 1 ? " (above 1.0)" : ""}`;
        const ai = f.risk_prob != null ? `<div class="aiscore">AI risk score ${Math.round(f.risk_prob * 100)}%</div>` : "";
        return `<div class="row">
          <div><strong>${f.name}</strong>
            <div class="hosp-meta">${f.state} · ${f.type || ""} · ${star}</div>
            <div class="hosp-meta">${ratioTxt}</div>
          </div>
          <div style="text-align:right"><span class="badge ${cls}">${lbl}</span>${ai}</div>
        </div>`;
      })
      .join("");
  }

  /* ---------- educational "what makes a hospital safer" calculator ---------- */
  function buildCalculator(model) {
    const wrap = $("#calc-fields");
    if (!wrap) return;
    const META = {
      hcahps_discharge_info: { label: "How well the hospital explains discharge & home care", min: 70, max: 95, def: 86, step: 1 },
      psi_90: { label: "Rate of avoidable safety problems (lower is better)", min: 0.7, max: 1.4, def: 1.0, step: 0.01 },
      sir_mrsa: { label: "MRSA infection rate (lower is better)", min: 0, max: 2.5, def: 0.8, step: 0.05 },
      sir_clabsi: { label: "Bloodstream infection rate (lower is better)", min: 0, max: 2.5, def: 0.8, step: 0.05 },
      log_volume: { label: "How many patients the hospital treats", kind: "volume", min: 50, max: 8000, def: 1200, step: 50 },
    };
    const state = {};
    model.numeric.forEach((f) => {
      const m = META[f.name] || { label: f.name, min: 0, max: 100, def: f.median, step: 1 };
      state[f.name] = m.def;
      const id = "f_" + f.name;
      const el = document.createElement("div");
      el.className = "field";
      el.innerHTML = `<label>${m.label}: <span class="rangeval" id="${id}_v"></span></label>
        <input type="range" id="${id}" min="${m.min}" max="${m.max}" step="${m.step}" value="${m.def}"/>`;
      wrap.appendChild(el);
      const input = el.querySelector("input");
      const show = () => { document.getElementById(id + "_v").textContent = m.step < 1 ? state[f.name].toFixed(2) : Math.round(state[f.name]).toLocaleString(); };
      input.addEventListener("input", () => { state[f.name] = parseFloat(input.value); show(); compute(); });
      show();
    });
    model.categorical.forEach((c) => {
      if (c.name !== "ownership") return;
      const field = document.createElement("div");
      field.className = "field";
      const opts = Object.keys(c.levels);
      const def = opts.includes("Voluntary non-profit - Private") ? "Voluntary non-profit - Private" : opts[0];
      state[c.name] = def;
      field.innerHTML = `<label>Hospital ownership type</label><select id="sel_${c.name}">${opts.map((o) => `<option ${o === def ? "selected" : ""}>${o}</option>`).join("")}</select>`;
      wrap.appendChild(field);
      field.querySelector("select").addEventListener("change", (e) => { state[c.name] = e.target.value; compute(); });
    });

    function compute() {
      let z = model.intercept;
      model.numeric.forEach((f) => {
        let v = state[f.name];
        if (f.name === "log_volume") v = Math.log1p(v);
        z += f.coef * ((v - f.mean) / f.scale);
      });
      model.categorical.forEach((c) => { if (state[c.name] != null) z += c.levels[state[c.name]] || 0; });
      renderGauge(1 / (1 + Math.exp(-z)));
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
})();
