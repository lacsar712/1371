(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let allCourses = [];
  let allTeachers = [];
  let currentPage = 'courses';

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u.role !== 'admin' || !u.id) return null;
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
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })));
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ========== 页面切换 ==========
  function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.sidebar-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    document.getElementById('page-courses').style.display = page === 'courses' ? '' : 'none';
    document.getElementById('page-teachers').style.display = page === 'teachers' ? '' : 'none';
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (page === 'courses') {
      title.textContent = '课程管理';
      subtitle.textContent = '管理课程信息、容量与授课教师';
      loadCourses();
    } else {
      title.textContent = '教师管理';
      subtitle.textContent = '管理教师基本信息与所属学院';
      loadColleges();
      loadTeachers();
    }
  }

  // ========== 课程管理 ==========
  async function loadCourses() {
    const tbody = document.getElementById('courseTableBody');
    const { data } = await api('/api/admin/courses');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    allCourses = data.data;
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);">暂无课程</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (c) => `
        <tr>
          <td>${c.id}</td>
          <td>${escapeHtml(c.code)}</td>
          <td>${escapeHtml(c.name)}</td>
          <td>${c.credit ?? 0}</td>
          <td>${c.capacity ?? 0}</td>
          <td>${c.enrolled ?? 0}</td>
          <td>${(c.teachers || []).map((t) => escapeHtml(t.name)).join('、') || '<span style="color:var(--text-secondary);">未分配</span>'}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm edit-course-btn" data-id="${c.id}">编辑</button>
            <button type="button" class="btn btn-danger btn-sm delete-course-btn" data-id="${c.id}">删除</button>
          </td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('.edit-course-btn').forEach((btn) => {
      btn.addEventListener('click', () => openCourseEdit(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.delete-course-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteCourse(parseInt(btn.dataset.id, 10)));
    });
  }

  async function loadTeachersForModal() {
    const { data } = await api('/api/admin/teachers');
    if (data && data.ok && Array.isArray(data.data)) {
      allTeachers = data.data;
    }
    return allTeachers;
  }

  function renderTeacherCheckboxes(selectedIds = []) {
    const container = document.getElementById('teacherCheckboxes');
    if (!allTeachers.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.875rem;">暂无教师，请先在「教师管理」中添加</p>';
      return;
    }
    const selectedSet = new Set(selectedIds.map((id) => Number(id)));
    container.innerHTML = allTeachers
      .map((t) => {
        const checked = selectedSet.has(t.id) ? 'checked' : '';
        const meta = [t.title, t.college].filter(Boolean).join(' · ');
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer;border-radius:8px;">
            <input type="checkbox" name="teacherIds" value="${t.id}" ${checked} style="width:18px;height:18px;accent-color:var(--accent-start);" />
            <div>
              <div style="font-weight:500;">${escapeHtml(t.name)} <span style="color:var(--text-secondary);font-weight:400;">(${escapeHtml(t.teacherNo)})</span></div>
              ${meta ? `<div style="font-size:0.8125rem;color:var(--text-secondary);">${escapeHtml(meta)}</div>` : ''}
            </div>
          </label>`;
      })
      .join('');
  }

  const courseModal = document.getElementById('courseModalOverlay');
  const courseForm = document.getElementById('courseForm');
  const courseModalTitle = document.getElementById('courseModalTitle');

  async function openCourseAdd() {
    document.getElementById('courseId').value = '';
    document.getElementById('code').value = '';
    document.getElementById('name').value = '';
    document.getElementById('credit').value = '';
    document.getElementById('capacity').value = '';
    await loadTeachersForModal();
    renderTeacherCheckboxes([]);
    courseModalTitle.textContent = '新增课程';
    courseModal.classList.remove('modal-editing');
    courseModal.classList.add('show');
  }

  async function openCourseEdit(id) {
    const course = allCourses.find((c) => c.id === id);
    if (!course) return;
    document.getElementById('courseId').value = id;
    document.getElementById('code').value = course.code;
    document.getElementById('name').value = course.name;
    document.getElementById('credit').value = course.credit;
    document.getElementById('capacity').value = course.capacity;
    await loadTeachersForModal();
    renderTeacherCheckboxes((course.teachers || []).map((t) => t.id));
    courseModalTitle.textContent = '编辑课程';
    courseModal.classList.add('modal-editing', 'show');
  }

  function closeCourseModal() {
    courseModal.classList.remove('show');
  }

  async function deleteCourse(id) {
    if (!confirm('确定删除该课程？已选课记录与教师关联将一并删除。')) return;
    const { data } = await api('/api/admin/courses/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      loadCourses();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  courseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('courseId').value.trim();
    const code = document.getElementById('code').value.trim();
    const name = document.getElementById('name').value.trim();
    const credit = parseInt(document.getElementById('credit').value, 10);
    const capacity = parseInt(document.getElementById('capacity').value, 10);
    const teacherCheckboxes = document.querySelectorAll('input[name="teacherIds"]:checked');
    const teacherIds = Array.from(teacherCheckboxes).map((cb) => parseInt(cb.value, 10));
    if (!code || !name || Number.isNaN(credit) || credit < 0 || Number.isNaN(capacity) || capacity < 0) {
      showToast('请填写完整且有效的字段', 'error');
      return;
    }
    const payload = { code, name, credit, capacity, teacherIds };
    if (id) {
      const { data } = await api('/api/admin/courses/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('保存成功', 'success');
        closeCourseModal();
        loadCourses();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } else {
      const { data } = await api('/api/admin/courses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('新增成功', 'success');
        closeCourseModal();
        loadCourses();
      } else {
        showToast((data && data.message) || '新增失败', 'error');
      }
    }
  });

  document.getElementById('courseModalCancel').addEventListener('click', closeCourseModal);
  courseModal.addEventListener('click', (e) => {
    if (e.target === courseModal) closeCourseModal();
  });
  document.getElementById('addCourseBtn').addEventListener('click', openCourseAdd);

  // ========== 教师管理 ==========
  async function loadColleges() {
    const { data } = await api('/api/admin/teachers/colleges');
    if (data && data.ok && Array.isArray(data.data)) {
      const select = document.getElementById('collegeFilter');
      const currentVal = select.value;
      select.innerHTML = '<option value="">全部学院</option>' +
        data.data.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      select.value = currentVal;
    }
  }

  async function loadTeachers() {
    const tbody = document.getElementById('teacherTableBody');
    const keyword = document.getElementById('teacherKeyword').value.trim();
    const college = document.getElementById('collegeFilter').value;
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (college) params.set('college', college);
    const qs = params.toString();
    const { data } = await api('/api/admin/teachers' + (qs ? '?' + qs : ''));
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    allTeachers = data.data;
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">暂无教师</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (t) => `
        <tr>
          <td>${t.id}</td>
          <td>${escapeHtml(t.teacherNo)}</td>
          <td style="font-weight:600;">${escapeHtml(t.name)}</td>
          <td>${escapeHtml(t.title || '')}</td>
          <td>${escapeHtml(t.college || '')}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm edit-teacher-btn" data-id="${t.id}">编辑</button>
            <button type="button" class="btn btn-danger btn-sm delete-teacher-btn" data-id="${t.id}">删除</button>
          </td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('.edit-teacher-btn').forEach((btn) => {
      btn.addEventListener('click', () => openTeacherEdit(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.delete-teacher-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteTeacher(parseInt(btn.dataset.id, 10)));
    });
  }

  const teacherModal = document.getElementById('teacherModalOverlay');
  const teacherForm = document.getElementById('teacherForm');
  const teacherModalTitle = document.getElementById('teacherModalTitle');

  function openTeacherAdd() {
    document.getElementById('teacherId').value = '';
    document.getElementById('teacherNo').value = '';
    document.getElementById('teacherName').value = '';
    document.getElementById('teacherTitle').value = '';
    document.getElementById('teacherCollege').value = '';
    document.getElementById('teacherPassword').value = '';
    document.getElementById('teacherPasswordGroup').querySelector('label').textContent = '登录密码';
    teacherModalTitle.textContent = '新增教师';
    teacherModal.classList.remove('modal-editing');
    teacherModal.classList.add('show');
  }

  function openTeacherEdit(id) {
    const t = allTeachers.find((x) => x.id === id);
    if (!t) return;
    document.getElementById('teacherId').value = id;
    document.getElementById('teacherNo').value = t.teacherNo;
    document.getElementById('teacherName').value = t.name;
    document.getElementById('teacherTitle').value = t.title || '';
    document.getElementById('teacherCollege').value = t.college || '';
    document.getElementById('teacherPassword').value = '';
    document.getElementById('teacherPasswordGroup').querySelector('label').textContent = '登录密码（留空不修改）';
    teacherModalTitle.textContent = '编辑教师';
    teacherModal.classList.add('modal-editing', 'show');
  }

  function closeTeacherModal() {
    teacherModal.classList.remove('show');
  }

  async function deleteTeacher(id) {
    if (!confirm('确定删除该教师？其课程关联将一并解除。')) return;
    const { data } = await api('/api/admin/teachers/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      loadColleges();
      loadTeachers();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  teacherForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('teacherId').value.trim();
    const teacherNo = document.getElementById('teacherNo').value.trim();
    const name = document.getElementById('teacherName').value.trim();
    const title = document.getElementById('teacherTitle').value.trim();
    const college = document.getElementById('teacherCollege').value.trim();
    const password = document.getElementById('teacherPassword').value;
    if (!teacherNo || !name) {
      showToast('请填写工号和姓名', 'error');
      return;
    }
    if (!id && !password) {
      showToast('新增教师请设置登录密码', 'error');
      return;
    }
    const payload = { teacherNo, name, title, college };
    if (password) payload.password = password;
    if (id) {
      const { data } = await api('/api/admin/teachers/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('保存成功', 'success');
        closeTeacherModal();
        loadColleges();
        loadTeachers();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } else {
      const { data } = await api('/api/admin/teachers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('新增成功', 'success');
        closeTeacherModal();
        loadColleges();
        loadTeachers();
      } else {
        showToast((data && data.message) || '新增失败', 'error');
      }
    }
  });

  document.getElementById('teacherModalCancel').addEventListener('click', closeTeacherModal);
  teacherModal.addEventListener('click', (e) => {
    if (e.target === teacherModal) closeTeacherModal();
  });
  document.getElementById('addTeacherBtn').addEventListener('click', openTeacherAdd);
  document.getElementById('searchTeacherBtn').addEventListener('click', loadTeachers);
  document.getElementById('teacherKeyword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadTeachers();
  });
  document.getElementById('collegeFilter').addEventListener('change', loadTeachers);

  // ========== 导航绑定 ==========
  document.querySelectorAll('.sidebar-nav a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      switchPage(a.dataset.page);
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', (e) => {
    sessionStorage.removeItem('user');
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
    } else {
      fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
  });

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    loadCourses();
  }

  init();
})();
