// Answers an "ask:" issue with Claude, writes the reply to reply.md,
// and puts published Q&As into the README block between the ASK markers.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const DAILY_CAP = 30; // ponytail: one global cap; add per-user limits if someone spams
const SHOWN = 3;
const README = "README.md";
const LOG = "agent/log.json";
const REPO = "https://github.com/huaruic/huaruic";

const { ISSUE_TITLE = "", ISSUE_BODY = "", ISSUE_USER, ISSUE_NUMBER } = process.env;
const question = `${ISSUE_TITLE.replace(/^ask:\s*/i, "")}\n${ISSUE_BODY}`.trim().slice(0, 1000);
const today = new Date().toISOString().slice(0, 10);
const log = JSON.parse(fs.readFileSync(LOG, "utf8"));
const reply = (text) => fs.writeFileSync("reply.md", text);

if (!question) {
  reply("The question didn't come through. Put it after `ask:` in the title and open a new issue.");
  process.exit(0);
}
if (log.filter((e) => e.date === today).length >= DAILY_CAP) {
  reply("The agent has answered enough for today. Try again tomorrow, or email Ernest at ernestchen247@gmail.com.");
  process.exit(0);
}

const client = new Anthropic();
const response = await client.beta.messages.create({
  model: "claude-opus-5",
  max_tokens: 4000, // anyone on GitHub can trigger this, so keep a hard ceiling
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: {
    effort: "low",
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: { answer: { type: "string" }, publish: { type: "boolean" } },
        required: ["answer", "publish"],
        additionalProperties: false,
      },
    },
  },
  system: fs.readFileSync("agent/ernest.md", "utf8"),
  messages: [{ role: "user", content: `<question from="@${ISSUE_USER}">\n${question}\n</question>` }],
});

if (response.stop_reason === "refusal") {
  reply("The agent couldn't answer this one. Ernest reads these issues, so he may reply himself.");
  process.exit(0);
}
const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
const { answer, publish } = JSON.parse(text);

reply(`${answer}\n\n<sub>Answered by an agent that has read Ernest's notes. It can be wrong; Ernest reads these too.</sub>`);

if (publish) {
  const oneLine = (s, n) => s.replace(/\s+/g, " ").trim().slice(0, n);
  log.unshift({ date: today, user: ISSUE_USER, issue: Number(ISSUE_NUMBER), q: oneLine(question, 160), a: oneLine(answer, 420) });
  fs.writeFileSync(LOG, JSON.stringify(log.slice(0, 50), null, 2) + "\n");

  // Visitor text lands on the profile page, so escape anything markdown or HTML would act on.
  const esc = (s) => s.replace(/[\\`*_{}\[\]()<>#!|~]/g, "\\$&");
  const block = log
    .slice(0, SHOWN)
    .map((e) => `**@${e.user}** asked in [#${e.issue}](${REPO}/issues/${e.issue}): ${esc(e.q)}\n> ${esc(e.a)}`)
    .join("\n\n");
  const md = fs.readFileSync(README, "utf8");
  fs.writeFileSync(README, md.replace(/(<!-- ASK:START -->)[\s\S]*(<!-- ASK:END -->)/, `$1\n${block}\n$2`));
}
