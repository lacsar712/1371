(function (global) {
  const API_BASE = global.API_BASE || '';
  const POLL_INTERVAL = 30000;

  function getUser() {
    try {
      const raw = sessionStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function authHeaders() {
    const user = getUser();
    if (!user) return {};
    return { 'X-User': encodeURIComponent(JSON.stringify(user)) };
  }

  async function apiFetch(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders(), options.headers || {});
    const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!res.ok) {
      throw new Error(data.message || ('HTTP ' + res.status));
    }
    return data;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isSameDay = d.toDateString() === now.toDateString();
    const pad = (n) => String(n).padStart(2, '0');
    if (isSameDay) {
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    const isSameYear = d.getFullYear() === now.getFullYear();
    if (isSameYear) {
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.charAt(0);
  }

  function showToast(message, type) {
    type = type || 'info';
    const el = document.getElementById('toast');
    if (!el) {
      alert(message);
      return;
    }
    el.textContent = message;
    el.className = 'toast ' + type + ' show';
    setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  const state = {
    activeTab: 'inbox',
    pages: { inbox: 1, sent: 1, drafts: 1 },
    totalCounts: { inbox: 0, sent: 0, drafts: 0 },
    listCache: { inbox: [], sent: [], drafts: [] },
    pollTimer: null,
    currentDetailId: null,
  };

  function renderBell(container) {
    container.innerHTML =
      '<div class="msg-bell-wrap" id="msgBellBtn" title="消息中心">' +
        '<span class="msg-bell-icon">🔔</span>' +
        '<span class="msg-bell-badge hidden" id="msgBellBadge">0</span>' +
      '</div>';
    const bell = document.getElementById('msgBellBtn');
    bell.addEventListener('click', openDrawer);
  }

  async function refreshUnreadCount(updateBadgeOnly) {
    try {
      const res = await apiFetch('/api/messages/unread-count');
      const count = (res.data && res.data.count) || 0;
      const badge = document.getElementById('msgBellBadge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
      if (!updateBadgeOnly && document.getElementById('msgInboxTab')) {
        await refreshTabCount('inbox');
      }
    } catch (e) {
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(function () {
      refreshUnreadCount(true);
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function ensureDrawerDom() {
    if (document.getElementById('msgDrawerOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'msgDrawerOverlay';
    overlay.className = 'msg-drawer-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML =
      '<div class="msg-drawer" id="msgDrawer" onclick="event.stopPropagation()">' +
        '<div class="msg-drawer-header">' +
          '<h2 class="msg-drawer-title">💬 消息中心</h2>' +
          '<button type="button" class="msg-drawer-close" id="msgDrawerClose">✕</button>' +
        '</div>' +
        '<div class="msg-tabs">' +
          '<button type="button" class="msg-tab active" data-msg-tab="inbox" id="msgInboxTab">' +
            '收件箱<span class="msg-tab-count" id="msgInboxCount">0</span>' +
          '</button>' +
          '<button type="button" class="msg-tab" data-msg-tab="sent" id="msgSentTab">' +
            '已发送<span class="msg-tab-count" id="msgSentCount">0</span>' +
          '</button>' +
          '<button type="button" class="msg-tab" data-msg-tab="drafts" id="msgDraftsTab">' +
            '草稿箱<span class="msg-tab-count" id="msgDraftsCount">0</span>' +
          '</button>' +
        '</div>' +
        '<div class="msg-toolbar">' +
          '<span id="msgToolbarHint" style="font-size:0.8125rem;color:var(--text-secondary);opacity:0.8;"></span>' +
          '<button type="button" class="msg-compose-btn" id="msgComposeBtn">✏️ 写消息</button>' +
        '</div>' +
        '<div class="msg-list" id="msgList"></div>' +
        '<div class="msg-pagination" id="msgPagination"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDrawer();
    });
    document.getElementById('msgDrawerClose').addEventListener('click', closeDrawer);
    document.getElementById('msgComposeBtn').addEventListener('click', openCompose);

    overlay.querySelectorAll('.msg-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTab(tab.dataset.msgTab);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (overlay.style.display !== 'none') closeDrawer();
        if (document.getElementById('msgComposeOverlay') && document.getElementById('msgComposeOverlay').style.display !== 'none') closeCompose();
      }
    });
  }

  function openDrawer() {
    ensureDrawerDom();
    const overlay = document.getElementById('msgDrawerOverlay');
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    switchTab(state.activeTab);
    refreshUnreadCount(false);
  }

  function closeDrawer() {
    const overlay = document.getElementById('msgDrawerOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    state.currentDetailId = null;
  }

  async function refreshTabCount(tab) {
    const countEl = document.getElementById('msg' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Count');
    if (!countEl) return;
    try {
      const pageSize = 10;
      const endpoint = tab === 'inbox' ? '/api/messages/inbox' : tab === 'sent' ? '/api/messages/sent' : '/api/messages/drafts';
      const res = await apiFetch(endpoint + '?page=1&pageSize=' + pageSize);
      const total = (res.pagination && res.pagination.total) || 0;
      countEl.textContent = total;
      state.totalCounts[tab] = total;
    } catch (e) {
    }
  }

  async function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.msg-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.msgTab === tab);
    });
    const hint = document.getElementById('msgToolbarHint');
    if (hint) {
      if (tab === 'inbox') hint.textContent = '点击消息查看详情，打开后自动标记为已读';
      else if (tab === 'sent') hint.textContent = '对方已读的消息会显示「已读」徽章';
      else hint.textContent = '草稿可继续编辑后发送';
    }
    await loadList(tab, state.pages[tab]);
  }

  async function loadList(tab, page) {
    page = page || 1;
    state.pages[tab] = page;
    const pageSize = 10;
    const listEl = document.getElementById('msgList');
    const paginationEl = document.getElementById('msgPagination');
    listEl.innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text-secondary);opacity:0.6;">' +
        '<div style="display:inline-block;width:24px;height:24px;border:2px solid rgba(99,102,241,0.3);border-top-color:var(--accent-start);border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
        '<div style="margin-top:12px;font-size:0.875rem;">加载中...</div>' +
      '</div>';
    paginationEl.innerHTML = '';
    try {
      const endpoint = tab === 'inbox' ? '/api/messages/inbox' : tab === 'sent' ? '/api/messages/sent' : '/api/messages/drafts';
      const res = await apiFetch(endpoint + '?page=' + page + '&pageSize=' + pageSize);
      const list = res.data || [];
      state.listCache[tab] = list;
      const pagination = res.pagination || { total: 0, page: 1, pageSize: 10, totalPages: 0 };
      state.totalCounts[tab] = pagination.total || 0;
      const countEl = document.getElementById('msg' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Count');
      if (countEl) countEl.textContent = pagination.total || 0;

      renderList(tab, list);
      renderPagination(tab, pagination);
    } catch (e) {
      listEl.innerHTML =
        '<div class="msg-list-empty">' +
          '<div class="msg-list-empty-icon">⚠️</div>' +
          '<div class="msg-list-empty-text">加载失败：' + escapeHtml(e.message) + '</div>' +
        '</div>';
    }
  }

  function renderList(tab, list) {
    const listEl = document.getElementById('msgList');
    if (!list || list.length === 0) {
      let emptyIcon = '📭';
      let emptyText = '暂无消息';
      if (tab === 'inbox') { emptyText = '收件箱空空如也'; }
      else if (tab === 'sent') { emptyIcon = '📤'; emptyText = '还没有发送过消息'; }
      else { emptyIcon = '📝'; emptyText = '没有草稿'; }
      listEl.innerHTML =
        '<div class="msg-list-empty">' +
          '<div class="msg-list-empty-icon">' + emptyIcon + '</div>' +
          '<div class="msg-list-empty-text">' + emptyText + '</div>' +
        '</div>';
      return;
    }

    const html = list.map(function (msg) {
      if (tab === 'inbox') return renderInboxItem(msg);
      if (tab === 'sent') return renderSentItem(msg);
      return renderDraftItem(msg);
    }).join('');
    listEl.innerHTML = html;

    listEl.querySelectorAll('.msg-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const id = parseInt(item.dataset.msgId, 10);
        if (tab === 'drafts') {
          openCompose(id);
        } else {
          openDetail(tab, id);
        }
      });
    });
  }

  function renderInboxItem(msg) {
    const unread = !msg.isRead;
    return (
      '<div class="msg-item' + (unread ? ' unread' : '') + '" data-msg-id="' + msg.id + '">' +
        '<div class="msg-avatar ' + msg.senderType + '">' + escapeHtml(getInitials(msg.senderName)) + '</div>' +
        '<div class="msg-content">' +
          '<div class="msg-item-header">' +
            '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' +
              '<span class="msg-name">' + escapeHtml(msg.senderName) + '</span>' +
              '<span class="msg-role-tag ' + msg.senderType + '">' + escapeHtml(msg.senderRoleName || msg.senderType) + '</span>' +
            '</div>' +
            '<span class="msg-time">' + formatTime(msg.sentAt) + '</span>' +
          '</div>' +
          '<div class="msg-title">' + escapeHtml(msg.title) + '</div>' +
          '<div class="msg-preview">' + escapeHtml(msg.content) + '</div>' +
          '<div class="msg-item-meta">' +
            (unread ? '<span class="msg-unread-dot"></span><span style="font-size:0.75rem;color:var(--accent-start);font-weight:600;">新消息</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderSentItem(msg) {
    return (
      '<div class="msg-item" data-msg-id="' + msg.id + '">' +
        '<div class="msg-avatar ' + msg.recipientType + '">' + escapeHtml(getInitials(msg.recipientName)) + '</div>' +
        '<div class="msg-content">' +
          '<div class="msg-item-header">' +
            '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' +
              '<span class="msg-name">' + escapeHtml(msg.recipientName) + '</span>' +
              '<span class="msg-role-tag ' + msg.recipientType + '">' + escapeHtml(msg.recipientRoleName || msg.recipientType) + '</span>' +
            '</div>' +
            '<span class="msg-time">' + formatTime(msg.sentAt) + '</span>' +
          '</div>' +
          '<div class="msg-title">' + escapeHtml(msg.title) + '</div>' +
          '<div class="msg-preview">' + escapeHtml(msg.content) + '</div>' +
          '<div class="msg-item-meta">' +
            (msg.isRead ? '<span class="msg-read-badge">✓ 已读</span>' : '<span style="font-size:0.75rem;color:var(--text-secondary);opacity:0.7;">未读</span>') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderDraftItem(msg) {
    return (
      '<div class="msg-item" data-msg-id="' + msg.id + '">' +
        '<div class="msg-avatar" style="background:linear-gradient(135deg,#64748b,#475569);">📝</div>' +
        '<div class="msg-content">' +
          '<div class="msg-item-header">' +
            '<div style="display:flex;align-items:center;gap:6px;min-width:0;">' +
              '<span class="msg-name">' + (msg.recipientName ? escapeHtml(msg.recipientName) : '未选择接收人') + '</span>' +
              (msg.recipientType ? '<span class="msg-role-tag ' + msg.recipientType + '">' + escapeHtml(msg.recipientRoleName || msg.recipientType) + '</span>' : '') +
            '</div>' +
            '<span class="msg-time">' + formatTime(msg.sentAt) + '</span>' +
          '</div>' +
          '<div class="msg-title">' + escapeHtml(msg.title || '(无标题)') + '</div>' +
          '<div class="msg-preview">' + escapeHtml(msg.content || '(无内容)') + '</div>' +
          '<div class="msg-item-meta">' +
            '<span style="font-size:0.75rem;color:#fbbf24;font-weight:600;">📋 草稿</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPagination(tab, pagination) {
    const paginationEl = document.getElementById('msgPagination');
    if (pagination.totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    const totalPages = pagination.totalPages;
    const current = pagination.page;
    let html = '<button type="button" class="msg-page-btn" data-pg="prev" ' + (current <= 1 ? 'disabled' : '') + '>‹ 上一页</button>';
    const pages = [];
    const addPage = function (p) {
      if (pages.length && pages[pages.length - 1] === '...' && p === '...') return;
      pages.push(p);
    };
    addPage(1);
    const start = Math.max(2, current - 2);
    const end = Math.min(totalPages - 1, current + 2);
    if (start > 2) addPage('...');
    for (let i = start; i <= end; i++) addPage(i);
    if (end < totalPages - 1) addPage('...');
    if (totalPages > 1) addPage(totalPages);

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (p === '...') {
        html += '<span style="padding:0 4px;color:var(--text-secondary);opacity:0.5;">...</span>';
      } else {
        html += '<button type="button" class="msg-page-btn' + (p === current ? ' active' : '') + '" data-pg="' + p + '">' + p + '</button>';
      }
    }
    html += '<button type="button" class="msg-page-btn" data-pg="next" ' + (current >= totalPages ? 'disabled' : '') + '>下一页 ›</button>';
    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll('.msg-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        let target = btn.dataset.pg;
        if (target === 'prev') target = current - 1;
        else if (target === 'next') target = current + 1;
        else target = parseInt(target, 10);
        if (target >= 1 && target <= totalPages) loadList(tab, target);
      });
    });
  }

  async function openDetail(tab, id) {
    try {
      const res = await apiFetch('/api/messages/' + id);
      const msg = res.data;
      if (!msg) return;
      state.currentDetailId = id;

      const listEl = document.getElementById('msgList');
      const paginationEl = document.getElementById('msgPagination');
      paginationEl.innerHTML = '';

      let isRecipient = tab === 'inbox';
      let fromInfo, toInfo;
      if (isRecipient) {
        fromInfo = { name: msg.senderName, type: msg.senderType, roleName: msg.senderRoleName, no: msg.senderNo };
        toInfo = { name: '我', type: msg.recipientType, roleName: msg.recipientRoleName, no: msg.recipientNo };
      } else {
        fromInfo = { name: '我', type: msg.senderType, roleName: msg.senderRoleName, no: msg.senderNo };
        toInfo = { name: msg.recipientName, type: msg.recipientType, roleName: msg.recipientRoleName, no: msg.recipientNo };
      }

      let readInfo = '';
      if (isRecipient) {
        readInfo = '<div class="msg-detail-meta-item"><span class="msg-detail-meta-label">状态：</span><span class="msg-detail-meta-value" style="color:#34d399;">✓ 已读</span></div>';
      } else {
        if (msg.isRead) {
          readInfo = '<div class="msg-detail-meta-item"><span class="msg-detail-meta-label">状态：</span><span class="msg-detail-meta-value" style="color:#34d399;">✓ 对方已于 ' + formatTime(msg.readAt) + ' 阅读</span></div>';
        } else {
          readInfo = '<div class="msg-detail-meta-item"><span class="msg-detail-meta-label">状态：</span><span class="msg-detail-meta-value" style="color:var(--text-secondary);">对方未读</span></div>';
        }
      }

      const fromNoText = fromInfo.no && fromInfo.name !== '我' ? ' (' + escapeHtml(fromInfo.no) + ')' : '';
      const toNoText = toInfo.no && toInfo.name !== '我' ? ' (' + escapeHtml(toInfo.no) + ')' : '';

      listEl.innerHTML =
        '<div class="msg-detail-view">' +
          '<button type="button" class="msg-detail-back" id="msgDetailBack">← 返回列表</button>' +
          '<div class="msg-detail-header">' +
            '<h2 class="msg-detail-title">' + escapeHtml(msg.title) + '</h2>' +
            '<div class="msg-detail-meta">' +
              '<div class="msg-detail-meta-item"><span class="msg-detail-meta-label">发件人：</span><span class="msg-detail-meta-value">' + escapeHtml(fromInfo.name) + fromNoText + '</span>' +
                (fromInfo.name !== '我' ? '<span class="msg-role-tag ' + fromInfo.type + '" style="margin-left:6px;">' + escapeHtml(fromInfo.roleName || fromInfo.type) + '</span>' : '') +
              '</div>' +
              '<div class="msg-detail-meta-item"><span class="msg-detail-meta-label">收件人：</span><span class="msg-detail-meta-value">' + escapeHtml(toInfo.name) + toNoText + '</span>' +
                (toInfo.name !== '我' ? '<span class="msg-role-tag ' + toInfo.type + '" style="margin-left:6px;">' + escapeHtml(toInfo.roleName || toInfo.type) + '</span>' : '') +
              '</div>' +
              '<div class="msg-detail-meta-item"><span class="msg-detail-meta-label">发送时间：</span><span class="msg-detail-meta-value">' + escapeHtml(formatTime(msg.sentAt)) + '</span></div>' +
              readInfo +
            '</div>' +
          '</div>' +
          '<div class="msg-detail-content">' + escapeHtml(msg.content) + '</div>' +
        '</div>';

      document.getElementById('msgDetailBack').addEventListener('click', function () {
        state.currentDetailId = null;
        renderList(tab, state.listCache[tab]);
        renderPagination(tab, {
          total: state.totalCounts[tab],
          page: state.pages[tab],
          pageSize: 10,
          totalPages: Math.ceil(state.totalCounts[tab] / 10),
        });
      });

      if (isRecipient) {
        refreshUnreadCount(false);
      }
    } catch (e) {
      showToast('打开消息失败：' + e.message, 'error');
    }
  }

  function ensureComposeDom() {
    if (document.getElementById('msgComposeOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'msgComposeOverlay';
    overlay.className = 'msg-compose-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML =
      '<div class="msg-compose-modal" onclick="event.stopPropagation()">' +
        '<div class="msg-compose-header">' +
          '<h2 class="msg-compose-title" id="msgComposeTitle">撰写新消息</h2>' +
          '<button type="button" class="msg-drawer-close" id="msgComposeClose">✕</button>' +
        '</div>' +
        '<div class="msg-compose-body">' +
          '<div class="msg-form-group">' +
            '<label class="msg-form-label">接收人<span class="required">*</span></label>' +
            '<div id="msgSelectedTag" style="display:none;"></div>' +
            '<div class="msg-recipient-wrap">' +
              '<input type="text" class="msg-recipient-input" id="msgRecipientInput" placeholder="按学号 / 工号 / 用户名搜索..." autocomplete="off" />' +
              '<div class="msg-recipient-dropdown" id="msgRecipientDropdown"></div>' +
            '</div>' +
          '</div>' +
          '<div class="msg-form-group">' +
            '<label for="msgTitleInput" class="msg-form-label">标题<span class="required">*</span></label>' +
            '<input type="text" class="msg-form-input" id="msgTitleInput" placeholder="请输入消息标题" maxlength="200" />' +
          '</div>' +
          '<div class="msg-form-group">' +
            '<label for="msgContentInput" class="msg-form-label">内容<span class="required">*</span></label>' +
            '<textarea class="msg-form-textarea" id="msgContentInput" placeholder="请输入消息内容..."></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="msg-compose-footer">' +
          '<button type="button" class="msg-save-draft-btn" id="msgSaveDraftBtn">💾 保存草稿</button>' +
          '<div class="msg-compose-actions">' +
            '<button type="button" class="msg-cancel-btn" id="msgComposeCancelBtn">取消</button>' +
            '<button type="button" class="msg-send-btn" id="msgSendBtn">📤 发送</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeCompose();
    });
    document.getElementById('msgComposeClose').addEventListener('click', closeCompose);
    document.getElementById('msgComposeCancelBtn').addEventListener('click', closeCompose);

    const recipientInput = document.getElementById('msgRecipientInput');
    const dropdown = document.getElementById('msgRecipientDropdown');
    let searchTimer = null;
    let searchResults = [];

    function hideDropdown() {
      dropdown.classList.remove('show');
    }

    function showDropdown() {
      dropdown.classList.add('show');
    }

    function renderOptions(results, selectedId) {
      if (!results || results.length === 0) {
        dropdown.innerHTML = '<div style="padding:20px;text-align:center;font-size:0.875rem;color:var(--text-secondary);opacity:0.7;">未找到匹配的用户</div>';
      } else {
        dropdown.innerHTML = results.map(function (r) {
          return (
            '<div class="msg-recipient-option' + (selectedId === r.id + '-' + r.type ? ' selected' : '') + '" data-result-id="' + r.id + '" data-result-type="' + r.type + '">' +
              '<div class="msg-recipient-option-avatar ' + r.type + '">' + escapeHtml(getInitials(r.name)) + '</div>' +
              '<div class="msg-recipient-option-info">' +
                '<div class="msg-recipient-option-name">' + escapeHtml(r.display) + '</div>' +
                '<div class="msg-recipient-option-no">' + escapeHtml(getRoleLabel(r.type)) + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('');
        dropdown.querySelectorAll('.msg-recipient-option').forEach(function (opt) {
          opt.addEventListener('click', function () {
            const id = parseInt(opt.dataset.resultId, 10);
            const type = opt.dataset.resultType;
            const match = results.find(function (r) { return r.id === id && r.type === type; });
            if (match) selectRecipient(match);
          });
        });
      }
    }

    function selectRecipient(r) {
      composeState.recipient = r;
      recipientInput.value = r.display;
      renderSelectedTag(r);
      hideDropdown();
      recipientInput.blur();
    }

    function renderSelectedTag(r) {
      const tagEl = document.getElementById('msgSelectedTag');
      tagEl.style.display = 'block';
      tagEl.innerHTML =
        '<div class="msg-selected-tag">' +
          '<div class="msg-avatar ' + r.type + '" style="width:32px;height:32px;font-size:0.8125rem;">' + escapeHtml(getInitials(r.name)) + '</div>' +
          '<div class="msg-selected-tag-info">' +
            '<span class="msg-selected-tag-name">' + escapeHtml(r.display) + '</span>' +
            '<span style="font-size:0.6875rem;color:rgba(199,210,254,0.7);">' + escapeHtml(getRoleLabel(r.type)) + '</span>' +
          '</div>' +
          '<button type="button" class="msg-selected-tag-remove" id="msgRemoveRecipient" title="移除">✕</button>' +
        '</div>';
      document.getElementById('msgRemoveRecipient').addEventListener('click', function () {
        composeState.recipient = null;
        recipientInput.value = '';
        tagEl.style.display = 'none';
        recipientInput.focus();
      });
    }

    function getRoleLabel(type) {
      if (type === 'student') return '学生';
      if (type === 'teacher') return '教师';
      if (type === 'admin') return '管理员';
      return '未知';
    }

    async function doSearch(keyword) {
      try {
        const res = await apiFetch('/api/messages/recipients/search?keyword=' + encodeURIComponent(keyword) + '&limit=20');
        searchResults = res.data || [];
        renderOptions(searchResults, composeState.recipient ? composeState.recipient.id + '-' + composeState.recipient.type : null);
      } catch (e) {
        searchResults = [];
        dropdown.innerHTML = '<div style="padding:20px;text-align:center;font-size:0.875rem;color:var(--text-secondary);opacity:0.7;">搜索失败</div>';
      }
    }

    recipientInput.addEventListener('focus', function () {
      if (composeState.recipient) return;
      const kw = recipientInput.value.trim();
      if (kw.length >= 1) {
        showDropdown();
        doSearch(kw);
      } else if (searchResults.length > 0) {
        showDropdown();
        renderOptions(searchResults, null);
      }
    });

    recipientInput.addEventListener('input', function () {
      const kw = recipientInput.value.trim();
      if (composeState.recipient && composeState.recipient.display !== kw) {
        composeState.recipient = null;
        document.getElementById('msgSelectedTag').style.display = 'none';
      }
      if (searchTimer) clearTimeout(searchTimer);
      if (kw.length < 1) {
        hideDropdown();
        return;
      }
      searchTimer = setTimeout(function () {
        showDropdown();
        doSearch(kw);
      }, 300);
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.msg-recipient-wrap')) hideDropdown();
    });

    document.getElementById('msgSaveDraftBtn').addEventListener('click', saveDraft);
    document.getElementById('msgSendBtn').addEventListener('click', sendMessage);
  }

  const composeState = {
    recipient: null,
    draftId: null,
  };

  function openCompose(draftId) {
    ensureComposeDom();
    composeState.draftId = draftId || null;
    composeState.recipient = null;

    const overlay = document.getElementById('msgComposeOverlay');
    const title = document.getElementById('msgComposeTitle');
    const recipientInput = document.getElementById('msgRecipientInput');
    const titleInput = document.getElementById('msgTitleInput');
    const contentInput = document.getElementById('msgContentInput');
    const tagEl = document.getElementById('msgSelectedTag');
    const dropdown = document.getElementById('msgRecipientDropdown');

    title.textContent = draftId ? '编辑草稿' : '撰写新消息';
    recipientInput.value = '';
    titleInput.value = '';
    contentInput.value = '';
    tagEl.style.display = 'none';
    dropdown.classList.remove('show');
    dropdown.innerHTML = '';

    if (draftId) {
      (async function () {
        try {
          const res = await apiFetch('/api/messages/' + draftId);
          const msg = res.data;
          if (!msg) return;
          if (msg.recipientId && msg.recipientType && msg.recipientName) {
            const no = msg.recipientNo || '';
            let display = msg.recipientName;
            if (msg.recipientType === 'student') display = msg.recipientName + ' (学号: ' + no + ')';
            else if (msg.recipientType === 'teacher') display = msg.recipientName + ' (工号: ' + no + ')';
            else display = msg.recipientName + ' (管理员)';
            composeState.recipient = { id: msg.recipientId, type: msg.recipientType, name: msg.recipientName, no: no, display: display };
            recipientInput.value = display;
            tagEl.style.display = 'block';
            tagEl.innerHTML =
              '<div class="msg-selected-tag">' +
                '<div class="msg-avatar ' + msg.recipientType + '" style="width:32px;height:32px;font-size:0.8125rem;">' + escapeHtml(getInitials(msg.recipientName)) + '</div>' +
                '<div class="msg-selected-tag-info">' +
                  '<span class="msg-selected-tag-name">' + escapeHtml(display) + '</span>' +
                  '<span style="font-size:0.6875rem;color:rgba(199,210,254,0.7);">' + (msg.recipientRoleName || msg.recipientType) + '</span>' +
                '</div>' +
                '<button type="button" class="msg-selected-tag-remove" id="msgRemoveRecipient">✕</button>' +
              '</div>';
            document.getElementById('msgRemoveRecipient').addEventListener('click', function () {
              composeState.recipient = null;
              recipientInput.value = '';
              tagEl.style.display = 'none';
              recipientInput.focus();
            });
          }
          titleInput.value = msg.title && msg.title !== '(无标题)' ? msg.title : '';
          contentInput.value = msg.content || '';
        } catch (e) {
          showToast('加载草稿失败：' + e.message, 'error');
        }
      })();
    }

    overlay.style.display = 'flex';
  }

  function closeCompose() {
    const overlay = document.getElementById('msgComposeOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function saveDraft() {
    const titleInput = document.getElementById('msgTitleInput');
    const contentInput = document.getElementById('msgContentInput');
    const btn = document.getElementById('msgSaveDraftBtn');
    const originalText = btn.textContent;

    const payload = {
      title: titleInput.value.trim(),
      content: contentInput.value.trim(),
    };
    if (composeState.draftId) payload.id = composeState.draftId;
    if (composeState.recipient) {
      payload.recipientId = composeState.recipient.id;
      payload.recipientType = composeState.recipient.type;
    }
    if (!payload.title && !payload.content && !payload.recipientId) {
      showToast('请至少填写标题、内容或选择接收人', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      const res = await apiFetch('/api/messages/draft', { method: 'POST', body: JSON.stringify(payload) });
      composeState.draftId = res.data ? res.data.id : composeState.draftId;
      showToast(res.message || '草稿已保存', 'success');
      if (state.activeTab === 'drafts') {
        await refreshTabCount('drafts');
        await loadList('drafts', state.pages.drafts);
      } else {
        refreshTabCount('drafts');
      }
    } catch (e) {
      showToast('保存草稿失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  async function sendMessage() {
    const titleInput = document.getElementById('msgTitleInput');
    const contentInput = document.getElementById('msgContentInput');
    const btn = document.getElementById('msgSendBtn');
    const originalText = btn.textContent;

    if (!composeState.recipient) {
      showToast('请选择接收人', 'error');
      return;
    }
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title) {
      showToast('请填写标题', 'error');
      titleInput.focus();
      return;
    }
    if (!content) {
      showToast('请填写内容', 'error');
      contentInput.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '发送中...';
    try {
      await apiFetch('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: composeState.recipient.id,
          recipientType: composeState.recipient.type,
          title: title,
          content: content,
        }),
      });
      showToast('发送成功', 'success');
      closeCompose();
      if (composeState.draftId) {
        try {
          await apiFetch('/api/messages/' + composeState.draftId, { method: 'DELETE' });
        } catch (_) {}
        composeState.draftId = null;
      }
      refreshTabCount('sent');
      if (state.activeTab === 'sent') {
        await loadList('sent', 1);
      }
      if (state.activeTab === 'drafts') {
        await refreshTabCount('drafts');
        await loadList('drafts', state.pages.drafts);
      }
    } catch (e) {
      showToast('发送失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function initMessageCenter(bellContainer) {
    renderBell(bellContainer);
    setTimeout(function () {
      refreshUnreadCount(true);
      startPolling();
    }, 100);
  }

  global.MessageCenter = {
    init: initMessageCenter,
    refreshUnreadCount: refreshUnreadCount,
  };
})(window);
