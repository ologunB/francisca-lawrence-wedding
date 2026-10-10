# Deploying the Francisca & Lawrence wedding website

There are two parts:

1. **The RSVP database**: a private Google Sheet plus a small Google Apps Script that receives RSVPs and guestbook wishes. It is free.
2. **The website**: the static files in the `site-v1/` or `site-v2/` folder, hosted free on Netlify, Vercel, GitHub Pages or Cloudflare Pages.

Set up part 1 first, because the website needs the RSVP address (URL) it produces.

---

## 1. Set up the RSVP Google Sheet (about 10 minutes, done once)

### Step 1: Create the sheet
1. Go to <https://sheets.google.com> and sign in with the Google account that should **own** the RSVPs (the couple's account).
2. Click **Blank spreadsheet** and name it, for example **"F&L Wedding RSVPs"**.
3. **Do not share this sheet with guests.** It stays private. The website never needs it to be shared.

### Step 2: Add the script
1. In the sheet, click **Extensions → Apps Script**. A code editor opens in a new tab.
2. Delete everything in the `Code.gs` file shown there.
3. Open `backend/Code.js` from this project, copy **all** of it, and paste it into the editor.
4. *(Optional)* To get an email for every RSVP, find this line near the top
   `var NOTIFY_EMAIL = '';`
   and put your address between the quotes, e.g. `var NOTIFY_EMAIL = 'francisca@example.com';`
5. Click the **💾 Save** icon (or press Ctrl/Cmd + S). You can name the project "Wedding RSVP".

### Step 3: Run `setup()` once and authorise
1. In the toolbar's function drop-down (next to **▶ Run** and **Debug**), choose **`setup`**.
2. Click **▶ Run**.
3. Google asks for permission. Click **Review permissions**, choose your account, then click **Advanced → Go to Wedding RSVP (unsafe) → Allow**.
   *Google shows the "unsafe" warning for every personal script that hasn't been through Google's review. The script is yours and only touches this spreadsheet (plus email if you turned it on).*
4. When the log says *Execution completed*, go back to the sheet tab. You should now see three tabs:
   - **Dashboard**: live totals (responses, attending, declined, expected guests, per-event breakdown, pending guestbook wishes).
   - **RSVPs**: one row per RSVP, with columns A–H as specified (a hidden column I holds a technical ID; leave it alone).
   - **Guestbook**: wishes from guests, waiting for your approval.

You can run `setup` again at any time, for example if formatting gets messed up. It **never deletes** RSVPs or wishes.

### Step 4: Publish the script as a web app
1. In the Apps Script editor click **Deploy → New deployment**.
2. Click the ⚙️ gear next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** `RSVP v1`
   - **Execute as:** **Me** (your account, so the script can write to your private sheet)
   - **Who has access:** **Anyone** (so guests can submit without a Google login)
