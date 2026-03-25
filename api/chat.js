// PURPOSE PIECE — REVELATION ENGINE
// Architecture: Behavior → Tension → Mirror → Frame
// Stateless: session object lives on the client, sent with every request.

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Session factory ──────────────────────────────────────────────────────────
function createSession() {
  return {
    phase:         "welcome",
    questionIndex: 0,
    probeCount:    0,
    transcript:    [],
    synthesis:     null,
    status:        "active"
  };
}

// ─── The five questions ───────────────────────────────────────────────────────
const QUESTIONS = [
  {
    label: "The Moment",
    text: "Something around you was off — and you either stepped in or you didn't. A situation at work, at home, in a group, anywhere. It doesn't have to be dramatic.\n\nPick one. What happened, and what did you do?"
  },
  {
    label: "The Frustration",
    text: "What's something you keep seeing go wrong — in organisations, communities, systems, relationships — that bothers you even when it has nothing to do with you personally?\n\nName a specific example. What actually happens that shouldn't?"
  },
  {
    label: "The Pressure",
    text: "Describe a moment in the last year or two where you had to make a real decision with incomplete information and something genuinely at stake.\n\nWhat did you do — and what did you deliberately not do?"
  },
  {
    label: "The Cost",
    text: "This one is harder. Take your time.\n\nWhat does your particular way of moving through the world cost you? Not what you find difficult in general — what specifically does your instinct ask of you that others don't seem to pay?"
  },
  {
    label: "The Obligation",
    text: "What's something you haven't done yet that keeps coming back to you — not as a goal you're working toward, but as something that would feel like unfinished business if you never got to it?\n\nWhat is it, and why does it keep returning?"
  }
];

// ─── Scripted probes per question ────────────────────────────────────────────
const PROBES = [
  [
    "Give me one specific moment from that situation. Where were you, and what did you actually do first?",
    "Even a small action counts. What was the very first thing you did — or consciously chose not to do?"
  ],
  [
    "Can you name a specific instance where you saw this? Even a recent small example.",
    "What does it look like in practice — what actually happens that shouldn't be happening?"
  ],
  [
    "What were the actual stakes — what could have gone wrong? And what did you do in the first 24-48 hours?",
    "Walk me through one decision you made. What information did you have, and what did you do with it?"
  ],
  [
    "Think of a specific situation where your way of operating made something harder for you. What happened?",
    "What do people around you not seem to pay — what's the thing you carry that others put down more easily?"
  ],
  [
    "What makes this feel like unfinished business rather than just something on a list? Is there a person, a moment, or a window you're aware of closing?",
    "If you never got to it — what specifically would feel incomplete? What would remain undone in you?"
  ]
];

// ─── Thin answer detection ────────────────────────────────────────────────────
const GENERIC_DEFLECTORS = [
  "it depends","not sure","i guess","maybe","hard to say",
  "whatever","idk","don't know","no idea","not really",
  "i don't know","nothing comes to mind","can't think"
];

const TIME_ANCHORS = [
  "last week","yesterday","last month","last year","recently",
  "in 2024","in 2023","a few weeks","a few months","this year",
  "this week","today","ago","when i","after i","before i"
];

const ACTION_VERBS = [
  "called","asked","built","avoided","stepped","said","told",
  "decided","chose","left","stayed","went","made","helped",
  "stopped","started","reached out","spoke","wrote","created",
  "organized","refused","accepted","pushed","pulled","watched"
];

function isThin(answer, qi) {
  const lower = answer.toLowerCase().trim();
  const words = answer.trim().split(/\s+/).filter(Boolean);

  const minWords = qi === 3 ? 15 : 20;
  if (words.length < minWords) return true;

  const deflectorCount = GENERIC_DEFLECTORS.filter(d => lower.includes(d)).length;
  if (deflectorCount >= 2) return true;

  if ([0, 1, 2].includes(qi)) {
    const hasTime    = TIME_ANCHORS.some(t => lower.includes(t));
    const hasAction  = ACTION_VERBS.some(v => lower.includes(v));
    const hasSetting = /\b(work|office|home|family|friend|community|meeting|team|partner|colleague|school|hospital|city|neighbourhood|neighborhood)\b/.test(lower);
    if (!hasTime && !hasAction && !hasSetting) return true;
  }

  return false;
}

