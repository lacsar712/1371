(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let allCourses = [];
  let myCourseIds = new Set();
  let evaluatedCourseIds = new Set();
  let myCoursesData = [];
  let allSemesters = [];
  let currentSemesterId = null;
  let currentTab = 'courses';
  let gradeData = [];
  let semesterStats = [];
  let gradeSemesterFilter = null;
  let gradeLevelFilter = null;
  let currentEvalCourseId = null;
  let currentDrawerCourseId = null;

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u.role !== 'student' || !u.id) return null;
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

  function showConfirm(message, title = '确认') {
    const overlay = document.getElementById('confirmOverlay');
    const messageEl = document.getElementById('confirmMessage');
    const titleEl = document.getElementById('confirmTitle');
    if (!overlay || !messageEl || !titleEl) return Promise.resolve(false);

    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.add('show');

    return new Promise((resolve) => {
      const done = (result) => {
        overlay.classList.remove('show');
        resolve(result);
        overlay.removeEventListener('click', onOverlayClick);
        document.getElementById('confirmCancel').removeEventListener('click', onCancel);
        document.getElementById('confirmOk').removeEventListener('click', onOk);
      };
      const onOverlayClick = (e) => {
        if (e.target === overlay) done(false);
      };
      const onCancel = () => done(false);
      const onOk = () => done(true);

      overlay.addEventListener('click', onOverlayClick);
      document.getElementById('confirmCancel').addEventListener('click', onCancel);
      document.getElementById('confirmOk').addEventListener('click', onOk);
    });
  }

  function api(path, options = {}) {
    return fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })));
  }

  function renderCourseList(courses) {
    const container = document.getElementById('courseList');
    if (!container) return;
    container.innerHTML = courses
      .map((c) => {
        const enrolled = (c.enrolled ?? 0) | 0;
        const capacity = (c.capacity ?? 0) | 0;
        const full = capacity > 0 && enrolled >= capacity;
        const selected = myCourseIds.has(c.id);
        const canEnroll = !full && !selected;
        const location = c.location || '';
        return `
          <div class="course-card ${canEnroll ? '' : 'disabled'}">
            <div class="code">${escapeHtml(c.code)}</div>
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="meta">
              <span>${c.credit ?? 0} 学分</span>
              <span>${enrolled} / ${capacity} 人</span>
            </div>
            ${location ? `<div class="course-location">📍 ${escapeHtml(location)}</div>` : ''}
            <div class="course-card-actions">
              ${canEnroll
                ? `<button type="button" class="btn btn-primary" data-action="enroll" data-id="${c.id}">选课</button>`
                : selected
                  ? '<span style="color:var(--text-secondary);font-size:0.875rem;">已选</span>'
                  : '<span style="color:var(--danger);font-size:0.875rem;">已满</span>'}
              ${selected ? `<button type="button" class="btn btn-ghost btn-sm" data-action="detail" data-id="${c.id}">详情</button>` : ''}
            </div>
          </div>`;
      })
      .join('');

    container.querySelectorAll('[data-action="enroll"]').forEach((btn) => {
      btn.addEventListener('click', () => enroll(parseInt(btn.dataset.id, 10)));
    });
    container.querySelectorAll('[data-action="detail"]').forEach((btn) => {
      btn.addEventListener('click', () => openDrawer(parseInt(btn.dataset.id, 10)));
    });
  }

  function renderMyCourses(courses) {
    const container = document.getElementById('myCourses');
    if (!container) return;
    if (!courses.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);">暂无选课</p>';
      return;
    }
    container.innerHTML = courses
      .map(
        (c) => {
          const location = c.location || '';
          const evaluated = evaluatedCourseIds.has(c.id);
          return `
        <div class="course-card">
          <div class="code">${escapeHtml(c.code)}</div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="meta">
            <span>${c.credit ?? 0} 学分</span>
          </div>
          ${location ? `<div class="course-location">📍 ${escapeHtml(location)}</div>` : ''}
          <div class="course-card-actions">
            <button type="button" class="btn btn-ghost" data-action="drop" data-id="${c.id}">退课</button>
            ${!evaluated ? `<button type="button" class="btn btn-primary btn-sm" data-action="eval" data-id="${c.id}" data-code="${escapeHtml(c.code)}" data-name="${escapeHtml(c.name)}">评教</button>` : '<span style="color:var(--success);font-size:0.8125rem;">✓ 已评教</span>'}
            <button type="button" class="btn btn-ghost btn-sm" data-action="detail" data-id="${c.id}">详情</button>
          </div>
        </div>`;
        }
      )
      .join('');
    container.querySelectorAll('[data-action="drop"]').forEach((btn) => {
      btn.addEventListener('click', () => drop(parseInt(btn.dataset.id, 10)));
    });
    container.querySelectorAll('[data-action="eval"]').forEach((btn) => {
      btn.addEventListener('click', () => openEvalModal(parseInt(btn.dataset.id, 10), btn.dataset.code, btn.dataset.name));
    });
    container.querySelectorAll('[data-action="detail"]').forEach((btn) => {
      btn.addEventListener('click', () => openDrawer(parseInt(btn.dataset.id, 10)));
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function getGradeClass(grade) {
    if (!grade) return '';
    return 'grade-' + grade.toLowerCase();
  }

  function gpaFromGrade(grade) {
    switch (grade) {
      case 'A': return 4.0;
      case 'B': return 3.0;
      case 'C': return 2.0;
      case 'D': return 1.0;
      case 'F': return 0.0;
      default: return null;
    }
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.student-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const coursesView = document.getElementById('coursesView');
    const gradesView = document.getElementById('gradesView');
    const coursesSemester = document.getElementById('coursesSemesterSelector');
    if (tab === 'courses') {
      coursesView.style.display = '';
      gradesView.style.display = 'none';
      coursesSemester.style.display = '';
      document.getElementById('pageTitle').textContent = '课程中心';
    } else if (tab === 'grades') {
      coursesView.style.display = 'none';
      gradesView.style.display = '';
      coursesSemester.style.display = 'none';
      document.getElementById('pageTitle').textContent = '我的成绩';
      loadGrades();
    }
  }

  async function loadGrades() {
    const gradesList = document.getElementById('gradesList');
    gradesList.innerHTML = '<div class="grade-skeleton"></div><div class="grade-skeleton"></div><div class="grade-skeleton"></div>';
    const params = new URLSearchParams();
    if (gradeSemesterFilter) params.set('semesterId', gradeSemesterFilter);
    if (gradeLevelFilter) params.set('grade', gradeLevelFilter);
    const qs = params.toString();
    const { data } = await api('/api/grades/student/' + user.id + '/grades' + (qs ? '?' + qs : ''));
    if (data && data.ok && Array.isArray(data.data)) {
      gradeData = data.data;
      renderGpaCard(data.gpa, data.totalCredits, data.data.length);
      renderGradeList(data.data);
    } else {
      document.getElementById('gradesList').innerHTML =
        '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">加载失败</p>';
    }
    loadSemesterStats();
  }

  async function loadSemesterStats() {
    const { data } = await api('/api/grades/student/' + user.id + '/grades/semester-stats');
    if (data && data.ok && Array.isArray(data.data)) {
      semesterStats = data.data;
      renderSemesterChart(data.data);
      updateGradeSemesterOptions();
    }
  }

  function updateGradeSemesterOptions() {
    const select = document.getElementById('gradeSemesterFilter');
    if (!select) return;
    const options = ['<option value="">全部学期</option>'];
    for (const s of semesterStats) {
      const selected = gradeSemesterFilter === s.semesterId ? ' selected' : '';
      options.push(`<option value="${s.semesterId}"${selected}>${escapeHtml(s.semesterName)}</option>`);
    }
    select.innerHTML = options.join('');
  }

  function renderGpaCard(gpa, totalCredits, courseCount) {
    const gpaValue = gpa || 0;
    document.getElementById('gpaValue').textContent = gpaValue.toFixed(2);
    document.getElementById('gpaCredits').textContent = `已修 ${totalCredits || 0} 学分`;
    document.getElementById('gpaCourses').textContent = `共 ${courseCount || 0} 门课程`;
    document.getElementById('gpaRingText').textContent = gpaValue.toFixed(1);
    const progress = Math.min(gpaValue / 4.0, 1);
    const circumference = 2 * Math.PI * 52;
    const offset = circumference * (1 - progress);
    const ring = document.getElementById('gpaRingProgress');
    if (ring) {
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = offset;
    }
  }

  function renderSemesterChart(stats) {
    const svg = document.getElementById('semesterChart');
    if (!svg || !stats.length) {
      svg.innerHTML = '<text x="350" y="140" text-anchor="middle" fill="#a1a1aa" font-size="14">暂无成绩数据</text>';
      return;
    }
    const width = 700;
    const height = 280;
    const padding = { top: 30, right: 40, bottom: 50, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxGpa = 4.0;
    const maxScore = 100;
    const n = stats.length;
    const stepX = n > 1 ? chartWidth / (n - 1) : 0;
    const gpaPoints = stats.map((s, i) => ({
      x: padding.left + stepX * i,
      y: padding.top + chartHeight - (s.gpa / maxGpa) * chartHeight,
      value: s.gpa,
      label: s.semesterName,
    }));
    const scorePoints = stats.map((s, i) => ({
      x: padding.left + stepX * i,
      y: padding.top + chartHeight - ((s.avgScore || 0) / maxScore) * chartHeight,
      value: s.avgScore || 0,
      label: s.semesterName,
    }));
    function toPath(points) {
      return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    }
    function toArea(points, baseY) {
      if (!points.length) return '';
      let d = `M ${points[0].x} ${baseY}`;
      for (const p of points) d += ` L ${p.x} ${p.y}`;
      d += ` L ${points[points.length - 1].x} ${baseY} Z`;
      return d;
    }
    const baseY = padding.top + chartHeight;
    let svgContent = '';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      svgContent += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />`;
    }
    svgContent += `<path d="${toArea(gpaPoints, baseY)}" fill="url(#gpaGradient)" opacity="0.3" />`;
    svgContent += `<path d="${toArea(scorePoints, baseY)}" fill="url(#scoreGradient)" opacity="0.2" />`;
    svgContent += `<path d="${toPath(gpaPoints)}" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    svgContent += `<path d="${toPath(scorePoints)}" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    for (const p of gpaPoints) {
      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#0f0f12" stroke="#6366f1" stroke-width="2.5" />`;
    }
    for (const p of scorePoints) {
      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#0f0f12" stroke="#22c55e" stroke-width="2.5" />`;
    }
    for (const p of gpaPoints) {
      const label = p.gpa ? p.gpa.toFixed(1) : '-';
      svgContent += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" fill="#6366f1" font-size="11" font-weight="600">${label}</text>`;
    }
    for (let i = 0; i < stats.length; i++) {
      const x = padding.left + stepX * i;
      const y = height - 20;
      const label = stats[i].semesterName;
      svgContent += `<text x="${x}" y="${y}" text-anchor="middle" fill="#a1a1aa" font-size="11">${escapeHtml(label)}</text>`;
    }
    svgContent = `
      <defs>
        <linearGradient id="gpaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#22c55e" stop-opacity="0" />
        </linearGradient>
      </defs>
    ` + svgContent;
    svg.innerHTML = svgContent;
  }

  function renderGradeList(grades) {
    const container = document.getElementById('gradesList');
    if (!grades.length) {
      container.innerHTML = '<div style="text-align:center;padding:60px 24px;color:var(--text-secondary);"><div style="font-size:3rem;margin-bottom:12px;opacity:0.3;">📋</div>暂无成绩记录</div>';
      return;
    }
    const semesterGroup = {};
    for (const g of grades) {
      const key = g.semesterId;
      if (!semesterGroup[key]) {
        semesterGroup[key] = {
          name: g.semesterName,
          items: [],
        };
      }
      semesterGroup[key].items.push(g);
    }
    const semesterOrder = Object.keys(semesterGroup).sort((a, b) => Number(b) - Number(a));
    let html = '';
    for (const key of semesterOrder) {
      const group = semesterGroup[key];
      html += `<div class="grade-semester-group">
        <div class="grade-semester-title">${escapeHtml(group.name)}</div>
        <div class="grade-items">`;
      for (const g of group.items) {
        const gradeClass = getGradeClass(g.grade);
        const gpa = gpaFromGrade(g.grade);
        html += `
          <div class="grade-item">
            <div class="grade-item-left">
              <div class="grade-course-code">${escapeHtml(g.courseCode || '')}</div>
              <div class="grade-course-name">${escapeHtml(g.courseName || '')}</div>
              <div class="grade-item-meta">
                <span>${g.credit || 0} 学分</span>
                <span>平时 ${g.regularScore !== null && g.regularScore !== undefined ? g.regularScore : '-'}</span>
                <span>期末 ${g.finalScore !== null && g.finalScore !== undefined ? g.finalScore : '-'}</span>
              </div>
            </div>
            <div class="grade-item-right">
              <div class="grade-total ${gradeClass}">${g.totalScore !== null && g.totalScore !== undefined ? g.totalScore : '-'}</div>
              <div class="grade-badge ${gradeClass}">${g.grade || '-'}</div>
              <div class="grade-gpa">${gpa !== null ? gpa.toFixed(1) : '-'} 绩点</div>
            </div>
          </div>`;
      }
      html += `</div></div>`;
    }
    container.innerHTML = html;
  }

  async function loadCourses(keyword = '') {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (currentSemesterId) params.set('semesterId', currentSemesterId);
    const qs = params.toString();
    const path = '/api/courses' + (qs ? '?' + qs : '');
    const { data } = await api(path);
    if (data && data.ok && Array.isArray(data.data)) {
      allCourses = data.data;
      renderCourseList(data.data);
    } else {
      document.getElementById('courseList').innerHTML =
        '<p style="color:var(--text-secondary);">加载失败</p>';
    }
  }

  async function loadMyCourses() {
    const qs = currentSemesterId ? '?semesterId=' + currentSemesterId : '';
    const { data } = await api('/api/students/' + user.id + '/courses' + qs);
    if (data && data.ok && Array.isArray(data.data)) {
      myCourseIds = new Set(data.data.map((c) => c.id));
      myCoursesData = data.data;
      renderMyCourses(data.data);
    } else {
      document.getElementById('myCourses').innerHTML =
        '<p style="color:var(--text-secondary);">加载失败</p>';
    }
  }

  async function loadEvaluatedCourses() {
    const { data } = await api('/api/evaluations/student/' + user.id);
    if (data && data.ok) {
      evaluatedCourseIds = new Set(data.evaluatedCourseIds || []);
    }
  }

  async function enroll(courseId) {
    const { data } = await api('/api/students/' + user.id + '/enroll', {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    });
    if (data && data.ok) {
      showToast('选课成功', 'success');
      loadCourses(document.getElementById('keyword').value.trim());
      loadMyCourses();
    } else {
      showToast((data && data.message) || '选课失败', 'error');
    }
  }

  async function drop(courseId) {
    const ok = await showConfirm('确定退选该课程？');
    if (!ok) return;
    const qs = currentSemesterId ? '?semesterId=' + currentSemesterId : '';
    const { data } = await api('/api/students/' + user.id + '/enroll/' + courseId + qs, {
      method: 'DELETE',
    });
    if (data && data.ok) {
      showToast('退课成功', 'success');
      loadCourses(document.getElementById('keyword').value.trim());
      loadMyCourses();
    } else {
      showToast((data && data.message) || '退课失败', 'error');
    }
  }

  function renderBreadcrumb() {
    const el = document.getElementById('studentBreadcrumb');
    if (!el || !user) return;
    const org = user.org || {};
    const parts = [org.collegeName, org.majorName, org.className].filter(Boolean);
    if (!parts.length) {
      el.innerHTML = '<span style="color:var(--text-secondary);">暂无班级信息</span>';
      return;
    }
    el.innerHTML = parts.map((p, i) => {
      const isLast = i === parts.length - 1;
      if (isLast) {
        return `<span style="color:var(--text-primary);">${escapeHtml(p)}</span>`;
      }
      return `<span>${escapeHtml(p)}</span><span class="breadcrumb-sep">/</span>`;
    }).join('');
  }

  function openEvalModal(courseId, courseCode, courseName) {
    currentEvalCourseId = courseId;
    document.getElementById('evalModalTitle').textContent = '课程评教';
    document.getElementById('evalCourseInfo').textContent = courseCode + ' · ' + courseName;
    document.getElementById('evalRating').value = '0';
    document.getElementById('evalComment').value = '';
    document.getElementById('evalAnonymous').checked = false;
    updateStarDisplay(0);
    document.getElementById('evalModalOverlay').classList.add('show');
  }

  function closeEvalModal() {
    document.getElementById('evalModalOverlay').classList.remove('show');
    currentEvalCourseId = null;
  }

  function updateStarDisplay(rating) {
    const stars = document.querySelectorAll('#evalStars .eval-star');
    stars.forEach((star) => {
      const val = parseInt(star.dataset.value, 10);
      star.classList.toggle('active', val <= rating);
    });
  }

  async function submitEvaluation() {
    const rating = parseInt(document.getElementById('evalRating').value, 10);
    const comment = document.getElementById('evalComment').value.trim();
    const isAnonymous = document.getElementById('evalAnonymous').checked;
    if (!rating || rating < 1 || rating > 5) {
      showToast('请选择评分（1-5 星）', 'error');
      return;
    }
    const { data } = await api('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify({
        studentId: user.id,
        courseId: currentEvalCourseId,
        rating,
        comment,
        isAnonymous,
      }),
    });
    if (data && data.ok) {
      showToast('评教提交成功', 'success');
      closeEvalModal();
      evaluatedCourseIds.add(currentEvalCourseId);
      loadMyCourses();
    } else {
      showToast((data && data.message) || '评教提交失败', 'error');
    }
  }

  function openDrawer(courseId) {
    currentDrawerCourseId = courseId;
    const course = allCourses.find((c) => c.id === courseId) || myCoursesData.find((c) => c.id === courseId);
    if (!course) return;

    document.getElementById('drawerCourseName').textContent = course.name || '课程详情';

    const infoHtml = `
      <div class="drawer-info-grid">
        <div class="drawer-info-item"><span class="drawer-info-label">课程代码</span><span>${escapeHtml(course.code || '')}</span></div>
        <div class="drawer-info-item"><span class="drawer-info-label">学分</span><span>${course.credit ?? 0}</span></div>
        <div class="drawer-info-item"><span class="drawer-info-label">容量</span><span>${course.capacity ?? 0}</span></div>
        ${course.location ? `<div class="drawer-info-item"><span class="drawer-info-label">上课地点</span><span>${escapeHtml(course.location)}</span></div>` : ''}
      </div>`;
    document.getElementById('drawerCourseInfo').innerHTML = infoHtml;

    document.querySelectorAll('.drawer-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.drawerTab === 'info');
    });
    document.getElementById('drawerTabInfo').style.display = '';
    document.getElementById('drawerTabEval').style.display = 'none';

    document.getElementById('courseDrawerOverlay').classList.add('show');
    loadDrawerEval(courseId);
  }

  function closeDrawer() {
    document.getElementById('courseDrawerOverlay').classList.remove('show');
    currentDrawerCourseId = null;
  }

  async function loadDrawerEval(courseId) {
    const content = document.getElementById('drawerEvalContent');
    content.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:40px 0;">加载中...</p>';
    const { data } = await api('/api/evaluations/course/' + courseId + '/summary');
    if (!data || !data.ok) {
      content.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px 0;">加载失败</p>';
      return;
    }
    const summary = data.data;
    if (!summary.totalCount) {
      content.innerHTML = '<div style="text-align:center;padding:60px 24px;color:var(--text-secondary);"><div style="font-size:3rem;margin-bottom:12px;opacity:0.3;">⭐</div>暂无评教</div>';
      return;
    }
    const starsHtml = renderStarsHtml(summary.averageRating);
    const distHtml = renderDistributionChart(summary.distribution, summary.totalCount);
    const commentsHtml = renderCommentsList(summary.comments);
    content.innerHTML = `
      <div class="eval-summary-card">
        <div class="eval-avg-row">
          <div class="eval-avg-number">${summary.averageRating.toFixed(1)}</div>
          <div>
            <div class="eval-avg-stars">${starsHtml}</div>
            <div class="eval-avg-count">${summary.totalCount} 条评教</div>
          </div>
        </div>
      </div>
      <div class="eval-dist-card">
        <h4 class="eval-section-title">星级分布</h4>
        ${distHtml}
      </div>
      <div class="eval-comments-card">
        <h4 class="eval-section-title">评论列表</h4>
        ${commentsHtml}
      </div>`;
  }

  function renderStarsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="eval-star-display ${i <= Math.round(rating) ? 'active' : ''}">★</span>`;
    }
    return html;
  }

  function renderDistributionChart(distribution, total) {
    const labels = ['5 星', '4 星', '3 星', '2 星', '1 星'];
    const keys = [5, 4, 3, 2, 1];
    let html = '<div class="eval-dist-chart">';
    for (let idx = 0; idx < keys.length; idx++) {
      const key = keys[idx];
      const count = distribution[key] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      html += `
        <div class="eval-dist-row">
          <span class="eval-dist-label">${labels[idx]}</span>
          <div class="eval-dist-bar-wrap">
            <div class="eval-dist-bar" style="width:${pct}%;"></div>
          </div>
          <span class="eval-dist-count">${count}</span>
        </div>`;
    }
    html += '</div>';
    return html;
  }

  function renderCommentsList(comments) {
    if (!comments || !comments.length) return '<p style="color:var(--text-secondary);text-align:center;padding:20px 0;">暂无评论</p>';
    let html = '<div class="eval-comments-list">';
    for (const c of comments) {
      const name = c.isAnonymous ? '匿名学生' : escapeHtml(c.studentName || '');
      const time = c.createdAt ? new Date(c.createdAt).toLocaleString('zh-CN') : '';
      html += `
        <div class="eval-comment-item">
          <div class="eval-comment-header">
            <span class="eval-comment-name">${name}</span>
            <span class="eval-comment-stars">${renderStarsHtml(c.rating)}</span>
            <span class="eval-comment-time">${time}</span>
          </div>
          ${c.comment ? `<div class="eval-comment-text">${escapeHtml(c.comment)}</div>` : ''}
        </div>`;
    }
    html += '</div>';
    return html;
  }

  async function initSemesterDropdown() {
    const { data } = await api('/api/semesters');
    if (data && data.ok && Array.isArray(data.data)) {
      allSemesters = data.data;
      const select = document.getElementById('studentSemesterSelect');
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

  function initEvalStars() {
    const starsContainer = document.getElementById('evalStars');
    if (!starsContainer) return;
    const stars = starsContainer.querySelectorAll('.eval-star');
    stars.forEach((star) => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.value, 10);
        document.getElementById('evalRating').value = val;
        updateStarDisplay(val);
      });
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value, 10);
        updateStarDisplay(val);
      });
    });
    starsContainer.addEventListener('mouseleave', () => {
      const current = parseInt(document.getElementById('evalRating').value, 10) || 0;
      updateStarDisplay(current);
    });
  }

  function initEvalModal() {
    const overlay = document.getElementById('evalModalOverlay');
    if (!overlay) return;
    document.getElementById('evalModalCancel').addEventListener('click', closeEvalModal);
    document.getElementById('evalModalSubmit').addEventListener('click', submitEvaluation);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeEvalModal();
    });
  }

  function initDrawer() {
    const overlay = document.getElementById('courseDrawerOverlay');
    if (!overlay) return;
    document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDrawer();
    });
    document.querySelectorAll('.drawer-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.drawer-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.drawerTab;
        document.getElementById('drawerTabInfo').style.display = target === 'info' ? '' : 'none';
        document.getElementById('drawerTabEval').style.display = target === 'eval' ? '' : 'none';
      });
    });
  }

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('userName').textContent = (user.name || user.studentNo || '') + ' · 学生';
    renderBreadcrumb();

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      sessionStorage.removeItem('user');
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
      loadCourses(document.getElementById('keyword').value.trim());
    });
    document.getElementById('keyword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadCourses(e.target.value.trim());
    });

    document.getElementById('studentSemesterSelect').addEventListener('change', (e) => {
      currentSemesterId = e.target.value ? parseInt(e.target.value, 10) : null;
      loadCourses(document.getElementById('keyword').value.trim());
      loadMyCourses();
    });

    document.querySelectorAll('.student-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    const gradeSemesterSelect = document.getElementById('gradeSemesterFilter');
    if (gradeSemesterSelect) {
      gradeSemesterSelect.addEventListener('change', (e) => {
        gradeSemesterFilter = e.target.value ? parseInt(e.target.value, 10) : null;
        loadGrades();
      });
    }
    const gradeLevelSelect = document.getElementById('gradeLevelFilter');
    if (gradeLevelSelect) {
      gradeLevelSelect.addEventListener('change', (e) => {
        gradeLevelFilter = e.target.value || null;
        loadGrades();
      });
    }

    initEvalStars();
    initEvalModal();
    initDrawer();

    initSemesterDropdown().then(() => {
      loadEvaluatedCourses().then(() => {
        Promise.all([loadCourses(), loadMyCourses()]);
      });
    });
  }

  init();
})();
