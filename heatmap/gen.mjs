// Draws assets/heatmap.svg from the real GitHub contribution calendar:
// the grid starts as lavender "ciphertext" and decrypts column by column.
// Usage: GITHUB_TOKEN=... node heatmap/gen.mjs [login]
import fs from "node:fs";
import assert from "node:assert";

const LOGIN = process.argv[2] ?? "huaruic";
const OUT = "assets/heatmap.svg";
const CELL = 11, GAP = 3, STEP = CELL + GAP;
const W = 840, TOP = 70, START = 0.6, COL_DELAY = 0.035;
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const PLAIN = ["#161b22", "#4d4200", "#806e00", "#b39a00", "#ffd200"];
const CIPHER = ["#2d2250", "#3b2d66", "#4b3a86", "#5a4499", "#7d62c8"];
const SQ = `width="${CELL}" height="${CELL}" rx="2"`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
      totalContributions weeks{contributionDays{date weekday contributionLevel}}}}}}`,
    variables: { login: LOGIN },
  }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
const { totalContributions: total, weeks } = json.data.user.contributionsCollection.contributionCalendar;

const left = Math.round((W - weeks.length * STEP + GAP) / 2);
const endAt = START + weeks.length * COL_DELAY;
let plain = "", cipher = "", months = "", cells = 0, lastLabel = -3;

weeks.forEach((week, col) => {
  const x = left + col * STEP;
  const month = Number(week.contributionDays[0].date.slice(5, 7)) - 1;
  const prev = col && Number(weeks[col - 1].contributionDays[0].date.slice(5, 7)) - 1;
  if (col && month !== prev && col - lastLabel >= 3) {
    months += `<text x="${x}" y="${TOP - 8}">${MONTHS[month]}</text>`;
    lastLabel = col;
  }
  let enc = "";
  for (const day of week.contributionDays) {
    const y = TOP + day.weekday * STEP;
    plain += `<rect x="${x}" y="${y}" ${SQ} class="p${LEVEL[day.contributionLevel]}"/>`;
    enc += `<rect x="${x}" y="${y}" ${SQ} class="c${(col * 7 + day.weekday) * 2654435761 % 5}"/>`; // ponytail: hash, not random, so daily diffs stay small
    cells++;
  }
  cipher += `<g class="col" style="animation-delay:${(START + col * COL_DELAY).toFixed(3)}s">${enc}</g>`;
});
assert.equal(cells, weeks.reduce((n, w) => n + w.contributionDays.length, 0));

const gridW = weeks.length * STEP - GAP, H = TOP + 7 * STEP + 44;
const legendX = left + gridW - 36 - 5 * STEP + GAP;
const legend = PLAIN.map((c, i) => `<rect x="${legendX + i * STEP}" y="${H - 29}" ${SQ} class="p${i}"/>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${total.toLocaleString("en-US")} GitHub contributions in the last year, shown as a heatmap that decrypts from ciphertext.">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 11px; fill: #7d8590; }
    ${PLAIN.map((c, i) => `.p${i} { fill: ${c}; }`).join(" ")}
    ${CIPHER.map((c, i) => `.c${i} { fill: ${c}; }`).join(" ")}
    @keyframes fade { to { opacity: 0; } }
    @keyframes show { to { opacity: 1; } }
    @keyframes scan { from { transform: translateX(0); opacity: 1; } 98% { opacity: 1; } to { transform: translateX(${gridW}px); opacity: 0; } }
    @keyframes flick { 50% { opacity: .55; } }
    .col { animation: flick .5s steps(1) infinite, fade .25s ease-out forwards; }
    .scan { animation: scan ${(endAt - START).toFixed(2)}s linear ${START}s forwards; opacity: 0; }
    .after { opacity: 0; animation: show .3s ${endAt.toFixed(2)}s forwards; }
    .before { animation: fade .2s ${endAt.toFixed(2)}s forwards; }
    @media (prefers-reduced-motion: reduce) { .col, .before { opacity: 0; animation: none; } .after { opacity: 1; animation: none; } .scan { display: none; } }
  </style>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="#0d1117" stroke="#30363d"/>
  <text x="${left}" y="30" style="fill:#e6edf3">huaruic / contributions</text>
  <text x="${left + gridW}" y="30" text-anchor="end" class="before" style="fill:#d2a8ff">ciphertext</text>
  <text x="${left + gridW}" y="30" text-anchor="end" class="after" style="fill:#3fb950">decrypted</text>
  <g>${months}</g>
  <g>${plain}</g>
  <g>${cipher}</g>
  <rect class="scan" x="${left - 2}" y="${TOP - 4}" width="2" height="${7 * STEP + 5}" fill="#ffd200"/>
  <g class="after">
    <text x="${left}" y="${H - 20}">${total.toLocaleString("en-US")} contributions in the last year</text>
    <text x="${legendX - 6}" y="${H - 20}" text-anchor="end">less</text>
    ${legend}
    <text x="${left + gridW}" y="${H - 20}" text-anchor="end">more</text>
  </g>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(`${OUT}: ${total} contributions, ${weeks.length} weeks, ${cells} cells`);