// ─── Claude signal check (escalation after 2 failed probes) ──────────────────
async function claudeSignalCheck(question, answer) {
  try {
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages:   [{
        role:    "user",
        content: `Evaluate signal quality for a behavioural assessment answer.\n\nQuestion: "${question}"\nAnswer: "${answer}"\n\nReturn JSON only:\n{"has_signal": true or false, "missing": ["concrete_example","emotions","cost","stakes"], "one_probe_question": "single best follow-up"}`
      }]
    });
    return extractJSON(response.content[0].text);
  } catch {
    return { has_signal: true };
  }
}

// ─── Robust JSON extractor ───────────────────────────────────────────────────
function extractJSON(text) {
  // Strip markdown fences
  let clean = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  // Try direct parse first
  try { return JSON.parse(clean); } catch {}
  // Find first { to last } 
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  throw new Error("Could not extract JSON from response: " + text.slice(0, 200));
}

// ─── Phase 3 system prompt ────────────────────────────────────────────────────
const PHASE3_SYSTEM = `You are the Initial Reflection layer of Purpose Piece. Your job is to hold up a mirror so precise that the person feels — before any label arrives — that they have been genuinely heard.

You are not analysing them. You are speaking directly to them. Every sentence should only be possible because of what this specific person said. If a sentence could appear in anyone's reflection, rewrite it.

WHAT YOU ARE DOING:
Finding the instinct that repeats across all five answers. Not the content — the movement underneath. The emotional logic that connects what they did in Q1 to what frustrated them in Q2 to how they moved under pressure in Q3 to what it costs them in Q4 to what sits unfinished in Q5.

Use their own words and moments as your raw material. Not quoted back at them — metabolised into observation. The person should recognise their own experience in language that is clearer than how they said it.

Your reflection must feel like: "Someone finally said it back to me properly."
Not like: "Based on your answers, you appear to be..."

WHAT YOU ARE NOT DOING:
- Not naming an archetype. Not yet. Not even implicitly.
- Not praising them. Warmth yes. Flattery no.
- Not summarising their answers. Reflection is not repetition.
- Not using systems theory language. No "redistributive force," "adjustment mechanism," "relational vector," or similar. Write like a person, not a framework.

STRUCTURE — four sections, flowing prose. No bullet points within sections.

Your Signal — The repeated instinct:
Speak directly to them: "When X, you..." Enter through a specific moment they gave you. Reference their actual situations. You may echo one short phrase they used (3-6 words max) if it sharpens recognition — no more than once. Do not open with generic summarising language.

Your Engine — The emotional logic:
Speak directly: "What drives this is..." Connect instinct to motivation using what they revealed in Q2 and Q3. If competing patterns appear, name the tension rather than resolving it. Real people are blended. The tension is part of who they are.

Your Calling — The throughline:
Speak directly: "You are here to..." If clear, name it plainly. If blended, name the tension honestly rather than forcing a tidy conclusion. Reach. Stay tethered to their evidence.

The Cost — The price of the pattern:
Speak directly. Do not soften it. At least one sentence should name something the person may not have fully admitted to themselves — the thing underneath Q4. That moment of recognition is the point. If Q5 connects to the cost, bring it in.

THE RULES:
- Speak directly to the person. "You" not "this person" or "this pattern."
- Use plain human language. Never use: "redistributive force," "adjustment mechanism," "relational vector," "calibration impulse," or any language that sounds like systems theory or clinical observation.
- Never mention an archetype name. Not even as a hint.
- Never mention domain or scale.
- Never use "clearly" or "simply."
- Avoid filler transitions. Every sentence must deepen the picture.
- If an answer was thin or evasive — note what that reveals. Avoidance is data.
- Tone: warm, direct, precise, unhurried. Like a person who listened carefully and took you seriously.
- Length: 60-90 words per section. Every sentence earns its place.

THE TEST:
Read each section and ask: could this have been written about someone else with a similar pattern? If yes — go back to their specific words and moments and rewrite from there.
The emotional endpoint is not "that's accurate." It is "how did it know that."

OUTPUT — return JSON only, no other text:
{
  "sections": {
    "your_signal": "60-90 word paragraph",
    "your_engine": "60-90 word paragraph",
    "your_calling": "60-90 word paragraph",
    "the_cost": "60-90 word paragraph"
  },
  "synthesis_text": "Full reflection as continuous prose — all four sections joined without headers, for internal use only",
  "internal_signals": {
    "signals_detected": {
      "movement_style": "brief description",
      "decision_bias": "brief description",
      "primary_value": "brief description",
      "stress_response": "brief description",
      "cost_pattern": "brief description",
      "avoidance_signal": "brief description or null",
      "scale_pull": "brief description",
      "relational_vector": "brief description"
    },
    "confidence": "strong / blended / thin / contradictory",
    "confidence_notes": "1-2 sentences on signal quality"
  }
}`;

