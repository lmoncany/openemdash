/**
 * EmDash AI Copilot Widget
 *
 * A floating chat bubble injected via middleware for authenticated editors.
 * Renders as plain HTML with inline styles and a <script> tag.
 * Streams AI responses via SSE from /_emdash/api/ai/chat.
 * No dependencies — works on any page with a </body> tag.
 */

export function renderCopilot(): string {
	return `
<!-- EmDash AI Copilot -->
<div id="emdash-copilot-bubble" title="AI Copilot">
  <svg width="24" height="24" viewBox="0 0 256 256" fill="none">
    <path d="M200 52H136V36a20 20 0 0 0-40 0v16H56a20 20 0 0 0-20 20v36a20 20 0 0 0 20 20h4v28a20 20 0 0 0 20 20h24v24a20 20 0 0 0 40 0v-24h24a20 20 0 0 0 20-20v-28h4a20 20 0 0 0 20-20V72a20 20 0 0 0-20-20ZM100 148a16 16 0 1 1 16-16 16 16 0 0 1-16 16Zm56 0a16 16 0 1 1 16-16 16 16 0 0 1-16 16Z" fill="currentColor"/>
  </svg>
</div>

<div id="emdash-copilot-panel" class="emdash-copilot-hidden">
  <div class="emdash-copilot-header">
    <div class="emdash-copilot-header-left">
      <span class="emdash-copilot-avatar">🤖</span>
      <div>
        <div class="emdash-copilot-title">AI Copilot</div>
        <div class="emdash-copilot-subtitle">Ask anything about your content</div>
      </div>
    </div>
    <button class="emdash-copilot-close" id="emdash-copilot-close" title="Close">&times;</button>
  </div>
  <div class="emdash-copilot-messages" id="emdash-copilot-messages">
    <div class="emdash-copilot-empty">
      <div class="emdash-copilot-empty-icon">✨</div>
      <div class="emdash-copilot-empty-text">How can I help with your content?</div>
      <div class="emdash-copilot-empty-hint">Try: "Improve the SEO of this page" or "Rewrite the intro paragraph"</div>
    </div>
  </div>
  <div class="emdash-copilot-input-area">
    <textarea id="emdash-copilot-input" placeholder="Ask the copilot..." rows="1"></textarea>
    <button id="emdash-copilot-send" class="emdash-copilot-send" title="Send" disabled>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    </button>
  </div>
</div>

<style>
  #emdash-copilot-bubble {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999998;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #1a1a1a;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  #emdash-copilot-bubble:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.12);
  }
  #emdash-copilot-bubble.emdash-copilot-active {
    display: none;
  }

  #emdash-copilot-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999998;
    width: 380px;
    max-width: calc(100vw - 32px);
    height: 520px;
    max-height: calc(100vh - 100px);
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  #emdash-copilot-panel.emdash-copilot-hidden {
    opacity: 0;
    transform: translateY(16px) scale(0.95);
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    #emdash-copilot-panel {
      background: #1e1e1e;
      color: #e0e0e0;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
    }
  }

  .emdash-copilot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    flex-shrink: 0;
  }
  @media (prefers-color-scheme: dark) {
    .emdash-copilot-header { border-color: rgba(255,255,255,0.08); }
  }
  .emdash-copilot-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .emdash-copilot-avatar {
    font-size: 20px;
  }
  .emdash-copilot-title {
    font-weight: 600;
    font-size: 14px;
  }
  .emdash-copilot-subtitle {
    font-size: 11px;
    opacity: 0.5;
  }
  .emdash-copilot-close {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: inherit;
    opacity: 0.5;
    padding: 4px 8px;
    border-radius: 6px;
    line-height: 1;
  }
  .emdash-copilot-close:hover { opacity: 1; background: rgba(0,0,0,0.05); }
  @media (prefers-color-scheme: dark) {
    .emdash-copilot-close:hover { background: rgba(255,255,255,0.08); }
  }

  .emdash-copilot-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .emdash-copilot-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    opacity: 0.6;
  }
  .emdash-copilot-empty-icon { font-size: 32px; margin-bottom: 12px; }
  .emdash-copilot-empty-text { font-weight: 500; margin-bottom: 6px; }
  .emdash-copilot-empty-hint { font-size: 12px; opacity: 0.7; max-width: 240px; }

  .emdash-copilot-msg {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .emdash-copilot-msg--user {
    align-self: flex-end;
    background: #1a1a1a;
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .emdash-copilot-msg--assistant {
    align-self: flex-start;
    background: #f0f0f0;
    border-bottom-left-radius: 4px;
  }
  @media (prefers-color-scheme: dark) {
    .emdash-copilot-msg--assistant { background: #2a2a2a; }
  }
  .emdash-copilot-msg--error {
    color: #dc3545;
    font-style: italic;
  }
  .emdash-copilot-typing {
    display: inline-flex;
    gap: 4px;
    padding: 12px 14px;
  }
  .emdash-copilot-typing span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #999;
    animation: emdash-copilot-bounce 1.2s ease-in-out infinite;
  }
  .emdash-copilot-typing span:nth-child(2) { animation-delay: 0.2s; }
  .emdash-copilot-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes emdash-copilot-bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  .emdash-copilot-input-area {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid rgba(0,0,0,0.08);
    flex-shrink: 0;
  }
  @media (prefers-color-scheme: dark) {
    .emdash-copilot-input-area { border-color: rgba(255,255,255,0.08); }
  }
  #emdash-copilot-input {
    flex: 1;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
    font-family: inherit;
    line-height: 1.4;
    resize: none;
    outline: none;
    background: transparent;
    color: inherit;
    max-height: 100px;
    overflow-y: auto;
  }
  #emdash-copilot-input:focus {
    border-color: rgba(0,0,0,0.25);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.05);
  }
  @media (prefers-color-scheme: dark) {
    #emdash-copilot-input { border-color: rgba(255,255,255,0.15); }
    #emdash-copilot-input:focus {
      border-color: rgba(255,255,255,0.3);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.05);
    }
  }
  .emdash-copilot-send {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: #1a1a1a;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .emdash-copilot-send:disabled { opacity: 0.3; cursor: default; }
  .emdash-copilot-send:not(:disabled):hover { opacity: 0.8; }
</style>

<script>
(function() {
  "use strict";

  var bubble = document.getElementById("emdash-copilot-bubble");
  var panel = document.getElementById("emdash-copilot-panel");
  var closeBtn = document.getElementById("emdash-copilot-close");
  var messagesEl = document.getElementById("emdash-copilot-messages");
  var inputEl = document.getElementById("emdash-copilot-input");
  var sendBtn = document.getElementById("emdash-copilot-send");
  var isStreaming = false;
  var abortController = null;

  // Gather page context from data-emdash-ref annotations
  function getPageContext() {
    var refs = document.querySelectorAll("[data-emdash-ref]");
    var context = { collection: null, id: null, fields: {} };
    for (var i = 0; i < refs.length; i++) {
      try {
        var data = JSON.parse(refs[i].getAttribute("data-emdash-ref"));
        if (data.collection && !context.collection) {
          context.collection = data.collection;
          context.id = data.id;
        }
        if (data.field) {
          var text = refs[i].textContent || "";
          if (text.length > 200) text = text.substring(0, 200) + "...";
          context.fields[data.field] = text;
        }
      } catch(e) { /* skip */ }
    }
    return context;
  }

  function togglePanel(show) {
    if (show) {
      panel.classList.remove("emdash-copilot-hidden");
      bubble.classList.add("emdash-copilot-active");
      inputEl.focus();
    } else {
      panel.classList.add("emdash-copilot-hidden");
      bubble.classList.remove("emdash-copilot-active");
    }
  }

  bubble.addEventListener("click", function() { togglePanel(true); });
  closeBtn.addEventListener("click", function() { togglePanel(false); });

  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && !panel.classList.contains("emdash-copilot-hidden")) {
      togglePanel(false);
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 100) + "px";
    sendBtn.disabled = !this.value.trim() || isStreaming;
  });

  inputEl.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn.addEventListener("click", function() {
    if (!sendBtn.disabled) sendMessage();
  });

  function addMessage(role, content) {
    // Remove empty state
    var empty = messagesEl.querySelector(".emdash-copilot-empty");
    if (empty) empty.remove();

    var div = document.createElement("div");
    div.className = "emdash-copilot-msg emdash-copilot-msg--" + role;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTypingIndicator() {
    var empty = messagesEl.querySelector(".emdash-copilot-empty");
    if (empty) empty.remove();

    var div = document.createElement("div");
    div.className = "emdash-copilot-msg emdash-copilot-msg--assistant emdash-copilot-typing";
    div.id = "emdash-copilot-typing";
    div.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function removeTypingIndicator() {
    var el = document.getElementById("emdash-copilot-typing");
    if (el) el.remove();
  }

  // Apply a content edit to the live DOM
  function applyFieldUpdate(action) {
    if (!action || !action.field) return;

    // Find the DOM element with the matching data-emdash-ref for this field
    var refs = document.querySelectorAll("[data-emdash-ref]");
    for (var i = 0; i < refs.length; i++) {
      try {
        var data = JSON.parse(refs[i].getAttribute("data-emdash-ref"));
        if (data.field === action.field && data.collection === action.collection && data.id === action.id) {
          // Flash highlight to show the edit
          refs[i].style.transition = "background-color 0.3s, box-shadow 0.3s";
          refs[i].style.boxShadow = "0 0 0 2px rgba(34,197,94,0.6)";
          refs[i].style.backgroundColor = "rgba(34,197,94,0.08)";
          refs[i].style.borderRadius = "4px";

          // Update the text content
          refs[i].textContent = action.value;

          // Remove highlight after animation
          setTimeout(function() {
            refs[i].style.boxShadow = "";
            refs[i].style.backgroundColor = "";
          }, 2000);
          break;
        }
      } catch(e) { /* skip */ }
    }
  }

  // Show an action badge in the chat
  function addActionBadge(action) {
    var badge = document.createElement("div");
    badge.className = "emdash-copilot-msg emdash-copilot-msg--action";
    if (action.success) {
      badge.innerHTML = "\\u2713 Updated <strong>" + action.field + "</strong>";
      badge.style.background = "rgba(34,197,94,0.1)";
      badge.style.color = "#16a34a";
      badge.style.border = "1px solid rgba(34,197,94,0.2)";
    } else {
      badge.innerHTML = "\\u2717 Failed to update <strong>" + action.field + "</strong>: " + (action.error || "Unknown error");
      badge.style.background = "rgba(239,68,68,0.1)";
      badge.style.color = "#dc2626";
      badge.style.border = "1px solid rgba(239,68,68,0.2)";
    }
    badge.style.fontSize = "12px";
    badge.style.padding = "6px 10px";
    badge.style.borderRadius = "8px";
    badge.style.maxWidth = "100%";
    badge.style.alignSelf = "stretch";
    messagesEl.appendChild(badge);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text || isStreaming) return;

    // Gather structured page context
    var ctx = getPageContext();

    addMessage("user", text);
    inputEl.value = "";
    inputEl.style.height = "auto";
    sendBtn.disabled = true;
    isStreaming = true;

    addTypingIndicator();

    abortController = new AbortController();

    // Send structured context alongside the message
    var requestBody = {
      agentId: "content-editor",
      message: text,
      context: (ctx.collection && ctx.id) ? ctx : undefined
    };

    fetch("/_emdash/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EmDash-Request": "1"
      },
      credentials: "same-origin",
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    }).then(function(response) {
      if (!response.ok) {
        return response.json().then(function(body) {
          var msg = (body && body.error && body.error.message) || "Request failed";
          throw new Error(msg);
        });
      }

      removeTypingIndicator();
      var assistantDiv = addMessage("assistant", "");
      var fullText = "";

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var currentEvent = "";

      function processChunk() {
        return reader.read().then(function(result) {
          if (result.done) {
            // Strip action blocks from displayed text
            if (fullText.indexOf("\`\`\`action") !== -1) {
              var cleaned = fullText.replace(/\`\`\`action[\\s\\S]*?\`\`\`/g, "").trim();
              assistantDiv.textContent = cleaned;
            }
            isStreaming = false;
            sendBtn.disabled = !inputEl.value.trim();
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split("\\n");
          buffer = lines.pop() || "";

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf("event: ") === 0) {
              currentEvent = line.substring(7).trim();
            } else if (line.indexOf("data: ") === 0) {
              var data = line.substring(6);
              if (currentEvent === "done") {
                // Strip action blocks from final display
                if (fullText.indexOf("\`\`\`action") !== -1) {
                  var cleaned = fullText.replace(/\`\`\`action[\\s\\S]*?\`\`\`/g, "").trim();
                  assistantDiv.textContent = cleaned;
                }
                isStreaming = false;
                sendBtn.disabled = !inputEl.value.trim();
              } else if (currentEvent === "error") {
                try {
                  var parsed = JSON.parse(data);
                  assistantDiv.textContent += "\\nError: " + (parsed.message || "Unknown error");
                } catch(e) {
                  assistantDiv.textContent += "\\nError: " + data;
                }
                assistantDiv.classList.add("emdash-copilot-msg--error");
                isStreaming = false;
                sendBtn.disabled = !inputEl.value.trim();
              } else if (currentEvent === "action") {
                // Content edit was applied server-side
                try {
                  var action = JSON.parse(data);
                  addActionBadge(action);
                  if (action.success) {
                    applyFieldUpdate(action);
                  }
                } catch(e) { /* skip malformed action */ }
              } else {
                fullText += data;
                assistantDiv.textContent += data;
                messagesEl.scrollTop = messagesEl.scrollHeight;
              }
              currentEvent = "";
            } else if (line === "") {
              currentEvent = "";
            }
          }

          return processChunk();
        });
      }

      return processChunk();
    }).catch(function(err) {
      removeTypingIndicator();
      if (err.name !== "AbortError") {
        addMessage("assistant", "Error: " + err.message).classList.add("emdash-copilot-msg--error");
      }
      isStreaming = false;
      sendBtn.disabled = !inputEl.value.trim();
    });
  }
})();
</script>
`;
}
