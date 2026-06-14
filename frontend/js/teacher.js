(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let myCourses = [];
  let currentCourseId = null;
  let allSemesters = [];
  let currentSemesterId = null;

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
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('studentToolbar').style.display = '';
    document.getElementById('studentTableWrap').style.display = '';
    document.getElementById('studentKeyword').value = '';
    loadStudents();
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