async function runPhase3(transcript) {
  const transcriptText = transcript.map((entry, i) => {
    let text = `Q${i+1} — ${QUESTIONS[i].label}\nQuestion: ${QUESTIONS[i].text}\nAnswer: ${entry.answer}`;
    if (entry.probes && entry.probes.length > 0) {
      entry.probes.forEach(p => { text += `\nProbe: ${p.probe}\nResponse: ${p.response}`; });
    }
    if (entry.thin) text += `\n[Note: Answer remained thin after probing — treat evasion as signal.]`;
    return text;
  }).join("\n\n---\n\n");

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system:     PHASE3_SYSTEM,
    messages:   [{ role: "user", content: `Here are the five answers:\n\n${transcriptText}` }]
  });

  return extractJSON(response.content[0].text);
}

// ─── Phase 4 system prompt ────────────────────────────────────────────────────
const PHASE4_SYSTEM = `You are the Your Purpose Piece layer. The Initial Reflection showed the person their pattern. Now name it — and make clear what that naming asks of them.

Speak directly to the person throughout. "You" not "this pattern" or "this person." Every section should be anchored in something specific they said or did. If a sentence could appear in any profile for this archetype, rewrite it.

THE SEVEN ARCHETYPES:
- STEWARD: Tends systems, ensures they remain whole. Maintains, repairs, sustains. Patient with operational work.
- MAKER: Builds what doesn't exist. Concept to creation. Comfortable with iteration. Values function over perfection.
- ARCHITECT: Designs the structural conditions that determine what can be built at all. Doesn't build the thing — designs the container the thing lives inside. When something keeps breaking, redesigns the conditions producing the break. Energised by making the system sound, not shipping the output.
- CONNECTOR: Weaves relationships, creates networks. Sees who needs who. Facilitates without dominating.
- GUARDIAN: Protects what matters, holds boundaries. Recognises threats early. Fierce protecting, gentle tending.
- EXPLORER: Ventures into unknown territory, brings back what's needed. Comfortable with uncertainty.
- SAGE: Holds wisdom, offers perspective that clarifies. Sees patterns across time. Values understanding over action.

THE SEVEN DOMAINS:
- HUMAN BEING: Personal development, consciousness, inner work, transformation.
- SOCIETY: Governance, culture, community, social structures.
- NATURE: Environment, ecology, planetary health, regeneration.
- TECHNOLOGY: Tools, infrastructure, innovation, digital and physical systems.
- FINANCE & ECONOMY: Resources, exchange, wealth, value creation and distribution.
- LEGACY: Long-term thinking, intergenerational work, preservation, deep time.
- VISION: Future imagination, possibility, coordination, collective direction.

THE FOUR SCALES:
- LOCAL: Neighbourhood, community level. Face-to-face. Immediate impact.
- BIOREGIONAL: Watershed, region level. Multi-community. Ecological boundaries.
- GLOBAL: International, planetary systems. Cross-border challenges.
- CIVILISATIONAL: Intergenerational, species-level. 100+ year timelines.

STRUCTURE:

Section 1 — Pattern (1 paragraph, 1-3 sentences):
Restate the throughline from the Initial Reflection — sharper and shorter. Compression, not repetition. Open with the pattern, not the archetype name. Speak directly: "You are..." or "The way you move through..."

Section 2 — Archetype (1 paragraph):
"The pattern most aligned with this movement is [Archetype]."
Explain in concrete behavioural terms what this archetype does — not what it is, what it does. Anchor at least one sentence in a specific moment from their answers. Avoid abstract or mythic language. Never use mechanical systems language ("redistributive force," "adjustment mechanism," etc.). If confidence is blended — name primary and acknowledge secondary directly.

Section 3 — Domain (1 paragraph):
"The territory where this pattern most wants to operate is [Domain]."
Justify with a direct reference to their specific lived example. Make clear why this domain and not another.

Section 4 — Scale (1 paragraph):
"The scale where this pattern is most coherent right now is [Scale]."
Scale is coherence bandwidth, not ambition. Do not assume larger is better. Reference their actual life context — where they are now, not where they might aspire to be.

Section 5 — Responsibility (2-4 sentences):
Name what this pattern asks of them in plain language. Not a warning — a weight. Include one line grounding this in capacity: this exists in them because something in them is built for it. That is not praise. That is why the responsibility is real.

Section 6 — Actions:
Three tiers — each specific to this person's actual context, not generic archetype actions:
Light (this week): 30-60 minutes. No special resources. Something they could start today.
Medium (ongoing): A few hours, recurring. Builds over time.
Deep (structural): Weeks to months. The thing their pattern is genuinely built for.

Section 7 — Resources (3-5 items):
Chosen for this specific person's pattern, tension, and texture. Not a generic reading list.
Each: title + author/source + one sentence explaining why it is specifically for them — referencing their actual situation where possible.
At least one must address the tension or cost from the Initial Reflection.
At least one must be immediately accessible today.
Mix formats: books, essays, talks, organisations, communities.
CRITICAL: Only include resources you are certain exist. Verify title and author are real before including. If uncertain, omit entirely. Three accurate items are better than five where one is invented or misattributed.

THE RULES:
- Speak directly throughout. "You" not "this pattern" or "this type."
- Never say "You are a [Archetype]." Say "The pattern most aligned with this movement is [Archetype]."
- Never use mechanical or systems theory language: "redistributive force," "adjustment mechanism," "relational vector," "calibration," or similar.
- Never smooth over blended or contradictory signals. Name the tension.
- Never motivate or celebrate. Responsibility carries weight, not energy.
- Never produce generic actions or resources. Every item must be specific to this person.
- Tone: warm, direct, plain. The same register as the Initial Reflection — not louder, just clearer.

THE TEST:
Could any sentence in Sections 2-5 appear in a generic profile for this archetype? If yes — add their specific words, moments, or decisions until it couldn't.

OUTPUT — return JSON only, no other text:
{
  "pattern_restatement": "1 paragraph",
  "archetype_frame": "1 paragraph",
  "domain_frame": "1 paragraph",
  "scale_frame": "1 paragraph",
  "responsibility": "2-4 sentences",
  "actions": {
    "light": "specific action with brief context",
    "medium": "specific action with brief context",
    "deep": "specific action with brief context"
  },
  "resources": [
    {"title": "Title — Author or Source", "why": "one sentence specific to this person"}
  ]
}`;

