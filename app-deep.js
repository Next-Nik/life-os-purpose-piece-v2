// PURPOSE PIECE — DEEP EXPERIENCE APP LOGIC
// app-deep.js
// Depends on ui.js (loaded first via deep.html).
// Reads First Look session from sessionStorage, starts deep conversation.

const DeepApp = {
  session:   null,
  firstLook: null,
  isWaiting: false,

  // ─── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.bindEvents();
    this.loadFirstLook();
  },

  loadFirstLook() {
    // Retrieve First Look session stored by app.js when Go Deeper was clicked
    try {
      const raw = sessionStorage.getItem('pp_first_look');
      if (raw) {
        const firstLookSession = JSON.parse(raw);

        // Extract what the deep engine needs from the First Look session
        // The synthesis and internal_signals live in session.synthesis
        const synthesis = firstLookSession.synthesis || {};
        this.firstLook = {
          archetype:        this.extractArchetype(firstLookSession),
          domain:           firstLookSession.domain || null,
          scale:            firstLookSession.scale  || null,
          synthesis_text:   synthesis.synthesis_text || "",
          internal_signals: synthesis.internal_signals || {},
          transcript:       firstLookSession.transcript || []
        };
      }
    } catch (e) {
      console.warn('Could not load First Look session:', e);
    }

    // If no First Look data — show a gentle redirect message
    if (!this.firstLook || !this.firstLook.synthesis_text) {
      this.showNoFirstLookMessage();
      return;
    }

    this.startDeepConversation();
  },

  // Extract archetype name from First Look session
  // The profile card renders it in .profile-archetype-name but the session
  // stores it via the Phase 4 archetype_frame text — parse it out
  extractArchetype(session) {
    // Try direct property first
    if (session.archetype) return session.archetype;
    // Try to extract from last profile if present
    if (session.synthesis?.internal_signals) {
      // Best we can do without re-parsing — return unknown and let engine infer
      return "Unknown";
    }
    return "Unknown";
  },

  showNoFirstLookMessage() {
    const chatContainer = document.getElementById('chat-container');
    const msg = document.createElement('div');
    msg.className = 'message message-assistant';
    msg.textContent = 'The deep experience begins after the First Look. Complete the Purpose Piece assessment first, then return here.';
    chatContainer.appendChild(msg);

    const link = document.createElement('a');
    link.href = '/';
    link.className = 'btn-go-deeper';
    link.style.display = 'inline-block';
    link.style.marginTop = '16px';
    link.style.textDecoration = 'none';
    link.textContent = '← Start the First Look';
    chatContainer.appendChild(link);
  },

  bindEvents() {
    const sendBtn = document.getElementById('send-btn');
    const input   = document.getElementById('user-input');

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendUserInput());
    }

    if (input) {
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendUserInput();
        }
      });
    }
  },

  // ─── Start deep conversation ───────────────────────────────────────────────
  async startDeepConversation() {
    const chatContainer = document.getElementById('chat-container');

    // Brief opening label
    const label = document.createElement('div');
    label.className = 'deep-layer-label';
    label.textContent = 'The tension';
    chatContainer.appendChild(label);

    // Show typing
    const typingEl = UI.createTypingIndicator();
    chatContainer.appendChild(typingEl);
    UI.showTyping();
    UI.scrollToBottom();

    try {
      const data = await this.callAPI([], true);
      UI.hideTyping();
      this.handleResponse(data);
    } catch (err) {
      UI.hideTyping();
      this.addAssistantMessage('Something went wrong getting started. Please refresh and try again.');
      console.error('Deep start error:', err);
    }
  },

  // ─── Send user input ───────────────────────────────────────────────────────
  sendUserInput() {
    if (this.isWaiting) return;
    const input = document.getElementById('user-input');
    const text  = input ? input.value.trim() : '';
    if (!text) return;
    this.sendMessage(text);
  },

  sendMessage(text) {
    if (this.isWaiting) return;
    this.isWaiting = true;

    UI.clearInput();
    UI.disableInput();

    const chatContainer = document.getElementById('chat-container');

    const userBubble = UI.createUserMessage(text);
    chatContainer.appendChild(userBubble);
    UI.scrollToMessage(userBubble);

    const typingEl = UI.createTypingIndicator();
    chatContainer.appendChild(typingEl);
    UI.showTyping();

    this.callAPI([{ role: 'user', content: text }], false)
      .then(data => {
        UI.hideTyping();
        this.handleResponse(data);
        this.isWaiting = false;
      })
      .catch(err => {
        UI.hideTyping();
        this.addAssistantMessage('Something went wrong. Please try again.');
        UI.enableInput();
        this.isWaiting = false;
        console.error('Deep send error:', err);
      });
  },

  // ─── API call ──────────────────────────────────────────────────────────────
  async callAPI(messages, isFirst = false) {
    const body = {
      messages,
      session:   this.session,
      firstLook: isFirst ? this.firstLook : undefined
    };

    const response = await fetch('/api/chat-deep', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  },

  // ─── Handle response ───────────────────────────────────────────────────────
  handleResponse(data) {
    if (data.session) this.session = data.session;

    const chatContainer = document.getElementById('chat-container');

    // Update progress
    this.updateProgress(data.phase);

    // Add layer label on phase transition
    if (data.phase === 'mirror') {
      const label = document.createElement('div');
      label.className = 'deep-layer-label';
      label.textContent = 'The full picture';
      chatContainer.appendChild(label);
    }

    if (data.message) {
      // Deep output card — rendered HTML
      if (data.complete && data.message.includes('deep-output-card')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message message-profile';
        wrapper.innerHTML = data.message;
        chatContainer.appendChild(wrapper);
        setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } else {
        // Mirror and shadow messages — use opening style for mirror
        const isMirror = data.phase === 'mirror';
        const msgEl = document.createElement('div');
        msgEl.className = isMirror ? 'deep-opening' : 'message message-assistant';
        msgEl.textContent = data.message;
        chatContainer.appendChild(msgEl);
        setTimeout(() => msgEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }

    // Auto-advance: mirror → deep output
    if (data.autoAdvance) {
      UI.setInputMode('none');
      const delay = data.advanceDelay || 500;

      setTimeout(() => {
        const typingEl = UI.createTypingIndicator();
        chatContainer.appendChild(typingEl);
        UI.scrollToMessage(typingEl);

        this.callAPI([], false)
          .then(nextData => {
            typingEl.remove();
            this.handleResponse(nextData);
          })
          .catch(err => {
            typingEl.remove();
            console.error('Auto-advance error:', err);
          });
      }, delay);
      return;
    }

    // Set input mode
    if (data.complete) {
      UI.setInputMode('none');
      // Show a quiet restart option
      setTimeout(() => {
        const restartEl = document.createElement('div');
        restartEl.style.cssText = 'text-align:center; padding: 32px 0 80px; font-family: var(--font-serif); font-size: 0.88rem; font-style: italic; color: var(--doc-light);';
        restartEl.innerHTML = '<a href="/" style="color: var(--gold); text-decoration: none; letter-spacing: 0.06em;">← Return to Purpose Piece</a>';
        chatContainer.appendChild(restartEl);
      }, 1000);
    } else {
      UI.setInputMode(data.inputMode || 'text');
    }
  },

  updateProgress(phase) {
    const fill    = document.getElementById('progress-fill');
    const labelEl = document.getElementById('progress-label');
    const map = {
      shadow:    { pct: 40, label: 'Deep Conversation' },
      mirror:    { pct: 80, label: 'The Full Picture'  },
      complete:  { pct: 100, label: 'Deep Experience'  }
    };
    const current = map[phase] || { pct: 20, label: 'Deep Conversation' };
    if (fill)    fill.style.width = current.pct + '%';
    if (labelEl) labelEl.textContent = current.label;
  },

  addAssistantMessage(text) {
    const chatContainer = document.getElementById('chat-container');
    const el = UI.createAssistantMessage(text);
    chatContainer.appendChild(el);
    UI.scrollToMessage(el);
    UI.enableInput();
  }
};

document.addEventListener('DOMContentLoaded', () => DeepApp.init());
window.DeepApp = DeepApp;
