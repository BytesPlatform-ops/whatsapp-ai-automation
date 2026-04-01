(function() {
  'use strict';

  // Use document.currentScript (reliable at parse time) with fallback
  var currentScript = document.currentScript;
  if (!currentScript) {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].getAttribute('data-client-id')) { currentScript = scripts[i]; break; }
    }
  }
  if (!currentScript) return;

  var clientId = currentScript.getAttribute('data-client-id');
  var embedded = currentScript.getAttribute('data-embedded') === 'true';
  var containerId = currentScript.getAttribute('data-container');
  if (!clientId) return;

  var API_BASE = currentScript.src.replace(/\/widget\.js.*$/, '');

  var config = null;
  var sessionId = null;
  var conversationId = null;
  var isOpen = embedded; // embedded mode starts open
  var isLoading = false;

  var SESSION_KEY = 'bp_chat_session_' + clientId;
  try { sessionId = sessionStorage.getItem(SESSION_KEY); } catch (e) {}

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  if (!sessionId) {
    sessionId = generateId();
    try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch (e) {}
  }

  var CSS = '\
    #bp-chat-container *, #bp-chat-container *::before, #bp-chat-container *::after { margin:0; padding:0; box-sizing:border-box !important; font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; -webkit-font-smoothing:antialiased; }\
    \
    /* ── Bubble ── */\
    #bp-chat-bubble { position:fixed; bottom:24px; right:24px; width:62px; height:62px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(0,0,0,0.18),0 0 0 0 rgba(0,0,0,0); z-index:999998; transition:transform 0.25s cubic-bezier(.4,0,.2,1),box-shadow 0.25s ease; }\
    #bp-chat-bubble:hover { transform:scale(1.1); box-shadow:0 6px 24px rgba(0,0,0,0.22); }\
    #bp-chat-bubble svg { width:26px; height:26px; fill:#fff; transition:transform 0.3s ease; }\
    #bp-chat-bubble.bp-bubble-open svg { transform:rotate(90deg); }\
    \
    /* ── Notification dot ── */\
    #bp-chat-bubble::after { content:""; position:absolute; top:2px; right:2px; width:14px; height:14px; background:#ef4444; border-radius:50%; border:2.5px solid #fff; opacity:1; transition:opacity 0.2s; }\
    #bp-chat-bubble.bp-bubble-seen::after { opacity:0; }\
    \
    /* ── Window (floating mode) ── */\
    #bp-chat-window { position:fixed; bottom:24px; right:24px; width:400px; max-width:calc(100vw - 48px); height:560px; border-radius:20px; overflow:hidden !important; display:flex !important; flex-direction:column !important; box-shadow:0 12px 48px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.08); z-index:999999; opacity:0; transform:translateY(16px) scale(0.96); transition:opacity 0.3s cubic-bezier(.4,0,.2,1),transform 0.3s cubic-bezier(.4,0,.2,1); pointer-events:none; background:#fff; }\
    #bp-chat-window.bp-open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }\
    \
    /* ── Window (embedded mode) ── */\
    #bp-chat-window.bp-embedded { position:relative; bottom:auto; right:auto; width:100%; height:100%; border-radius:20px; opacity:1; transform:none; pointer-events:auto; box-shadow:0 4px 32px rgba(0,0,0,0.08),0 0 0 1px rgba(0,0,0,0.04); }\
    \
    /* ── Header ── */\
    #bp-chat-header { padding:18px 20px; display:flex; align-items:center; gap:12px; color:#fff; flex-shrink:0; position:relative; }\
    #bp-chat-header::after { content:""; position:absolute; bottom:0; left:0; right:0; height:1px; background:rgba(255,255,255,0.15); }\
    .bp-header-avatar { width:40px; height:40px; border-radius:12px; object-fit:cover; flex-shrink:0; border:2px solid rgba(255,255,255,0.25); }\
    .bp-header-avatar-placeholder { width:40px; height:40px; border-radius:12px; flex-shrink:0; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; color:rgba(255,255,255,0.9); border:2px solid rgba(255,255,255,0.15); }\
    #bp-chat-header-info { flex:1; min-width:0; }\
    #bp-chat-header-name { font-size:15px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.01em; }\
    #bp-chat-header-status { font-size:12px; opacity:0.8; display:flex; align-items:center; gap:5px; margin-top:1px; }\
    #bp-chat-header-status::before { content:""; width:7px; height:7px; border-radius:50%; background:#4ade80; flex-shrink:0; }\
    #bp-chat-close { background:rgba(255,255,255,0.12); border:none; color:#fff; cursor:pointer; padding:6px; border-radius:8px; transition:background 0.15s; }\
    #bp-chat-close:hover { background:rgba(255,255,255,0.22); }\
    #bp-chat-close svg { width:18px; height:18px; fill:#fff; display:block; }\
    \
    /* ── Messages ── */\
    #bp-chat-messages { flex:1 !important; overflow-y:auto !important; overflow-x:hidden !important; padding:24px 16px !important; display:flex !important; flex-direction:column !important; gap:16px !important; background:#fafafa !important; scroll-behavior:smooth; }\
    #bp-chat-messages::-webkit-scrollbar { width:5px; }\
    #bp-chat-messages::-webkit-scrollbar-track { background:transparent; }\
    #bp-chat-messages::-webkit-scrollbar-thumb { background:#ddd; border-radius:10px; }\
    #bp-chat-messages::-webkit-scrollbar-thumb:hover { background:#bbb; }\
    \
    /* ── Message bubbles ── */\
    .bp-msg-row { display:flex !important; gap:8px !important; animation:bp-fade-in 0.25s ease; min-width:0 !important; }\
    .bp-msg-row-user { justify-content:flex-end !important; margin-left:50px !important; }\
    .bp-msg-row-bot { justify-content:flex-start !important; margin-right:50px !important; }\
    .bp-msg-row > div { min-width:0 !important; }\
    .bp-msg-avatar { width:30px; height:30px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; margin-top:2px; }\
    .bp-msg { max-width:100% !important; padding:12px 20px !important; font-size:14px !important; line-height:1.6 !important; word-wrap:break-word; white-space:pre-wrap; overflow-wrap:break-word; }\
    .bp-msg-user { background:var(--bp-color) !important; color:#fff !important; border-radius:18px 18px 4px 18px !important; }\
    .bp-msg-bot { background:#fff !important; color:#1f2937 !important; border-radius:18px 18px 18px 4px !important; box-shadow:0 1px 4px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.03) !important; }\
    .bp-msg-time { font-size:10px; color:#b0b0b0; margin-top:4px; padding:0 4px; }\
    .bp-msg-time-user { text-align:right; }\
    \
    /* ── Typing indicator ── */\
    .bp-typing-row { display:flex; gap:8px; align-items:flex-start; animation:bp-fade-in 0.25s ease; }\
    .bp-typing { background:#fff; padding:12px 16px; border-radius:16px 16px 16px 4px; box-shadow:0 1px 3px rgba(0,0,0,0.05),0 0 0 1px rgba(0,0,0,0.03); display:flex; gap:5px; align-items:center; }\
    .bp-typing-dot { width:6px; height:6px; border-radius:50%; background:#b0b0b0; animation:bp-bounce 1.4s infinite ease-in-out; }\
    .bp-typing-dot:nth-child(2) { animation-delay:0.16s; }\
    .bp-typing-dot:nth-child(3) { animation-delay:0.32s; }\
    \
    /* ── Input area ── */\
    #bp-chat-input-area { display:flex; align-items:flex-end; padding:16px 20px; gap:10px; border-top:1px solid #f0f0f0; background:#fff; flex-shrink:0; }\
    #bp-chat-input { flex:1; border:1.5px solid #e5e7eb; border-radius:14px; padding:12px 18px; font-size:14px; outline:none; resize:none; max-height:100px; line-height:1.45; transition:border-color 0.2s,box-shadow 0.2s; background:#fafafa; }\
    #bp-chat-input:focus { border-color:var(--bp-color); box-shadow:0 0 0 3px color-mix(in srgb, var(--bp-color) 12%, transparent); background:#fff; }\
    #bp-chat-input::placeholder { color:#aaa; }\
    #bp-chat-send { width:40px; height:40px; border-radius:12px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity 0.15s,transform 0.15s; }\
    #bp-chat-send:hover:not(:disabled) { transform:scale(1.06); }\
    #bp-chat-send:active:not(:disabled) { transform:scale(0.95); }\
    #bp-chat-send:disabled { opacity:0.4; cursor:default; }\
    #bp-chat-send svg { width:18px; height:18px; fill:#fff; display:block; }\
    \
    /* ── Footer ── */\
    #bp-chat-powered { text-align:center; padding:8px; font-size:11px; color:#bbb; background:#fff; flex-shrink:0; letter-spacing:0.01em; }\
    #bp-chat-powered a { color:#999; text-decoration:none; font-weight:500; transition:color 0.15s; }\
    #bp-chat-powered a:hover { color:#666; }\
    \
    /* ── Animations ── */\
    @keyframes bp-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }\
    @keyframes bp-fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }\
    \
    /* ── Mobile ── */\
    @media(max-width:480px) {\
      #bp-chat-window:not(.bp-embedded) { bottom:0; right:0; left:0; width:100%; height:100%; border-radius:0; }\
      #bp-chat-bubble { bottom:20px; right:20px; width:56px; height:56px; }\
    }\
  ';

  function init() {
    // Load Inter font
    if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Inter"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }

    var container;
    if (embedded && containerId) {
      container = document.getElementById(containerId);
      if (!container) return;
    } else {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
    container.id = container.id || 'bp-chat-container';

    var style = document.createElement('style');
    style.textContent = CSS;
    container.appendChild(style);

    fetch(API_BASE + '/api/v1/widget/' + clientId + '/config')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) return;
        if (data.status === 'cancelled' || data.status === 'paused') return;
        config = data;
        buildUI(container);
      })
      .catch(function() {});
  }

  function getInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function darkenColor(hex, amount) {
    hex = hex.replace('#', '');
    var r = Math.max(0, parseInt(hex.substring(0, 2), 16) - amount);
    var g = Math.max(0, parseInt(hex.substring(2, 4), 16) - amount);
    var b = Math.max(0, parseInt(hex.substring(4, 6), 16) - amount);
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
  }

  function buildUI(container) {
    var color = config.widget_color || '#1A73E8';
    var darkColor = darkenColor(color, 25);
    container.style.setProperty('--bp-color', color);

    var headerBg = 'background:linear-gradient(135deg, ' + color + ' 0%, ' + darkColor + ' 100%)';

    // Bubble (only in floating mode)
    if (!embedded) {
      var bubble = document.createElement('div');
      bubble.id = 'bp-chat-bubble';
      bubble.style.background = color;
      bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 5.92 2 10.66c0 2.72 1.48 5.14 3.8 6.72l-.54 3.14c-.1.6.54 1.06 1.08.76L10 19.3c.64.12 1.32.18 2 .18 5.52 0 10-3.92 10-8.66S17.52 2 12 2z"/></svg>';
      bubble.onclick = toggleChat;
      container.appendChild(bubble);
    }

    // Window
    var win = document.createElement('div');
    win.id = 'bp-chat-window';
    if (embedded) win.classList.add('bp-embedded');

    var avatarHtml = config.logo_url
      ? '<img class="bp-header-avatar" src="' + escapeHtml(config.logo_url) + '" alt="">'
      : '<div class="bp-header-avatar-placeholder">' + getInitial(config.business_name) + '</div>';

    var closeHtml = embedded ? '' : '<button id="bp-chat-close"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>';

    win.innerHTML = '\
      <div id="bp-chat-header" style="' + headerBg + '">\
        ' + avatarHtml + '\
        <div id="bp-chat-header-info">\
          <div id="bp-chat-header-name">' + escapeHtml(config.chatbot_name) + '</div>\
          <div id="bp-chat-header-status">Online</div>\
        </div>\
        ' + closeHtml + '\
      </div>\
      <div id="bp-chat-messages"></div>\
      <div id="bp-chat-input-area">\
        <textarea id="bp-chat-input" placeholder="Type a message..." rows="1"></textarea>\
        <button id="bp-chat-send" style="background:' + color + '"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>\
      </div>\
      <div id="bp-chat-powered">Powered by <a href="https://bytesplatform.info" target="_blank" rel="noopener">Bytes Platform</a></div>\
    ';
    container.appendChild(win);

    if (!embedded) {
      var closeBtn = win.querySelector('#bp-chat-close');
      if (closeBtn) closeBtn.onclick = toggleChat;
    }

    var input = win.querySelector('#bp-chat-input');
    var sendBtn = win.querySelector('#bp-chat-send');

    sendBtn.onclick = function() { sendMessage(); };
    input.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };
    input.oninput = function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    };

    addMessage('assistant', config.welcome_message);

    if (embedded) {
      setTimeout(function() { input.focus(); }, 400);
    }
  }

  function toggleChat() {
    var win = document.getElementById('bp-chat-window');
    var bubble = document.getElementById('bp-chat-bubble');
    if (!win || embedded) return;

    isOpen = !isOpen;
    if (isOpen) {
      win.classList.add('bp-open');
      if (bubble) {
        bubble.classList.add('bp-bubble-seen');
        bubble.style.display = 'none';
      }
      var input = document.getElementById('bp-chat-input');
      if (input) setTimeout(function() { input.focus(); }, 300);
    } else {
      win.classList.remove('bp-open');
      if (bubble) bubble.style.display = 'flex';
    }
  }

  function formatTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function addMessage(role, text) {
    var messages = document.getElementById('bp-chat-messages');
    if (!messages) return;

    var row = document.createElement('div');
    row.className = 'bp-msg-row bp-msg-row-' + (role === 'user' ? 'user' : 'bot');

    var html = '';
    if (role !== 'user') {
      var initial = config ? getInitial(config.business_name) : '?';
      var color = config ? (config.widget_color || '#1A73E8') : '#1A73E8';
      if (config && config.logo_url) {
        html += '<img class="bp-msg-avatar" src="' + escapeHtml(config.logo_url) + '" style="object-fit:cover;">';
      } else {
        html += '<div class="bp-msg-avatar" style="background:' + color + ';color:#fff;">' + initial + '</div>';
      }
    }

    html += '<div>';
    html += '<div class="bp-msg bp-msg-' + (role === 'user' ? 'user' : 'bot') + '">' + escapeHtml(text) + '</div>';
    html += '<div class="bp-msg-time bp-msg-time-' + (role === 'user' ? 'user' : 'bot') + '">' + formatTime() + '</div>';
    html += '</div>';

    row.innerHTML = html;
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    var messages = document.getElementById('bp-chat-messages');
    if (!messages) return;

    var row = document.createElement('div');
    row.className = 'bp-typing-row';
    row.id = 'bp-typing-indicator';

    var initial = config ? getInitial(config.business_name) : '?';
    var color = config ? (config.widget_color || '#1A73E8') : '#1A73E8';
    var avatarHtml;
    if (config && config.logo_url) {
      avatarHtml = '<img class="bp-msg-avatar" src="' + escapeHtml(config.logo_url) + '" style="object-fit:cover;">';
    } else {
      avatarHtml = '<div class="bp-msg-avatar" style="background:' + color + ';color:#fff;">' + initial + '</div>';
    }

    row.innerHTML = avatarHtml + '<div class="bp-typing"><div class="bp-typing-dot"></div><div class="bp-typing-dot"></div><div class="bp-typing-dot"></div></div>';
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('bp-typing-indicator');
    if (el) el.remove();
  }

  function sendMessage() {
    if (isLoading) return;
    var input = document.getElementById('bp-chat-input');
    var text = (input.value || '').trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    addMessage('user', text);
    showTyping();
    isLoading = true;

    var sendBtn = document.getElementById('bp-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    fetch(API_BASE + '/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, session_id: sessionId, message: text }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      hideTyping();
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      if (data.reply) addMessage('assistant', data.reply);
      else if (data.error) addMessage('assistant', 'Sorry, something went wrong. Please try again.');
      if (data.session_id) { sessionId = data.session_id; try { sessionStorage.setItem(SESSION_KEY, sessionId); } catch(e) {} }
      if (data.conversation_id) conversationId = data.conversation_id;
    })
    .catch(function() {
      hideTyping();
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      addMessage('assistant', 'Sorry, I couldn\'t connect. Please try again.');
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  window.BP_CHAT_OPEN = function() { if (!isOpen) toggleChat(); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
