// Transit AI Assistant Client Module

let aiChatOpen = false;
let currentAIEngine = 'gemini';

function toggleAIChat() {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  
  aiChatOpen = !aiChatOpen;
  panel.style.display = aiChatOpen ? 'flex' : 'none';
  
  if (aiChatOpen) {
    // Focus input
    const input = document.getElementById('ai-input');
    if (input) input.focus();
  }
}

function syncAIEngines(value) {
  currentAIEngine = value;
  // Sync select dropdowns if they exist in multiple places
  const floatingSelect = document.getElementById('ai-platform-select-floating');
  if (floatingSelect) floatingSelect.value = value;
}

function askAI(question) {
  const input = document.getElementById('ai-input');
  if (input) {
    input.value = question;
    sendAIMessage();
  }
}

function sendAIMessage() {
  const input = document.getElementById('ai-input');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;

  // Clear input
  input.value = '';

  // Append user message
  appendAIMessage(question, 'user');

  // Append typing indicator
  const typingId = appendAITyping();

  // Prepare context from global state
  let context = '';
  if (window.state && window.state.busData) {
    context = window.state.busData.map(b => {
      return `Route ${b.route} (${b.type}): Driver ${b.driver}, current stop ${b.nearStop}, ETA ${b.etaMin}m, Seats: ${b.filled}/${b.total} filled, ${b.free} free.`;
    }).join('\n');
  }

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      context,
      platform: currentAIEngine
    })
  })
  .then(readApiResponse)
  .then(data => {
    removeAITyping(typingId);
    if (data.reply) {
      appendAIMessage(data.reply, 'bot');
    } else {
      appendAIMessage('Sorry, I couldn\'t process that request.', 'bot');
    }
  })
  .catch(err => {
    console.error(err);
    removeAITyping(typingId);
    appendAIMessage('Network error. Please try again.', 'bot');
  });
}

function appendAIMessage(text, sender) {
  const container = document.getElementById('ai-messages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = `ai-msg ai-msg-${sender}`;
  msg.innerHTML = formatMessageText(text);
  container.appendChild(msg);

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function appendAITyping() {
  const container = document.getElementById('ai-messages');
  if (!container) return null;

  const id = 'typing-' + Date.now();
  const typing = document.createElement('div');
  typing.id = id;
  typing.className = 'ai-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeAITyping(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function formatMessageText(text) {
  // Safe HTML formatting for linebreaks, think tags, bolding
  let safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Restore thought tag styling if DeepSeek is used
  safe = safe.replace(/&lt;think&gt;/g, '<div style="font-size:11px; color:#3B6B91; border-left:2px solid #3B6B91; padding-left:8px; margin-bottom:8px; font-style:italic;">💭 ');
  safe = safe.replace(/&lt;\/think&gt;/g, '</div>');

  // Basic markdown bolding **text** -> <strong>text</strong>
  safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Line breaks
  return safe.replace(/\n/g, '<br>');
}

// Show/Hide FAB based on user state
function checkAIFabVisibility() {
  const fab = document.getElementById('ai-fab');
  if (fab) {
    fab.style.display = (window.state && window.state.currentUser) ? 'flex' : 'none';
  }
}

// Expose globals for window inline event listeners
window.toggleAIChat = toggleAIChat;
window.syncAIEngines = syncAIEngines;
window.askAI = askAI;
window.sendAIMessage = sendAIMessage;
window.checkAIFabVisibility = checkAIFabVisibility;
