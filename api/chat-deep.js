// PURPOSE PIECE — DEEP EXPERIENCE ENGINE
// api/chat-deep.js
//
// Architecture: Tension → Shadow → Full Mirror → Deep Output
// Receives First Look session on first call (firstLook flag).
// Runs genuine back-and-forth conversation across three layers,
// then synthesises a deeper output anchored in what emerged.
//
// Session shape:
// {
//   phase: "tension" | "shadow" | "mirror" | "deep_output" | "complete",
//   firstLook: { archetype, domain, scale, synthesis, internal_signals, transcript },
//   conversationHistory: [ {role, content} ],
//   layerTurns: number,       // turns in current layer
//   shadowDepth: number,      // exchanges completed in shadow layer
//   complete: boolean
// }

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Robust JSON extractor ────────────────────────────────────────────────────
function extractJSON(text) {
  let clean = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  throw new Error("Could not extract JSON: " + text.slice(0, 200));
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Layer 1: Tension probe system prompt ────────────────────────────────────
// Uses cost_pattern from First Look internal_signals.
// Opens with a reflection on the cost — not a question, a statement.
// Then invites response.
function buildTensionPrompt(firstLook) {
  const { archetype, synthesis_text, internal_signals } = firstLook;
  const costPattern = internal_signals?.signals_detected?.cost_pattern || "";
  const avoidanceSignal = internal_signals?.signals_detected?.avoidance_signal || "";
  const movementStyle = internal_signals?.signals_detected?.movement_style || "";

  return `You are the opening voice of the Purpose Piece deep experience.

The person has completed the First Look — they know their archetype (${archetype}) and have seen the Initial Reflection. They chose to go deeper.

WHAT YOU KNOW FROM THE FIRST LOOK:
Synthesis: ${synthesis_text}
Cost pattern: ${costPattern}
Avoidance signal: ${avoidanceSignal}
Movement style: ${movementStyle}

YOUR JOB IN THIS FIRST MESSAGE:
Open the deep experience. Not a question — a reflection. Name what the First Look saw in the cost without softening it. Then create an opening for them to respond.

The tone is: we already know each other. You've listened. Now we go somewhere the First Look didn't have room to go.

WHAT THIS MESSAGE MUST DO:
- Reference the cost pattern specifically — not generically
- Name what was half-said in the First Look (what sits underneath what they said)
- End with an invitation, not a question. Something like: "I want to start there."
- 3-5 sentences total. Unhurried. No framing or preamble.

WHAT IT MUST NOT DO:
- Congratulate them for coming back
- Recap the First Look
- Ask a direct question
- Use "actually" or "clearly"
- Use archetype name as a label

Tone: the same voice as the Initial Reflection — direct, warm, precise. Like someone who has been thinking about what you said and knows where to go next.

Return plain text only. No JSON. No formatting.`;
}

// ─── Layer 2: Shadow conversation system prompt ───────────────────────────────
function buildShadowPrompt(firstLook) {
  const { archetype, synthesis_text, internal_signals } = firstLook;
  const costPattern = internal_signals?.signals_detected?.cost_pattern || "";
  const stressResponse = internal_signals?.signals_detected?.stress_response || "";
  const decisionBias = internal_signals?.signals_detected?.decision_bias || "";

  return `You are in a genuine conversation with someone exploring the shadow side of their pattern.

WHAT YOU KNOW:
Archetype: ${archetype}
Cost pattern: ${costPattern}
Stress response: ${stressResponse}
Decision bias: ${decisionBias}
First Look synthesis: ${synthesis_text}

YOUR JOB:
This is a real conversation — not scripted probing. Respond to what they actually say. Go deeper on what they bring. 

The three things this layer explores (in natural conversation, not as explicit questions):
1. Where does the instinct go too far? When does the pattern become the problem?
2. Where has this pattern been misread — by others, or by themselves?
3. What does it keep asking of them that they keep trying to put down?

CONVERSATION PRINCIPLES:
- Better to go three layers deep on one thing than surface-skim three things
- If they say something revealing, stay with it — don't pivot to the next topic
- If they deflect, name the deflection warmly and stay present
- Validate what's real. Challenge what's protective.
- Short responses are often more powerful than long ones here
- Never rush toward the output. The conversation is the value.

WHAT TO AVOID:
- Therapy language ("how does that make you feel", "it sounds like you're saying")
- Archetype names as labels
- Praise or flattery
- Generic shadow descriptions that could apply to anyone
- Summarising back what they just said

After 3-5 exchanges in this layer, the conversation will move toward the full mirror. You'll feel when there's enough — when something real has surfaced that wasn't in the First Look.

Return plain text only. Conversational. No formatting.`;
}

// ─── Layer 3: Full mirror prompt ─────────────────────────────────────────────
function buildMirrorPrompt(firstLook, conversationHistory) {
  const { archetype, synthesis_text, internal_signals } = firstLook;
  const conversationText = conversationHistory
    .map(m => `${m.role === "user" ? "Person" : "System"}: ${m.content}`)
    .join("\n\n");

  return `You are writing the Full Mirror — the moment before the deep output where the person sees themselves completely.

WHAT YOU KNOW FROM THE FIRST LOOK:
${synthesis_text}

WHAT EMERGED IN THE DEEP CONVERSATION:
${conversationText}

YOUR JOB:
Write a reflection that integrates both. Not a summary — a mirror. The person should feel that they have been seen fully for the first time, including the parts they tried to protect.

This reflection should:
- Name the pattern from the First Look sharper and shorter (one sentence)
- Name what emerged in this conversation that wasn't visible before
- Name the shadow directly — what the pattern costs, where it breaks, what it asks
- End with what this fully means — the weight and the possibility together

TONE: This is the "oh" moment. Not celebratory. Not clinical. The emotional endpoint is quiet recognition — "there it is."

LENGTH: 4-6 sentences. Every sentence must earn its place.

RULES:
- No archetype names as labels
- No "you are a..." language  
- No flattery
- No framing sentences ("In the deep conversation..." "Looking at what emerged...")
- Speak directly. Second person throughout.
- Plain language. No systems theory.

After this reflection, return this exact separator on its own line:
---READY---

Then on the next line, just write: "Ready to build your deep profile."`;
}

// ─── Deep output system prompt ────────────────────────────────────────────────
const DEEP_OUTPUT_SYSTEM = `You are writing the deep output for Purpose Piece — the final profile that emerges from a genuine conversation about shadow, tension, and cost.

This is not a repeat of the First Look profile. It is built from what actually emerged in the deep conversation. Every section must be anchored in something specific from that conversation.

THE NINE ARCHETYPES (for reference):
- STEWARD: Tends systems, ensures they remain whole. Maintains, repairs, sustains.
- MAKER: Builds what doesn't exist. Concept to creation. Values function over perfection.
- ARCHITECT: Designs structural conditions. Not the instance — the container. Makes systems sound.
- CONNECTOR: Weaves relationships. Sees who needs who. Creates belonging.
- GUARDIAN: Protects what matters. Recognises threats early. Holds standards.
- EXPLORER: Ventures into unknown territory. Comfortable with uncertainty. Brings back what's needed.
- SAGE: Sees patterns. Holds complexity. Clarifies meaning.
- MIRROR: Reflects what is true — about human experience, the interior life, the living world. Expression felt before it is understood. Makes the invisible visible and the unbearable bearable.
- EXEMPLAR: Contributes by being the example. Embodies the standard fully — in public, under pressure, at the edge of human capacity. Demonstration, not instruction.

STRUCTURE — seven sections:

1. pattern_full (1 paragraph):
The complete pattern — strength AND shadow together. Not "you do X and that's hard" — "you do X and that costs Y and that tension IS the thing." Anchored in the deep conversation.

2. shadow_named (1 paragraph):
Name the shadow directly. What the pattern becomes when it goes wrong. Where the instinct undermines itself. Specific to this person — not generic archetype shadow. Reference what surfaced in the conversation.

3. what_it_costs (1 paragraph):
Name the real cost. Not the acknowledged cost from the First Look — what came out in this conversation. The thing they've been carrying. Speak to it directly.

4. what_it_asks (2-4 sentences):
What this pattern asks of them now. Not a warning — a weight. Grounded in what emerged. One sentence naming what they are built for. One sentence naming what that requires.

5. actions_deep (3 tiers):
Light (this week): Something specific to what emerged in this conversation — not generic.
Medium (ongoing): Built from the shadow work — what recurring practice would address what surfaced.
Deep (structural): The thing the deep conversation pointed toward. The move the pattern has been asking for.

6. resources (3-5 items):
Chosen specifically for this person's shadow pattern and what emerged. Not the same as First Look resources. At least one addresses the specific cost named in this conversation. Title + author/source + one sentence why, referencing the conversation.

7. closing_line (1 sentence):
Not motivational. Not a summary. The one true thing that belongs at the end of this specific conversation.

RULES:
- Every section anchored in the deep conversation, not generic archetype descriptions
- Never: "You are a [Archetype]." Use: "The pattern most aligned..."
- No flattery. No celebration. Weight, not energy.
- Plain language. No clinical or systems theory terms.
- Speak directly. "You" throughout.
- If something important didn't come up in conversation — don't invent it. Work with what's there.

OUTPUT — return JSON only, no other text:
{
  "archetype": "archetype name for display",
  "domain": "domain name for display",
  "scale": "scale name for display",
  "pattern_full": "paragraph",
  "shadow_named": "paragraph",
  "what_it_costs": "paragraph",
  "what_it_asks": "2-4 sentences",
  "actions_deep": {
    "light": "specific action",
    "medium": "specific action",
    "deep": "specific action"
  },
  "resources": [
    {"title": "Title — Author", "why": "one sentence specific to this person"}
  ],
  "closing_line": "one sentence"
}`;

// ─── Run deep output generation ───────────────────────────────────────────────
async function runDeepOutput(firstLook, conversationHistory) {
  const conversationText = conversationHistory
    .map(m => `${m.role === "user" ? "Person" : "System"}: ${m.content}`)
    .join("\n\n");

  const payload = `FIRST LOOK SYNTHESIS:
${firstLook.synthesis_text}

INTERNAL SIGNALS FROM FIRST LOOK:
${JSON.stringify(firstLook.internal_signals, null, 2)}

ARCHETYPE: ${firstLook.archetype}
DOMAIN: ${firstLook.domain}
SCALE: ${firstLook.scale}

DEEP CONVERSATION:
${conversationText}`;

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system:     DEEP_OUTPUT_SYSTEM,
    messages:   [{ role: "user", content: payload }]
  });

  return extractJSON(response.content[0].text);
}

