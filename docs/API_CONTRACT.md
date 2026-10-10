# RSVP / Guestbook API contract (frontend ⇄ Google Apps Script)

Endpoint: the Apps Script Web App URL (`https://script.google.com/macros/s/.../exec`), stored in `site/config.js` as `CONFIG.api.endpoint`.

## Transport
- POST with `Content-Type: text/plain;charset=utf-8` and a JSON string body (avoids CORS preflight, which Apps Script cannot answer).
- GET with query params.
- All responses are JSON via `ContentService` (`{ ok: boolean, ... }`). Errors: `{ ok:false, error:"Human-friendly message" }`.

## POST action=rsvp
```json
{
  "action": "rsvp",
  "name": "Full name (2–80 chars)",
  "phone": "Nigerian or intl phone, 7–20 chars of digits/+/spaces/-",
  "attendance": "accept" | "decline",
  "guests": 1,            // integer 1–5 when accept, 0 when decline (total incl. the guest)
  "event": "Church Ceremony & Reception" | "Church Ceremony only" | "Reception only",
  "message": "optional, ≤ 500 chars",
  "website": "",          // honeypot — must be empty
  "startedAt": 1765000000000, // ms epoch when form was rendered; reject if submitted < 3s later
  "clientId": "uuid"       // generated once per form fill; idempotency key
}
```
Response: `{ "ok": true, "reference": "FL-7K3Q9P", "duplicate": false }`
- If the same `clientId` was already stored, or the same normalised phone number already has an RSVP, return the existing reference with `duplicate: true` (do not add a row).

## POST action=guestbook
```json
{ "action": "guestbook", "name": "...", "message": "≤ 400 chars", "website": "", "startedAt": 0, "clientId": "uuid" }
```
Response: `{ "ok": true }` — stored with Approved = FALSE (pending moderation).

## GET ?action=guestbook
Response: `{ "ok": true, "entries": [ { "name": "...", "message": "...", "date": "2026-10-09" } ] }` — only rows with Approved = TRUE, newest first, max 50.

## GET ?action=ping
Response: `{ "ok": true }`

---

# Gift registry (added 2026-10-10)

The item list lives in the couple's Google Sheet, so they can add, edit or hide gifts without touching the website.

## Sheet "Registry" (auto-created + seeded on first use if missing)
| Col | Header | Notes |
|---|---|---|
| A | ID | short slug, e.g. `blender` (unique, a–z 0–9 -) |
| B | Gift | display name |
| C | Category | e.g. Kitchen / Dining / Home / Bedroom / Money |
| D | Quantity Wanted | integer; BLANK = unlimited (used for Cash gift) |
| E | Note | optional short note shown under the item |
| F | Show on Website | checkbox (TRUE = listed) |
| G | Chosen So Far | formula: COUNTIF('Gift Pledges'!D:D, A2) |

## Sheet "Gift Pledges"
A Date · B Guest Name · C Phone · D Item ID · E Gift · F Message · G Reference · (H Client ID, hidden)

## GET ?action=registry
`{ ok:true, items:[ { id, name, category, note, wanted: 1|null, chosen: 0, remaining: 1|null } ] }`
- Only rows with Show on Website = TRUE, in sheet order. `wanted`/`remaining` are null when unlimited.
- Cached ~30 s; the cache is cleared after every successful pledge.

## POST action=pledge
```json
{ "action":"pledge", "itemId":"blender", "name":"…", "phone":"…", "message":"optional ≤ 200",
  "website":"", "startedAt": 0, "clientId":"uuid" }
```
- Same validation / honeypot / timing / rate-limit / formula-injection rules as RSVP. Phone uses the same 7–15 digit rule.
- Unknown or hidden itemId → `{ ok:false, error:"That gift is no longer on the list." }`
- remaining === 0 → `{ ok:false, error:"Someone has just chosen this gift. Please pick another.", soldOut:true }`
- Same clientId already stored → return the existing reference with `duplicate:true`.
- Same phone + same itemId already stored → existing reference, `duplicate:true` (one person can pledge different items).
- Success: `{ ok:true, reference:"GF-XXXXXX", itemName:"Blender", remaining: 0|null, duplicate:false }`

## Seed items (Registry rows created when the sheet is first made)
| ID | Gift | Category | Qty |
|---|---|---|---|
| cash-gift | Cash gift | Money | (blank) — note: "Bank details are just below" |
| blender | Blender | Kitchen | 1 |
| tabletop-gas-cooker | Table-top gas cooker | Kitchen | 1 |
| air-fryer | Air fryer | Kitchen | 1 |
| microwave | Microwave oven | Kitchen | 1 |
| rice-cooker | Rice cooker | Kitchen | 1 |
| electric-kettle | Electric kettle | Kitchen | 1 |
| toaster | Sandwich maker / toaster | Kitchen | 1 |
| pressure-pot | Pressure pot | Kitchen | 1 |
| cookware-set | Non-stick pot set | Kitchen | 1 |
| food-flasks | Food flask set | Kitchen | 1 |
| dinner-set | Dinner set (plates & bowls) | Dining | 1 |
| cutlery-set | Cutlery set | Dining | 1 |
| glassware | Drinking glasses set | Dining | 1 |
| standing-fan | Rechargeable standing fan | Home | 1 |
| pressing-iron | Pressing iron | Home | 1 |
| water-dispenser | Water dispenser | Home | 1 |
| bedding-set | Bedsheet & duvet set | Bedroom | 2 |
| towel-set | Bath towel set | Bedroom | 2 |
