# Readmission Risk AI, public research website

Static site (no build step) for the Hospital Readmission Risk AI research
project. Presents the problem's national importance, the interpretable
methodology, validated results, disease-specific risk, a **live in-browser risk
calculator**, and a hospital-risk lookup.

## Contents
```
index.html        single-page site
css/style.css     theme (navy + teal)
js/app.js         loads results + model JSON; calculator + lookup
assets/figures/   model figures (PNG)
data/
  results.json    copy of the model's results_summary.json
  web_model.json  JS-portable logistic model (client-side calculator)
  facilities.json compact facility risk lookup table
```
All numbers load live from `data/results.json`, regenerate the model and copy
the file to keep the site in sync.

## Run locally
```bash
cd site && python -m http.server 8000   # open http://localhost:8000
```

## Deploy (GitHub Pages, free)
Push the contents of `site/` to a **public** repository and enable Pages
(Settings → Pages → Deploy from branch → root). The page is fully static; the
risk calculator runs entirely client-side, so no server or patient data is
involved.

*Research and educational use only. Not a medical device.*