// ─── Render deep output as HTML ───────────────────────────────────────────────
function renderDeepOutput(d) {
  const resourcesHtml = (d.resources || []).map(r =>
    `<div class="profile-resource">
      <div class="profile-resource-title">${esc(r.title)}</div>
      <div class="profile-resource-why">${esc(r.why)}</div>
    </div>`
  ).join("");

  return `<div class="deep-output-card">

    <div class="deep-output-hero">
      <div class="deep-output-heading">The Deep Experience</div>
      <div class="deep-output-archetype">${esc(d.archetype)}</div>
      <div class="deep-output-meta">
        <span>${esc(d.domain)}</span>
        <span class="profile-meta-divider"></span>
        <span>${esc(d.scale)}</span>
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">The Full Pattern</div>
      <p>${esc(d.pattern_full)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">The Shadow</div>
      <p>${esc(d.shadow_named)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">What It Costs</div>
      <p>${esc(d.what_it_costs)}</p>
    </div>

    <div class="profile-section">
      <div class="profile-section-label">What It Asks</div>
      <p>${esc(d.what_it_asks)}</p>
    </div>

    <div class="profile-section profile-section-actions">
      <div class="profile-section-label">What this looks like now</div>
      <div class="profile-actions">
        <div class="profile-action">
          <span class="profile-action-tier">This week</span>
          <span>${esc(d.actions_deep?.light)}</span>
        </div>
        <div class="profile-action">
          <span class="profile-action-tier">Ongoing</span>
          <span>${esc(d.actions_deep?.medium)}</span>
        </div>
        <div class="profile-action">
          <span class="profile-action-tier">Structural</span>
          <span>${esc(d.actions_deep?.deep)}</span>
        </div>
      </div>
    </div>

    <div class="profile-section profile-section-resources">
      <div class="profile-section-label">Worth exploring</div>
      <div class="profile-resources">${resourcesHtml}</div>
    </div>

    <div class="deep-output-closing">${esc(d.closing_line)}</div>

  </div>`;
}

