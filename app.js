// PURPOSE PIECE — APP LOGIC
// Session management, API communication, event handling.
// Depends on ui.js (loaded first via index.html).

const App = {
  session: null,
  currentPhase: null,
  currentOptions: null,
  isWaiting: false,
  messageHistory: [],   // [{role, content, domEl}] for back navigation

  // ─── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.bindEvents();
    this.checkExistingAuth();
  },

  async checkExistingAuth() {
    if (window.LIFEOS_USER_ID) {
      this.userId = window.LIFEOS_USER_ID;
    }
  },


// ─── NextUs vocabulary normalisation ─────────────────────────────────────────
// Maps raw archetype/domain/scale strings from Phase 4 to locked NextUs values

const DOMAIN_MAP = {
  "human being":    "human-being",
  "humanbeing":     "human-being",
  "human-being":    "human-being",
  "society":        "society",
  "nature":         "nature",
  "technology":     "technology",
  "finance":        "finance-economy",
  "finance & economy": "finance-economy",
  "finance and economy": "finance-economy",
  "finance-economy":"finance-economy",
  "economy":        "finance-economy",
  "legacy":         "legacy",
  "vision":         "vision"
};

const SCALE_MAP = {
  "local":          "local",
  "municipal":      "municipal",
  "regional":       "regional",
  "national":       "national",
  "international":  "international",
  "global":         "global",
  "civilisational": "global",
  "civilizational": "global",
  "bioregional":    "regional"
};

function normaliseDomain(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().trim().replace(/[^a-z& ]/g, "");
  return DOMAIN_MAP[key] || null;
}

function normaliseScale(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return SCALE_MAP[key] || null;
}

function normaliseArchetype(raw) {
  if (!raw) return null;
  // Capitalise first letter, lowercase rest
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
}

// ─── Supabase save on completion ──────────────────────────────────────────────
let _ppSessionRowId = null;

async function supabaseSavePurposePiece(session, userId, profile, isComplete, identitySystem) {
  const sb = window.supabase?.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );
  if (!sb || !userId) return null;

  // Extract and normalise coordinates from profile
  const archetypeRaw = profile ? extractArchetypeName(profile.archetype_frame) : null;
  const domainRaw    = profile ? extractDomainName(profile.domain_frame)       : null;
  const scaleRaw     = profile ? extractScaleName(profile.scale_frame)         : null;

  const archetype = normaliseArchetype(archetypeRaw);
  const domain    = normaliseDomain(domainRaw);
  const scale     = normaliseScale(scaleRaw);

  try {
    if (_ppSessionRowId) {
      await sb.from("purpose_piece_sessions").update({
        archetype,
        domain,
        scale,
        pattern_restatement: profile?.pattern_restatement || null,
        archetype_frame:     profile?.archetype_frame     || null,
        domain_frame:        profile?.domain_frame        || null,
        scale_frame:         profile?.scale_frame         || null,
        responsibility:      profile?.responsibility      || null,
        actions:             profile?.actions             || null,
        resources:           profile?.resources           || null,
        synthesis:           session?.synthesis           || null,
        transcript:          session?.transcript          || null,
        completed_at:        isComplete ? new Date().toISOString() : null
      }).eq("id", _ppSessionRowId);
    } else {
      const { data, error } = await sb.from("purpose_piece_sessions").insert({
        user_id:                   userId,
        archetype,
        domain,
        scale,
        transcript:                session?.transcript || null,
        identity_statement_system: identitySystem || null,
        completed_at:              isComplete ? new Date().toISOString() : null
      }).select("id").single();
      if (!error && data?.id) {
        _ppSessionRowId = data.id;
        console.log("[PurposePiece] Session row created:", data.id);
      }
    }
    return _ppSessionRowId;
  } catch (err) {
    console.warn("[PurposePiece] Save failed:", err);
    return null;
  }
}

// Extract archetype/domain/scale from Phase 4 frame text
function extractArchetypeName(frame) {
  if (!frame) return null;
  const m = frame.match(/pattern most aligned with this (?:movement )?is ([\w]+)/i);
  return m ? m[1] : null;
}

function extractDomainName(frame) {
  if (!frame) return null;
  const m = frame.match(/territory.*?is ([A-Z][a-z]+(?: ?[&A-Z][a-z]+)*)/);
  return m ? m[1].trim() : null;
}

