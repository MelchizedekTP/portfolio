# Portfolio website (GitHub Pages + Google Sheets)

A mobile-friendly site that reads and writes your Google Sheet directly. There is no server.
People sign in with Google, and the sheet's own sharing settings decide who can do what:

| Shared as | Can do |
|---|---|
| Editor | View, plus add/edit/delete transactions, add/rename stocks, and add cash-flow entries |
| Viewer | View only (the site shows a "view-only" note and hides the edit buttons) |
| Not shared | Nothing ("no access" message) |

## 1. Put the spreadsheet in Google Sheets
If the portfolio is still an .xlsx file, upload it to Google Drive and open it with **File → Save as Google Sheets**.
Copy the sheet ID from the URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## 2. Google Cloud setup (one time, about 10 minutes)
1. Go to https://console.cloud.google.com and create a project (e.g. "portfolio").
2. **APIs & Services → Library**: enable **Google Sheets API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External** (or **Internal** if everyone is on the same Google Workspace, e.g. your institute domain. Internal skips the warning and test-user limits).
   - Add the scope `.../auth/spreadsheets`.
   - While the app is in **Testing**, add every user's Gmail under **Test users** (up to 100).
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized JavaScript origins: `https://<your-github-username>.github.io`
     (add `http://localhost:8000` too if you want to test locally)
   - Authorized redirect URIs (for "Sign in without popup"): add the exact page address, e.g.
     `https://<your-github-username>.github.io/<repo>/` (with the trailing `/`). If people open
     `.../<repo>/index.html`, add that address as well.
   - Copy the **Client ID**.

## 3. Configure and publish
1. Open `index.html` and set the two values at the top of the script:
   ```js
   const CLIENT_ID = '1234-abc.apps.googleusercontent.com';
   const SHEET_ID  = '1AbC...xyz';
   ```
   Both are safe to make public. Access is enforced by Google sign-in plus sheet sharing.
2. Create a GitHub repo, add `index.html`, then go to **Settings → Pages → Deploy from branch → main / root**.
3. Open `https://<username>.github.io/<repo>/` on your phone. Tip: use "Add to Home screen" so it opens like an app.

## 4. Share the sheet
In Google Sheets, click **Share** and add each person as **Editor** (can update) or **Viewer** (read only).

## What the site writes, and where
| Action | Sheet cells |
|---|---|
| Buy / sell | Next empty row 5–30 on the stock's tab: B date, C/D buy qty and rate, E/F sell qty and rate |
| Delete transaction | Rows below it move up one (your formulas in G–M are untouched) |
| Add stock | Uses the next empty slot tab (7, 8, 9…), renames it, writes B1 (name) and D1 (code), fills the Dash Temp row, and updates `mem!C4`. If no slot is left, it copies an existing stock tab and clears its transactions |
| Rename stock / change code | Renames the tab, writes B1 and D1, and updates the Dash Temp row |
| Deposit / withdraw | Next empty row 3–27 on CAGR: date, amount (deposits negative), and DEP/WIT |

Dates are written as `=DATE(y,m,d)`, so they are correct whatever the sheet's locale is.

## Notes
- Your Apps Script `onEdit` keeps working for edits made inside Google Sheets. It does **not** run for edits from the website (Google never fires simple triggers for API edits), which is why the site does the rename and dashboard update itself.
- In Testing mode, Google asks users to re-approve about every 7 days. To avoid that, publish the consent screen, or use Internal with Workspace.
- Live prices come from GOOGLEFINANCE inside the sheet. Use the refresh button to pull the latest values.
