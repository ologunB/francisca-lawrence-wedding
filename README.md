# Francisca & Lawrence: Wedding Website

Wedding website for **Francisca Oluwadamilola & Lawrence Oluwatobi**, Saturday 19 December 2026, St. Gregory Catholic Church, Moniya, Ibadan. The reception is at Idunnu Hall Event Centre, immediately after the Mass.

| Version | Folder | Live |
|---|---|---|
| v1: envelope intro, script names, espresso & gold | `site-v1/` | https://francisca-and-lawrence-v1.vercel.app |
| v2: simplified, light and minimal | `site-v2/` | https://francisca-and-lawrence-v2.vercel.app |
| Main link | (currently v1) | https://francisca-and-lawrence.vercel.app |

## What's inside

- **`site-v1/`, `site-v2/`**: static sites (HTML, CSS, vanilla JS). No build step.
  - Features: envelope intro, countdown, invitation, scripture, wedding details with directions and calendar files, gallery, RSVP form, gift registry with bank details, guestbook, WhatsApp share and help.
- **`backend/`**: a Google Apps Script bound to a private Google Sheet. It stores RSVPs, guestbook wishes and gift pledges, and serves the gift list.
  - Managed with [clasp](https://github.com/google/clasp).
  - Tests: `node backend/tests.js`.
- **`docs/`**:
  - `DEPLOY.md`: setup, day-to-day use and the gift registry.
  - `API_CONTRACT.md`: the website ⇄ backend API.

## Editing content

Almost everything guests read lives in each site's **`config.js`**. Edit both folders if you're keeping both versions in sync. That includes the reception, RSVP deadline, bank details, WhatsApp contact, announcements, story and gallery.

The gift list itself is edited in the Google Sheet's **Registry** tab. The site picks up changes within about 30 seconds.

## Deploying

```bash
cd site-v1 && vercel deploy --prod   # or site-v2
```

After changing the backend:

```bash
cd backend && npx @google/clasp push && npx @google/clasp update-deployment <deploymentId>
```

Update the existing deployment (don't create a new one) so the `/exec` URL stays the same.

## Privacy

The Google Sheet is private. The public web-app endpoint can only submit RSVPs, wishes and pledges, and read the gift list and approved guestbook wishes. It never exposes the sheet's contents.