async function runPhase4(transcript, synthesis) {
  const transcriptText = transcript.map((entry, i) =>
    `Q${i+1} — ${QUESTIONS[i].label}\nAnswer: ${entry.answer}${entry.thin ? " [thin/evasive]" : ""}`
  ).join("\n\n");

  const payload = `PHASE 3 SYNTHESIS:\n${synthesis.synthesis_text}\n\nINTERNAL SIGNALS:\n${JSON.stringify(synthesis.internal_signals, null, 2)}\n\nORIGINAL ANSWERS:\n${transcriptText}`;

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system:     PHASE4_SYSTEM,
    messages:   [{ role: "user", content: payload }]
  });

  return extractJSON(response.content[0].text);
}

// ─── Sanitise text for safe HTML insertion ───────────────────────────────────
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Render Phase 4 as structured HTML ───────────────────────────────────────
function renderPhase4(p4) {

  // Extract archetype / domain / scale from frame text
  const archetypeMatch = p4.archetype_frame.match(/pattern most aligned with this (?:movement )?is ([\w]+)/i);
  const archetypeName  = archetypeMatch ? archetypeMatch[1] : "Your Pattern";

  const domainMatch = p4.domain_frame.match(/territory.*?is ([A-Z][a-z]+(?: ?[&A-Z][a-z]+)*)/); 
  const domainName  = domainMatch ? domainMatch[1].trim() : "";

  const scaleMatch = p4.scale_frame.match(/scale.*?is ([A-Z][a-z]+)/);
  const scaleName  = scaleMatch ? scaleMatch[1].trim() : "";

  const resourcesHtml = p4.resources.map(r =>
    `<div class="profile-resource">
      <div class="profile-resource-title">${esc(r.title)}</div>
      <div class="profile-resource-why">${esc(r.why)}</div>
    </div>`
  ).join("");

  return `<div class="profile-card">

    <div class="profile-hero">
      <div class="profile-card-heading">Your Purpose Piece</div>
      <div class="profile-archetype-name">${esc(archetypeName)}</div>
      <div class="profile-meta">${esc(domainName)}<span class="profile-meta-divider"></span>${esc(scaleName)}</div>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">Pattern</div>
      <p>${esc(p4.pattern_restatement)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">Archetype</div>
      <p>${esc(p4.archetype_frame)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">Domain</div>
      <p class="profile-domain-context">There are 7 domains of collective work. Yours is <strong>${esc(domainName)}</strong>.</p>
      <p>${esc(p4.domain_frame)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">Scale</div>
      <p>${esc(p4.scale_frame)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">Responsibility</div>
      <p>${esc(p4.responsibility)}</p>
    </div>

    <div class="profile-section profile-section-actions">
      <div class="profile-section-label">What this looks like</div>
      <div class="profile-actions">
        <div class="profile-action">
          <span class="profile-action-tier">This week</span>
          <span>${esc(p4.actions.light)}</span>
        </div>
        <div class="profile-action">
          <span class="profile-action-tier">Ongoing</span>
          <span>${esc(p4.actions.medium)}</span>
        </div>
        <div class="profile-action">
          <span class="profile-action-tier">Structural</span>
          <span>${esc(p4.actions.deep)}</span>
        </div>
      </div>
    </div>

    <div class="profile-section profile-section-resources">
      <div class="profile-section-label">Worth exploring</div>
      <div class="profile-resources">${resourcesHtml}</div>
    </div>

    <div class="profile-closing">Your Purpose Piece. This is where you fit.</div>

    <div class="profile-threshold">
      <div class="profile-threshold-eyebrow">First Look</div>
      <p class="profile-threshold-body">This is your pattern as it reads from the outside. The shape is here. What isn't here yet is the tension — what this costs you at the bone, where the instinct breaks, and what it has been asking of you that you haven't fully faced. That's the second conversation.</p>
      <button class="btn-go-deeper" onclick="App.goDeeper()">Go deeper &rarr;</button>
    </div>

  </div>`;
}

