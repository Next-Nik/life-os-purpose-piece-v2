// PURPOSE PIECE — UI COMPONENTS
// Builds DOM elements. No API calls, no business logic, no state management.
// Called by app.js.

const UI = {

  // ─── Message bubbles ────────────────────────────────────────────────────────
  createAssistantMessage(text, isSynthesis = false) {
    const div = document.createElement("div");

    // Profile delivery: HTML from renderPhase4
    if (text.includes("profile-card")) {
      div.className = "message message-profile";
      div.innerHTML = text;
      return div;
    }

    // Synthesis mirror: HTML with headed card
    if (text.includes("synthesis-card")) {
      div.className = "message message-profile";
      div.innerHTML = text;
      return div;
    }

    // Synthesis mirror (plain text phase) — parchment exception
    if (isSynthesis) {
      div.className = "message message-synthesis-mirror";
      div.textContent = text;
      return div;
    }

    // All other Signal Reader messages — dark
    div.className = "message message-assistant";
    div.textContent = text;
    return div;
  },

  createUserMessage(text) {
    const div = document.createElement("div");
    div.className = "message message-user";
    div.textContent = text;
    return div;
  },

  // ─── Phase divider ──────────────────────────────────────────────────────────
  createPhaseDivider(label) {
    const div = document.createElement("div");
    div.className = "phase-divider";
    div.innerHTML = `<span>${label}</span>`;
    return div;
  },

  // ─── Option buttons (A–G for Phase 1, A–E for subdomains) ──────────────────
  // options: [{id, text}]
  // onSelect: callback(selectedId, selectedText)
  createOptionButtons(options, onSelect) {
    const container = document.createElement("div");
    container.className = "option-buttons";

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.dataset.id = opt.id;
      btn.innerHTML = `<span class="option-letter">${opt.id.toUpperCase()}</span><span>${opt.text}</span>`;

      btn.addEventListener("click", () => {
        // Visual selection
        container.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");

        // Disable all after selection (prevent double-click)
        container.querySelectorAll(".option-btn").forEach(b => { b.disabled = true; });

        // Callback
        setTimeout(() => onSelect(opt.id, opt.text), 200);
      });

      container.appendChild(btn);
    });

    return container;
  },

  // ─── Typing indicator ───────────────────────────────────────────────────────
  createTypingIndicator() {
    const div = document.createElement("div");
    div.className = "typing-indicator active";
    div.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    return div;
  },

  showTyping() {
    const indicators = document.querySelectorAll(".typing-indicator");
    indicators.forEach(el => el.classList.add("active"));
  },

  hideTyping() {
    const indicators = document.querySelectorAll(".typing-indicator");
    indicators.forEach(el => el.remove());
  },

  // ─── Progress bar ───────────────────────────────────────────────────────────
  // Phase → approximate fill percentage
  PHASE_PROGRESS: {
    1:                  15,
    "1-tiebreaker":     20,
    "2-fork":           30,
    "2-domain":         45,
    "2-scale":          60,
    "3-handoff":        75,
    "thinking":         80,
    "synthesis":        85,
    3:                  85,
    4:                  100
  },

  updateProgress(phase, label) {
    const fill = document.getElementById("progress-fill");
    const labelEl = document.getElementById("progress-label");
    if (fill) {
      const pct = UI.PHASE_PROGRESS[phase] || 0;
      fill.style.width = pct + "%";
    }
    if (labelEl && label) {
      labelEl.textContent = label;
    }
  },

  // ─── Input area ─────────────────────────────────────────────────────────────
  setInputMode(mode) {
    // mode: "text" | "buttons" | "none"
    const inputArea = document.getElementById("input-area");
    const input     = document.getElementById("user-input");
    const sendBtn   = document.getElementById("send-btn");

    if (!inputArea) return;

    if (mode === "none") {
      inputArea.style.display = "none";
      return;
    }

    inputArea.style.display = "";

    if (mode === "text") {
      input.disabled    = false;
      sendBtn.disabled  = false;
      input.placeholder = "Type your answer...";
      input.focus();
    }

    if (mode === "buttons") {
      // Buttons handle their own selection — text input still available for off-road
      input.placeholder = "Or type your response...";
      input.disabled    = false;
      sendBtn.disabled  = false;
    }
  },

  disableInput() {
    const input   = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    if (input)   input.disabled   = true;
    if (sendBtn) sendBtn.disabled = true;
  },

  enableInput() {
    const input   = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");
    if (input)   input.disabled   = false;
    if (sendBtn) sendBtn.disabled = false;
  },

  clearInput() {
    const input = document.getElementById("user-input");
    if (input) {
      input.value = "";
      input.style.height = "auto";
    }
  },

  // ─── Scroll ─────────────────────────────────────────────────────────────────
  // Scroll so the new message appears near the top of the viewport
  scrollToMessage(el) {
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  },

  scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  },

  // ─── Welcome screen ─────────────────────────────────────────────────────────
  hideWelcome() {
    const welcome = document.getElementById("welcome-screen");
    if (welcome) welcome.style.display = "none";
  },

  showChat() {
    const chat = document.getElementById("chat-area");
    if (chat) chat.style.display = "flex";
  }
};

// Make available globally (loaded via script tag in index.html)
window.UI = UI;
