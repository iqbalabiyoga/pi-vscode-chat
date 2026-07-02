// ── Pi Chat Webview Frontend ──
(function () {
  const vscode = acquireVsCodeApi();

  let state = {
    isStreaming: false,
    messageIdCounter: 0,
    currentMessageId: null,
    accumulatedText: '',
    messages: [],
  };

  const ICONS = {
    sparkle: '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0l1.6 5.4L15 7l-5.4 1.6L8 14 6.4 8.6 1 7l5.4-1.6L8 0zm5.5 9.5l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7z"/></svg>',
    chevron: '<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4l4 4-4 4"/></svg>',
    terminal: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 6l2.5 2-2.5 2M8.5 10.5h3"/></svg>',
    search: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    pencil: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M11.5 2.5l2 2L5 13l-2.7.7L3 11l8.5-8.5z"/></svg>',
    file: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5L9 1.5z"/><path d="M9 1.5V5h3.5"/></svg>',
    globe: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-4.5 4-4.5 9 0 13 4.5-4 4.5-9 0-13z"/></svg>',
    wrench: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9.5 4.5a3 3 0 0 1 4-2.8l-2 2 .8 2 2 .8 2-2a3 3 0 0 1-4.3 3.5L5.5 14.5a1.4 1.4 0 0 1-2-2L10 6a3 3 0 0 1-.5-1.5z"/></svg>',
    agent: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="5" r="2.5"/><path d="M2.5 13.5c0-2.5 2.4-4 5.5-4s5.5 1.5 5.5 4"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>',
    cross: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    copy: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
  };

  const TOOL_ICONS = {
    bash: ICONS.terminal,
    read: ICONS.file,
    write: ICONS.pencil,
    edit: ICONS.pencil,
    'multi-edit': ICONS.pencil,
    grep: ICONS.search,
    glob: ICONS.search,
    find: ICONS.search,
    ls: ICONS.file,
    fetch: ICONS.globe,
    'web-search': ICONS.globe,
    browse: ICONS.globe,
    agent: ICONS.agent,
    subagent: ICONS.agent,
    task: ICONS.agent,
  };

  const saved = vscode.getState();
  if (saved) state = { ...state, ...saved, isStreaming: false };

  const $ = (id) => document.getElementById(id);
  const messagesEl = $('messages');
  const inputEl = $('input');
  const sendBtn = $('btn-send');
  const abortBtn = $('btn-abort');
  const modelNameEl = $('model-name');
  const btnNew = $('btn-new');
  const btnModel = $('btn-model');
  const btnThinking = $('btn-thinking');
  const thinkingLevelEl = $('thinking-level');
  const btnAttach = $('btn-attach');
  const widgetsContainer = $('widgets-container');
  const statusBar = $('status-bar');
  const queueBar = $('queue-bar');
  const changesBar = $('changes-bar');
  const sessionsPanel = $('sessions-panel');
  const sessionsList = $('sessions-list');
  const btnCloseSessions = $('btn-close-sessions');
  const btnHistory = $('btn-history');
  const autocompleteEl = $('autocomplete');
  const dialogOverlay = $('dialog-overlay');
  const footerStats = $('footer-stats');

  let attachments = [];
  let activeStatuses = {};
  let piCommands = [];
  let currentModelReasoning = false;
  const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

  // ── Utilities ──

  function cleanAnsi(text) {
    if (!text) return '';
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }

  function createElement(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html) el.innerHTML = html;
    return el;
  }

  let autoScroll = true;
  messagesEl.addEventListener('scroll', () => {
    autoScroll = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  });
  function scrollToBottom(force) {
    if (!autoScroll && !force) return;
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  function renderMarkdown(container, text) {
    try {
      container.innerHTML = window.marked ? window.marked.parse(text) : escapeHtml(text);
    } catch {
      container.textContent = text;
    }
    container.querySelectorAll('pre code').forEach((block) => {
      if (window.hljs && !block.dataset.hl) {
        try { window.hljs.highlightElement(block); block.dataset.hl = '1'; } catch {}
      }
    });
    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy')) return;
      const btn = createElement('button', 'code-copy', ICONS.copy);
      btn.title = 'Copy';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.querySelector('code')?.innerText || pre.innerText);
        btn.innerHTML = ICONS.check;
        setTimeout(() => { btn.innerHTML = ICONS.copy; }, 1200);
      });
      pre.appendChild(btn);
    });
  }

  // ── Welcome state ──

  function renderWelcome() {
    if (messagesEl.querySelector('.message')) return;
    messagesEl.innerHTML = `
      <div id="welcome">
        <div class="welcome-logo">${ICONS.sparkle}</div>
        <h2>Pi Chat</h2>
        <p>Your local pi coding agent — with all its extensions, skills and models.</p>
        <div class="welcome-hints">
          <button class="hint" data-hint="Explain the architecture of this project">Explain this project</button>
          <button class="hint" data-hint="Find and fix bugs in the file I have open">Fix a bug</button>
          <button class="hint" data-hint="/">Browse / commands</button>
        </div>
      </div>`;
    messagesEl.querySelectorAll('.hint').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.hint;
      inputEl.value = v;
      inputEl.focus();
      inputEl.dispatchEvent(new Event('input'));
    }));
  }

  function clearWelcome() {
    const w = $('welcome');
    if (w) w.remove();
  }

  // ── Messages ──

  function getOrCreateMessage(role) {
    if (state.currentMessageId && role === 'assistant') {
      const existing = document.querySelector(`[data-msg-id="${state.currentMessageId}"]`);
      if (existing) return existing;
    }
    clearWelcome();

    const id = `msg-${++state.messageIdCounter}`;
    if (role === 'assistant') {
      state.currentMessageId = id;
      state.accumulatedText = '';
    }

    const msg = createElement('div', `message ${role}`);
    msg.dataset.msgId = id;

    if (role === 'assistant') {
      const header = createElement('div', 'message-header', `${ICONS.sparkle}<span>Pi</span>`);
      msg.appendChild(header);
    }
    msg.appendChild(createElement('div', 'message-content'));

    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function addUserMessage(text, queued) {
    clearWelcome();
    const msg = createElement('div', `message user${queued ? ' queued' : ''}`);
    const content = createElement('div', 'message-content');
    content.textContent = text;
    msg.appendChild(content);
    if (queued) {
      msg.appendChild(createElement('div', 'queued-tag', 'queued'));
    }
    messagesEl.appendChild(msg);
    scrollToBottom(true);
    saveState();
  }

  function saveState() {
    state.messages = [];
    messagesEl.querySelectorAll('.message').forEach(el => {
      const role = el.classList.contains('user') ? 'user' : 'assistant';
      const contentEl = el.querySelector('.message-content');
      if (contentEl) state.messages.push({ role, html: contentEl.innerHTML });
    });
    vscode.setState(state);
  }

  function restoreState() {
    if (state.messages && state.messages.length > 0) {
      messagesEl.innerHTML = '';
      state.messages.forEach(m => {
        const msgEl = createElement('div', `message ${m.role}`);
        if (m.role === 'assistant') {
          msgEl.appendChild(createElement('div', 'message-header', `${ICONS.sparkle}<span>Pi</span>`));
        }
        msgEl.appendChild(createElement('div', 'message-content', m.html));
        messagesEl.appendChild(msgEl);
      });
      scrollToBottom(true);
    } else {
      renderWelcome();
    }
  }

  // ── Thinking ──

  function appendThinkingDelta(messageId, blockIndex, delta) {
    const msgEl = document.querySelector(`[data-msg-id="${messageId === 'current' ? state.currentMessageId : messageId}"]`) || getOrCreateMessage('assistant');
    const contentEl = msgEl.querySelector('.message-content');

    let blockEl = contentEl.querySelector(`.thinking-block[data-block-idx="${blockIndex}"]`);
    if (!blockEl) {
      blockEl = createElement('details', 'thinking-block');
      blockEl.dataset.blockIdx = blockIndex;
      blockEl.innerHTML = `<summary>${ICONS.chevron}<span class="thinking-label">Thinking…</span><span class="shimmer"></span></summary><div class="thinking-content"></div>`;
      contentEl.appendChild(blockEl);
    }
    blockEl.querySelector('.thinking-content').textContent += delta;
    scrollToBottom();
  }

  function endThinking(messageId, blockIndex, content) {
    const msgEl = document.querySelector(`[data-msg-id="${messageId === 'current' ? state.currentMessageId : messageId}"]`);
    if (!msgEl) return;
    const blockEl = msgEl.querySelector(`.thinking-block[data-block-idx="${blockIndex}"]`);
    if (blockEl) {
      if (content) blockEl.querySelector('.thinking-content').textContent = content;
      blockEl.open = false;
      const label = blockEl.querySelector('.thinking-label');
      if (label) label.textContent = 'Thought';
      const shimmer = blockEl.querySelector('.shimmer');
      if (shimmer) shimmer.remove();
    }
    saveState();
  }

  // ── Tool cards ──

  function toolIcon(name) {
    const key = (name || '').toLowerCase();
    for (const k of Object.keys(TOOL_ICONS)) {
      if (key === k || key.startsWith(k)) return TOOL_ICONS[k];
    }
    return ICONS.wrench;
  }

  function toolSubject(name, args) {
    try {
      if (!args) return '';
      if (typeof args === 'string') args = JSON.parse(args);
      if (args.command) return String(args.command).split('\n')[0];
      const p = args.path || args.file_path || args.filePath;
      if (p) return String(p).split(/[\\/]/).pop();
      if (args.pattern) return String(args.pattern);
      if (args.url) return String(args.url);
      if (args.query) return String(args.query);
      const first = Object.values(args).find(v => typeof v === 'string');
      return first ? String(first).split('\n')[0] : '';
    } catch { return ''; }
  }

  function addToolCard(msg) {
    const toolMsg = document.querySelector(`[data-msg-id="${msg.messageId === 'current' ? state.currentMessageId : msg.messageId}"]`) || getOrCreateMessage('assistant');
    const content = toolMsg.querySelector('.message-content');

    const subject = toolSubject(msg.toolName, msg.args);
    const card = createElement('details', 'tool-card running');
    card.id = `tool-${msg.toolCallId}`;
    card.innerHTML = `
      <summary>
        <span class="tool-status"><span class="spinner"></span></span>
        <span class="tool-icon">${toolIcon(msg.toolName)}</span>
        <span class="tool-name">${escapeHtml(msg.toolName)}</span>
        <span class="tool-subject">${escapeHtml(subject)}</span>
        ${ICONS.chevron}
      </summary>
      <div class="tool-body">
        <pre class="tool-args"><code>${escapeHtml(typeof msg.args === 'string' ? msg.args : JSON.stringify(msg.args, null, 2))}</code></pre>
        <pre class="tool-output hidden"><code></code></pre>
      </div>`;
    content.appendChild(card);
    scrollToBottom();
  }

  function updateToolCard(toolCallId, output) {
    const card = document.getElementById(`tool-${toolCallId}`);
    if (!card) return;
    const out = card.querySelector('.tool-output');
    out.classList.remove('hidden');
    const code = out.querySelector('code');
    const text = cleanAnsi(output);
    code.textContent = text.length > 8000 ? text.slice(-8000) : text;
    out.scrollTop = out.scrollHeight;
  }

  function endToolCard(msg) {
    const card = document.getElementById(`tool-${msg.toolCallId}`);
    if (!card) return;
    card.classList.remove('running');
    card.classList.add(msg.isError ? 'error' : 'done');
    card.querySelector('.tool-status').innerHTML = msg.isError ? ICONS.cross : ICONS.check;
    if (msg.output) {
      const out = card.querySelector('.tool-output');
      out.classList.remove('hidden');
      const text = cleanAnsi(msg.output);
      out.querySelector('code').textContent = text.length > 8000 ? text.slice(0, 8000) + '\n…(truncated)' : text;
    }
    saveState();
  }

  // ── Edit cards & changes bar ──

  function addEditCard(filePath, id) {
    const msg = getOrCreateMessage('assistant');
    const content = msg.querySelector('.message-content');
    const fileName = filePath.split(/[\\/]/).pop();

    const card = createElement('div', 'edit-card');
    card.id = `edit-${id}`;
    card.innerHTML = `
      <button class="edit-file" data-action="openFile" data-path="${escapeHtml(filePath)}" title="${escapeHtml(filePath)}">
        ${ICONS.pencil}<span>${escapeHtml(fileName)}</span>
      </button>
      <div class="edit-actions">
        <button data-action="showDiff" data-edit="${id}" title="Open diff">Diff</button>
        <button data-action="acceptEdit" data-edit="${id}" class="keep" title="Keep this change">Keep</button>
        <button data-action="revertEdit" data-edit="${id}" class="undo" title="Revert this change">Undo</button>
      </div>`;
    content.appendChild(card);
    saveState();
    scrollToBottom();
  }

  function settleEditCard(editId, accepted) {
    const card = document.getElementById(`edit-${editId}`);
    if (card) {
      const actions = card.querySelector('.edit-actions');
      if (actions) actions.innerHTML = `<span class="edit-settled ${accepted ? 'kept' : 'undone'}">${accepted ? ICONS.check + ' Kept' : '↩ Undone'}</span>`;
    }
    saveState();
  }

  function renderChangesBar(pending) {
    if (!pending || pending.length === 0) {
      changesBar.classList.add('hidden');
      changesBar.innerHTML = '';
      return;
    }
    changesBar.classList.remove('hidden');
    const names = pending.map(p => escapeHtml(p.filePath.split(/[\\/]/).pop()));
    changesBar.innerHTML = `
      <span class="changes-label">${pending.length} file${pending.length > 1 ? 's' : ''} changed</span>
      <span class="changes-files" title="${names.join(', ')}">${names.slice(0, 3).join(', ')}${pending.length > 3 ? '…' : ''}</span>
      <span class="changes-actions">
        <button data-action="acceptAllEdits" class="keep">Keep all</button>
        <button data-action="revertAllEdits" class="undo">Undo all</button>
      </span>`;
  }

  // Event delegation for all data-action buttons (CSP-safe)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'openFile') {
      vscode.postMessage({ type: 'openFile', path: btn.dataset.path });
    } else if (action === 'acceptAllEdits' || action === 'revertAllEdits') {
      vscode.postMessage({ type: action });
    } else if (btn.dataset.edit) {
      vscode.postMessage({ type: action, editId: btn.dataset.edit });
    }
  });

  // ── History rendering (AgentMessage[]) ──

  function renderHistory(messages) {
    messagesEl.innerHTML = '';
    state.currentMessageId = null;
    const toolCards = {};

    messages.forEach((m) => {
      if (!m || !m.role) return;
      if (m.role === 'user') {
        const text = Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : String(m.content ?? '');
        if (text.trim()) addUserMessage(text.trim());
      } else if (m.role === 'assistant') {
        const msgEl = createElement('div', 'message assistant');
        msgEl.appendChild(createElement('div', 'message-header', `${ICONS.sparkle}<span>Pi</span>`));
        const contentEl = createElement('div', 'message-content');
        msgEl.appendChild(contentEl);
        messagesEl.appendChild(msgEl);

        const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
        content.forEach((item, idx) => {
          if (item.type === 'thinking' && item.thinking) {
            const blockEl = createElement('details', 'thinking-block');
            blockEl.dataset.blockIdx = idx;
            blockEl.innerHTML = `<summary>${ICONS.chevron}<span class="thinking-label">Thought</span></summary><div class="thinking-content">${escapeHtml(item.thinking)}</div>`;
            contentEl.appendChild(blockEl);
          } else if (item.type === 'text' && item.text) {
            const textEl = createElement('div', 'streaming-text');
            renderMarkdown(textEl, item.text);
            contentEl.appendChild(textEl);
          } else if (item.type === 'toolCall') {
            const subject = toolSubject(item.name, item.arguments);
            const card = createElement('details', 'tool-card done');
            card.innerHTML = `
              <summary>
                <span class="tool-status">${ICONS.check}</span>
                <span class="tool-icon">${toolIcon(item.name)}</span>
                <span class="tool-name">${escapeHtml(item.name)}</span>
                <span class="tool-subject">${escapeHtml(subject)}</span>
                ${ICONS.chevron}
              </summary>
              <div class="tool-body">
                <pre class="tool-args"><code>${escapeHtml(JSON.stringify(item.arguments ?? {}, null, 2))}</code></pre>
                <pre class="tool-output hidden"><code></code></pre>
              </div>`;
            contentEl.appendChild(card);
            toolCards[item.id] = card;
          }
        });
      } else if (m.role === 'toolResult' && toolCards[m.toolCallId]) {
        const card = toolCards[m.toolCallId];
        if (m.isError) {
          card.classList.remove('done');
          card.classList.add('error');
          card.querySelector('.tool-status').innerHTML = ICONS.cross;
        }
        const text = (m.content || []).map(c => c.text || '').join('');
        if (text) {
          const out = card.querySelector('.tool-output');
          out.classList.remove('hidden');
          out.querySelector('code').textContent = cleanAnsi(text).slice(0, 8000);
        }
      }
    });
    if (!messagesEl.querySelector('.message')) renderWelcome();
    scrollToBottom(true);
    saveState();
  }

  // ── Team monitor (pi-agents-team) ──

  const TEAM_AGENTS = ['orchestrator', 'scout', 'researcher', 'planner', 'worker', 'reviewer', 'oracle', 'context-builder', 'delegate'];
  let teamState = {};

  function isTeamAgent(key) {
    const k = String(key || '').toLowerCase();
    return TEAM_AGENTS.some(agent => k.includes(agent)) || k === 'team';
  }

  function updateTeamAgent(key, statusText, widgetLines) {
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    if (!teamState[key]) teamState[key] = { name, status: 'Idle', detail: '', active: false };

    if (statusText !== undefined) {
      const cleanTxt = cleanAnsi(statusText);
      teamState[key].status = cleanTxt || 'Idle';
      teamState[key].active = !!cleanTxt && !cleanTxt.toLowerCase().includes('idle');
    }
    if (widgetLines !== undefined) {
      teamState[key].detail = widgetLines && widgetLines.length ? cleanAnsi(widgetLines[widgetLines.length - 1]) : '';
    }
    renderTeamGrid();
  }

  let teamPanelPinned = false;

  function renderTeamGrid() {
    const monitor = $('team-monitor');
    const grid = $('team-grid');
    const countBadge = $('team-active-count');

    grid.innerHTML = '';
    const keys = Object.keys(teamState);
    let activeCount = 0;

    keys.forEach(key => {
      const agent = teamState[key];
      if (agent.active) activeCount++;
      const card = createElement('div', 'agent-card');
      card.innerHTML = `
        <div class="agent-card-header">
          <span class="agent-card-name">${escapeHtml(agent.name)}</span>
          <div class="agent-status-dot ${agent.active ? 'active' : ''}"></div>
        </div>
        <div class="agent-card-status" title="${escapeHtml(agent.status)}">${escapeHtml(agent.status)}</div>
        <div class="agent-card-detail" title="${escapeHtml(agent.detail)}">${escapeHtml(agent.detail || '—')}</div>`;
      grid.appendChild(card);
    });

    if (keys.length === 0) {
      if (teamPanelPinned) {
        monitor.classList.remove('hidden');
        grid.innerHTML = '<div class="team-empty">No active agents. Use <b>Init</b> to set up a team, then ask Pi to delegate work.</div>';
      } else {
        monitor.classList.add('hidden');
      }
      countBadge.textContent = '0 active';
    } else {
      monitor.classList.remove('hidden');
      countBadge.textContent = `${activeCount} active`;
    }
  }

  function toggleTeamPanel() {
    const monitor = $('team-monitor');
    if (monitor.classList.contains('hidden')) {
      teamPanelPinned = true;
      renderTeamGrid();
    } else {
      teamPanelPinned = false;
      monitor.classList.add('hidden');
    }
  }

  // ── Status bar & widgets ──

  // Run a pi extension command silently (no chat bubble). The extension
  // updates its own status afterwards, which refreshes the chip.
  function runCommand(cmd) {
    vscode.postMessage({ type: 'runCommand', command: cmd });
  }

  const CAVEMAN_LEVELS = ['off', 'lite', 'full', 'ultra', 'wenyan-lite', 'wenyan', 'wenyan-ultra', 'micro'];

  let chipMenuEl = null;
  function closeChipMenu() {
    if (chipMenuEl) { chipMenuEl.remove(); chipMenuEl = null; }
  }
  document.addEventListener('mousedown', (e) => {
    if (chipMenuEl && !chipMenuEl.contains(e.target)) closeChipMenu();
  });

  function showChipMenu(anchor, items) {
    closeChipMenu();
    chipMenuEl = createElement('div', 'chip-menu');
    items.forEach(it => {
      const b = createElement('button', `chip-menu-item${it.active ? ' active' : ''}`);
      b.innerHTML = `<span class="check">${it.active ? ICONS.check : ''}</span><span>${escapeHtml(it.label)}</span>`;
      b.addEventListener('click', () => { closeChipMenu(); it.fn(); });
      chipMenuEl.appendChild(b);
    });
    document.body.appendChild(chipMenuEl);
    const r = anchor.getBoundingClientRect();
    const mh = chipMenuEl.offsetHeight;
    chipMenuEl.style.left = Math.min(r.left, window.innerWidth - chipMenuEl.offsetWidth - 8) + 'px';
    chipMenuEl.style.top = Math.max(4, r.top - mh - 4) + 'px';
  }

  function updateStatus(statusKey, statusText) {
    if (isTeamAgent(statusKey)) {
      updateTeamAgent(statusKey, statusText, undefined);
      return;
    }
    if (!statusText) delete activeStatuses[statusKey];
    else activeStatuses[statusKey] = statusText;
    renderStatusBar();
  }

  function buildStatusChip(key, raw) {
    // Busy chips (retry/compaction) keep a real spinner — they represent live work
    if (key === '__retry' || key === '__compaction') {
      const chip = createElement('div', 'status-item busy');
      chip.innerHTML = `<div class="spinner"></div><span>${escapeHtml(raw)}</span>`;
      return chip;
    }

    // pi-rtk → on/off toggle
    if (key === 'pi-rtk') {
      const off = /✗|✕|disabled|off/i.test(raw);
      const on = !off;
      const chip = createElement('button', `status-item action toggle ${on ? 'on' : 'off'}`);
      chip.title = `${raw}\nClick to ${on ? 'disable' : 'enable'} rtk`;
      chip.innerHTML = `<span class="dot"></span><span>rtk</span>`;
      chip.addEventListener('click', () => runCommand(`/rtk ${on ? 'disable' : 'enable'}`));
      return chip;
    }

    // caveman → level picker (strip the animated frame char from the text)
    if (key === 'caveman') {
      const m = raw.match(/caveman level:\s*([\w-]+)/i);
      const level = (m ? m[1] : '?').toLowerCase();
      const chip = createElement('button', 'status-item action');
      chip.title = 'Caveman prompt compression — click to change level';
      chip.innerHTML = `<span>caveman: <b>${escapeHtml(level)}</b></span><svg class="chev" width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10l4-4 4 4"/></svg>`;
      chip.addEventListener('click', () => showChipMenu(chip, CAVEMAN_LEVELS.map(l => ({
        label: l,
        active: l === level,
        fn: () => runCommand(`/caveman ${l}`),
      }))));
      return chip;
    }

    // pi-agent-team → condensed text, click opens the team panel
    if (key === 'pi-agent-team') {
      const short = raw.split(/[·\-–]\s*Tip:/i)[0].replace(/\s+/g, ' ').trim();
      const chip = createElement('button', 'status-item action');
      chip.title = `${raw}\nClick to open the team panel`;
      chip.innerHTML = `${ICONS.agent}<span>${escapeHtml(short.slice(0, 48))}</span>`;
      chip.addEventListener('click', toggleTeamPanel);
      return chip;
    }

    // Generic: static informational chip — no fake spinner
    const chip = createElement('div', 'status-item');
    chip.title = raw;
    chip.innerHTML = `<span>${escapeHtml(raw.slice(0, 80))}</span>`;
    return chip;
  }

  function renderStatusBar() {
    const keys = Object.keys(activeStatuses);
    statusBar.innerHTML = '';
    if (keys.length === 0) {
      statusBar.classList.add('hidden');
      return;
    }
    statusBar.classList.remove('hidden');
    keys.forEach(key => {
      statusBar.appendChild(buildStatusChip(key, cleanAnsi(activeStatuses[key]).trim()));
    });
  }

  function updateWidget(widgetKey, widgetLines) {
    if (isTeamAgent(widgetKey)) {
      updateTeamAgent(widgetKey, undefined, widgetLines);
      return;
    }
    let card = widgetsContainer.querySelector(`.widget-card[data-widget-key="${widgetKey}"]`);
    if (!widgetLines || widgetLines.length === 0) {
      if (card) card.remove();
    } else {
      if (!card) {
        card = createElement('div', 'widget-card');
        card.dataset.widgetKey = widgetKey;
        widgetsContainer.appendChild(card);
      }
      card.innerHTML = `
        <div class="widget-card-title">${escapeHtml(widgetKey)}</div>
        <div class="widget-card-line">${escapeHtml(widgetLines.map(cleanAnsi).join('\n'))}</div>`;
    }
    widgetsContainer.classList.toggle('hidden', widgetsContainer.children.length === 0);
  }

  // ── Queue bar ──

  function renderQueue(steering, followUp) {
    const total = (steering?.length || 0) + (followUp?.length || 0);
    if (!total) {
      queueBar.classList.add('hidden');
      queueBar.innerHTML = '';
      return;
    }
    queueBar.classList.remove('hidden');
    queueBar.innerHTML = '';
    (steering || []).forEach(t => {
      queueBar.appendChild(createElement('span', 'queue-chip steer', `↪ ${escapeHtml(t.slice(0, 60))}`));
    });
    (followUp || []).forEach(t => {
      queueBar.appendChild(createElement('span', 'queue-chip follow', `⏭ ${escapeHtml(t.slice(0, 60))}`));
    });
  }

  // ── Stats footer ──

  function renderStats(stats) {
    if (!stats) { footerStats.textContent = ''; return; }
    const parts = [];
    if (stats.contextUsage && stats.contextUsage.percent != null) {
      const pct = Math.round(stats.contextUsage.percent);
      parts.push(`<span class="ctx ${pct > 80 ? 'warn' : ''}">${pct}% context</span>`);
    }
    if (typeof stats.cost === 'number' && stats.cost > 0) {
      parts.push(`<span>$${stats.cost.toFixed(3)}</span>`);
    }
    if (stats.tokens?.total) {
      const t = stats.tokens.total;
      parts.push(`<span>${t > 1000 ? (t / 1000).toFixed(1) + 'k' : t} tok</span>`);
    }
    footerStats.innerHTML = parts.join('<span class="sep">·</span>');
  }

  // ── Extension UI dialogs ──

  function showDialog(request) {
    const { id, method } = request;
    dialogOverlay.classList.remove('hidden');
    dialogOverlay.innerHTML = '';

    const box = createElement('div', 'dialog');
    const title = createElement('div', 'dialog-title');
    title.textContent = request.data.title || 'Pi';
    box.appendChild(title);

    const respond = (payload) => {
      dialogOverlay.classList.add('hidden');
      dialogOverlay.innerHTML = '';
      vscode.postMessage({ type: 'extensionUiResponse', id, ...payload });
    };

    if (method === 'select') {
      const list = createElement('div', 'dialog-options');
      (request.data.options || []).forEach(opt => {
        const b = createElement('button', 'dialog-option');
        b.textContent = opt;
        b.addEventListener('click', () => respond({ value: opt }));
        list.appendChild(b);
      });
      box.appendChild(list);
      box.appendChild(dialogButtons(null, () => respond({ cancelled: true })));
    } else if (method === 'confirm') {
      const msg = createElement('div', 'dialog-message');
      msg.textContent = request.data.message || '';
      box.appendChild(msg);
      box.appendChild(dialogButtons(
        { label: 'Yes', fn: () => respond({ confirmed: true }) },
        () => respond({ confirmed: false }),
        'No',
      ));
    } else if (method === 'input' || method === 'editor') {
      const field = createElement(method === 'editor' ? 'textarea' : 'input', 'dialog-input');
      if (method === 'editor') { field.rows = 8; field.value = request.data.prefill || ''; }
      else field.placeholder = request.data.placeholder || '';
      box.appendChild(field);
      box.appendChild(dialogButtons(
        { label: 'OK', fn: () => respond({ value: field.value }) },
        () => respond({ cancelled: true }),
      ));
      setTimeout(() => field.focus(), 50);
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && method === 'input') { e.preventDefault(); respond({ value: field.value }); }
        if (e.key === 'Escape') respond({ cancelled: true });
      });
    } else {
      // Unknown dialog method: cancel so pi never blocks
      respond({ cancelled: true });
      return;
    }

    dialogOverlay.appendChild(box);
  }

  function dialogButtons(primary, onCancel, cancelLabel) {
    const row = createElement('div', 'dialog-buttons');
    const cancel = createElement('button', 'dialog-btn');
    cancel.textContent = cancelLabel || 'Cancel';
    cancel.addEventListener('click', onCancel);
    row.appendChild(cancel);
    if (primary) {
      const ok = createElement('button', 'dialog-btn primary');
      ok.textContent = primary.label;
      ok.addEventListener('click', primary.fn);
      row.appendChild(ok);
    }
    return row;
  }

  // ── Autocomplete (@ files, / commands) ──

  let acItems = [];
  let acIndex = 0;
  let acKind = null; // 'file' | 'command'

  function showAutocomplete(items, kind) {
    acItems = items;
    acIndex = 0;
    acKind = kind;
    if (!items.length) { hideAutocomplete(); return; }
    autocompleteEl.classList.remove('hidden');
    renderAutocomplete();
  }

  function renderAutocomplete() {
    autocompleteEl.innerHTML = '';
    acItems.forEach((item, i) => {
      const row = createElement('div', `ac-item${i === acIndex ? ' selected' : ''}`);
      row.innerHTML = `
        <span class="ac-icon">${acKind === 'file' ? ICONS.file : ICONS.terminal}</span>
        <span class="ac-label">${escapeHtml(item.label)}</span>
        <span class="ac-detail">${escapeHtml(item.detail || '')}</span>`;
      row.addEventListener('mousedown', (e) => { e.preventDefault(); acceptAutocomplete(i); });
      row.addEventListener('mousemove', () => { if (acIndex !== i) { acIndex = i; renderAutocomplete(); } });
      autocompleteEl.appendChild(row);
    });
  }

  function hideAutocomplete() {
    autocompleteEl.classList.add('hidden');
    autocompleteEl.innerHTML = '';
    acItems = [];
    acKind = null;
  }

  function acceptAutocomplete(i) {
    const item = acItems[i ?? acIndex];
    if (!item) return;
    const cursor = inputEl.selectionStart;
    const val = inputEl.value;
    const before = val.slice(0, cursor);
    const after = val.slice(cursor);
    if (acKind === 'file') {
      const newBefore = before.replace(/@[\w\-./\\]*$/, `@${item.label} `);
      inputEl.value = newBefore + after;
      inputEl.selectionStart = inputEl.selectionEnd = newBefore.length;
    } else {
      const newBefore = before.replace(/\/[\w:\-]*$/, `/${item.name} `);
      inputEl.value = newBefore + after;
      inputEl.selectionStart = inputEl.selectionEnd = newBefore.length;
    }
    hideAutocomplete();
    inputEl.focus();
    inputEl.dispatchEvent(new Event('input'));
  }

  function checkAutocomplete() {
    const cursor = inputEl.selectionStart;
    const val = inputEl.value.slice(0, cursor);

    const fileMatch = val.match(/@([\w\-./\\]*)$/);
    if (fileMatch) {
      vscode.postMessage({ type: 'searchFile', query: fileMatch[1] });
      return;
    }

    const cmdMatch = val.match(/^\/([\w:\-]*)$/);
    if (cmdMatch && piCommands.length) {
      const q = cmdMatch[1].toLowerCase();
      const filtered = piCommands
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 10)
        .map(c => ({ name: c.name, label: `/${c.name}`, detail: c.description || c.source }));
      showAutocomplete(filtered, 'command');
      return;
    }
    hideAutocomplete();
  }

  // ── Attachments ──

  function addAttachment(file) {
    if (attachments.some(a => a.path === file.path)) return;
    attachments.push(file);
    renderAttachments();
  }

  function removeAttachment(path) {
    attachments = attachments.filter(a => a.path !== path);
    renderAttachments();
  }

  function renderAttachments() {
    const list = $('attachment-list');
    list.innerHTML = '';
    attachments.forEach(att => {
      const chip = createElement('div', 'attachment-chip');
      chip.innerHTML = `${ICONS.file}<span title="${escapeHtml(att.path)}">${escapeHtml(att.name)}</span><button title="Remove">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => removeAttachment(att.path));
      list.appendChild(chip);
    });
  }

  // ── Streaming state ──

  function updateStreamingState(isStreaming) {
    state.isStreaming = isStreaming;
    document.body.classList.toggle('streaming', isStreaming);
    abortBtn.classList.toggle('hidden', !isStreaming);
    sendBtn.classList.toggle('hidden', isStreaming && !inputEl.value.trim());
    sendBtn.disabled = !inputEl.value.trim();
    inputEl.placeholder = isStreaming
      ? 'Steer the agent — Enter to send, Esc to stop'
      : 'Ask Pi — @ for files, / for commands';
  }

  // ── Message routing ──

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        if (msg.model) {
          const short = msg.model.split('/').pop();
          modelNameEl.textContent = short.length > 24 ? short.slice(0, 24) + '…' : short;
          modelNameEl.title = msg.model;
        }
        currentModelReasoning = !!msg.modelReasoning;
        btnThinking.classList.toggle('hidden', !currentModelReasoning);
        thinkingLevelEl.textContent = msg.thinkingLevel || 'off';
        updateStreamingState(msg.state === 'streaming');
        break;

      case 'commands':
        piCommands = msg.commands || [];
        break;

      case 'stats':
        renderStats(msg.stats);
        break;

      case 'loadHistory':
        renderHistory(msg.messages || []);
        break;

      case 'sessionsList':
        sessionsList.innerHTML = '';
        if (msg.sessions && msg.sessions.length > 0) {
          sessionsPanel.classList.remove('hidden');
          msg.sessions.forEach(sess => {
            const item = createElement('div', 'session-item');
            item.innerHTML = `
              <div class="session-item-title">${escapeHtml(sess.title)}</div>
              <div class="session-item-date">${escapeHtml(sess.date)}</div>`;
            item.addEventListener('click', () => {
              vscode.postMessage({ type: 'resumeSession', filePath: sess.filePath });
              sessionsPanel.classList.add('hidden');
            });
            sessionsList.appendChild(item);
          });
        } else {
          sessionsList.innerHTML = '<div class="sessions-empty">No sessions for this workspace yet</div>';
          sessionsPanel.classList.remove('hidden');
        }
        break;

      case 'userMessage':
        addUserMessage(msg.text, msg.queued);
        break;

      case 'textDelta': {
        const msgEl = document.querySelector(`[data-msg-id="${msg.messageId === 'current' ? state.currentMessageId : msg.messageId}"]`) || getOrCreateMessage('assistant');
        const contentEl = msgEl.querySelector('.message-content');
        // Continue the last text block only if it is still the last child;
        // otherwise (tool/edit card interleaved) start a fresh block.
        let textEl = contentEl.lastElementChild;
        if (!textEl || !textEl.classList.contains('streaming-text')) {
          if (contentEl.querySelector('.streaming-text')) state.accumulatedText = '';
          textEl = createElement('div', 'streaming-text');
          contentEl.appendChild(textEl);
        }
        state.accumulatedText += msg.delta;
        renderMarkdown(textEl, state.accumulatedText);
        textEl.classList.add('live');
        scrollToBottom();
        break;
      }

      case 'thinkingDelta':
        appendThinkingDelta(msg.messageId, msg.blockIndex, msg.delta);
        break;

      case 'thinkingEnd':
        endThinking(msg.messageId, msg.blockIndex, msg.content);
        break;

      case 'toolStart':
        addToolCard(msg);
        break;

      case 'toolUpdate':
        updateToolCard(msg.toolCallId, msg.output);
        break;

      case 'toolEnd':
        endToolCard(msg);
        break;

      case 'editRecorded':
        addEditCard(msg.filePath, msg.editId);
        break;

      case 'editAccepted':
        settleEditCard(msg.editId, true);
        break;

      case 'editReverted':
        settleEditCard(msg.editId, false);
        break;

      case 'editsSummary':
        renderChangesBar(msg.pending);
        break;

      case 'queueUpdate':
        renderQueue(msg.steering, msg.followUp);
        break;

      case 'retryStatus':
        updateStatus('__retry', msg.text || undefined);
        break;

      case 'compactionStatus':
        updateStatus('__compaction', msg.text || undefined);
        break;

      case 'agentStart':
        state.currentMessageId = null;
        state.accumulatedText = '';
        updateStreamingState(true);
        break;

      case 'agentEnd': {
        updateStreamingState(false);
        document.querySelectorAll('.streaming-text.live').forEach(el => el.classList.remove('live'));
        // Settle any still-running tool cards (aborted)
        document.querySelectorAll('.tool-card.running').forEach(card => {
          card.classList.remove('running');
          card.querySelector('.tool-status').innerHTML = ICONS.cross;
        });
        renderQueue([], []);
        saveState();
        break;
      }

      case 'sessionCleared':
        messagesEl.innerHTML = '';
        widgetsContainer.innerHTML = '';
        widgetsContainer.classList.add('hidden');
        statusBar.innerHTML = '';
        statusBar.classList.add('hidden');
        activeStatuses = {};
        teamState = {};
        renderTeamGrid();
        renderChangesBar([]);
        renderQueue([], []);
        state.messages = [];
        state.currentMessageId = null;
        vscode.setState(state);
        renderWelcome();
        break;

      case 'addFileAttachment':
        addAttachment({ name: msg.name, path: msg.path, type: 'file' });
        break;

      case 'fileResults': {
        // Only show if the @query is still active
        const cursor = inputEl.selectionStart;
        const val = inputEl.value.slice(0, cursor);
        if (/@[\w\-./\\]*$/.test(val)) {
          showAutocomplete(msg.results.map(r => ({ label: r.label, path: r.path })), 'file');
        }
        break;
      }

      case 'setInputText':
        if (msg.append && inputEl.value) inputEl.value = inputEl.value + '\n' + msg.text;
        else inputEl.value = msg.text;
        inputEl.focus();
        inputEl.dispatchEvent(new Event('input'));
        break;

      case 'extensionUiRequest':
        if (msg.method === 'setStatus') {
          updateStatus(msg.data.statusKey, msg.data.statusText);
        } else if (msg.method === 'setWidget') {
          updateWidget(msg.data.widgetKey, msg.data.widgetLines);
        } else if (['select', 'confirm', 'input', 'editor'].includes(msg.method)) {
          showDialog(msg);
        }
        break;

      case 'error': {
        clearWelcome();
        const el = createElement('div', 'error-banner');
        el.textContent = msg.message;
        messagesEl.appendChild(el);
        scrollToBottom(true);
        break;
      }
    }
  });

  // ── Send ──

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    const wasStreaming = state.isStreaming;
    if (!wasStreaming) {
      state.currentMessageId = null;
      state.accumulatedText = '';
    }

    let formattedText = text;
    const images = [];
    attachments.forEach(att => {
      if (att.type === 'file') {
        formattedText += `\n\n@${att.path}`;
      } else if (att.type === 'image') {
        images.push({ data: att.data, mime: att.mime });
      } else if (att.type === 'textcontent') {
        formattedText += `\n\nAttached file "${att.name}":\n\`\`\`\n${att.content}\n\`\`\``;
      }
    });

    inputEl.value = '';
    inputEl.style.height = 'auto';
    attachments = [];
    renderAttachments();
    hideAutocomplete();
    sendBtn.disabled = true;
    autoScroll = true;

    vscode.postMessage({ type: 'prompt', text: formattedText, images, streaming: wasStreaming });
  }

  // ── Input events ──

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
    sendBtn.disabled = !inputEl.value.trim();
    if (state.isStreaming) {
      sendBtn.classList.toggle('hidden', !inputEl.value.trim());
    }
    checkAutocomplete();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (!autocompleteEl.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = (acIndex + 1) % acItems.length; renderAutocomplete(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; renderAutocomplete(); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); acceptAutocomplete(); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideAutocomplete(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'Escape' && state.isStreaming) {
      e.preventDefault();
      vscode.postMessage({ type: 'abort' });
    }
  });

  inputEl.addEventListener('blur', () => setTimeout(hideAutocomplete, 150));

  sendBtn.addEventListener('click', sendMessage);
  abortBtn.addEventListener('click', () => vscode.postMessage({ type: 'abort' }));
  btnNew.addEventListener('click', () => vscode.postMessage({ type: 'newSession' }));
  btnHistory.addEventListener('click', () => {
    if (sessionsPanel.classList.contains('hidden')) {
      vscode.postMessage({ type: 'getSessions' });
    } else {
      sessionsPanel.classList.add('hidden');
    }
  });
  btnCloseSessions.addEventListener('click', () => sessionsPanel.classList.add('hidden'));

  // Team panel actions (Init / Result / Stop / Close)
  document.querySelectorAll('.team-action').forEach(btn => {
    btn.addEventListener('click', () => runCommand(btn.dataset.cmd));
  });
  $('btn-close-team').addEventListener('click', () => {
    teamPanelPinned = false;
    $('team-monitor').classList.add('hidden');
  });
  btnModel.addEventListener('click', () => vscode.postMessage({ type: 'selectModel' }));
  btnThinking.addEventListener('click', () => {
    const cur = thinkingLevelEl.textContent;
    const next = THINKING_LEVELS[(THINKING_LEVELS.indexOf(cur) + 1) % THINKING_LEVELS.length];
    thinkingLevelEl.textContent = next;
    vscode.postMessage({ type: 'setThinkingLevel', level: next });
  });
  btnAttach.addEventListener('click', () => vscode.postMessage({ type: 'selectFileToAttach' }));

  // ── Paste image ──

  inputEl.addEventListener('paste', (e) => {
    const items = (e.clipboardData || window.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (evt) => {
          addAttachment({
            name: `pasted-image-${Date.now()}.png`,
            path: `pasted-image-${Date.now()}`,
            data: evt.target.result.split(',')[1],
            mime: file.type,
            type: 'image',
          });
        };
        reader.readAsDataURL(file);
        e.preventDefault();
      }
    }
  });

  // ── Drag & drop ──
  // Sources handled:
  //  1. VS Code explorer/editor tabs → 'application/vnd.code.uri-list', 'codefiles', 'resourceurls', 'text/uri-list'
  //  2. Finder / OS → dataTransfer.files (path if Electron exposes it, else read contents)
  //  3. Plain text paths

  const dropZone = createElement('div', 'hidden');
  dropZone.id = 'drop-zone';
  dropZone.innerHTML = `<div class="drop-zone-inner">${ICONS.file}<span>Drop files to attach</span></div>`;
  document.body.appendChild(dropZone);

  let dragDepth = 0;
  function showDropZone(show) { dropZone.classList.toggle('hidden', !show); }

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    showDropZone(true);
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showDropZone(false);
  });
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  function uriToPath(text) {
    let t = String(text || '').trim().replace(/^["']|["']$/g, '');
    if (!t || t.startsWith('#')) return '';
    if (t.startsWith('file://')) {
      try { t = decodeURIComponent(t.replace(/^file:\/\/(localhost)?/, '')); } catch { return ''; }
      // Windows: /C:/foo → C:/foo
      if (/^\/[a-zA-Z]:[\\/]/.test(t)) t = t.slice(1);
      return t;
    }
    if (t.startsWith('vscode-remote://') || t.startsWith('vscode-file://')) {
      try {
        const u = new URL(t);
        return decodeURIComponent(u.pathname);
      } catch { return ''; }
    }
    if (t.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(t)) return t;
    return '';
  }

  function attachPath(p) {
    if (!p) return false;
    addAttachment({ name: p.split(/[\\/]/).pop(), path: p, type: 'file' });
    return true;
  }

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    showDropZone(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    let handled = false;

    // 1. VS Code-specific payloads
    const codeUris = dt.getData('application/vnd.code.uri-list');
    if (codeUris) {
      codeUris.split(/[\r\n]+/).forEach(u => { if (attachPath(uriToPath(u))) handled = true; });
    }
    if (!handled) {
      const resourceUrls = dt.getData('resourceurls');
      if (resourceUrls) {
        try {
          JSON.parse(resourceUrls).forEach(u => { if (attachPath(uriToPath(u))) handled = true; });
        } catch { /* not JSON */ }
      }
    }
    if (!handled) {
      const codeFiles = dt.getData('codefiles');
      if (codeFiles) {
        try {
          JSON.parse(codeFiles).forEach(p => { if (attachPath(p)) handled = true; });
        } catch { /* not JSON */ }
      }
    }

    // 2. Generic uri-list / plain text
    if (!handled) {
      const uriList = dt.getData('text/uri-list') || dt.getData('text/plain');
      if (uriList) {
        uriList.split(/[\r\n]+/).forEach(u => { if (attachPath(uriToPath(u))) handled = true; });
      }
    }
    if (handled) return;

    // 3. OS file objects (Finder). Prefer the real path when Electron exposes
    //    it; otherwise read the contents (image → base64, text → inline).
    for (const file of dt.files) {
      if (file.path && attachPath(file.path)) continue;

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          addAttachment({
            name: file.name,
            path: `dropped-${Date.now()}-${file.name}`,
            data: evt.target.result.split(',')[1],
            mime: file.type,
            type: 'image',
          });
        };
        reader.readAsDataURL(file);
      } else if (file.size <= 256 * 1024) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = String(evt.target.result || '');
          // Skip binary-looking content
          if (/[\u0000-\u0008\u000e-\u001f]/.test(content.slice(0, 1000))) return;
          addAttachment({
            name: file.name,
            path: `dropped-${Date.now()}-${file.name}`,
            content: content.slice(0, 64 * 1024),
            type: 'textcontent',
          });
        };
        reader.readAsText(file);
      }
    }
  });

  restoreState();
  vscode.postMessage({ type: 'ready' });
})();
