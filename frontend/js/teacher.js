(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let myCourses = [];
  let currentCourseId = null;
  let allSemesters = [];
  let currentSemesterId = null;
  let currentView = 'students';
  let gradeData = [];

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u.role !== 'teacher' || !u.id) return null;
      return u;
    } catch (_) {
      return null;
    }
  }

  function showToast(message, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast ' + type + ' show';
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function api(path, options = {}) {
    return fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    }).then((r) => {
      const contentType = r.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return r.json().then((d) => ({ ok: r.ok, status: r.status, data: d, blob: null }));
      }
      return r.blob().then((b) => ({ ok: r.ok, status: r.status, data: null, blob: b, response: r }));
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function calculateTotalScore(regular, final) {
    const r = regular !== '' && regular !== null && regular !== undefined ? Number(regular) : null;
    const f = final !== '' && final !== null && final !== undefined ? Number(final) : null;
    if (r === null && f === null) return null;
    let total = 0;
    if (r !== null) total += r * 0.4;
    if (f !== null) total += f * 0.6;
    return Math.round(total * 100) / 100;
  }

  function calculateGrade(total) {
    if (total === null || total === undefined || total === '') return '';
    const num = Number(total);
    if (Number.isNaN(num)) return '';
    if (num >= 90) return 'A';
    if (num >= 80) return 'B';
    if (num >= 70) return 'C';
    if (num >= 60) return 'D';
    return 'F';
  }

  function getGradeClass(grade) {
    if (!grade) return '';
    return 'grade-' + grade.toLowerCase();
  }

  function renderTeacherInfo() {
    const el = document.getElementById('teacherInfo');
    if (!el || !user) return;
    const lines = [];
    lines.push(`<div style="font-weight:600;color:#fff;margin-bottom:4px;">${escapeHtml(user.name || '')}</div>`);
    const meta = [user.teacherNo, user.title, user.college].filter(Boolean);
    if (meta.length) {
      lines.push(`<div style="color:var(--text-secondary);font-size:0.8125rem;">${escapeHtml(meta.join(' · '))}</div>`);
    }
    el.innerHTML = lines.join('');
  }

  async function initSemesterDropdown() {
    const { data } = await api('/api/semesters');
    if (data && data.ok && Array.isArray(data.data)) {
      allSemesters = data.data;
      const select = document.getElementById('teacherSemesterSelect');
      select.innerHTML = allSemesters.map((s) =>
        `<option value="${s.id}">${escapeHtml(s.academicYear)} 第${s.semesterNumber}学期${s.isCurrent ? ' ★' : ''}</option>`
      ).join('');
      const current = allSemesters.find((s) => s.isCurrent);
      if (current) {
        select.value = current.id;
        currentSemesterId = current.id;
      }
    }
  }

  async function loadMyCourses() {
    const nav = document.getElementById('courseNav');
    const qs = currentSemesterId ? '?semesterId=' + currentSemesterId : '';
    const { data } = await api('/api/teachers/' + user.id + '/courses' + qs);
    if (!data || !data.ok || !Array.isArray(data.data)) {
      nav.innerHTML = '<span style="color:var(--danger);padding:14px 20px;display:block;">加载失败</span>';
      return;
    }
    myCourses = data.data;
    currentCourseId = null;
    if (!myCourses.length) {
      nav.innerHTML = '<span style="color:var(--text-secondary);padding:14px 20px;display:block;">该学期暂无授课课程</span>';
      document.getElementById('courseTitle').textContent = '我的授课';
      document.getElementById('courseSubtitle').textContent = '该学期暂无授课课程';
      document.getElementById('emptyState').style.display = '';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      return;
    }
    nav.innerHTML = myCourses
      .map(
        (c) => `
        <a href="#" data-id="${c.id}">
          <span class="nav-icon" aria-hidden="true">📖</span>
          <span>
            <div style="font-weight:500;">${escapeHtml(c.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:400;margin-top:2px;">
              ${escapeHtml(c.code)} · ${c.enrolled ?? 0} / ${c.capacity ?? 0} 人
            </div>
          </span>
        </a>`
      )
      .join('');
    nav.querySelectorAll('a[data-id]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        selectCourse(parseInt(a.dataset.id, 10));
      });
    });
    document.getElementById('emptyState').style.display = '';
    document.getElementById('studentToolbar').style.display = 'none';
    document.getElementById('studentTableWrap').style.display = 'none';
  }

  function selectCourse(courseId) {
    currentCourseId = courseId;
    const course = myCourses.find((c) => c.id === courseId);
    if (!course) return;
    document.querySelectorAll('#courseNav a').forEach((a) => {
      a.classList.toggle('active', parseInt(a.dataset.id, 10) === courseId);
    });
    document.getElementById('courseTitle').textContent = course.name;
    document.getElementById('courseSubtitle').textContent = `${course.code} · ${course.credit ?? 0} 学分 · ${course.enrolled ?? 0} / ${course.capacity ?? 0} 人已选`;
    document.getElementById('studentListTitle').textContent = `${course.name} - 学生名单`;
    document.getElementById('gradeListTitle').textContent = `${course.name} - 成绩录入`;
    document.getElementById('emptyState').style.display = 'none';
    updateView();
    document.getElementById('studentKeyword').value = '';
    if (currentView === 'students') {
      loadStudents();
    } else if (currentView === 'grades') {
      loadGrades();
    } else if (currentView === 'resources') {
      loadTeacherResources();
    }
  }

  function updateView() {
    document.getElementById('announcementToolbar').style.display = 'none';
    document.getElementById('announcementView').style.display = 'none';
    if (!currentCourseId) {
      document.getElementById('emptyState').style.display = '';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      document.getElementById('gradeToolbar').style.display = 'none';
      document.getElementById('gradeTableWrap').style.display = 'none';
      document.getElementById('resourceToolbar').style.display = 'none';
      document.getElementById('resourceContent').style.display = 'none';
      if (currentView === 'announcements') {
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('announcementToolbar').style.display = '';
        document.getElementById('announcementView').style.display = '';
      }
      return;
    }
    if (currentView === 'students') {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('studentToolbar').style.display = '';
      document.getElementById('studentTableWrap').style.display = '';
      document.getElementById('gradeToolbar').style.display = 'none';
      document.getElementById('gradeTableWrap').style.display = 'none';
      document.getElementById('resourceToolbar').style.display = 'none';
      document.getElementById('resourceContent').style.display = 'none';
    } else if (currentView === 'grades') {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      document.getElementById('gradeToolbar').style.display = '';
      document.getElementById('gradeTableWrap').style.display = '';
      document.getElementById('resourceToolbar').style.display = 'none';
      document.getElementById('resourceContent').style.display = 'none';
    } else if (currentView === 'resources') {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      document.getElementById('gradeToolbar').style.display = 'none';
      document.getElementById('gradeTableWrap').style.display = 'none';
      document.getElementById('resourceToolbar').style.display = '';
      document.getElementById('resourceContent').style.display = '';
    } else if (currentView === 'announcements') {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      document.getElementById('gradeToolbar').style.display = 'none';
      document.getElementById('gradeTableWrap').style.display = 'none';
      document.getElementById('resourceToolbar').style.display = 'none';
      document.getElementById('resourceContent').style.display = 'none';
      document.getElementById('announcementToolbar').style.display = '';
      document.getElementById('announcementView').style.display = '';
    }
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.sidebar-nav a[data-view]').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === view);
    });
    updateView();
    if (view === 'grades' && currentCourseId) {
      loadGrades();
    } else if (view === 'resources' && currentCourseId) {
      loadTeacherResources();
    } else if (view === 'announcements') {
      loadTeacherAnnouncements();
    }
  }

  async function loadGrades() {
    if (!currentCourseId) return;
    const tbody = document.getElementById('gradeTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">加载中...</td></tr>';
    const params = new URLSearchParams();
    if (currentSemesterId) params.set('semesterId', currentSemesterId);
    const qs = params.toString();
    const { data } = await api('/api/grades/teacher/' + user.id + '/courses/' + currentCourseId + '/grades' + (qs ? '?' + qs : ''));
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    gradeData = data.data.map((r) => ({
      studentId: r.studentId,
      studentNo: r.studentNo,
      name: r.name,
      regularScore: r.regularScore !== null && r.regularScore !== undefined ? String(r.regularScore) : '',
      finalScore: r.finalScore !== null && r.finalScore !== undefined ? String(r.finalScore) : '',
    }));
    renderGradeTable();
  }

  function renderGradeTable() {
    const tbody = document.getElementById('gradeTableBody');
    if (!gradeData.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">暂无选课学生</td></tr>';
      return;
    }
    tbody.innerHTML = gradeData
      .map(
        (r, idx) => {
          const total = calculateTotalScore(r.regularScore, r.finalScore);
          const grade = calculateGrade(total);
          const gradeClass = getGradeClass(grade);
          return `
        <tr data-student-id="${r.studentId}">
          <td>${idx + 1}</td>
          <td>${escapeHtml(r.studentNo)}</td>
          <td style="font-weight:600;">${escapeHtml(r.name)}</td>
          <td><input type="number" min="0" max="100" step="0.01" class="grade-input regular-score" data-idx="${idx}" value="${escapeHtml(r.regularScore)}" placeholder="0-100" /></td>
          <td><input type="number" min="0" max="100" step="0.01" class="grade-input final-score" data-idx="${idx}" value="${escapeHtml(r.finalScore)}" placeholder="0-100" /></td>
          <td class="total-score ${gradeClass}" data-idx="${idx}">${total !== null ? total : '-'}</td>
          <td><span class="grade-badge ${gradeClass}">${grade || '-'}</span></td>
        </tr>`;
        }
      )
      .join('');
    tbody.querySelectorAll('.grade-input').forEach((input) => {
      input.addEventListener('input', onGradeInput);
      input.addEventListener('blur', onGradeBlur);
    });
  }

  function onGradeInput(e) {
    const idx = parseInt(e.target.dataset.idx, 10);
    const row = gradeData[idx];
    if (!row) return;
    const isRegular = e.target.classList.contains('regular-score');
    let value = e.target.value;
    if (value !== '') {
      let num = Number(value);
      if (num < 0) {
        num = 0;
        e.target.value = '0';
      } else if (num > 100) {
        num = 100;
        e.target.value = '100';
      }
      value = String(num);
    }
    if (isRegular) {
      row.regularScore = value;
    } else {
      row.finalScore = value;
    }
    const total = calculateTotalScore(row.regularScore, row.finalScore);
    const grade = calculateGrade(total);
    const gradeClass = getGradeClass(grade);
    const totalEl = document.querySelector(`.total-score[data-idx="${idx}"]`);
    if (totalEl) {
      totalEl.textContent = total !== null ? total : '-';
      totalEl.className = 'total-score ' + gradeClass;
    }
    const badgeEl = document.querySelector(`tr[data-student-id="${row.studentId}"] .grade-badge`);
    if (badgeEl) {
      badgeEl.textContent = grade || '-';
      badgeEl.className = 'grade-badge ' + gradeClass;
    }
  }

  function onGradeBlur(e) {
    let value = e.target.value;
    if (value === '') return;
    let num = Number(value);
    if (Number.isNaN(num)) {
      e.target.value = '';
      const idx = parseInt(e.target.dataset.idx, 10);
      const row = gradeData[idx];
      if (row) {
        if (e.target.classList.contains('regular-score')) row.regularScore = '';
        else row.finalScore = '';
      }
      return;
    }
    num = Math.round(num * 100) / 100;
    e.target.value = String(num);
  }

  async function saveGrades() {
    if (!currentCourseId) return;
    const validGrades = [];
    for (const r of gradeData) {
      if (r.regularScore !== '' || r.finalScore !== '') {
        validGrades.push({
          studentId: r.studentId,
          regularScore: r.regularScore !== '' ? Number(r.regularScore) : null,
          finalScore: r.finalScore !== '' ? Number(r.finalScore) : null,
        });
      }
    }
    if (!validGrades.length) {
      showToast('没有需要保存的成绩', 'warning');
      return;
    }
    const btn = document.getElementById('saveGradesBtn');
    const originalText = btn.textContent;
    btn.textContent = '保存中...';
    btn.disabled = true;
    try {
      const params = new URLSearchParams();
      if (currentSemesterId) params.set('semesterId', currentSemesterId);
      const qs = params.toString();
      const { data } = await api('/api/grades/teacher/' + user.id + '/courses/' + currentCourseId + '/grades/batch' + (qs ? '?' + qs : ''), {
        method: 'POST',
        body: JSON.stringify({ grades: validGrades }),
      });
      if (data && data.ok) {
        showToast(data.message || '保存成功', 'success');
        loadGrades();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } catch (e) {
      showToast('保存失败：网络错误', 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async function downloadTemplate() {
    if (!currentCourseId) return;
    const course = myCourses.find((c) => c.id === currentCourseId);
    if (!course) return;
    try {
      const params = new URLSearchParams();
      if (currentSemesterId) params.set('semesterId', currentSemesterId);
      const qs = params.toString();
      const res = await fetch(API_BASE + '/api/grades/teacher/' + user.id + '/courses/' + currentCourseId + '/grades/template' + (qs ? '?' + qs : ''));
      if (!res.ok) {
        let msg = '下载失败';
        try {
          const d = await res.json();
          if (d && d.message) msg = d.message;
        } catch (_) {}
        showToast(msg, 'error');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = `${course.code}_${course.name}_成绩模板.csv`;
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (match && match[1]) {
        try { filename = decodeURIComponent(match[1]); } catch (_) {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('模板下载成功', 'success');
    } catch (e) {
      showToast('下载失败：网络错误', 'error');
    }
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length) return [];
    const result = [];
    const bom = '\uFEFF';
    let headers = lines[0];
    if (headers.startsWith(bom)) headers = headers.slice(1);
    const headerRow = parseCsvLine(headers);
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const obj = {};
      for (let j = 0; j < headerRow.length; j++) {
        obj[headerRow[j].trim()] = values[j] !== undefined ? values[j].trim() : '';
      }
      result.push(obj);
    }
    return result;
  }

  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === ',') {
          result.push(current);
          current = '';
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  async function importGrades(file) {
    if (!currentCourseId || !file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        showToast('文件内容为空', 'error');
        return;
      }
      const btn = document.getElementById('importGradeFile');
      const label = btn.parentElement;
      const originalText = label.textContent;
      label.textContent = '导入中...';
      const params = new URLSearchParams();
      if (currentSemesterId) params.set('semesterId', currentSemesterId);
      const qs = params.toString();
      const { data } = await api('/api/grades/teacher/' + user.id + '/courses/' + currentCourseId + '/grades/import' + (qs ? '?' + qs : ''), {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      if (data && data.ok) {
        showToast(data.message || '导入成功', 'success');
        if (data.warnings && data.warnings.length) {
          console.warn('导入警告:', data.warnings);
        }
        loadGrades();
      } else {
        showToast((data && data.message) || '导入失败', 'error');
      }
      label.innerHTML = '📂 批量导入<input type="file" id="importGradeFile" accept=".csv" style="display:none;" />';
      document.getElementById('importGradeFile').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) importGrades(f);
        e.target.value = '';
      });
    } catch (e) {
      showToast('导入失败：网络错误', 'error');
    }
  }

  async function loadStudents() {
    if (!currentCourseId) return;
    const tbody = document.getElementById('studentTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);">加载中...</td></tr>';
    const keyword = document.getElementById('studentKeyword').value.trim();
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (currentSemesterId) params.set('semesterId', currentSemesterId);
    const qs = params.toString();
    const { data } = await api('/api/teachers/' + user.id + '/courses/' + currentCourseId + '/students' + (qs ? '?' + qs : ''));
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);">暂无选课学生</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(r.studentNo)}</td>
          <td style="font-weight:600;">${escapeHtml(r.name)}</td>
          <td>${escapeHtml(formatDate(r.enrolledAt))}</td>
        </tr>`
      )
      .join('');
  }

  async function exportStudents() {
    if (!currentCourseId) return;
    const course = myCourses.find((c) => c.id === currentCourseId);
    if (!course) return;
    try {
      const params = new URLSearchParams();
      if (currentSemesterId) params.set('semesterId', currentSemesterId);
      const qs = params.toString();
      const res = await fetch(API_BASE + '/api/teachers/' + user.id + '/courses/' + currentCourseId + '/students/export' + (qs ? '?' + qs : ''));
      if (!res.ok) {
        let msg = '导出失败';
        try {
          const d = await res.json();
          if (d && d.message) msg = d.message;
        } catch (_) {}
        showToast(msg, 'error');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let filename = `${course.code}_${course.name}_学生名单.csv`;
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (match && match[1]) {
        try { filename = decodeURIComponent(match[1]); } catch (_) {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('导出成功', 'success');
    } catch (e) {
      showToast('导出失败：网络错误', 'error');
    }
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = Number(bytes);
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return size.toFixed(size >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function formatDateTimeShort(d) {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  let allTeacherResources = [];
  let teacherResourceKeyword = '';

  async function loadTeacherResources() {
    if (!currentCourseId) return;
    const listEl = document.getElementById('teacherResourceList');
    listEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:24px;">加载中...</p>';
    const { data } = await api('/api/resources/course/' + currentCourseId);
    if (!data || !data.ok || !Array.isArray(data.data)) {
      listEl.innerHTML = '<p style="text-align:center;color:var(--danger);padding:24px;">加载失败</p>';
      return;
    }
    allTeacherResources = data.data;
    renderTeacherResources();
  }

  function renderTeacherResources() {
    const listEl = document.getElementById('teacherResourceList');
    const keyword = teacherResourceKeyword.trim().toLowerCase();
    const list = keyword
      ? allTeacherResources.filter((r) => r.fileName && r.fileName.toLowerCase().includes(keyword))
      : allTeacherResources;
    if (!list.length) {
      listEl.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:24px;">${keyword ? '未找到匹配的资源' : '暂无资源，拖拽或点击上方区域上传文件'}</p>`;
      return;
    }
    listEl.innerHTML = list.map((r) => `
      <div class="resource-item" data-id="${r.id}">
        <div class="resource-icon">📄</div>
        <div class="resource-info">
          <div class="resource-name">${escapeHtml(r.fileName)}</div>
          <div class="resource-meta">
            <span>${formatFileSize(r.fileSize)}</span>
            <span>上传者：${escapeHtml(r.uploaderName || '未知')}</span>
            <span>下载：${r.downloadCount || 0} 次</span>
            <span>${formatDateTimeShort(r.uploadTime)}</span>
          </div>
        </div>
        <div class="resource-actions">
          <button type="button" class="btn btn-ghost btn-sm t-resource-rename" data-id="${r.id}">重命名</button>
          <button type="button" class="btn btn-ghost btn-sm t-resource-download" data-id="${r.id}">下载</button>
          <button type="button" class="btn btn-danger btn-sm t-resource-delete" data-id="${r.id}">删除</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.t-resource-rename').forEach((btn) => {
      btn.addEventListener('click', () => renameTeacherResource(parseInt(btn.dataset.id, 10)));
    });
    listEl.querySelectorAll('.t-resource-download').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.open(API_BASE + '/api/resources/download/' + btn.dataset.id, '_blank');
      });
    });
    listEl.querySelectorAll('.t-resource-delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteTeacherResource(parseInt(btn.dataset.id, 10)));
    });
  }

  async function uploadTeacherResourceFiles(files) {
    if (!currentCourseId) {
      showToast('请先选择课程', 'error');
      return;
    }
    if (!files || !files.length) return;
    for (const file of files) {
      if (file.size > 100 * 1024 * 1024) {
        showToast(`文件 ${file.name} 超过 100MB，已跳过`, 'error');
        continue;
      }
      const formData = new FormData();
      formData.append('courseId', currentCourseId);
      formData.append('uploadedBy', user.id);
      formData.append('uploaderRole', 'teacher');
      formData.append('file', file);
      try {
        const r = await fetch(API_BASE + '/api/resources/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        const d = await r.json();
        if (d && d.ok) {
          showToast(`已上传：${file.name}`, 'success');
        } else {
          showToast(`上传失败：${(d && d.message) || file.name}`, 'error');
        }
      } catch (e) {
        showToast(`上传失败：${file.name}`, 'error');
      }
    }
    loadTeacherResources();
  }

  async function renameTeacherResource(id) {
    const item = allTeacherResources.find((r) => r.id === id);
    if (!item) return;
    const newName = prompt('请输入新的文件名：', item.fileName);
    if (!newName || !newName.trim()) return;
    const { data } = await api('/api/resources/' + id + '/rename', {
      method: 'PUT',
      body: JSON.stringify({ fileName: newName.trim() }),
    });
    if (data && data.ok) {
      showToast('已重命名', 'success');
      loadTeacherResources();
    } else {
      showToast((data && data.message) || '重命名失败', 'error');
    }
  }

  async function deleteTeacherResource(id) {
    if (!confirm('确定删除该资源？文件将被永久删除。')) return;
    const { data } = await api('/api/resources/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      loadTeacherResources();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  function bindTeacherResourceEvents() {
    const dropArea = document.getElementById('teacherResourceDropArea');
    const fileInput = document.getElementById('teacherResourceFileInput');

    if (dropArea) {
      ['dragenter', 'dragover'].forEach((evt) => {
        dropArea.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach((evt) => {
        dropArea.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.remove('dragover');
        });
      });
      dropArea.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
          uploadTeacherResourceFiles(e.dataTransfer.files);
        }
      });
      dropArea.addEventListener('click', () => fileInput && fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        uploadTeacherResourceFiles(e.target.files);
        fileInput.value = '';
      });
    }

    const searchInput = document.getElementById('teacherResourceSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        teacherResourceKeyword = e.target.value || '';
        renderTeacherResources();
      });
    }
  }

  let teacherAnnCat = '';
  let teacherAnnPage = 1;
  const CATEGORY_MAP = { system: '系统通知', academic: '教务通知', activity: '活动通知' };
  const CATEGORY_BADGE_CLASS = { system: 'announcement-cat-system', academic: 'announcement-cat-academic', activity: 'announcement-cat-activity' };

  async function loadTeacherAnnouncements(page) {
    page = page || 1;
    teacherAnnPage = page;
    const listEl = document.getElementById('teacherAnnList');
    const keyword = document.getElementById('teacherAnnSearchKeyword').value.trim();
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('pageSize', '10');
    if (teacherAnnCat) params.set('category', teacherAnnCat);
    if (keyword) params.set('keyword', keyword);
    const { data } = await api('/api/announcements?' + params.toString());
    if (!data || !data.ok || !Array.isArray(data.data)) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--danger);padding:40px;">加载失败</div>';
      return;
    }
    const announcements = data.data;
    if (!announcements.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:60px 20px;"><div style="font-size:3rem;opacity:0.3;margin-bottom:12px;">📢</div><div>暂无公告</div></div>';
      document.getElementById('teacherAnnPagination').innerHTML = '';
      return;
    }
    listEl.innerHTML = announcements.map((a) => `
      <div class="announcement-card" data-id="${a.id}" style="cursor:pointer;">
        <div class="announcement-card-header">
          <div class="announcement-card-title">
            ${a.isPinned ? '<span style="color:#f59e0b;margin-right:6px;">📌</span>' : ''}
            ${escapeHtml(a.title)}
          </div>
          <span class="announcement-cat-badge ${CATEGORY_BADGE_CLASS[a.category] || ''}">${CATEGORY_MAP[a.category] || a.category}</span>
        </div>
        <div class="announcement-card-meta">
          <span>发布人：${escapeHtml(a.publisherName)}</span>
          <span>阅读：${a.viewCount}</span>
          <span>${formatDate(a.publishedAt)}</span>
        </div>
      </div>
    `).join('');
    listEl.querySelectorAll('.announcement-card').forEach((card) => {
      card.addEventListener('click', () => openTeacherAnnDetail(parseInt(card.dataset.id, 10)));
    });
    renderTeacherAnnPagination(data.pagination || { total: 0, page, pageSize: 10, totalPages: 0 });
  }

  function renderTeacherAnnPagination(pagination) {
    const el = document.getElementById('teacherAnnPagination');
    if (!el) return;
    const totalPages = pagination.totalPages || 0;
    const current = pagination.page || 1;
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    let html = '<button type="button" class="msg-page-btn" data-pg="prev" ' + (current <= 1 ? 'disabled' : '') + '>‹</button>';
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
    html += '<button type="button" class="msg-page-btn" data-pg="next" ' + (current >= totalPages ? 'disabled' : '') + '>›</button>';
    el.innerHTML = html;
    el.querySelectorAll('.msg-page-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        let target = btn.dataset.pg;
        if (target === 'prev') target = current - 1;
        else if (target === 'next') target = current + 1;
        else target = parseInt(target, 10);
        if (target >= 1 && target <= totalPages) loadTeacherAnnouncements(target);
      });
    });
  }

  async function openTeacherAnnDetail(id) {
    const overlay = document.getElementById('teacherAnnDetailOverlay');
    const titleEl = document.getElementById('teacherAnnDetailTitle');
    const metaEl = document.getElementById('teacherAnnDetailMeta');
    const contentEl = document.getElementById('teacherAnnDetailContent');
    titleEl.textContent = '加载中...';
    metaEl.innerHTML = '';
    contentEl.innerHTML = '';
    overlay.classList.add('show');
    const { data } = await api('/api/announcements/' + id);
    if (!data || !data.ok || !data.data) {
      titleEl.textContent = '加载失败';
      contentEl.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">无法加载公告</p>';
      return;
    }
    const a = data.data;
    titleEl.textContent = a.title;
    metaEl.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:12px 24px;font-size:0.875rem;margin-bottom:16px;">
        <span style="color:var(--text-secondary);">发布人：<span style="color:var(--text-primary);font-weight:500;">${escapeHtml(a.publisherName)}</span></span>
        <span><span class="announcement-cat-badge ${CATEGORY_BADGE_CLASS[a.category] || ''}">${CATEGORY_MAP[a.category] || a.category}</span></span>
        <span style="color:var(--text-secondary);">阅读：<span style="color:var(--text-primary);font-weight:500;">${a.viewCount}</span></span>
        <span style="color:var(--text-secondary);">${formatDate(a.publishedAt)}</span>
      </div>
    `;
    contentEl.innerHTML = a.content || '<p style="color:var(--text-secondary);">暂无正文</p>';
  }

  function initTeacherAnnouncementCenter() {
    document.querySelectorAll('#teacherAnnCatTabs .announcement-cat-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        teacherAnnCat = btn.dataset.cat;
        document.querySelectorAll('#teacherAnnCatTabs .announcement-cat-tab').forEach((b) => {
          b.classList.toggle('active', b.dataset.cat === teacherAnnCat);
        });
        loadTeacherAnnouncements(1);
      });
    });
    const searchInput = document.getElementById('teacherAnnSearchKeyword');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadTeacherAnnouncements(1);
      });
    }
    const closeBtn = document.getElementById('teacherAnnDetailClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('teacherAnnDetailOverlay').classList.remove('show');
      });
    }
    const overlay = document.getElementById('teacherAnnDetailOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    }
  }

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    renderTeacherInfo();

    if (window.MessageCenter) {
      MessageCenter.init(document.getElementById('msgBellContainer'));
    }

    bindTeacherResourceEvents();
    initTeacherAnnouncementCenter();

    document.getElementById('searchStudentBtn').addEventListener('click', loadStudents);
    document.getElementById('studentKeyword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadStudents();
    });
    document.getElementById('exportBtn').addEventListener('click', exportStudents);

    document.querySelectorAll('.sidebar-nav a[data-view]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(a.dataset.view);
      });
    });

    document.getElementById('saveGradesBtn').addEventListener('click', saveGrades);
    document.getElementById('downloadTemplateBtn').addEventListener('click', downloadTemplate);
    document.getElementById('importGradeFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importGrades(f);
      e.target.value = '';
    });

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      sessionStorage.removeItem('user');
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    });

    document.getElementById('teacherSemesterSelect').addEventListener('change', (e) => {
      currentSemesterId = e.target.value ? parseInt(e.target.value, 10) : null;
      loadMyCourses();
    });

    initSemesterDropdown().then(() => {
      loadMyCourses();
    });
  }

  init();
})();
