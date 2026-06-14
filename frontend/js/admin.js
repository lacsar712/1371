(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let allCourses = [];
  let allTeachers = [];
  let allClassrooms = [];
  let allSchedules = [];
  let allSemesters = [];
  let currentSemesterId = null;
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
    document.getElementById('page-semesters').style.display = page === 'semesters' ? '' : 'none';
    document.getElementById('page-organization').style.display = page === 'organization' ? '' : 'none';
    document.getElementById('page-courses').style.display = page === 'courses' ? '' : 'none';
    document.getElementById('page-teachers').style.display = page === 'teachers' ? '' : 'none';
    document.getElementById('page-classrooms').style.display = page === 'classrooms' ? '' : 'none';
    document.getElementById('page-scheduling').style.display = page === 'scheduling' ? '' : 'none';
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (page === 'semesters') {
      title.textContent = '学期管理';
      subtitle.textContent = '管理学年学期、设置当前学期';
      loadSemesters();
    } else if (page === 'organization') {
      title.textContent = '组织架构';
      subtitle.textContent = '管理学院、专业、班级与学生归属';
      loadOrgTree();
    } else if (page === 'courses') {
      title.textContent = '课程管理';
      subtitle.textContent = '管理课程信息、容量与授课教师';
      loadCourses();
    } else if (page === 'classrooms') {
      title.textContent = '教室管理';
      subtitle.textContent = '管理教学楼、教室容量与多媒体配置';
      loadBuildings();
      loadClassrooms();
    } else if (page === 'scheduling') {
      title.textContent = '排课中心';
      subtitle.textContent = '拖拽课程到网格完成排课，实时冲突检测';
      loadSchedulingData();
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
    const qs = currentSemesterId ? '?semesterId=' + currentSemesterId : '';
    const { data } = await api('/api/admin/courses' + qs);
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
    await populateCourseSemesterSelect();
    const semSelect = document.getElementById('courseSemesterId');
    if (currentSemesterId) semSelect.value = currentSemesterId;
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
    await populateCourseSemesterSelect();
    const semSelect = document.getElementById('courseSemesterId');
    if (course.semesterId) semSelect.value = course.semesterId;
    await loadTeachersForModal();
    renderTeacherCheckboxes((course.teachers || []).map((t) => t.id));
    courseModalTitle.textContent = '编辑课程';
    courseModal.classList.add('modal-editing', 'show');
  }

  async function populateCourseSemesterSelect() {
    const select = document.getElementById('courseSemesterId');
    if (!allSemesters.length) {
      const { data } = await api('/api/semesters');
      if (data && data.ok && Array.isArray(data.data)) {
        allSemesters = data.data;
      }
    }
    select.innerHTML = allSemesters.map((s) =>
      `<option value="${s.id}">${escapeHtml(s.academicYear)} 第${s.semesterNumber}学期${s.isCurrent ? ' (当前)' : ''}</option>`
    ).join('');
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
    const semesterId = parseInt(document.getElementById('courseSemesterId').value, 10);
    const code = document.getElementById('code').value.trim();
    const name = document.getElementById('name').value.trim();
    const credit = parseInt(document.getElementById('credit').value, 10);
    const capacity = parseInt(document.getElementById('capacity').value, 10);
    const teacherCheckboxes = document.querySelectorAll('input[name="teacherIds"]:checked');
    const teacherIds = Array.from(teacherCheckboxes).map((cb) => parseInt(cb.value, 10));
    if (!semesterId || !code || !name || Number.isNaN(credit) || credit < 0 || Number.isNaN(capacity) || capacity < 0) {
      showToast('请填写完整且有效的字段', 'error');
      return;
    }
    const payload = { code, name, credit, capacity, semesterId, teacherIds };
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

  // ========== 组织架构 ==========
  let orgTreeData = [];
  let currentSelectedClass = null;
  let dragStudentId = null;
  let pendingDeleteNode = null;

  const TYPE_LABEL = { college: '学院', major: '专业', class: '班级', student: '学生' };
  const TYPE_ICON = { college: '🏛️', major: '📚', class: '👥', student: '🎓' };

  async function loadOrgTree() {
    const container = document.getElementById('orgTree');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;text-align:center;">加载中...</p>';
    const { data } = await api('/api/admin/org/tree');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      container.innerHTML = '<p style="color:var(--danger);padding:20px;text-align:center;">加载失败</p>';
      return;
    }
    orgTreeData = data.data;
    renderOrgTree();
  }

  function renderOrgTree() {
    const container = document.getElementById('orgTree');
    if (!orgTreeData.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;text-align:center;">暂无学院，点击右上角「新增学院」开始创建</p>';
      return;
    }
    container.innerHTML = orgTreeData.map((node) => renderTreeNode(node, 0)).join('');
    bindTreeEvents();
  }

  function renderTreeNode(node, depth) {
    const hasChildren = node.children && node.children.length > 0;
    const typeLabel = TYPE_LABEL[node.type] || '节点';
    const icon = TYPE_ICON[node.type] || '📁';
    const extra = node.type === 'student' && node.studentNo ? ` <span style="color:var(--text-secondary);font-weight:400;">(${escapeHtml(node.studentNo)})</span>` : '';
    const draggable = node.type === 'student' ? 'draggable="true"' : '';
    const dropTarget = node.type === 'class' ? 'data-drop-target="true"' : '';

    const childHtml = hasChildren
      ? `<div class="tree-children">${node.children.map((c) => renderTreeNode(c, depth + 1)).join('')}</div>`
      : '';

    const actions = node.type !== 'student'
      ? `<div class="tree-node-actions">
           <button type="button" class="tree-act-btn tree-add-btn" data-action="add" data-type="${node.type}" data-id="${node.id}" title="新增下级">＋</button>
           <button type="button" class="tree-act-btn tree-edit-btn" data-action="edit" data-type="${node.type}" data-id="${node.id}" title="重命名">✎</button>
           <button type="button" class="tree-act-btn tree-del-btn" data-action="delete" data-type="${node.type}" data-id="${node.id}" title="删除">✕</button>
         </div>`
      : '';

    return `
      <div class="tree-node" data-type="${node.type}" data-id="${node.id}" style="padding-left:${depth * 18}px;" ${draggable} ${dropTarget}>
        <div class="tree-node-row">
          ${hasChildren ? `<span class="tree-toggle" data-toggle="${node.id}">▸</span>` : '<span class="tree-toggle tree-toggle-placeholder"></span>'}
          <span class="tree-node-icon">${icon}</span>
          <span class="tree-node-label"><strong>${escapeHtml(node.name)}</strong>${extra}</span>
          ${actions}
        </div>
        ${childHtml}
      </div>`;
  }

  function bindTreeEvents() {
    const container = document.getElementById('orgTree');

    container.querySelectorAll('.tree-toggle[data-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const node = el.closest('.tree-node');
        const children = node.querySelector(':scope > .tree-children');
        if (children) {
          const expanded = children.style.display !== 'none';
          children.style.display = expanded ? 'none' : '';
          el.textContent = expanded ? '▸' : '▾';
          el.classList.toggle('expanded', !expanded);
        }
      });
    });

    container.querySelectorAll('.tree-node-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.tree-act-btn') || e.target.closest('.tree-toggle')) return;
        const node = row.closest('.tree-node');
        const type = node.dataset.type;
        const id = parseInt(node.dataset.id, 10);
        if (type === 'class') {
          selectClassNode(id, node);
        } else if (type === 'student') {
          showToast('学生节点：可拖拽到其他班级进行调班', 'info');
        }
      });
    });

    container.querySelectorAll('.tree-add-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openOrgAdd(btn.dataset.type, parseInt(btn.dataset.id, 10));
      });
    });
    container.querySelectorAll('.tree-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openOrgEdit(btn.dataset.type, parseInt(btn.dataset.id, 10));
      });
    });
    container.querySelectorAll('.tree-del-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmOrgDelete(btn.dataset.type, parseInt(btn.dataset.id, 10));
      });
    });

    container.querySelectorAll('.tree-node[draggable="true"]').forEach((node) => {
      node.addEventListener('dragstart', (e) => {
        const id = parseInt(node.dataset.id, 10);
        dragStudentId = id;
        e.dataTransfer.effectAllowed = 'move';
        node.classList.add('dragging');
      });
      node.addEventListener('dragend', () => {
        node.classList.remove('dragging');
        dragStudentId = null;
        container.querySelectorAll('.tree-node.drag-over').forEach((n) => n.classList.remove('drag-over'));
      });
    });

    container.querySelectorAll('.tree-node[data-drop-target="true"]').forEach((node) => {
      node.addEventListener('dragover', (e) => {
        if (!dragStudentId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', () => {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', async (e) => {
        e.preventDefault();
        node.classList.remove('drag-over');
        if (!dragStudentId) return;
        const targetClassId = parseInt(node.dataset.id, 10);
        await moveStudentToClass(dragStudentId, targetClassId);
      });
    });
  }

  async function selectClassNode(classId, nodeEl) {
    document.querySelectorAll('#orgTree .tree-node.selected').forEach((n) => n.classList.remove('selected'));
    if (nodeEl) nodeEl.classList.add('selected');
    currentSelectedClass = classId;
    const detailTitle = document.getElementById('orgDetailTitle');
    const detail = document.getElementById('orgDetail');
    detailTitle.textContent = '班级学生列表';
    detail.innerHTML = '<p style="color:var(--text-secondary);padding:40px;text-align:center;">加载中...</p>';

    const { data } = await api('/api/admin/org/classes/' + classId + '/students');
    if (!data || !data.ok) {
      detail.innerHTML = '<p style="color:var(--danger);padding:40px;text-align:center;">加载失败</p>';
      return;
    }
    const students = data.data || [];
    if (!students.length) {
      detail.innerHTML = '<p style="color:var(--text-secondary);padding:40px;text-align:center;">该班级暂无学生</p>';
      return;
    }

    // 同时获取所有班级用于调班下拉
    const { data: classesData } = await api('/api/admin/org/classes');
    const allClasses = (classesData && classesData.ok && classesData.data) || [];

    detail.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>学号</th>
              <th>姓名</th>
              <th>调至班级</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((s) => `
              <tr>
                <td>${s.id}</td>
                <td>${escapeHtml(s.studentNo)}</td>
                <td style="font-weight:600;">${escapeHtml(s.name)}</td>
                <td>
                  <select class="student-move-select" data-student-id="${s.id}">
                    <option value="">-- 选择班级调班 --</option>
                    ${allClasses.filter((c) => c.id !== classId).map((c) => `<option value="${c.id}">${escapeHtml(c.collegeName || '')} / ${escapeHtml(c.majorName || '')} / ${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    detail.querySelectorAll('.student-move-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const targetClassId = parseInt(sel.value, 10);
        const studentId = parseInt(sel.dataset.studentId, 10);
        if (!targetClassId || !studentId) return;
        await moveStudentToClass(studentId, targetClassId);
      });
    });
  }

  async function moveStudentToClass(studentId, classId) {
    if (!studentId || !classId) return;
    const { data } = await api('/api/admin/org/students/' + studentId + '/move', {
      method: 'POST',
      body: JSON.stringify({ classId }),
    });
    if (data && data.ok) {
      showToast('调班成功', 'success');
      loadOrgTree();
      if (currentSelectedClass) {
        // 重新加载当前班级列表（如果学生还在当前班级）
        setTimeout(() => {
          const node = document.querySelector(`#orgTree .tree-node[data-type="class"][data-id="${currentSelectedClass}"]`);
          if (node) selectClassNode(currentSelectedClass, node);
        }, 200);
      }
    } else {
      showToast((data && data.message) || '调班失败', 'error');
    }
  }

  // ======== 新增/重命名弹窗 ========
  const orgModal = document.getElementById('orgModalOverlay');
  const orgForm = document.getElementById('orgForm');

  function getApiPrefix(type) {
    if (type === 'college') return '/api/admin/org/colleges';
    if (type === 'major') return '/api/admin/org/majors';
    if (type === 'class') return '/api/admin/org/classes';
    return '';
  }

  function getChildType(type) {
    if (type === 'college') return 'major';
    if (type === 'major') return 'class';
    return null;
  }

  async function openOrgAdd(parentType, parentId) {
    // 新增：在 parentType 下新增子节点
    const childType = getChildType(parentType);
    if (!childType) return;
    document.getElementById('orgNodeId').value = '';
    document.getElementById('orgNodeType').value = childType;
    document.getElementById('orgName').value = '';
    document.getElementById('orgModalTitle').textContent = '新增' + TYPE_LABEL[childType];

    // 显示父级选择
    const parentGroup = document.getElementById('orgParentGroup');
    const parentLabel = document.getElementById('orgParentLabel');
    const parentSelect = document.getElementById('orgParentSelect');
    parentGroup.style.display = '';

    if (childType === 'major') {
      parentLabel.textContent = '所属学院';
      const { data } = await api('/api/admin/org/colleges');
      const list = (data && data.ok && data.data) || [];
      parentSelect.innerHTML = list.map((c) => `<option value="${c.id}" ${c.id === parentId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
      document.getElementById('orgParentId').value = parentId || '';
    } else if (childType === 'class') {
      parentLabel.textContent = '所属专业';
      const { data } = await api('/api/admin/org/majors');
      const list = (data && data.ok && data.data) || [];
      parentSelect.innerHTML = list.map((m) => `<option value="${m.id}" ${m.id === parentId ? 'selected' : ''}>${escapeHtml((m.collegeName ? m.collegeName + ' / ' : '') + m.name)}</option>`).join('');
      document.getElementById('orgParentId').value = parentId || '';
    }

    orgModal.classList.remove('modal-editing');
    orgModal.classList.add('show');
    setTimeout(() => document.getElementById('orgName').focus(), 100);
  }

  async function openOrgAddRoot() {
    // 从根按钮新增学院
    document.getElementById('orgNodeId').value = '';
    document.getElementById('orgNodeType').value = 'college';
    document.getElementById('orgName').value = '';
    document.getElementById('orgModalTitle').textContent = '新增学院';
    document.getElementById('orgParentGroup').style.display = 'none';
    orgModal.classList.remove('modal-editing');
    orgModal.classList.add('show');
    setTimeout(() => document.getElementById('orgName').focus(), 100);
  }

  async function openOrgEdit(type, id) {
    // 找到节点信息
    let target = null;
    function walk(nodes) {
      for (const n of nodes) {
        if (n.type === type && n.id === id) { target = n; return true; }
        if (n.children && walk(n.children)) return true;
      }
      return false;
    }
    walk(orgTreeData);
    if (!target) return;

    document.getElementById('orgNodeId').value = id;
    document.getElementById('orgNodeType').value = type;
    document.getElementById('orgName').value = target.name;
    document.getElementById('orgModalTitle').textContent = '重命名' + TYPE_LABEL[type];

    const parentGroup = document.getElementById('orgParentGroup');
    if (type === 'college') {
      parentGroup.style.display = 'none';
    } else {
      parentGroup.style.display = '';
      const parentLabel = document.getElementById('orgParentLabel');
      const parentSelect = document.getElementById('orgParentSelect');
      if (type === 'major') {
        parentLabel.textContent = '所属学院';
        const { data } = await api('/api/admin/org/colleges');
        const list = (data && data.ok && data.data) || [];
        parentSelect.innerHTML = list.map((c) => `<option value="${c.id}" ${c.id === target.collegeId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
      } else if (type === 'class') {
        parentLabel.textContent = '所属专业';
        const { data } = await api('/api/admin/org/majors');
        const list = (data && data.ok && data.data) || [];
        parentSelect.innerHTML = list.map((m) => `<option value="${m.id}" ${m.id === target.majorId ? 'selected' : ''}>${escapeHtml((m.collegeName ? m.collegeName + ' / ' : '') + m.name)}</option>`).join('');
      }
    }

    orgModal.classList.add('modal-editing', 'show');
    setTimeout(() => document.getElementById('orgName').focus(), 100);
  }

  function closeOrgModal() {
    orgModal.classList.remove('show');
  }

  orgForm && orgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('orgNodeId').value.trim();
    const type = document.getElementById('orgNodeType').value;
    const name = document.getElementById('orgName').value.trim();
    const parentSelect = document.getElementById('orgParentSelect');
    const parentId = parentSelect && parentSelect.value ? parseInt(parentSelect.value, 10) : null;
    if (!name || !type) return;

    const prefix = getApiPrefix(type);
    if (!prefix) return;

    let payload = { name };
    if (type === 'major' && parentId) payload.collegeId = parentId;
    if (type === 'class' && parentId) payload.majorId = parentId;

    if (id) {
      const { data } = await api(prefix + '/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      if (data && data.ok) {
        showToast('保存成功', 'success');
        closeOrgModal();
        loadOrgTree();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } else {
      const { data } = await api(prefix, { method: 'POST', body: JSON.stringify(payload) });
      if (data && data.ok) {
        showToast('新增成功', 'success');
        closeOrgModal();
        loadOrgTree();
      } else {
        showToast((data && data.message) || '新增失败', 'error');
      }
    }
  });

  document.getElementById('orgModalCancel') && document.getElementById('orgModalCancel').addEventListener('click', closeOrgModal);
  orgModal && orgModal.addEventListener('click', (e) => {
    if (e.target === orgModal) closeOrgModal();
  });
  document.querySelector('.tree-root-add') && document.querySelector('.tree-root-add').addEventListener('click', openOrgAddRoot);

  // ======== 删除确认弹窗 ========
  const orgDeleteOverlay = document.getElementById('orgDeleteOverlay');

  function findNodeInfo(type, id) {
    let result = null;
    function walk(nodes) {
      for (const n of nodes) {
        if (n.type === type && n.id === id) { result = n; return true; }
        if (n.children && walk(n.children)) return true;
      }
      return false;
    }
    walk(orgTreeData);
    return result;
  }

  function countCascade(node) {
    const counts = { majors: 0, classes: 0, students: 0 };
    function walk(n) {
      if (!n.children) return;
      for (const c of n.children) {
        if (c.type === 'major') counts.majors++;
        if (c.type === 'class') counts.classes++;
        if (c.type === 'student') counts.students++;
        walk(c);
      }
    }
    walk(node);
    return counts;
  }

  async function confirmOrgDelete(type, id) {
    const node = findNodeInfo(type, id);
    if (!node) return;
    const cascade = countCascade(node);
    const hasChildren = cascade.majors > 0 || cascade.classes > 0 || cascade.students > 0;

    let message = `确定要删除「${escapeHtml(node.name)}」吗？`;
    if (hasChildren) {
      const parts = [];
      if (cascade.majors) parts.push(`${cascade.majors} 个专业`);
      if (cascade.classes) parts.push(`${cascade.classes} 个班级`);
      if (cascade.students) parts.push(`${cascade.students} 名学生`);
      message += `<br><br><span style="color:var(--danger);">⚠️ 该${TYPE_LABEL[type]}下还包含 ${parts.join('、')}，请先处理子节点后再删除。</span>`;
    }

    const msgEl = document.getElementById('orgDeleteMessage');
    msgEl.innerHTML = message;

    pendingDeleteNode = { type, id, hasChildren };
    // 带子节点时禁用确定按钮
    const okBtn = document.getElementById('orgDeleteOk');
    if (hasChildren) {
      okBtn.disabled = true;
      okBtn.style.opacity = '0.5';
      okBtn.style.cursor = 'not-allowed';
    } else {
      okBtn.disabled = false;
      okBtn.style.opacity = '';
      okBtn.style.cursor = '';
    }

    orgDeleteOverlay.classList.add('show');
  }

  function closeOrgDelete() {
    orgDeleteOverlay.classList.remove('show');
    pendingDeleteNode = null;
  }

  document.getElementById('orgDeleteCancel') && document.getElementById('orgDeleteCancel').addEventListener('click', closeOrgDelete);
  orgDeleteOverlay && orgDeleteOverlay.addEventListener('click', (e) => {
    if (e.target === orgDeleteOverlay) closeOrgDelete();
  });
  document.getElementById('orgDeleteOk') && document.getElementById('orgDeleteOk').addEventListener('click', async () => {
    if (!pendingDeleteNode || pendingDeleteNode.hasChildren) return;
    const { type, id } = pendingDeleteNode;
    const prefix = getApiPrefix(type);
    const { data } = await api(prefix + '/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      closeOrgDelete();
      loadOrgTree();
      if (currentSelectedClass && type === 'class' && currentSelectedClass === id) {
        currentSelectedClass = null;
        document.getElementById('orgDetailTitle').textContent = '班级学生列表';
        document.getElementById('orgDetail').innerHTML = '<p style="color:var(--text-secondary);padding:40px;text-align:center;">请在左侧选择一个班级节点</p>';
      }
    } else {
      showToast((data && data.message) || '删除失败', 'error');
      closeOrgDelete();
    }
  });

  // ========== 教室管理 ==========
  async function loadBuildings() {
    const { data } = await api('/api/admin/classrooms/buildings');
    if (data && data.ok && Array.isArray(data.data)) {
      const select = document.getElementById('buildingFilter');
      const currentVal = select.value;
      select.innerHTML = '<option value="">全部教学楼</option>' +
        data.data.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
      select.value = currentVal;
    }
  }

  async function loadClassrooms() {
    const tbody = document.getElementById('classroomTableBody');
    const building = document.getElementById('buildingFilter').value;
    const minCapacity = document.getElementById('capacityFilter').value;
    const params = new URLSearchParams();
    if (building) params.set('building', building);
    if (minCapacity) params.set('minCapacity', minCapacity);
    const qs = params.toString();
    const { data } = await api('/api/admin/classrooms' + (qs ? '?' + qs : ''));
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    allClassrooms = data.data;
    if (!allClassrooms.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">暂无教室</td></tr>';
      return;
    }
    tbody.innerHTML = allClassrooms.map((c) => `
      <tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.building)}</td>
        <td>${escapeHtml(c.roomNumber)}</td>
        <td>${c.capacity}</td>
        <td>${c.isMultimedia ? '<span style="color:var(--success);">✓ 是</span>' : '<span style="color:var(--text-secondary);">—</span>'}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm edit-classroom-btn" data-id="${c.id}">编辑</button>
          <button type="button" class="btn btn-danger btn-sm delete-classroom-btn" data-id="${c.id}">删除</button>
        </td>
      </tr>`
    ).join('');
    tbody.querySelectorAll('.edit-classroom-btn').forEach((btn) => {
      btn.addEventListener('click', () => openClassroomEdit(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.delete-classroom-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteClassroom(parseInt(btn.dataset.id, 10)));
    });
  }

  const classroomModal = document.getElementById('classroomModalOverlay');
  const classroomForm = document.getElementById('classroomForm');
  const classroomModalTitle = document.getElementById('classroomModalTitle');

  function openClassroomAdd() {
    document.getElementById('classroomId').value = '';
    document.getElementById('classroomBuilding').value = '';
    document.getElementById('classroomRoomNumber').value = '';
    document.getElementById('classroomCapacity').value = '';
    document.getElementById('classroomIsMultimedia').checked = false;
    classroomModalTitle.textContent = '新增教室';
    classroomModal.classList.remove('modal-editing');
    classroomModal.classList.add('show');
  }

  function openClassroomEdit(id) {
    const c = allClassrooms.find((x) => x.id === id);
    if (!c) return;
    document.getElementById('classroomId').value = id;
    document.getElementById('classroomBuilding').value = c.building;
    document.getElementById('classroomRoomNumber').value = c.roomNumber;
    document.getElementById('classroomCapacity').value = c.capacity;
    document.getElementById('classroomIsMultimedia').checked = c.isMultimedia;
    classroomModalTitle.textContent = '编辑教室';
    classroomModal.classList.add('modal-editing', 'show');
  }

  function closeClassroomModal() {
    classroomModal.classList.remove('show');
  }

  async function deleteClassroom(id) {
    if (!confirm('确定删除该教室？关联的排课记录也将一并删除。')) return;
    const { data } = await api('/api/admin/classrooms/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      loadBuildings();
      loadClassrooms();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  classroomForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('classroomId').value.trim();
    const building = document.getElementById('classroomBuilding').value.trim();
    const roomNumber = document.getElementById('classroomRoomNumber').value.trim();
    const capacity = parseInt(document.getElementById('classroomCapacity').value, 10);
    const isMultimedia = document.getElementById('classroomIsMultimedia').checked;
    if (!building || !roomNumber || Number.isNaN(capacity) || capacity < 0) {
      showToast('请填写完整且有效的字段', 'error');
      return;
    }
    const payload = { building, roomNumber, capacity, isMultimedia };
    if (id) {
      const { data } = await api('/api/admin/classrooms/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('保存成功', 'success');
        closeClassroomModal();
        loadBuildings();
        loadClassrooms();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } else {
      const { data } = await api('/api/admin/classrooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('新增成功', 'success');
        closeClassroomModal();
        loadBuildings();
        loadClassrooms();
      } else {
        showToast((data && data.message) || '新增失败', 'error');
      }
    }
  });

  document.getElementById('classroomModalCancel').addEventListener('click', closeClassroomModal);
  classroomModal.addEventListener('click', (e) => {
    if (e.target === classroomModal) closeClassroomModal();
  });
  document.getElementById('addClassroomBtn').addEventListener('click', openClassroomAdd);
  document.getElementById('searchClassroomBtn').addEventListener('click', loadClassrooms);
  document.getElementById('buildingFilter').addEventListener('change', loadClassrooms);
  document.getElementById('capacityFilter').addEventListener('change', loadClassrooms);

  // ========== 排课中心 ==========
  let scheduleDragData = null;
  let currentScheduleDetailId = null;

  const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  async function loadSchedulingData() {
    const semQS = currentSemesterId ? '?semesterId=' + currentSemesterId : '';
    const [coursesRes, classroomsRes, schedulesRes] = await Promise.all([
      api('/api/admin/courses' + semQS),
      api('/api/admin/classrooms'),
      api('/api/admin/schedules' + semQS),
    ]);
    allCourses = (coursesRes.data && coursesRes.data.ok && coursesRes.data.data) || [];
    allClassrooms = (classroomsRes.data && classroomsRes.data.ok && classroomsRes.data.data) || [];
    allSchedules = (schedulesRes.data && schedulesRes.data.ok && schedulesRes.data.data) || [];

    const scheduleClassroomFilter = document.getElementById('scheduleClassroomFilter');
    scheduleClassroomFilter.innerHTML = '<option value="">全部教室</option>' +
      allClassrooms.map((c) => `<option value="${c.id}">${escapeHtml(c.building)} ${escapeHtml(c.roomNumber)} (${c.capacity}人)</option>`).join('');

    renderUnscheduledCourses();
    renderScheduleGrid();
  }

  function getScheduledCourseIds() {
    return new Set(allSchedules.map((s) => s.courseId));
  }

  function renderUnscheduledCourses() {
    const container = document.getElementById('unscheduledCourses');
    const scheduledIds = getScheduledCourseIds();
    const unscheduled = allCourses.filter((c) => !scheduledIds.has(c.id));
    if (!unscheduled.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;text-align:center;">所有课程已排完</p>';
      return;
    }
    container.innerHTML = unscheduled.map((c) => `
      <div class="schedule-course-item" draggable="true" data-course-id="${c.id}" data-course-name="${escapeHtml(c.name)}" data-course-capacity="${c.capacity}">
        <div class="schedule-course-code">${escapeHtml(c.code)}</div>
        <div class="schedule-course-name">${escapeHtml(c.name)}</div>
        <div class="schedule-course-capacity">${c.capacity}人</div>
      </div>
    `).join('');

    container.querySelectorAll('.schedule-course-item').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        scheduleDragData = {
          courseId: parseInt(item.dataset.courseId, 10),
          courseName: item.dataset.courseName,
          courseCapacity: parseInt(item.dataset.courseCapacity, 10),
        };
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        scheduleDragData = null;
        clearGridHighlights();
      });
    });
  }

  function renderScheduleGrid() {
    const tbody = document.getElementById('scheduleGridBody');
    const selectedClassroom = document.getElementById('scheduleClassroomFilter').value;
    const filteredSchedules = selectedClassroom
      ? allSchedules.filter((s) => s.classroomId === parseInt(selectedClassroom, 10))
      : allSchedules;

    let html = '';
    for (let period = 1; period <= 12; period++) {
      html += '<tr>';
      html += `<td class="period-label">第${period}节</td>`;
      for (let day = 1; day <= 7; day++) {
        const schedule = filteredSchedules.find((s) => s.dayOfWeek === day && s.startPeriod <= period && s.endPeriod >= period);
        if (schedule && schedule.startPeriod === period) {
          const rowspan = schedule.endPeriod - schedule.startPeriod + 1;
          const isConflict = schedule.capacityWarning;
          html += `<td class="schedule-cell has-schedule${isConflict ? ' capacity-warning' : ''}" rowspan="${rowspan}" data-schedule-id="${schedule.id}" data-day="${day}" data-period="${period}">`;
          html += `<div class="schedule-block${isConflict ? ' warning' : ''}">`;
          html += `<div class="schedule-block-name">${escapeHtml(schedule.course ? schedule.course.name : '')}</div>`;
          html += `<div class="schedule-block-room">${schedule.classroom ? escapeHtml(schedule.classroom.building + ' ' + schedule.classroom.roomNumber) : ''}</div>`;
          if (isConflict) html += `<div class="schedule-block-warning">⚠ 容量不足</div>`;
          html += '</div></td>';
        } else if (!schedule || period > schedule.endPeriod || period < schedule.startPeriod) {
          html += `<td class="schedule-cell" data-day="${day}" data-period="${period}"></td>`;
        }
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
    bindGridEvents();
  }

  function clearGridHighlights() {
    document.querySelectorAll('.schedule-cell.conflict-highlight, .schedule-cell.drop-ok, .schedule-cell.capacity-warn').forEach((cell) => {
      cell.classList.remove('conflict-highlight', 'drop-ok', 'capacity-warn');
    });
  }

  function bindGridEvents() {
    document.querySelectorAll('.schedule-cell').forEach((cell) => {
      cell.addEventListener('dragover', (e) => {
        if (!scheduleDragData) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        const day = parseInt(cell.dataset.day, 10);
        const startPeriod = parseInt(cell.dataset.period, 10);
        const endPeriod = Math.min(startPeriod + 1, 12);
        const classroomId = parseInt(document.getElementById('scheduleClassroomFilter').value, 10);

        if (!classroomId) {
          cell.classList.add('conflict-highlight');
          return;
        }

        const conflict = allSchedules.some((s) => {
          if (s.classroomId !== classroomId) return false;
          if (s.dayOfWeek !== day) return false;
          return s.startPeriod <= endPeriod && startPeriod <= s.endPeriod;
        });

        clearGridHighlights();

        if (conflict) {
          cell.classList.add('conflict-highlight');
        } else {
          const classroom = allClassrooms.find((c) => c.id === classroomId);
          if (classroom && classroom.capacity < scheduleDragData.courseCapacity) {
            cell.classList.add('capacity-warn');
          } else {
            cell.classList.add('drop-ok');
          }
        }
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('conflict-highlight', 'drop-ok', 'capacity-warn');
      });

      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        clearGridHighlights();
        if (!scheduleDragData) return;

        const day = parseInt(cell.dataset.day, 10);
        const startPeriod = parseInt(cell.dataset.period, 10);
        const endPeriod = Math.min(startPeriod + 1, 12);
        const classroomId = parseInt(document.getElementById('scheduleClassroomFilter').value, 10);

        if (!classroomId) {
          showToast('请先在上方选择一个教室', 'error');
          return;
        }

        const conflict = allSchedules.some((s) => {
          if (s.classroomId !== classroomId) return false;
          if (s.dayOfWeek !== day) return false;
          return s.startPeriod <= endPeriod && startPeriod <= s.endPeriod;
        });

        if (conflict) {
          showToast('该教室在此时段已有排课，存在冲突', 'error');
          return;
        }

        const classroom = allClassrooms.find((c) => c.id === classroomId);
        if (classroom && classroom.capacity < scheduleDragData.courseCapacity) {
          const ok = confirm(`教室容量(${classroom.capacity}人)小于课程容量(${scheduleDragData.courseCapacity}人)，是否继续排课？`);
          if (!ok) return;
        }

        const payload = {
          courseId: scheduleDragData.courseId,
          classroomId,
          dayOfWeek: day,
          startPeriod,
          endPeriod,
        };

        const { data } = await api('/api/admin/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (data && data.ok) {
          showToast('排课成功', 'success');
          await loadSchedulingData();
        } else {
          showToast((data && data.message) || '排课失败', 'error');
        }
        scheduleDragData = null;
      });

      cell.addEventListener('click', () => {
        const scheduleId = cell.dataset.scheduleId;
        if (!scheduleId) return;
        openScheduleDetail(parseInt(scheduleId, 10));
      });
    });
  }

  function openScheduleDetail(id) {
    const schedule = allSchedules.find((s) => s.id === id);
    if (!schedule) return;
    currentScheduleDetailId = id;
    const content = document.getElementById('scheduleDetailContent');
    const dayName = DAY_NAMES[schedule.dayOfWeek] || '';
    const courseName = schedule.course ? schedule.course.name : '';
    const classroomName = schedule.classroom ? `${schedule.classroom.building} ${schedule.classroom.roomNumber}` : '';
    const capacityInfo = schedule.classroom
      ? `教室容量: ${schedule.classroom.capacity}人 / 课程容量: ${schedule.course ? schedule.course.capacity : 0}人`
      : '';
    content.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:1.125rem;font-weight:600;margin-bottom:8px;">${escapeHtml(courseName)}</div>
        <div style="color:var(--text-secondary);font-size:0.9375rem;">${dayName} 第${schedule.startPeriod}-${schedule.endPeriod}节</div>
        <div style="color:var(--text-secondary);font-size:0.9375rem;margin-top:4px;">上课地点：${escapeHtml(classroomName)}</div>
        <div style="color:var(--text-secondary);font-size:0.875rem;margin-top:4px;">${capacityInfo}</div>
      </div>
    `;
    document.getElementById('scheduleDetailOverlay').classList.add('show');
  }

  document.getElementById('scheduleDetailClose').addEventListener('click', () => {
    document.getElementById('scheduleDetailOverlay').classList.remove('show');
    currentScheduleDetailId = null;
  });
  document.getElementById('scheduleDetailOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('scheduleDetailOverlay')) {
      document.getElementById('scheduleDetailOverlay').classList.remove('show');
      currentScheduleDetailId = null;
    }
  });
  document.getElementById('scheduleDetailDelete').addEventListener('click', async () => {
    if (!currentScheduleDetailId) return;
    if (!confirm('确定删除该排课记录？')) return;
    const { data } = await api('/api/admin/schedules/' + currentScheduleDetailId, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除排课', 'success');
      document.getElementById('scheduleDetailOverlay').classList.remove('show');
      currentScheduleDetailId = null;
      await loadSchedulingData();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  });

  document.getElementById('scheduleClassroomFilter').addEventListener('change', () => {
    const selected = document.getElementById('scheduleClassroomFilter').value;
    const label = document.getElementById('scheduleClassroomLabel');
    if (selected) {
      const classroom = allClassrooms.find((c) => c.id === parseInt(selected, 10));
      if (classroom) {
        label.textContent = `${classroom.building} ${classroom.roomNumber} · 容量${classroom.capacity}人${classroom.isMultimedia ? ' · 多媒体' : ''}`;
      }
    } else {
      label.textContent = '';
    }
    renderScheduleGrid();
  });

  // ========== 学期管理 ==========
  let allSemestersList = [];
  let pendingSetCurrentId = null;

  async function loadSemesters() {
    const tbody = document.getElementById('semesterTableBody');
    const { data } = await api('/api/semesters');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    allSemestersList = data.data;
    if (!allSemestersList.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">暂无学期，点击右上角新增</td></tr>';
      return;
    }
    tbody.innerHTML = allSemestersList.map((s) => `
      <tr>
        <td>${s.id}</td>
        <td>${escapeHtml(s.academicYear)}</td>
        <td>第${s.semesterNumber}学期</td>
        <td>${s.startDate}</td>
        <td>${s.endDate}</td>
        <td>${s.isCurrent ? '<span style="color:var(--success);font-weight:600;">✓ 当前学期</span>' : '<span style="color:var(--text-secondary);">—</span>'}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm edit-semester-btn" data-id="${s.id}">编辑</button>
          ${s.isCurrent ? '' : `<button type="button" class="btn btn-ghost btn-sm set-current-semester-btn" data-id="${s.id}" style="color:var(--accent-start);">设为当前</button>`}
          ${s.isCurrent ? '' : `<button type="button" class="btn btn-danger btn-sm delete-semester-btn" data-id="${s.id}">删除</button>`}
        </td>
      </tr>`
    ).join('');

    tbody.querySelectorAll('.edit-semester-btn').forEach((btn) => {
      btn.addEventListener('click', () => openSemesterEdit(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.set-current-semester-btn').forEach((btn) => {
      btn.addEventListener('click', () => confirmSetCurrentSemester(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.delete-semester-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteSemester(parseInt(btn.dataset.id, 10)));
    });
  }

  const semesterModal = document.getElementById('semesterModalOverlay');
  const semesterForm = document.getElementById('semesterForm');
  const semesterModalTitle = document.getElementById('semesterModalTitle');

  function openSemesterAdd() {
    document.getElementById('semesterEditId').value = '';
    document.getElementById('academicYear').value = '';
    document.getElementById('semesterNumber').value = '1';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('isCurrent').checked = false;
    semesterModalTitle.textContent = '新增学期';
    semesterModal.classList.remove('modal-editing');
    semesterModal.classList.add('show');
  }

  function openSemesterEdit(id) {
    const s = allSemestersList.find((x) => x.id === id);
    if (!s) return;
    document.getElementById('semesterEditId').value = id;
    document.getElementById('academicYear').value = s.academicYear;
    document.getElementById('semesterNumber').value = s.semesterNumber;
    document.getElementById('startDate').value = s.startDate;
    document.getElementById('endDate').value = s.endDate;
    document.getElementById('isCurrent').checked = s.isCurrent;
    semesterModalTitle.textContent = '编辑学期';
    semesterModal.classList.add('modal-editing', 'show');
  }

  function closeSemesterModal() {
    semesterModal.classList.remove('show');
  }

  async function deleteSemester(id) {
    if (!confirm('确定删除该学期？')) return;
    const { data } = await api('/api/semesters/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      await loadSemesters();
      await refreshSemesterDropdown();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  async function confirmSetCurrentSemester(id) {
    pendingSetCurrentId = id;
    const { data } = await api('/api/semesters/' + id + '/impact');
    if (!data || !data.ok) {
      showToast('获取影响范围失败', 'error');
      return;
    }
    const impact = data.data;
    const content = document.getElementById('semesterImpactContent');
    if (impact.isCurrentTarget) {
      content.innerHTML = '该学期已经是当前学期，无需切换。';
      document.getElementById('semesterImpactConfirm').style.display = 'none';
    } else {
      content.innerHTML = `
        <div style="margin-bottom:12px;">将 <strong>${escapeHtml(impact.targetSemesterLabel)}</strong> 设为当前学期：</div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:16px;margin-bottom:12px;">
          <div style="color:var(--danger);margin-bottom:8px;">⚠ 从默认视图消失的数据：</div>
          <div style="padding-left:12px;">
            <div>${impact.coursesLeavingDefault} 门课程</div>
            <div>${impact.enrollmentsLeavingDefault} 条选课记录</div>
          </div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:16px;">
          <div style="color:var(--success);margin-bottom:8px;">✓ 进入默认视图的数据：</div>
          <div style="padding-left:12px;">
            <div>${impact.coursesEnteringDefault} 门课程</div>
            <div>${impact.enrollmentsEnteringDefault} 条选课记录</div>
          </div>
        </div>
      `;
      document.getElementById('semesterImpactConfirm').style.display = '';
    }
    document.getElementById('semesterImpactOverlay').classList.add('show');
  }

  semesterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('semesterEditId').value.trim();
    const academicYear = document.getElementById('academicYear').value.trim();
    const semesterNumber = parseInt(document.getElementById('semesterNumber').value, 10);
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const isCurrent = document.getElementById('isCurrent').checked;
    if (!academicYear || !startDate || !endDate) {
      showToast('请填写完整字段', 'error');
      return;
    }
    const payload = { academicYear, semesterNumber, startDate, endDate, isCurrent };
    if (id) {
      const { data } = await api('/api/semesters/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('保存成功', 'success');
        closeSemesterModal();
        await loadSemesters();
        await refreshSemesterDropdown();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } else {
      const { data } = await api('/api/semesters', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('新增成功', 'success');
        closeSemesterModal();
        await loadSemesters();
        await refreshSemesterDropdown();
      } else {
        showToast((data && data.message) || '新增失败', 'error');
      }
    }
  });

  document.getElementById('semesterModalCancel').addEventListener('click', closeSemesterModal);
  semesterModal.addEventListener('click', (e) => {
    if (e.target === semesterModal) closeSemesterModal();
  });
  document.getElementById('addSemesterBtn').addEventListener('click', openSemesterAdd);

  document.getElementById('semesterImpactCancel').addEventListener('click', () => {
    document.getElementById('semesterImpactOverlay').classList.remove('show');
    pendingSetCurrentId = null;
  });
  document.getElementById('semesterImpactOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('semesterImpactOverlay')) {
      document.getElementById('semesterImpactOverlay').classList.remove('show');
      pendingSetCurrentId = null;
    }
  });
  document.getElementById('semesterImpactConfirm').addEventListener('click', async () => {
    if (!pendingSetCurrentId) return;
    const { data } = await api('/api/semesters/' + pendingSetCurrentId + '/set-current', { method: 'POST' });
    if (data && data.ok) {
      showToast('已切换当前学期', 'success');
      document.getElementById('semesterImpactOverlay').classList.remove('show');
      await loadSemesters();
      await refreshSemesterDropdown();
      currentSemesterId = pendingSetCurrentId;
      document.getElementById('adminSemesterSelect').value = currentSemesterId;
    } else {
      showToast((data && data.message) || '切换失败', 'error');
    }
    pendingSetCurrentId = null;
  });

  async function refreshSemesterDropdown() {
    const { data } = await api('/api/semesters');
    if (data && data.ok && Array.isArray(data.data)) {
      allSemesters = data.data;
      const select = document.getElementById('adminSemesterSelect');
      const prevVal = select.value;
      select.innerHTML = allSemesters.map((s) =>
        `<option value="${s.id}">${escapeHtml(s.academicYear)} 第${s.semesterNumber}学期${s.isCurrent ? ' ★' : ''}</option>`
      ).join('');
      const current = allSemesters.find((s) => s.isCurrent);
      if (prevVal && allSemesters.some((s) => s.id === parseInt(prevVal, 10))) {
        select.value = prevVal;
      } else if (current) {
        select.value = current.id;
        currentSemesterId = current.id;
      }
    }
  }

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
    refreshSemesterDropdown().then(() => {
      const select = document.getElementById('adminSemesterSelect');
      if (select.value) currentSemesterId = parseInt(select.value, 10);
    });
    document.getElementById('adminSemesterSelect').addEventListener('change', (e) => {
      currentSemesterId = e.target.value ? parseInt(e.target.value, 10) : null;
      switchPage(currentPage);
    });
    switchPage('courses');
  }

  init();
})();
