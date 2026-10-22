# Herald Central Database + Four Branch Sites

## What this package does

Herald now contains five connected web interfaces:

- **Main Herald:** `/app`
- **Branch 1:** `/branch-1`
- **Branch 2:** `/branch-2`
- **Branch 3:** `/branch-3`
- **Branch 4:** `/branch-4`

All five interfaces call the same Laravel API and the same MariaDB database on the central Herald computer. Branch laptops do **not** connect directly to MariaDB. They connect to Herald over the local network, which is safer and prevents conflicting copies of stock.

When a branch records a sale or item usage:

1. The branch sends one transaction to the central Herald server.
2. Laravel locks the affected inventory rows.
3. All requested quantities are validated together.
4. Stock is deducted in one database transaction.
5. Negative stock is rejected.
6. A transaction and sale audit record are saved.
7. Branch screens poll every 3 seconds.
8. The main Herald Inventory page detects the new shared-data version and refreshes automatically.

Stock requests submitted by a branch are saved in `supply_requests` and appear in the main Herald Supply Requests page.

---

## Requirements

### Central Herald computer

- Windows 10 or Windows 11
- XAMPP 8.2 or newer
- XAMPP MySQL/MariaDB running
- Connected to the same private Wi-Fi or LAN as all branch laptops
- The Herald server window must remain open while branches are using the system

### Four branch laptops

- A modern browser such as Chrome, Edge, or Firefox
- Connection to the same Wi-Fi or LAN as the central Herald computer
- No XAMPP, PHP, Node.js, or database installation is required

---

## Part 1 — Install on the central Herald computer

1. Extract the ZIP to a writable folder. Example:

   ```text
   C:\xampp\htdocs\herald-branch-system
   ```

2. Open **XAMPP Control Panel**.

3. Start **MySQL**. Start **Apache** only when you also need phpMyAdmin.

4. In the extracted Herald folder, double-click:

   ```text
   SETUP_XAMPP.bat
   ```

5. Wait for setup to complete. It will:
   - create or update the `herald` database;
   - run all database migrations;
   - add the branch-code and branch-sale tables;
   - create four branch locations and accounts;
   - seed opening inventory;
   - validate the Laravel routes.

6. Double-click:

   ```text
   ALLOW_NETWORK_ACCESS.bat
   ```

7. Approve the Windows administrator prompt. The script opens TCP port **8080** only for the **Private** network profile and the local subnet.

8. In Windows **Settings → Network & internet**, confirm the connected network profile is **Private**, not Public.

9. Double-click:

   ```text
   START_HERALD.bat
   ```

10. Keep the server window open. It prints one or more LAN addresses, such as:

    ```text
    LAN main site: http://192.168.1.20:8080/app
    ```

11. Use the displayed IP address in the branch URLs. Do not use `127.0.0.1` or `localhost` on another laptop; those addresses point back to that laptop itself.

---

## Part 2 — Open the five sites

Assume the central Herald computer prints this IP:

```text
192.168.1.20
```

Open these addresses:

| Site        | URL                                 |
| ----------- | ----------------------------------- |
| Main Herald | `http://192.168.1.20:8080/app`      |
| Branch 1    | `http://192.168.1.20:8080/branch-1` |
| Branch 2    | `http://192.168.1.20:8080/branch-2` |
| Branch 3    | `http://192.168.1.20:8080/branch-3` |
| Branch 4    | `http://192.168.1.20:8080/branch-4` |

Each branch URL is separate, but all of them use the central Herald API and database.

---

## Part 3 — Login accounts

The initial seeded password is:

```text
Password123!
```

| System         | Email                            |
| -------------- | -------------------------------- |
| Main admin     | `admin@franchisetitan.local`     |
| Main logistics | `logistics@franchisetitan.local` |
| Branch 1       | `branch1@herald.local`           |
| Branch 2       | `branch2@herald.local`           |
| Branch 3       | `branch3@herald.local`           |
| Branch 4       | `branch4@herald.local`           |

Change every default password before real use. A branch account is restricted to its assigned branch code and location. Logging a Branch 2 account into the Branch 1 URL is rejected.

---

## Part 4 — Test real-time deduction

1. On the central computer, log in to Main Herald as admin.
2. Open **Inventory**.
3. On a branch laptop, open its branch URL and log in.
4. In **Deduct sold or consumed stock**, enter a quantity for one or more products.
5. Add an optional receipt or shift note.
6. Click **Record deduction**.
7. The branch balance updates from the shared database.
8. The main Herald Inventory page detects the new inventory transaction and refreshes automatically.
9. Open another laptop on the same branch URL. It will show the updated balance during its next 3-second synchronization.

The deduction is atomic: if any item would become negative, none of the items in that sale are deducted.

---

## Part 5 — Test stock requests

1. On a branch site, locate **Request additional stock**.
2. Enter one or more requested quantities.
3. Optionally choose a target delivery date and add instructions.
4. Click **Submit stock request**.
5. On Main Herald, open **Supply Requests**.
6. The request appears with status **Submitted**.
7. Admin or Sales moves it to **Under Review** and **Endorsed**.
8. Logistics moves it through **Preparing**, **Dispatched**, **Delivered**, and **Completed**.
9. On completion, Herald deducts stock from the central warehouse and adds the fulfilled stock to the requesting branch.

---

## Part 6 — Recommended network settings

- Keep all devices on one trusted private LAN.
- Reserve the central computer's IP address in the router, or configure a static private IP. This prevents branch bookmarks from breaking after the IP changes.
- Do not forward port 8080 to the public internet.
- Do not give branch laptops the MariaDB root password.
- Back up the central database regularly.
- Keep the central Herald computer powered on and prevent sleep during operating hours.

---

## Troubleshooting

### Another laptop cannot open Herald

1. Confirm `START_HERALD.bat` is still running.
2. Confirm both computers are on the same Wi-Fi/LAN.
3. Use the LAN IP printed by the start script, not `localhost`.
4. Run `ALLOW_NETWORK_ACCESS.bat` as administrator again.
5. Confirm the Windows network profile is Private.
6. Test the health URL from the branch laptop:

   ```text
   http://192.168.1.87:8080/api/v1/health
   ```

### The branch can open the page but cannot log in

- Run `SETUP_XAMPP.bat` again so migrations and seed data are current.
- Use the branch email assigned to that exact URL.
- Confirm MySQL is running.

### Stock does not appear to change

- Confirm the transaction returned a success message.
- Refresh the branch manually using **Refresh now**.
- Open Main Herald → Inventory and clear any stock-status filter.
- Check Main Herald → Inventory Transactions through the API or database audit records.

### The server IP changes

- Run `START_HERALD.bat` and use the newly printed IP.
- Update branch bookmarks.
- Configure a DHCP reservation in the router for a permanent address.

---

## Production note

`php artisan serve` is suitable for local testing and a trusted internal demonstration network. For a permanent production deployment, use Apache or Nginx with HTTPS, point the document root to `backend/public`, use a dedicated least-privilege database account, change all seeded credentials, and follow `backend/docs/DEPLOYMENT.md`.
