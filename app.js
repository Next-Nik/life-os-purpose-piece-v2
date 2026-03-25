// PURPOSE PIECE — APP LOGIC
// Session management, API communication, event handling.
// Depends on ui.js (loaded first via index.html).

// ─── Supabase init ────────────────────────────────────────────────────────────
let _supabase = null;
function initSupabase() {
  if (_supabase) return _supabase;
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR_")) return null;
  try {
    _supabase = window.supabase.createClient(url, key);
    return _supabase;
  } catch { return null; }
}

async function supabaseSavePurposePiece(session, userId) {
  const sb = initSupabase();
  if (!sb || !userId || !session) return;
  try {
    await sb.from("purpose_piece_sessions").insert({
      user_id:            userId,
      archetype:          session.archetype           || null,
      domain:             session.domain              || null,
      scale:              session.scale               || null,
      pattern_restatement:session.pattern_restatement || null,
      archetype_frame:    session.synthesis?.archetype_frame    || null,
      domain_frame:       session.synthesis?.domain_frame       || null,
      scale_frame:        session.synthesis?.scale_frame        || null,
      responsibility:     session.synthesis?.responsibility     || null,
      actions:            session.synthesis?.actions            || null,
      resources:          session.synthesis?.resources          || null,
      synthesis:          session.synthesis            || null,
      transcript:         session.transcript           || null,
      completed_at:       new Date().toISOString()
    });
    console.log('[PurposePiece] Session saved to Supabase');
  } catch (err) {
    console.warn('[PurposePiece] Save failed:', err);
  }
}

const App = {
  session: null,
  currentPhase: null,
  currentOptions: null,
  isWaiting: false,
  userId: null,

  // ─── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.bindEvents();
    this.checkExistingAuth();
  },

  async checkExistingAuth() {
    const sb = initSupabase();
    if (!sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) this.userId = session.user.id;
    } catch {}
  },

  bindEvents() {
    const sendBtn = document.getElementById("send-btn");
    const input   = document.getElementById("user-input");
    let currentSlide = 0;
    const totalSlides = 3;
    const track  = document.getElementById("carousel-track");
    const arrow  = document.getElementById("carousel-arrow");
    const dots   = document.querySelectorAll(".carousel-dot");

    const advanceCarousel = () => {
      currentSlide++;
      track.style.transform = `translateX(-${currentSlide * 33.333}%)`;
      dots.forEach((d, i) => d.classList.toggle("active", i === currentSlide));

      if (currentSlide === totalSlides - 1) {
        arrow.outerHTML = `<button class="carousel-begin" id="carousel-arrow">Find where you fit</button>`;
        document.getElementById("carousel-arrow").addEventListener("click", () => this.startConversation());
      }
    };

    if (arrow) arrow.addEventListener("click", advanceCarousel);
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

  // ─── Ensure anonymous session ─────────────────────────────────────────────
  async ensureSession() {
    if (this.userId) return;
    const sb = initSupabase();
    if (!sb) return;
    try {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) { console.warn('[PurposePiece] Anonymous sign-in failed:', error.message); return; }
      if (data?.user) {
        this.userId = data.user.id;
        console.log('[PurposePiece] Anonymous session created:', data.user.id);
      }
    } catch (err) {
      console.warn('[PurposePiece] ensureSession error:', err);
    }
  },

  // ─── Start ─────────────────────────────────────────────────────────────────
  async startConversation() {
    UI.hideWelcome();
    UI.showChat();
    await this.ensureSession();

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

    // Save to Supabase on completion
    if (data.complete && this.userId && this.session) {
      supabaseSavePurposePiece(this.session, this.userId);
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
  addAssistantMessage(text) {
    const chatContainer = document.getElementById("chat-container");
    const el = UI.createAssistantMessage(text);
    chatContainer.appendChild(el);
    UI.scrollToMessage(el);
    UI.enableInput();
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
window.App = App;

function startConversation() {
  App.startConversation();
}