function extractScaleName(frame) {
  if (!frame) return null;
  const m = frame.match(/scale.*?is ([A-Z][a-z]+)/);
  return m ? m[1].trim() : null;
}

  bindEvents() {
    // Single entry screen — direct bind to begin button
    const beginBtn = document.getElementById("begin-btn");
    if (beginBtn) beginBtn.addEventListener("click", () => this.startConversation());

    const sendBtn = document.getElementById("send-btn");
    const input   = document.getElementById("user-input");

    if (sendBtn) sendBtn.addEventListener("click", () => this.sendUserInput());

    if (input) {
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendUserInput();
        }
      });
    }
  },

  // ─── Start ─────────────────────────────────────────────────────────────────
  async startConversation() {
    UI.hideWelcome();
    UI.showChat();
    UI.showNavBar(
      () => this.goBack(),
      () => this.restart()
    );

    const chatContainer = document.getElementById("chat-container");
    const typingEl = UI.createTypingIndicator();
    chatContainer.appendChild(typingEl);
    UI.showTyping();
    UI.scrollToBottom();

    try {
      const data = await this.callAPI([]);
      UI.hideTyping();
      this.handleAPIResponse(data, true);
    } catch (err) {
      UI.hideTyping();
      this.addAssistantMessage("Something went wrong getting started. Please refresh and try again.");
    }
  },

  // ─── Send user input ────────────────────────────────────────────────────────
  sendUserInput() {
    if (this.isWaiting) return;
    const input = document.getElementById("user-input");
    const text  = input ? input.value.trim() : "";
    if (!text) return;
    this.sendMessage(text);
  },

  sendMessage(text, suppressBubble = false) {
    if (this.isWaiting) return;
    this.isWaiting = true;

    UI.clearInput();
    UI.disableInput();

    const chatContainer = document.getElementById("chat-container");

    if (!suppressBubble) {
      const userBubble = UI.createUserMessage(text);
      chatContainer.appendChild(userBubble);
      this.messageHistory.push({ role: "user", content: text, domEl: userBubble });
      UI.scrollToMessage(userBubble);
    }

    const typingEl = UI.createTypingIndicator();
    chatContainer.appendChild(typingEl);
    UI.showTyping();

    const messages = [{ role: "user", content: text }];

    this.callAPI(messages)
      .then(data => {
        UI.hideTyping();
        this.handleAPIResponse(data);
        this.isWaiting = false;
      })
      .catch(() => {
        UI.hideTyping();
        this.addAssistantMessage("Something went wrong. Please try again.");
        UI.enableInput();
        this.isWaiting = false;
      });
  },

  // ─── API call ───────────────────────────────────────────────────────────────
  async callAPI(messages) {
    const body = { messages, session: this.session };
    const response = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  // ─── Handle API response ────────────────────────────────────────────────────
  handleAPIResponse(data, isFirst = false) {
    if (data.session) this.session = data.session;

    const chatContainer = document.getElementById("chat-container");

    // Phase transition divider
    if (data.phase && data.phase !== this.currentPhase) {
      if (this.currentPhase !== null && data.phaseLabel) {
        const divider = UI.createPhaseDivider(data.phaseLabel);
        chatContainer.appendChild(divider);
      }
      this.currentPhase = data.phase;
    }

    // Update progress bar
    if (data.phase !== undefined) {
      UI.updateProgress(data.phase, data.phaseLabel);
    }

    // Assistant message
    if (data.message) {
      // Question label — rendered as a visual header above the question body
      if (data.questionLabel) {
        const hr = document.createElement("hr");
        hr.className = "section-break";
        chatContainer.appendChild(hr);

        const header = document.createElement("div");
        header.className = "question-header";
        header.textContent = data.questionLabel;
        chatContainer.appendChild(header);
      }

      const isSynthesis = data.phase === "synthesis";

      // Synthesis with sections — render gold headers
      if (isSynthesis && data.sections) {
        const sectionOrder = [
          { key: "your_signal",  label: "Your Signal" },
          { key: "your_engine",  label: "Your Engine" },
          { key: "your_calling", label: "Your Calling" },
          { key: "the_cost",     label: "The Cost" }
        ];
        const wrapper = document.createElement("div");
        wrapper.className = "message message-synthesis-mirror";
        const heading = document.createElement("div");
        heading.className = "synthesis-heading";
        heading.textContent = "Initial Reflection";
        wrapper.appendChild(heading);
        const intro = document.createElement("div");
        intro.className = "synthesis-intro";
        intro.textContent = "Here's what the pattern in your answers is telling me.";
        wrapper.appendChild(intro);
        sectionOrder.forEach(({ key, label }) => {
          const text = data.sections[key];
          if (!text) return;
          const section = document.createElement("div");
          section.className = "synthesis-section";
          section.innerHTML = `<div class="synthesis-section-label">${label}</div><p>${text}</p>`;
          wrapper.appendChild(section);
        });
        chatContainer.appendChild(wrapper);
        setTimeout(() => wrapper.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      } else {
        const msgEl = UI.createAssistantMessage(data.message, isSynthesis);
        chatContainer.appendChild(msgEl);
        setTimeout(() => msgEl.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    }

    // nextMessage: post-probe-3 case — acknowledgment rendered first, question follows
    if (data.nextMessage) {
      setTimeout(() => {
        const msgEl = UI.createAssistantMessage(data.nextMessage);
        chatContainer.appendChild(msgEl);
        setTimeout(() => msgEl.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }, 600);
    }

    // Option buttons
    if (data.inputMode === "buttons" && data.options && data.options.length > 0) {
      this.currentOptions = data.options;
      const buttonsEl = UI.createOptionButtons(data.options, (id, text) => {
        const displayText = `${id.toUpperCase()}) ${text}`;
        const chatContainer = document.getElementById("chat-container");
        const userBubble = UI.createUserMessage(displayText);
        chatContainer.appendChild(userBubble);
        UI.scrollToMessage(userBubble);
        this.sendMessage(id.toUpperCase(), true);
      });
      chatContainer.appendChild(buttonsEl);
      UI.scrollToMessage(buttonsEl);
    }

    // Set input mode
    if (data.complete) {
      UI.setInputMode("none");
    } else {
      UI.setInputMode(data.inputMode || "text");
    }

    // Auto-advance — three phases use this
    if (data.autoAdvance) {
      const delay = data.advanceDelay || 500;
      UI.setInputMode("none");

      if (data.phase === "welcome") {
        // Welcome → Q1: brief pause then fire Q1
        setTimeout(() => {
          const typingEl = UI.createTypingIndicator();
          chatContainer.appendChild(typingEl);
          UI.scrollToMessage(typingEl);
          App.callAPI([]).then(q1data => {
            typingEl.remove();
            App.handleAPIResponse(q1data);
          }).catch(e => {
            typingEl.remove();
            console.error("Welcome auto-advance error:", e);
          });
        }, delay);

      } else if (data.phase === "thinking") {
        // Thinking → synthesis
        setTimeout(() => {
          const typingEl = UI.createTypingIndicator();
          chatContainer.appendChild(typingEl);
          UI.scrollToMessage(typingEl);
          App.callAPI([]).then(synthData => {
            typingEl.remove();
            App.handleAPIResponse(synthData);
          }).catch(e => {
            typingEl.remove();
            console.error("Synthesis auto-advance error:", e);
          });
        }, delay);

      } else if (data.phase === "synthesis") {
        // Synthesis → profile
        setTimeout(() => {
          const bridgeEl = UI.createAssistantMessage("Building your profile now...");
          chatContainer.appendChild(bridgeEl);
          UI.scrollToMessage(bridgeEl);

          const typingEl = UI.createTypingIndicator();
          chatContainer.appendChild(typingEl);
          UI.scrollToMessage(typingEl);

          App.callAPI([]).then(p4data => {
            typingEl.remove();
            bridgeEl.remove();
            App.handleAPIResponse(p4data);
          }).catch(e => {
            typingEl.remove();
            bridgeEl.remove();
            console.error("Profile auto-advance error:", e);
          });
        }, delay);
      }
    }
  },

  // ─── Go Deeper ──────────────────────────────────────────────────────────────
  goDeeper() {
    try {
      sessionStorage.setItem('pp_first_look', JSON.stringify(this.session));
    } catch(e) {
      console.warn('sessionStorage unavailable:', e);
    }

    const unlocked = localStorage.getItem('pp_deep_unlocked') === 'true';
    if (!unlocked) {
      this.showDeepGate();
      return;
    }

    window.location.href = '/deep';
  },

  showDeepGate() {
    const existing = document.getElementById('deep-gate-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'deep-gate-overlay';
    overlay.className = 'deep-gate-overlay';
    overlay.innerHTML = `
      <div class="deep-gate-card">
        <div class="deep-gate-eyebrow">Go Deeper</div>
        <h2 class="deep-gate-heading">The tension. The shadow. The full picture.</h2>
        <p class="deep-gate-body">The First Look gave you the shape. The Deep Dive is a real conversation — into what this pattern costs you, where it breaks, and what it's been asking of you. You leave knowing not just what you are, but what that fully asks.</p>
        <button class="deep-gate-cta" onclick="App.unlockDeep()">Unlock the Deep Dive</button>
        <button class="deep-gate-dismiss" onclick="document.getElementById('deep-gate-overlay').remove()">Not now</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  unlockDeep() {
    localStorage.setItem('pp_deep_unlocked', 'true');
    document.getElementById('deep-gate-overlay')?.remove();
    window.location.href = '/deep';
  },

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // ─── Purpose Piece personal note mechanic ─────────────────────────────────
  onPpNoteInput(value) {
    const lockBtn   = document.getElementById("ppLockBtn");
    const expandBtn = document.getElementById("ppExpandBtn");
    if (lockBtn) lockBtn.style.display = value.trim() ? "block" : "none";
    try { localStorage.setItem("lifeos_pp_personal_note", value); } catch {}
  },

  togglePpProfile() {
    const summary   = document.getElementById("ppProfileSummary");
    const btn       = document.getElementById("ppExpandBtn");
    if (!summary) return;
    const isOpen    = summary.style.display !== "none";
    summary.style.display = isOpen ? "none" : "block";
    btn.textContent = isOpen ? "See your Purpose Piece profile →" : "Hide profile ↑";
  },

  async lockPpNote() {
    const textarea  = document.getElementById("ppPersonalNote");
    const lockBtn   = document.getElementById("ppLockBtn");
    const lockedMsg = document.getElementById("ppLockedMsg");
    const value     = textarea?.value?.trim();
    if (!value) return;

    if (this.userId && _ppSessionRowId) {
      try {
        const sb = window.supabase?.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        if (sb) {
          // Write user version to the session row — system version is untouched
          await sb.from("purpose_piece_sessions").update({
            identity_statement_user: value
          }).eq("id", _ppSessionRowId);
        }
      } catch (err) {
        console.warn("[PurposePiece] Note lock save failed:", err);
      }
    }

    try { localStorage.setItem("lifeos_pp_personal_locked", value); } catch {}

    if (lockBtn)   lockBtn.style.display   = "none";
    if (lockedMsg) lockedMsg.style.display = "block";
    if (textarea)  textarea.style.borderStyle = "solid";
  },

  // ─── Navigation ────────────────────────────────────────────────────────────
  goBack() {
    if (this.messageHistory.length < 2) return;
    // Remove last assistant + last user exchange from DOM and history
    const lastAssistant = this.messageHistory.pop();
    const lastUser      = this.messageHistory.pop();
    if (lastAssistant?.domEl) lastAssistant.domEl.remove();
    if (lastUser?.domEl)      lastUser.domEl.remove();
    // Also pop from conversation array (used for API calls)
    if (this.session?.transcript?.length >= 2) {
      this.session.transcript = this.session.transcript.slice(0, -2);
    }
    UI.enableInput();
    UI.setInputMode("text");
    UI.setBackEnabled(this.messageHistory.length >= 2);
  },

  restart() {
    // Clear everything and return to entry card
    this.session         = null;
    this.currentPhase    = null;
    this.currentOptions  = null;
    this.isWaiting       = false;
    this.messageHistory  = [];
    document.getElementById("chat-container").innerHTML = "";
    document.getElementById("chat-area").style.display = "none";
    document.getElementById("progress-container").style.display = "none";
    document.getElementById("progress-fill").style.width = "0%";
    document.getElementById("input-area").style.display = "none";
    document.getElementById("welcome-screen").style.display = "";
    UI.hideNavBar();
  },

  addAssistantMessage(text) {
    const chatContainer = document.getElementById("chat-container");
    const el = UI.createAssistantMessage(text);
    chatContainer.appendChild(el);
    this.messageHistory.push({ role: "assistant", content: text, domEl: el });
    UI.setBackEnabled(this.messageHistory.length >= 2);
    UI.scrollToMessage(el);
    UI.enableInput();
  }
};

// App.init() is called by the lifeos:auth event in index.html
// This prevents the race condition where init fires before auth resolves
window.App = App;

function startConversation() {
  App.startConversation();
}
