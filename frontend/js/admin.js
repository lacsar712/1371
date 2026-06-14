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
    document.getElementById('page-organization').style.display = page === 'organization' ? '' : 'none';
    document.getElementById('page-courses').style.display = page === 'courses' ? '' : 'none';
    document.getElementById('page-teachers').style.display = page === 'teachers' ? '' : 'none';
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (page === 'organization') {
      title.textContent = '组织架构';
      subtitle.textContent = '管理学院、专业、班级与学生归属';
      loadOrgTree();
    } else if (page === 'courses') {
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
    switchPage('organization');
  }

  init();
})();
