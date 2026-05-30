# PhyEdit Human Study Static + Google Apps Script

This package is meant for public hosting on GitHub Pages, Netlify, Vercel, or any static file host. Annotators open tokenized links, complete 30 tasks, and submit once. The browser sends all answers to a Google Apps Script endpoint, which writes to Google Sheets and emails `hsulongman@gmail.com`.

## Files

- `index.html`: static survey UI.
- `config.js`: paste your Google Apps Script Web App URL here.
- `data/public_study.json`: public annotator-to-task assignment and task metadata. Tokens are distributed privately in invite links.
- `panels/`: 100 anonymized A/B panel images.
The Apps Script backend and private invite links are stored outside this upload folder, under `../private/`.

## Google Apps Script Setup

1. Create a Google Sheet.
2. Copy the Sheet ID from the URL.
3. Open `Extensions -> Apps Script`.
4. Paste `google_apps_script/Code.gs`.
5. Replace `PASTE_YOUR_SPREADSHEET_ID_HERE` with your Sheet ID.
6. Deploy: `Deploy -> New deployment -> Web app`.
7. Set:
   - Execute as: `Me`
   - Who has access: `Anyone`
8. Copy the Web App URL.
9. Paste it into `config.js` as `endpoint`.

The first successful submission creates two sheets:

- `responses`: one row per task answer.
- `submissions`: one row per participant completion.

## Host The Site

Upload this `site/` directory to a static host.

For GitHub Pages, commit these files to a repository and enable Pages. Then replace links in `invite_links_template.csv`:

```text
https://YOUR_DOMAIN_OR_IP
```

with your Pages URL in `../private/invite_links_private.csv`, for example:

```text
https://yourname.github.io/phyedit-human-study
```

## Important

The public static site intentionally does not include `assignment_key_private.csv`, so annotators cannot see which side is Ours.