// ─── Count shadow exchanges ───────────────────────────────────────────────────
function countUserTurns(history) {
  return history.filter(m => m.role === "user").length;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { messages, session: clientSession, firstLook } = req.body || {};

  try {

    // ── First call: initialise session and open with tension probe ────────────
    if (!clientSession || clientSession.phase === "init") {

      if (!firstLook) {
        return res.status(400).json({ error: "First Look data required" });
      }

      // Build tension opening
      const tensionSystemPrompt = buildTensionPrompt(firstLook);
      const openingResponse = await anthropic.messages.create({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages:   [{
          role: "user",
          content: `Open the deep experience. The person has just arrived from the First Look. Generate the opening reflection based on your instructions.`
        }],
        system: tensionSystemPrompt
      });

      const openingText = openingResponse.content[0].text.trim();

      const session = {
        phase:               "shadow",
        firstLook:           firstLook,
        conversationHistory: [{ role: "assistant", content: openingText }],
        userTurns:           0,
        complete:            false
      };

      return res.status(200).json({
        message:   openingText,
        session,
        phase:     "shadow",
        inputMode: "text"
      });
    }

    // ── Ongoing conversation ──────────────────────────────────────────────────
    let session = clientSession;
    const userMessages = (messages || []).filter(m => m.role === "user");
    const latestInput  = userMessages[userMessages.length - 1]?.content?.trim() || "";

    if (!latestInput) {
      return res.status(400).json({ error: "No user message" });
    }

    // Add user turn to history
    session.conversationHistory.push({ role: "user", content: latestInput });
    session.userTurns = (session.userTurns || 0) + 1;

    // ── Shadow phase ──────────────────────────────────────────────────────────
    if (session.phase === "shadow") {
      const userTurns = session.userTurns;

      // After 3 user turns minimum, check if we have enough to move to mirror
      // We move after 3-5 turns — let the conversation breathe
      const readyForMirror = userTurns >= 3;

      if (readyForMirror) {
        // Move to mirror phase
        session.phase = "mirror";

        const mirrorPrompt = buildMirrorPrompt(session.firstLook, session.conversationHistory);
        const mirrorResponse = await anthropic.messages.create({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages:   [{ role: "user", content: "Write the full mirror now." }],
          system:     mirrorPrompt
        });

        const mirrorText = mirrorResponse.content[0].text.trim();

        // Split mirror from "---READY---" marker
        const parts = mirrorText.split("---READY---");
        const mirrorReflection = parts[0].trim();
        const readyMessage = parts[1]?.trim() || "Ready to build your deep profile.";

        session.conversationHistory.push({ role: "assistant", content: mirrorReflection });

        return res.status(200).json({
          message:      mirrorReflection,
          session,
          phase:        "mirror",
          phaseLabel:   "Full Mirror",
          inputMode:    "none",
          autoAdvance:  true,
          advanceDelay: 5000
        });

      } else {
        // Continue shadow conversation
        const shadowSystem = buildShadowPrompt(session.firstLook);

        // Build full message history for context
        const apiMessages = session.conversationHistory.map(m => ({
          role:    m.role,
          content: m.content
        }));

        const shadowResponse = await anthropic.messages.create({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 500,
          system:     shadowSystem,
          messages:   apiMessages
        });

        const responseText = shadowResponse.content[0].text.trim();
        session.conversationHistory.push({ role: "assistant", content: responseText });

        return res.status(200).json({
          message:   responseText,
          session,
          phase:     "shadow",
          inputMode: "text"
        });
      }
    }

    // ── Mirror phase — auto-advances to deep output ───────────────────────────
    if (session.phase === "mirror") {
      session.phase = "generating";

      let deepData;
      try {
        deepData = await runDeepOutput(session.firstLook, session.conversationHistory);
      } catch (e) {
        console.error("Deep output error:", e);
        return res.status(500).json({ error: "Deep output generation failed", details: e.message });
      }

      session.complete = true;
      session.phase    = "complete";

      return res.status(200).json({
        message:    renderDeepOutput(deepData),
        session,
        phase:      "complete",
        phaseLabel: "Deep Experience",
        inputMode:  "none",
        complete:   true
      });
    }

    // ── Complete ──────────────────────────────────────────────────────────────
    if (session.phase === "complete") {
      return res.status(200).json({
        message:   "Your deep experience is complete.",
        session,
        phase:     "complete",
        inputMode: "none",
        complete:  true
      });
    }

    return res.status(200).json({
      message:   "Something went wrong. Please refresh.",
      session,
      inputMode: "text"
    });

  } catch (error) {
    console.error("Deep API error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
