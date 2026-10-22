# Herald Branch Reliability and Mobile Update

This package corrects the branch-entry problems reported after the first four-branch release.

## Corrections included

- Branch quantity inputs are no longer recreated during the three-second live refresh, so the cursor and typed value stay in place.
- Deduction and request quantities are whole units only.
- Every quantity control uses **−1** and **+1** buttons and rejects decimal quantities at both the page and API levels.
- A review screen appears before a deduction or stock request is submitted.
- If another laptop changes stock while an operator is entering a deduction, the page shows the new available balance and blocks an excessive deduction.
- The branch portal has a mobile card layout with larger touch controls and no required horizontal table scrolling.
- The main Herald site now has a separate **Branches** command panel for branch balances and deduction history.
- The main Inventory page is reserved for warehouse stock for Admin and Logistics users. Franchise users continue to see only their own location.
- Branch stock, recent deductions, open requests, low-stock items, and critical items refresh every three seconds.

## Where to open the new panel

After starting Herald, sign in to the main site as Admin or Logistics. A **Branches** link appears under **Operations**.

You can also open it directly:

```text
http://SERVER_IP:8080/branch-management
```

Replace `SERVER_IP` with the IPv4 address displayed by `START_HERALD.bat`.

## Updating an existing installation

The safest option is to back up the existing `backend/.env` file and database, then replace the old project folder with this complete package. Run `SETUP_XAMPP.bat` again without using the test reset file. Normal setup preserves existing operating data.

A smaller update-only ZIP is also supplied. Place its extracted `HERALD_UPDATE_V3` folder inside the existing Herald project folder and run `APPLY_UPDATE.bat` as described in that ZIP.
