/* ==========================================================================
   Francisca & Lawrence — WEBSITE SETTINGS
   --------------------------------------------------------------------------
   This is the ONLY file you need to edit to update the website's content.
   - Keep the quotation marks around text.
   - Keep the commas at the end of lines.
   - Anything marked "PLACEHOLDER" still needs a real value.
   After editing, re-upload this file (and nothing else) to your host.

   NOTE: A few core details (names, date, church) are ALSO written directly
   in index.html so that WhatsApp link previews and very old phones show them.
   If the date or church ever changes, update index.html (search for
   "19 December 2026") and wedding.ics as well.
   ========================================================================== */

window.CONFIG = {

  /* ---------- The couple ---------- */
  couple: {
    brideFirst: "Francisca",
    brideFull: "Francisca Oluwadamilola",
    groomFirst: "Lawrence",
    groomFull: "Lawrence Oluwatobi",
    tagline: "Together Is a Beautiful Place to Be",
    hashtag: "#DamifoundherLaw26"   // couple wrote it as "#DamifoundherLaw 26’"; hashtags can't contain spaces
  },

  /* ---------- Families (exact wording — shown on the formal invitation) ---------- */
  families: {
    bride: { label: "The Bride's Family", name: "Late Mr. and Mrs. Adeyinka and Badejos Family" },
    groom: { label: "The Groom's Family", name: "Dr. Ajayi and Mrs. Dupe Arowosegbe Family" }
  },

  /* ---------- Wedding date & time ----------
     dateISO / endISO drive the countdown and the calendar buttons.
     "+01:00" is Nigeria time (Africa/Lagos). */
  wedding: {
    dateISO: "2026-12-19T10:00:00+01:00",
    endISO: "2026-12-19T13:00:00+01:00",   // assumed ~3 hours, for calendars only
    dateLabel: "Saturday, 19 December 2026",
    timeLabel: "10:00 AM prompt"
  },

  /* ---------- Church ceremony ---------- */
  church: {
    name: "St. Gregory Catholic Church",
    shortAddress: "Moniya, Ibadan",
    address: "Moniya, Ibadan, Oyo State, Nigeria",
    // Helper text shown under the address (location as given on the parish's own website).
    directionsNote: "Sawmill area, along Moniya–Iseyin Road (Akinyele LGA)",
    // replace with the maps.app.goo.gl share link once you've confirmed the pin
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=St+Gregory+Catholic+Church%2C+Moniya%2C+Ibadan%2C+Oyo+State%2C+Nigeria"
  },

  /* ---------- Reception ----------
     confirmed: false  -> the site shows an elegant "Venue Coming Soon" card.
     confirmed: true   -> the venue name is shown; any missing address/time
                          simply reads "Details to follow".
     Also update the "Reception" line in the timeline below if the time changes. */
  reception: {
    confirmed: true,
    name: "Idunnu Hall Event Centre",
    address: "Ebenezer Estate, New Oyo Road, Moniya, Ibadan, Oyo State",
    // Small helper text shown under the address. Set to "" to hide.
    landmark: "Near the Ayo Adeseun Ni-Met Station / Obafemi Awolowo Train Station, Moniya",
    time: "Immediately after the Mass",
    // search link; replace with maps.app.goo.gl share link if preferred
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Idunnu+Hall+Event+Centre%2C+Ebenezer+Estate%2C+New+Oyo+Road%2C+Moniya%2C+Ibadan"
  },

  /* ---------- Order of the Day ----------
     Shown as a small timeline under the wedding details. Add, remove or edit
     items freely. icon can be "cross", "rings", "clock" or "heart". */
  timeline: [
    { time: "10:00 AM", title: "Holy Matrimony", place: "St. Gregory Catholic Church", icon: "cross" },
    { time: "After Mass", title: "Reception", place: "Idunnu Hall Event Centre", icon: "rings" }
  ],

  /* ---------- RSVP ---------- */
  rsvp: {
    deadline: "Saturday, 28 November 2026",   // confirm with couple
    maxGuests: 5,
    // These three values must match what the Google Apps Script backend accepts.
    events: [
      "Church Ceremony & Reception",
      "Church Ceremony only",
      "Reception only"
    ]
  },

  /* ---------- Backend (Google Apps Script) ----------
     Paste your Apps Script Web App URL here (it ends in /exec).
     Until you do, the RSVP form offers a WhatsApp fallback instead. */
  api: {
    endpoint: "https://script.google.com/macros/s/AKfycbxZ5sVi7vSgowsd57KcyBv3M5ctx3vgYhemMTRAhc8UjQRjw32t8JFzsF_nfOW_9sc85Q/exec"
  },

  /* ---------- Cash gifts ---------- */
  gifts: {
    // (Suggested amounts were removed: guests transfer from their own bank app, so the site
    //  only shows the account details, inside the "Cash gift" item of the wishlist.)
    bank: {
      bankName: "Wema Bank",
      accountName: "Lawrence Arowosegbe",
      accountNumber: "0267406713"
    },
    // Optional: a Paystack payment-page link (e.g. "https://paystack.com/pay/xxxx").
    // Leave empty "" to hide the online-gift button.
    paystackUrl: ""
  },

  /* ---------- Gift registry ----------
     The list of gifts lives in your Google Sheet (tab "Registry"), so you can add,
     edit or hide items there — no website change needed.
     enabled: false hides the registry and keeps only the bank-transfer card. */
  registry: {
    enabled: true,
    title: "Our Wishlist",
    intro: "If you’d like to bless our new home, here are a few things we’d treasure. Pick anything that speaks to you — there’s no expectation at all."
  },

  /* ---------- Contact ----------
     WhatsApp number in international format, digits only, no "+" or spaces.
     e.g. "2348012345678". Leave the placeholder to hide the help button. */
  contact: {
    whatsappNumber: "2347052286742",
    whatsappName: "Bunmi Badejo"
  },

  /* ---------- Website address ----------
     Your final website link, used for WhatsApp sharing. Also update the
     og:url / og:image tags at the top of index.html. */
  site: {
    url: "https://francisca-and-lawrence.vercel.app"
  },

  /* ---------- Our Story (add more paragraphs to the list if you like) ---------- */
  story: {
    title: "Our Story",
    paragraphs: [
      "Two people, one faith, and a love that has grown into a lifetime promise. We are grateful to God for bringing us together, and to everyone who has walked this road with us. On 19 December, we begin a new chapter, and we would love you to be there."
    ]
  },

  /* ---------- Announcements (newest first is automatic) ----------
     date format: "YYYY-MM-DD". Add a new { ... } block to post an update. */
  announcements: [
    {
      date: "2026-10-09",
      title: "Reception venue confirmed: Idunnu Hall Event Centre",
      body: "We're delighted to share that the reception will be held at Idunnu Hall Event Centre, immediately after the Mass. The venue is on New Oyo Road, Moniya — just a short drive from the church. Directions are in the Wedding Details section."
    },
    {
      date: "2026-10-09",
      title: "Our wedding website is live",
      body: "Welcome! Here you will find everything you need for our big day — ceremony details, directions, RSVP and more. Please RSVP so we can plan for you."
    }
  ],

  /* ---------- Gallery ----------
     The suit photo (couple-church.jpg) is the hero image, so the traditional photo leads the gallery.
     src = full-size photo, thumb = smaller copy for the grid.
     position = which part of the photo stays visible when cropped ("x% y%"). */
  gallery: [
    { src: "assets/photos/couple-traditional.jpg", thumb: "assets/photos/thumbs/couple-traditional.jpg", width: 810, height: 1080, position: "50% 28%",
      alt: "Francisca and Lawrence seated together, smiling, dressed in matching gold and champagne traditional attire with gele and fila" },
    { src: "assets/photos/couple-proposal-1.jpg", thumb: "assets/photos/thumbs/couple-proposal-1.jpg", width: 810, height: 1080, position: "50% 35%",
      alt: "Lawrence and Francisca at night beneath palm trees, holding a bouquet of red and white roses on the evening of the proposal" },
    { src: "assets/photos/francisca.jpg", thumb: "assets/photos/thumbs/francisca.jpg", width: 810, height: 1080, position: "47% 30%",
      alt: "Francisca in an elegant black jumpsuit standing before tall arched black doors" },
    { src: "assets/photos/lawrence.jpg", thumb: "assets/photos/thumbs/lawrence.jpg", width: 810, height: 1080, position: "48% 55%",
      alt: "Lawrence in a black tuxedo and bow tie standing before a white Pietà statue" },
    { src: "assets/photos/couple-church.jpg", thumb: "assets/photos/thumbs/couple-church.jpg", width: 810, height: 1080, position: "50% 18%",
      alt: "Francisca and Lawrence smiling and embracing in black formal wear, in front of a white Pietà statue" },
    { src: "assets/photos/couple-proposal-2.jpg", thumb: "assets/photos/thumbs/couple-proposal-2.jpg", width: 810, height: 1080, position: "50% 40%",
      alt: "Lawrence and Francisca smiling at night, her ring visible as he holds her hand over the bouquet" }
  ],

  /* ---------- Colour inspiration (not a dress code) ---------- */
  palette: [
    { name: "Espresso Brown", hex: "#3B241C" },
    { name: "Chocolate Brown", hex: "#65412F" },
    { name: "Antique Gold", hex: "#C6A15B" },
    { name: "Champagne Gold", hex: "#E8D5A8" },
    { name: "Warm Ivory", hex: "#FAF6EF" }
  ]
};
