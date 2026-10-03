/**
 * NevorAI Product Knowledge Registry
 * ----------------------------------
 * Static, reusable knowledge about the platform's features. Every route
 * below is verified against src/routes/ — never invent a menu path.
 *
 * Used two ways:
 *   1. Injected into the system prompt when the current screen matches.
 *   2. Searched at runtime by the `app_help` tool for how-to questions.
 *
 * Never exposes source code, tables, RLS policies, or implementation
 * detail — only user-visible behaviour, guides, and troubleshooting.
 */

export type ProductKnowledgeTopic = {
  id: string;
  title: string;
  /** Route path prefixes this topic is relevant to. */
  screens: string[];
  /** Keywords that should surface this topic (case-insensitive). */
  keywords: string[];
  /** Short summary — always safe to include verbatim in the prompt. */
  summary: string;
  /** Step-by-step guide the assistant can quote. */
  steps?: string[];
  faq?: { q: string; a: string }[];
  troubleshooting?: { symptom: string; fix: string }[];
  bestPractices?: string[];
};

export const PRODUCT_KNOWLEDGE: ProductKnowledgeTopic[] = [
  {
    id: "attendance",
    title: "Attendance",
    screens: ["/dashboard/attendance"],
    keywords: [
      "attendance",
      "present",
      "absent",
      "check in",
      "check-in",
      "check out",
      "hazri",
      "hazir",
      "haaziri",
      "mark attendance",
    ],
    summary:
      "Attendance is captured per session. Tap a waiting student to check them in; tap again on the in-academy pill to check out. Marks feed engagement reports and can trigger absentee automations.",
    steps: [
      "Open Attendance from the bottom nav or Dashboard.",
      "Tap Check In on a waiting student — they move to In academy instantly.",
      "Tap Check Out when they leave. History is auto-saved per date.",
    ],
    troubleshooting: [
      {
        symptom: "Student missing from the list",
        fix: "They may be inactive or unassigned — open Students, verify status is Active and a batch is assigned.",
      },
    ],
  },
  {
    id: "fees",
    title: "Fees & Payments",
    screens: ["/dashboard/fees", "/dashboard/billing"],
    keywords: [
      "fees",
      "fee",
      "invoice",
      "payment",
      "collect",
      "overdue",
      "pending",
      "paisa",
      "paise",
      "reminder",
      "record payment",
      "cash",
      "upi",
    ],
    summary:
      "Fees screen lists every active student with their current-period status. Tap a student to collect a payment (cash/UPI/bank/card) — the record is stored under Billing V2.",
    steps: [
      "Open Fees from the bottom nav.",
      "Filter by Pending, Overdue, or Paid using the tabs at the top.",
      "Tap a student → Collect payment, pick method, confirm the amount, and hit Confirm payment. The status flips to Paid immediately.",
    ],
    faq: [
      {
        q: "How do I send a reminder?",
        a: "From Fees, open the student row and use Send reminder — it uses the reminder channels set up under Reminders.",
      },
      {
        q: "Kya main fee plan badal sakta hoon?",
        a: "Haan — /dashboard/fee-plans par jaake plan edit karein, phir student ke profile mein assign karein.",
      },
    ],
  },
  {
    id: "fee-plans",
    title: "Fee Plans",
    screens: ["/dashboard/fee-plans"],
    keywords: ["fee plan", "plans", "monthly plan", "amount", "cycle"],
    summary:
      "Fees belong to sessions: each session (batch) carries its own monthly fee, plus one academy-wide one-time admission fee. A student inherits the fee of the session they are in.",
    steps: [
      "Open Dashboard → Fees → Sessions & Fees (same as Dashboard → Sessions).",
      "Add a new plan with name, amount and cycle.",
      "Assign the plan on the student's profile under Students.",
    ],
  },
  {
    id: "payment-settings",
    title: "Payment Settings",
    screens: ["/dashboard/payment-settings"],
    keywords: ["upi", "razorpay", "payment gateway", "provider", "online payment", "qr"],
    summary:
      "Configure how parents pay online: enable a payment provider (Razorpay, etc.), set the UPI ID/QR, and toggle offline modes (cash, bank transfer).",
  },
  {
    id: "admissions",
    title: "Admissions & Leads",
    screens: ["/dashboard/registrations", "/dashboard/leads"],
    keywords: [
      "admission",
      "admissions",
      "lead",
      "leads",
      "registration",
      "trial",
      "approve",
      "reject",
      "new student",
      "inquiry",
    ],
    summary:
      "Registrations and leads come in from the public site or manual entry. Admissions Review is where you accept, request info, or reject them.",
    steps: [
      "Open Admissions Review from Dashboard.",
      "Pick a lead, review the form and run the checklist.",
      "Approve to convert into a student — the first invoice is generated automatically.",
    ],
  },
  {
    id: "students",
    title: "Students & Batches",
    screens: ["/dashboard/students", "/dashboard/batches"],
    keywords: ["student", "students", "roster", "profile", "batch", "batches", "group"],
    summary:
      "Students belong to one batch each. Batches are scheduled groups (U-12, Evening Nets, etc.). Manage them from Students and Batches.",
    steps: [
      "Open Students to see the roster. Tap a student for the full profile — attendance, fees, coach notes.",
      "Open Batches to create/rename batches or move students between them.",
    ],
  },
  {
    id: "match-center-create",
    title: "Create a Match",
    screens: ["/match-center/create", "/match-center/matches", "/match-center/dashboard"],
    keywords: [
      "match",
      "create match",
      "new match",
      "start match",
      "score",
      "scoring",
      "toss",
      "innings",
      "playing xi",
      "squad",
    ],
    summary:
      "Match Center is where you create, score ball-by-ball, and finalize matches. Once finalized, career stats and player profiles update automatically.",
    steps: [
      "Open Match Center → New match (or the + button on Match Center Dashboard).",
      "Pick both teams, overs, ground and toss winner + decision.",
      "Add the playing XI for each side (Squads step).",
      "Save — the match opens in the Scorebook. Tap balls as they're bowled. When both innings are done, Finalize to lock the result.",
    ],
    faq: [
      {
        q: "Where do the player stats come from?",
        a: "Every finalized match feeds the career engine — runs, wickets, strike rate and economy in the Performance section are derived from ball-by-ball events. No manual editing.",
      },
      {
        q: "Match banane ke baad edit ho sakta hai?",
        a: "Haan — jab tak Finalize nahi kiya, Scorebook mein ball delete/undo hota hai. Finalize ke baad match lock ho jaata hai; unlock only from Match Center settings.",
      },
    ],
  },
  {
    id: "match-center-performance",
    title: "Player Performance & Compare",
    screens: [
      "/match-center/performance",
      "/match-center/performance/compare",
      "/match-center/players",
    ],
    keywords: [
      "performance",
      "career",
      "player stats",
      "strike rate",
      "economy",
      "wickets",
      "runs",
      "average",
      "compare players",
      "form",
      "last 5",
    ],
    summary:
      "Performance shows career-level batting, bowling and fielding for each cricketer. Compare puts two players side-by-side across the same metrics.",
    steps: [
      "Open Match Center → Performance to see the roster of players with stats.",
      "Tap any player for their full form curve, splits, and consistency score.",
      "Use Compare to pick two players and view a head-to-head.",
    ],
  },
  {
    id: "match-center-tournaments",
    title: "Tournaments & Teams",
    screens: ["/match-center/tournaments", "/match-center/teams"],
    keywords: ["tournament", "tournaments", "series", "team", "teams", "bracket", "leaderboard"],
    summary:
      "Create a tournament, add teams and rounds, then schedule matches inside it. Match results roll up into the tournament leaderboard automatically.",
  },
  {
    id: "website-gallery",
    title: "Website & Photo Gallery",
    screens: ["/dashboard/site"],
    keywords: [
      "website",
      "site",
      "gallery",
      "photos",
      "photo",
      "upload photo",
      "images",
      "branding",
      "logo",
      "colors",
      "site content",
      "public page",
    ],
    summary:
      "Your public academy site is edited from Dashboard → Website. Gallery photos, hero images, testimonials, program cards — all live under the Site content tabs. Logo, colours and favicon are on the same Website page.",
    steps: [
      "Open Dashboard → Website (or /dashboard/site).",
      "Stay on the Site content tab.",
      "Scroll to the Gallery section, tap Upload and pick your image files. They appear on the public /gallery page immediately.",
    ],
    faq: [
      {
        q: "Where does the logo change?",
        a: "Dashboard → Website (/dashboard/site) — logo, favicon and brand colour all live there.",
      },
    ],
    troubleshooting: [
      {
        symptom: "Uploaded photo doesn't appear on the public gallery",
        fix: "Make sure you tapped Save on the Gallery section. The public page can also take up to 30 seconds to refresh.",
      },
    ],
  },
  {
    id: "communications",
    title: "Communications & Broadcasts",
    screens: ["/dashboard/communications"],
    keywords: [
      "announcement",
      "message",
      "campaign",
      "whatsapp",
      "sms",
      "broadcast",
      "notify parents",
      "communication",
    ],
    summary:
      "Send announcements to parents/players via WhatsApp, SMS or in-app. Templates + scheduling are supported.",
    steps: [
      "Open Communications from the sidebar.",
      "New Campaign → pick audience (batch / status / all), channel, template.",
      "Preview, then Send or Schedule.",
    ],
    bestPractices: [
      "Keep WhatsApp messages under 300 characters.",
      "Schedule outside class hours for better read rates.",
    ],
  },
  {
    id: "automations",
    title: "Automations",
    screens: ["/dashboard/automation", "/dashboard/automation-settings", "/dashboard/reminders"],
    keywords: ["automation", "workflow", "trigger", "auto reminder", "reminders", "rules"],
    summary:
      "Automations react to events (invoice overdue, absent 3 days in a row, new registration) and send a message or create a task. Toggle each rule from Automation.",
    troubleshooting: [
      {
        symptom: "Automation not firing",
        fix: "Check the rule is enabled AND a messaging channel is connected. See the executions log for the failure reason.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports & Insights",
    screens: ["/dashboard/reports", "/dashboard/insights"],
    keywords: ["report", "reports", "analytics", "revenue", "engagement", "export", "csv", "insights"],
    summary:
      "Reports summarize revenue, attendance and admissions. Filter by date range, export as CSV. Insights shows trend charts on the same data.",
  },
  {
    id: "staff-coaches",
    title: "Staff & Coaches",
    screens: ["/dashboard/staff", "/dashboard/coach"],
    keywords: ["staff", "coach", "coaches", "admin", "invite", "role", "permissions", "members", "access"],
    summary:
      "Team & Access lives at Dashboard → Staff. The Directory lists staff, Members lists every account in this academy (students, parents, staff) with a role dropdown, Invitations tracks pending invites, and Activity shows role changes.",
  },
  {
    id: "subscription",
    title: "Your NevorAI Subscription",
    screens: ["/dashboard/subscription", "/dashboard/billing"],
    keywords: ["subscription", "plan", "upgrade", "trial", "downgrade", "billing plan", "pricing"],
    summary:
      "Your academy's SaaS plan (what you pay Nevor) lives at Dashboard → Subscription. Trials are 14 days; downgrading keeps all data but disables premium features.",
  },
  {
    id: "notifications",
    title: "Notifications",
    screens: ["/dashboard/notifications", "/notifications"],
    keywords: ["notification", "notifications", "alert", "unread"],
    summary: "Recent activity across the academy — new registrations, failed payments, automation runs.",
  },
  {
    id: "nevorai-help",
    title: "Using Kaizen",
    screens: ["/dashboard/nevorai"],
    keywords: ["nevorai", "ai", "chat", "assistant", "how do i use ai"],
    summary:
      "Kaizen is your AI Academy Manager. Ask business questions in Hindi/English/Hinglish — collections, pending fees, attendance, cricket stats, or 'how do I…' questions. NevorAI never changes data without your approval.",
  },
];

/* ------------------------------------------------------------------ */
/* Selection                                                          */
/* ------------------------------------------------------------------ */

function screenMatches(topic: ProductKnowledgeTopic, currentScreen?: string) {
  if (!currentScreen) return false;
  return topic.screens.some((s) => currentScreen === s || currentScreen.startsWith(s + "/"));
}

/** Extra weight for how-to intent phrases in en / hi / hinglish. */
const HOWTO_PATTERNS = [
  /\bhow\s+(do|to|can|should)\b/i,
  /\bwhere\s+(is|do|can)\b/i,
  /\bhelp\s*(me)?\b/i,
  /\bsteps?\b/i,
  /\bguide\b/i,
  /\bkaise\b/i,
  /\bkahaan\b/i,
  /\bkidhar\b/i,
  /\bmujhe\b.*\bkarn[ai]\b/i,
];

function isHowToQuery(q: string): boolean {
  return HOWTO_PATTERNS.some((rx) => rx.test(q));
}

/** Pick topics relevant to the current screen and/or the user's message. */
export function selectRelevantTopics(opts: {
  currentScreen?: string;
  query?: string;
  limit?: number;
}): ProductKnowledgeTopic[] {
  const limit = opts.limit ?? 3;
  const q = (opts.query ?? "").toLowerCase();
  const howto = isHowToQuery(q);

  const scored = PRODUCT_KNOWLEDGE.map((topic) => {
    let score = 0;
    if (screenMatches(topic, opts.currentScreen)) score += 3;
    if (q) {
      for (const kw of topic.keywords) if (q.includes(kw)) score += howto ? 4 : 2;
      if (q.includes(topic.title.toLowerCase())) score += 2;
    }
    return { topic, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.topic);
}

export function renderTopicForPrompt(topic: ProductKnowledgeTopic): string {
  const lines: string[] = [`# ${topic.title}`, `Route: ${topic.screens[0]}`, topic.summary];
  if (topic.steps?.length) {
    lines.push("## How", ...topic.steps.map((s, i) => `${i + 1}. ${s}`));
  }
  if (topic.faq?.length) {
    lines.push("## FAQ", ...topic.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`));
  }
  if (topic.troubleshooting?.length) {
    lines.push(
      "## Troubleshooting",
      ...topic.troubleshooting.map((t) => `- ${t.symptom} → ${t.fix}`),
    );
  }
  if (topic.bestPractices?.length) {
    lines.push("## Best practices", ...topic.bestPractices.map((b) => `- ${b}`));
  }
  return lines.join("\n");
}

/** Screen → suggested prompt chips. Reused by AskNevorAI + panel welcome. */
export const PAGE_SUGGESTIONS: Array<{
  match: (path: string) => boolean;
  label: string;
  suggestions: string[];
}> = [
  {
    match: (p) => p.startsWith("/dashboard/attendance"),
    label: "Attendance",
    suggestions: [
      "Why is attendance low today?",
      "How do I mark attendance?",
      "Show absent players",
    ],
  },
  {
    match: (p) => p.startsWith("/dashboard/fees") || p.startsWith("/dashboard/billing"),
    label: "Fees",
    suggestions: [
      "Show pending fees",
      "How do I collect a payment?",
      "Send reminders to overdue parents",
    ],
  },
  {
    match: (p) => p.startsWith("/dashboard/admissions") || p.startsWith("/dashboard/registrations"),
    label: "Admissions",
    suggestions: [
      "Which leads need follow-up?",
      "How do I approve an admission?",
      "Admission conversion rate this month",
    ],
  },
  {
    match: (p) => p.startsWith("/dashboard/site") || p.startsWith("/dashboard/branding"),
    label: "Website",
    suggestions: [
      "How do I upload photos to my gallery?",
      "Change my academy logo",
      "Update my programs page",
    ],
  },
  {
    match: (p) => p.startsWith("/match-center"),
    label: "Match Center",
    suggestions: [
      "How do I create a match?",
      "Compare two players' last 5 matches",
      "Show top run scorers",
    ],
  },
  {
    match: (p) => p.startsWith("/dashboard/reports") || p.startsWith("/dashboard/insights"),
    label: "Reports",
    suggestions: ["Revenue this month", "Compare to last month", "Export attendance CSV"],
  },
  {
    match: (p) => p.startsWith("/dashboard/communications"),
    label: "Communications",
    suggestions: [
      "How do I send a broadcast?",
      "Draft an announcement",
      "Which campaigns performed best?",
    ],
  },
  {
    match: (p) => p.startsWith("/dashboard/automation"),
    label: "Automations",
    suggestions: [
      "Why did this automation fail?",
      "How do I set up fee reminders?",
      "Which automations ran today?",
    ],
  },
  {
    match: (p) => p.startsWith("/dashboard/students"),
    label: "Students",
    suggestions: ["Who's new this month?", "How do I add a student?", "Show inactive students"],
  },
  {
    match: (p) => p.startsWith("/platform-admin"),
    label: "Platform",
    suggestions: [
      "Platform revenue this week",
      "Top performing academies",
      "Any accounts at risk?",
    ],
  },
];

export function suggestionsForScreen(pathname: string): string[] {
  const hit = PAGE_SUGGESTIONS.find((s) => s.match(pathname));
  return (
    hit?.suggestions ?? [
      "Brief me on today",
      "Who hasn't paid this month?",
      "How do I upload photos to my gallery?",
    ]
  );
}
