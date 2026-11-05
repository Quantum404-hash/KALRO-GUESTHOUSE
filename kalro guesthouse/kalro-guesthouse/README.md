# KALRO Guesthouse system

Rooms, bookings, check-in/out, events, lounge/hall reservations, invoices and payments, reports, users and an audit log.
No `npm install` needed: it uses only what ships with Node.js.

## Run it
1. Install Node.js 22.13 or newer (https://nodejs.org, LTS or Current).
2. Windows: double-click `start.bat`. Anywhere else: `npm start`.
3. Open http://localhost:3000. Other computers on the same network use `http://<this-computer's-IP>:3000`.

The first start loads KALRO's real 26 rooms (names, types and prices from the guesthouse notebook), the four default logins, and nothing else: no made-up guests, events or prices.

## Prices (set in the system, editable by a manager)
| Room type | Beds | Per night (breakfast included) |
|---|---|---|
| Single (S) | 5x6 | KES 1,800 |
| Executive (E) | 6x6 | KES 2,000 |
| Double (D) | double | KES 1,800 for one guest, KES 3,000 for two |

Dinner is KES 500 per guest per night. Choose "Bed, breakfast and dinner" on a booking and the invoice gets a dinner line automatically, or press **Add dinner** on any invoice. The dinner price is under **Lounge & amenities, Meal prices**.

## Events
Event details are confidential, so there are no sample events. Staff press **New event** when a request arrives (email, LPO or invoice) and write its reference in the Reference field.

## Other ways to start
- `npm run demo`: practice mode with invented rooms, guests, events and venues (erases the database first).
- `npm run empty`: no rooms at all; add your own under **Rooms & inventory**.
- `npm run clean` (or `start-clean.bat` on Windows): erase everything and start again with the 26 real rooms.

## Changing rooms later
Sign in as `admin` or `manager`, open **Rooms & inventory**. Click a room to edit its name, type, prices or how many guests it sleeps, put it in Maintenance/Blocked, or delete it (only if it never had a booking). **Add many rooms** accepts pasted Excel rows with the columns
`Room number, Type, Floor, Beds, View, Rate per night, Name, Rate for 2 guests, Guests it sleeps` (the last three are optional).
Lounge, hall and service prices are added by a manager under **Lounge & amenities** (none are pre-filled).

## Default logins (change them first, under Users & roles)
| Username | Password | Role |
|---|---|---|
| admin | admin123 | Administrator: everything |
| manager | manager123 | Manager: everything except users |
| reception | reception123 | Front desk: bookings, check-in/out, events, amenities, charges, payments |
| finance | finance123 | Finance: invoices, payments, reports |

## Forgot a password
- Staff: ask an administrator to reset it under **Users & roles, Edit**.
- Administrator locked out: stop nothing, open a terminal in the project folder and run
  `node src/reset-password.js admin NewPassword123` (use the real username and a new password of 8+ characters).

## Where things are
- `data/kalro.db`: the whole database (one file, copy it to back up). `data/secret.key`: login signing key. Keep both private.
- `src/`: server (API, rules, billing). `public/`: the screens.
- Room list, rates and amenities are set in `src/seed.js` (first run only); afterwards rates change in the app.

## Before real use
- Change all four default passwords; disable accounts you don't need.
- Run it on one office computer or server, and back up `data/` regularly.
- For access over the internet put it behind HTTPS (e.g. a reverse proxy); don't expose port 3000 directly.

## Learn how it works
See `LEARN.md` for a guided walkthrough, and `tests/` for runnable examples of every rule.
