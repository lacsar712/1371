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
    }
  }

  function updateView() {
    if (!currentCourseId) {
      document.getElementById('emptyState').style.display = '';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      document.getElementById('gradeToolbar').style.display = 'none';
      document.getElementById('gradeTableWrap').style.display = 'none';
      return;
    }
    if (currentView === 'students') {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('studentToolbar').style.display = '';
      document.getElementById('studentTableWrap').style.display = '';
      document.getElementById('gradeToolbar').style.display = 'none';
      document.getElementById('gradeTableWrap').style.display = 'none';
    } else if (currentView === 'grades') {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('studentToolbar').style.display = 'none';
      document.getElementById('studentTableWrap').style.display = 'none';
      document.getElementById('gradeToolbar').style.display = '';
      document.getElementById('gradeTableWrap').style.display = '';
    }
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.sidebar-nav a[data-view]').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === view);
    });
    if (!currentCourseId) {
      document.getElementById('emptyState').style.display = '';
      return;
    }
    updateView();
    if (view === 'grades') {
      loadGrades();
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

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    renderTeacherInfo();

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