// ─── Welcome message ──────────────────────────────────────────────────────────
const WELCOME = `Five questions. Each one asks for a specific moment, a real decision, an honest cost.

Answer as yourself — not who you're working toward.

At the end, you'll receive a profile: your Purpose Piece, the domain where it belongs, the scale where it's most coherent right now, and what it asks of you.

The pattern speaks through what you actually do.`;

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  // ── Parse body ──────────────────────────────────────────────────────────────
  const { messages, session: clientSession } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array required" });
  }

  try {
    // ── New session (no session sent, or first call) ──────────────────────────
    let session = clientSession || null;

    if (!session || session.status === undefined) {
      session = createSession();
      // Send welcome first — client auto-advances into Q1
      // Previously jumped straight to questions, leaving WELCOME as dead code
      return res.status(200).json({
        message:      WELCOME,
        session,
        phase:        "welcome",
        phaseLabel:   "Signal Reading",
        inputMode:    "none",
        autoAdvance:  true,
        advanceDelay: 2200
      });
    }

    // ── Complete ──────────────────────────────────────────────────────────────
    if (session.status === "complete") {
      return res.status(200).json({
        message:   "Your Purpose Piece has been delivered. Refresh to begin again.",
        session,
        phase:     "complete",
        inputMode: "none"
      });
    }

    const userMessages = messages.filter(m => m.role === "user");
    const latestInput  = userMessages[userMessages.length - 1]?.content?.trim() || "";
    const qi           = session.questionIndex;

    // ── Welcome → Q1 ─────────────────────────────────────────────────────────
    if (session.phase === "welcome") {
      session.phase = "questions";
      return res.status(200).json({
        message:       QUESTIONS[0].text,
        questionLabel: `Question 1 of 5 — ${QUESTIONS[0].label}`,
        session,
        phase:         "questions",
        phaseLabel:    "Behavioural Evidence",
        questionIndex: 0,
        inputMode:     "text"
      });
    }

    // ── Question phase ────────────────────────────────────────────────────────
    if (session.phase === "questions") {
      const entry = session.transcript[qi];

      // No entry yet — first answer to this question
      if (!entry) {
        const thin = isThin(latestInput, qi);

        if (!thin) {
          session.transcript.push({ question: QUESTIONS[qi].text, answer: latestInput, probes: [], thin: false });
          session.probeCount = 0;
          session.questionIndex++;

          if (session.questionIndex >= 5) {
          // Return thinking state first — client will autoAdvance into synthesis
          session.phase = "thinking";
          return res.status(200).json({
            message:      "Reading the pattern in your answers.\n\nThis takes a moment...",
            session,
            phase:        "thinking",
            phaseLabel:   "Signal Reading",
            inputMode:    "none",
            autoAdvance:  true,
            advanceDelay: 2000
          });
        }

          return res.status(200).json({
            message:       QUESTIONS[session.questionIndex].text,
            questionLabel: `Question ${session.questionIndex + 1} of 5 — ${QUESTIONS[session.questionIndex].label}`,
            session,
            phase:         "questions",
            phaseLabel:    "Behavioural Evidence",
            questionIndex: session.questionIndex,
            inputMode:     "text"
          });
        }

        // Thin — probe 1
        session.transcript.push({ question: QUESTIONS[qi].text, answer: latestInput, probes: [], thin: false });
        session.probeCount = 1;
        return res.status(200).json({
          message: PROBES[qi][0], session, phase: "questions",
          phaseLabel: "Behavioural Evidence", inputMode: "text", isProbe: true
        });
      }

      // Responding to a probe
      const probeIndex = Math.min(session.probeCount - 1, PROBES[qi].length - 1);
      entry.probes.push({ probe: PROBES[qi][probeIndex], response: latestInput });
      const combined = entry.answer + " " + entry.probes.map(p => p.response).join(" ");
      const thin     = isThin(combined, qi);

      if (!thin || session.probeCount >= 2) {
        if (session.probeCount >= 2 && thin) {
          const check = await claudeSignalCheck(QUESTIONS[qi].text, combined);
          entry.thin = !check.has_signal;

          // Still no signal after two probes — hold one more time with a direct ask
          if (!check.has_signal && session.probeCount === 2) {
            session.probeCount = 3;
            return res.status(200).json({
              message: "I want to make sure I'm reading this accurately. Can you give me one specific example — a real moment, even a small one?",
              session,
              phase: "questions",
              phaseLabel: "Behavioural Evidence",
              inputMode: "text",
              isProbe: true
            });
          }

          // After probe 3 — acknowledge and move on
          if (session.probeCount >= 3) {
            entry.thin = true;
            session.probeCount = 0;
            session.questionIndex++;

            const acknowledgment = "Let's keep moving. I'll work with what's here.";

            if (session.questionIndex >= 5) {
              session.phase = "thinking";
              return res.status(200).json({
                message:      acknowledgment,
                session,
                phase:        "thinking",
                phaseLabel:   "Signal Reading",
                inputMode:    "none",
                autoAdvance:  true,
                advanceDelay: 2000
              });
            }

            return res.status(200).json({
              message:       acknowledgment,
              questionLabel: `Question ${session.questionIndex + 1} of 5 — ${QUESTIONS[session.questionIndex].label}`,
              nextMessage:   QUESTIONS[session.questionIndex].text,
              session,
              phase:         "questions",
              phaseLabel:    "Behavioural Evidence",
              questionIndex: session.questionIndex,
              inputMode:     "text"
            });
          }
        }

        session.probeCount = 0;
        session.questionIndex++;

        if (session.questionIndex >= 5) {
          session.phase = "thinking";
          return res.status(200).json({
            message:      "Reading the pattern in your answers.",
            session,
            phase:        "thinking",
            phaseLabel:   "Signal Reading",
            inputMode:    "none",
            autoAdvance:  true,
            advanceDelay: 500
          });
        }

        return res.status(200).json({
          message:       QUESTIONS[session.questionIndex].text,
          questionLabel: `Question ${session.questionIndex + 1} of 5 — ${QUESTIONS[session.questionIndex].label}`,
          session,
          phase:         "questions",
          phaseLabel:    "Behavioural Evidence",
          questionIndex: session.questionIndex,
          inputMode:     "text"
        });
      }

      // Still thin — probe 2
      session.probeCount = 2;
      return res.status(200).json({
        message: PROBES[qi][1], session, phase: "questions",
        phaseLabel: "Behavioural Evidence", inputMode: "text", isProbe: true
      });
    }

    // ── Thinking phase → trigger synthesis ───────────────────────────────────
    if (session.phase === "thinking") {
      return await synthesiseAndFrame(session, res);
    }

    // ── Framing phase (Phase 4) ───────────────────────────────────────────────
    if (session.phase === "framing") {
      return await frameAndDeliver(session, res);
    }

    return res.status(200).json({ message: "Something went wrong. Please refresh.", session, inputMode: "text" });

  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

// ─── Synthesis → framing pipeline ────────────────────────────────────────────
async function synthesiseAndFrame(session, res) {
  session.phase = "synthesis";

  let synthesis;
  try {
    synthesis = await runPhase3(session.transcript);
  } catch (e) {
    console.error("Phase 3 error:", e);
    return res.status(500).json({ error: "Synthesis failed", details: e.message });
  }

  session.synthesis = synthesis;
  session.phase     = "framing";

  return res.status(200).json({
    message:      synthesis.synthesis_text,
    sections:     synthesis.sections,
    session,
    phase:        "synthesis",
    phaseLabel:   "Signal Reading",
    inputMode:    "none",
    autoAdvance:  true,
    advanceDelay: 6000
  });
}

async function frameAndDeliver(session, res) {
  let p4;
  try {
    p4 = await runPhase4(session.transcript, session.synthesis);
  } catch (e) {
    console.error("Phase 4 error:", e);
    return res.status(500).json({ error: "Framing failed", details: e.message });
  }

  session.status = "complete";

  return res.status(200).json({
    message:    renderPhase4(p4),
    session,
    phase:      "complete",
    phaseLabel: "Your Purpose Piece",
    inputMode:  "none",
    complete:   true,
    profile:    p4
  });
}