4. Click **Deploy** (authorise again if asked).
5. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy…/exec`.
   (Use the one ending in **/exec**, not /dev.)

### Step 5: Connect the website
1. Open `site-vX/config.js` and paste the URL as the API endpoint:
   ```js
   api: {
     endpoint: "https://script.google.com/macros/s/AKfy…/exec",
   },
   ```
2. Save the file and re-upload the site (see part 2).
3. **Test it:** open `YOUR-URL?action=ping` in a browser. You should see `{"ok":true}`. Then submit a test RSVP on the website and check that a row appears in the **RSVPs** tab. Delete the test row afterwards.

### Updating the script later (keeps the same URL)
If you change `Code.gs`, saving is **not** enough. The live web app keeps running the old version until you redeploy:
1. **Deploy → Manage deployments**.
2. Select your existing deployment and click the ✏️ **pencil (Edit)**.
3. Under **Version**, choose **New version**, then click **Deploy**.

The URL stays the same, so `config.js` doesn't need to change.
*(Don't use "New deployment" for updates. That creates a **different** URL.)*

---

## 2. Day-to-day use

### Approving guestbook wishes
1. Open the **Guestbook** tab.
2. Read the wish, then tick the **Approved** checkbox to show it on the website.
3. It appears on the site within about **1 minute** (the list is cached for speed). Untick the box to hide it again. To remove a wish permanently, delete its row.

### Gift registry
The gift list on the website comes from the **Registry** tab. The **Registry** and **Gift Pledges** tabs appear by themselves the first time someone opens the gift section of the site, already filled with the starter list. You don't need to run `setup()` again.

- **Edit a gift:** change its name, category, quantity or note in the **Registry** tab. The website shows the change within about **30 seconds**.
- **Hide a gift:** untick **Show on Website**. Tick it again to bring the gift back. Hiding is safer than deleting a row because it keeps the gift's pledges linked to it.
- **Add a gift:** type it on the first empty row. Give it an **ID** that's short and unique, using lowercase letters, numbers and dashes only (e.g. `stand-mixer`), plus a **Gift** name, then tick **Show on Website**. A row with no ID, no name or an invalid ID is ignored.
- **Quantity Wanted:** how many of that gift you'd like. Leave it **blank for unlimited**, as with the Cash gift.
- **Chosen So Far** is worked out automatically, so don't type in it. The website does its own count from the Gift Pledges tab when deciding what's still available.
- **Where pledges appear:** each choice adds a row to the **Gift Pledges** tab with the date, guest name, phone, gift, message and a `GF-` reference. To free a gift up again (for example if a guest changes their mind), delete that guest's row.
- Please don't rename the `Registry` / `Gift Pledges` tabs or reorder their columns. If you set `NOTIFY_EMAIL` in the script, you'll also get an email for every pledge.

### Exporting RSVPs to Excel or CSV
- **Excel:** open the **RSVPs** tab, then **File → Download → Microsoft Excel (.xlsx)**. This downloads all tabs.
- **CSV:** open the **RSVPs** tab, then **File → Download → Comma-separated values (.csv)**. This downloads only the tab you're looking at.
- To sort or filter, use the filter arrows on the header row (Data → Create a filter view lets you filter without changing what others see).

### Tips
- Please **don't rename** the `RSVPs` or `Guestbook` tabs, and don't reorder their columns. The script writes to them by position.
- You *can* add your own notes in extra columns to the right of column I, or add new tabs.
- Phone numbers are stored as text, so leading `0` and `+234` are kept.
- If a guest submits twice (same phone number, e.g. `0803…` and `+234 803…`), they get their original RSVP reference back and no duplicate row is added. If a guest needs to **change** their RSVP, edit their row directly in the sheet.

---

## 3. Security & trade-offs

**Why Google Sheets + Apps Script is fine at wedding scale**
- A wedding gets hundreds of guests and at most a few hundred submissions. Apps Script handles that easily. The relevant Google limits for a free account are about **30 simultaneous executions** and **6 minutes per execution** (each RSVP takes well under a second). Google's often-quoted **~20,000 URL Fetch calls/day** applies to the script calling *other* websites, which this script never does. Optional email is limited to about **100 emails/day** on a free account.
- It costs nothing, there is no server to maintain, and you can see and export your data in a familiar spreadsheet.

**What protects you**
- **The sheet is never exposed.** Guests only talk to the web app URL. The script runs as you, but it only exposes two narrow actions: "add an RSVP / wish" and "list *approved* wishes". No one can read RSVPs, phone numbers or unapproved wishes through it.
- **Nothing secret is in the website.** The `/exec` URL is public by design. It is "write-only" for RSVPs.
- **Every field is validated on the server**: name length, phone format, allowed attendance and event values, guests 1–5 (forced to 0 when declining), message length, and at most 2 links.
- **Spreadsheet formula injection is blocked.** Text starting with `= + - @` is stored as plain text.
- **Spam protection** uses a hidden "honeypot" field that bots fill in (they get a fake success and nothing is saved), a minimum time to fill the form (3 seconds), and a maximum form age (24 hours).
- **Rate limiting**: at most 30 submissions per minute overall, 5 attempts per phone number per 10 minutes, and 3 wishes per name per 10 minutes.
- **No duplicates or races**: writes happen one at a time (a lock), and duplicates are detected by form ID and by normalised phone number.

**Honest limitations**
- Apps Script **cannot see the visitor's IP address**, so there is no per-IP blocking. The global per-minute cap is the backstop.
- The spam protection stops casual bots, not a determined attacker who studies the form. The worst case is junk rows (easy to delete) or a few minutes where new RSVPs are briefly rejected by the global cap. Your data cannot be read or deleted through the website.
- Guestbook wishes only appear after you approve them, so nothing offensive goes public automatically.
- Apps Script responses take about 1–2 seconds. That is normal.

**When to switch to something like Supabase**
Move to a real database (e.g. **Supabase**: free tier, Postgres, row-level security) if you ever need **thousands of submissions** or heavy simultaneous traffic, **guest logins** (e.g. guests editing their own RSVP), **real-time** dashboards, or stronger abuse controls such as per-IP rate limits and CAPTCHA verification. For one wedding, Google Sheets is the simpler and more maintainable choice.

---

## 4. Hosting the website for free

The `site-v1/` or `site-v2/` folder is a plain static website (HTML/CSS/JS). It needs no build step. Pick **one** host:

| Host | How | Notes |
|---|---|---|
| **Netlify** (easiest) | Go to <https://app.netlify.com/drop> and drag the `site` folder onto the page. | Live in seconds. Create a free account to keep it and rename the address (e.g. `francisca-lawrence.netlify.app`). To update, drag the folder again under **Deploys**. |
| **Vercel** | <https://vercel.com>: **Add New → Project**, then import a GitHub repo or use the `vercel` CLI in the `site` folder. | Free `*.vercel.app` address. |
| **GitHub Pages** | Put the project on GitHub, then **Settings → Pages → Deploy from branch**, and choose the folder that contains `index.html`. | Free `username.github.io/repo` address. |
| **Cloudflare Pages** | <https://pages.cloudflare.com>: **Create → Upload assets**, then upload the `site` folder (or connect GitHub). | Very fast in Nigeria and worldwide. Free `*.pages.dev` address. |

All four support a custom domain (e.g. `franciscaandlawrence.com`, about ₦15–25k/year from any registrar) and free HTTPS.

After changing anything in `site-v1/` or `site-v2/` (photos, `config.js`), re-upload or push again to update the live site.

---

## Editing website content

Almost everything guests read lives in **`site-vX/config.js`**. Open it in any text editor (TextEdit in plain-text mode, Notepad, VS Code), change the text **between the quotation marks**, keep the commas at the ends of lines, save, then re-upload the site. Anything marked `PLACEHOLDER` still needs a real value.

> Tip: after editing, open the site and check the section you changed. If a whole section goes blank, a quote mark or comma was probably removed by accident; undo and try again.

### Reception venue and time (`reception`)
```js
reception: {
  confirmed: true,
  name: "Idunnu Hall Event Centre",
  address: "Ebenezer Estate, New Oyo Road, Moniya, Ibadan, Oyo State",
  landmark: "Near the Ayo Adeseun Ni-Met Station / Obafemi Awolowo Train Station, Moniya",
  time: "To follow after the church service",
  mapsUrl: "https://maps.app.goo.gl/..."
},
```
- `time`: replace with an exact time when you have one (e.g. `"2:00 PM"`).
- `mapsUrl`: in Google Maps, find the venue, then **Share → Copy link** and paste it here. Set it to `null` to hide the Directions button.
- If `address` or `time` is empty, the card shows "Details to follow" in its place. With `confirmed: false`, the card shows a "Venue Coming Soon" design instead.
- Also update the **Reception** line in `timeline` (the "Order of the Day") if the time changes.
- The church works the same way under `church` (`mapsUrl`, `directionsNote`).

### Bank details for gifts (`gifts`)
- Fill in `bankName`, `accountName` and `accountNumber` (10-digit NUBAN, digits only). The "Copy Account Number" button copies exactly what you type in `accountNumber`.
- `amounts` lists the suggested amounts in naira (no commas or ₦ sign), e.g. `[10000, 20000, 50000]`.
- `paystackUrl`: optional. Paste a Paystack payment-page link to show a "Give Online" button, or leave it as `""` to hide it.

### Photos (`gallery`)
1. Put the new photo in `site-vX/assets/photos/` and a smaller copy (about 600 px wide) in `site-vX/assets/photos/thumbs/` with the **same file name**. On a Mac: `sips --resampleWidth 600 photo.jpg --out thumbs/photo.jpg`.
2. Add an entry to `gallery`:
   ```js
   { src: "assets/photos/new.jpg", thumb: "assets/photos/thumbs/new.jpg", width: 810, height: 1080,
     position: "50% 30%", alt: "Short description of the photo for screen readers" },
   ```
   `position` controls which part stays visible when the photo is cropped: the first number is left↔right and the second is top↔bottom. Use a smaller second number (e.g. `20%`) if heads are being cut off.
3. Keep photos portrait (3:4) and under about 300 KB so the site stays fast on mobile data.
- The hero photo and the two portraits in "Our Story" are set in `index.html` (search for `couple-traditional.jpg`, `francisca.jpg` or `lawrence.jpg`). Replace the file with one of the same name, or update the file name there.

### RSVP deadline (`rsvp.deadline`)
Change the text, e.g. `deadline: "Saturday, 28 November 2026"`. It appears under the RSVP heading. The form stays open after the deadline; if you want to close it, ask your developer or just change the wording.

### Announcements (`announcements`)
Add a new block at the top of the list. Dates use `YYYY-MM-DD`, and the newest is shown first automatically:
```js
announcements: [
  { date: "2026-11-20", title: "Parking information", body: "Parking is available inside the church compound." },
  // ...older announcements below
],
```
To remove an announcement, delete its whole `{ ... },` block.

### Contact / WhatsApp help button (`contact`)
Set `whatsappNumber` to the international format, digits only, with no `+` or spaces, e.g. `"2348012345678"`. This shows a "Need help? WhatsApp us" button in the footer, and the RSVP fallback messages go to that number. While it is still the placeholder, the help button stays hidden.

### Love story (`story`)
Replace the three placeholder paragraphs in `story.paragraphs` with your own words. You can add or remove paragraphs; each one is a quoted string followed by a comma.

### Other things in `config.js`
- `site.url`: your final website address, used in the WhatsApp share message. Also replace `https://YOUR-SITE-URL` in the `og:` / `twitter:` tags at the top of `index.html`, so WhatsApp can show the preview image.
- `couple.hashtag`, `couple.tagline`, `palette` (colour swatches) and `timeline` (Order of the Day) can be edited the same way.
- `api.endpoint`: the Apps Script URL from Part 1, Step 5.

### Things that are *not* in `config.js`
- **Date or church changes:** also update `index.html` (search for `19 December 2026`) and `wedding.ics`, because these are written into the page for WhatsApp previews and calendars.
- **Social preview image:** `site-vX/assets/og-image.jpg` (1200 × 630). Replace it with an image of the same size and name.
