# Francisca & Lawrence: v2 design (simplified)

The couple said the first v2 had "too many distractions … too many fonts" and asked for something
"simpler but still very classy", opening with the suit photo. This version keeps the restraint of a
fine printed invitation suite: one centred axis, lots of ivory space, two typefaces, one ornament
(the wax seal on the envelope). The ornate version is archived at `archive/v2-ornate/`.

## Section pattern (used for every section)
A centred `h2`, an optional one-line `lead`, then the content. Sections alternate ivory and cream so
guests always know where one ends. Long lists (order of the day, updates, gifts, wishes) are
left-aligned plain rows inside a centred column, divided by hairlines.

Page order, which the header nav, the mobile menu and the footer links all follow exactly:
Hero → Invitation → The Day → RSVP → Updates → Our Story → Pictures → Gifts → Wishes → footer (thank-you).
The hero already answers "when, where, what time" and offers RSVP and directions, so older guests
have the essentials before they scroll.

## Type: two families, four styles
| Style   | Face                         | Used for                                              |
|---------|------------------------------|-------------------------------------------------------|
| Display | Bodoni Moda 400              | The couple's names only (hero, invitation, footer, envelope, monogram) |
| Heading | EB Garamond 400              | Section titles (`.h2`, ~48px) and sub-titles (`.h3`, 26px) |
| Body    | EB Garamond 400 / 500        | Everything else, 20–21px for older eyes               |
| Label   | EB Garamond small caps, 16px | Form labels, card labels, categories, dates           |

No italics, no Roman numerals, no vertical text, no drop caps, no decorative figures. The gold
ampersand in the names is the only flourish.

## Components
- **One button**: solid espresso, ivory text, sentence case. Secondary actions are underlined text links.
- **One card**: white-ivory with a single gold-tinted hairline. Used for the invitation, venues,
  forms, the bank details and the pledge dialog.
- Plain rows for lists. Photos are plain 3:4 frames; the hero keeps a clean semicircular arch.

## Colour
Ivory `#FAF6EF` and cream `#F3EBDF` pages, Deep Cocoa ink `#2C1B16`, brown secondary `#5A4238`.
Gold is a sparing accent: `#7A5A22` on light (ampersands, focus ring, link underlines) and `#C6A15B`
on the espresso footer. No textures, shadows or gradients except the envelope's wax seal.

## Hero
`couple-church.jpg` (810×1080) at every width, shown whole in a 3:4 arch (never cropped beyond the
arch corners; faces sit at 12–31% height, well inside the curve). Displayed at 280px on phones, 360px on
tablets and 470px on desktop, so it is always downscaled. The traditional photo is in Pictures.

## Gifts
Presence first, gifts optional. The list loads from the sheet (`GET ?action=registry`), grouped by
category, with each row showing name, note and status (Available, "1 of 2 left", Chosen). "I'll get this"
opens an accessible dialog (`POST action=pledge`) that confirms with a `GF-` reference. The bank
details live inside the list's **Cash gift** row, which you tap to reveal; there is no separate bank block.
If the list can't load, the guest sees "Message Bunmi on WhatsApp" and the Cash gift row with the
bank details open.

## Motion
The envelope intro (tap the seal: flap opens, letter rises and becomes the page), then a quiet fade-in
of the hero. Nothing animates on scroll. Reduced motion skips the envelope.

## Practical notes
- Browser storage keys are versioned `fl-v2b-…` (envelope, RSVP, pledges). The inline `<head>` script
  and `ENVELOPE_KEY` in `main.js` must use the same string.
- `config.js`: new optional `registry: { enabled, title, intro }`. `gifts.amounts` is no longer used.
- Fonts: Bodoni Moda (roman 400 only) from Google Fonts; EB Garamond roman self-hosted (italic is no longer loaded).
