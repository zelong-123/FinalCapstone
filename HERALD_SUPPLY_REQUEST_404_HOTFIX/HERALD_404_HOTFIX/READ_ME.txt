HERALD SUPPLY REQUEST 404 HOTFIX

This fixes the 404 that appears after changing a supply-request action.

Cause:
The live synchronization script was performing a full browser reload on the React route /app/supply-requests. On the affected installation, the server did not catch that refreshed route.

Install:
1. Close START_HERALD.bat.
2. Extract this ZIP.
3. Open HERALD_404_HOTFIX.
4. Double-click APPLY_404_FIX.bat.
5. When asked, paste the Herald project folder path.
6. Start Herald again.
7. Open /app and press Ctrl+F5.

The hotfix preserves the database, stock, users, requests, and passwords.
