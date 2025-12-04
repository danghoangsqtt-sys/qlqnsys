

const { ipcRenderer } = require('electron');
const bootstrap = require('bootstrap/dist/js/bootstrap.bundle.min.js');

let currentMode = 'login';
let unitsCache = [];
let customFieldsCache = [];
let editingFieldId = null; // Track which field is being edited
let customFieldModal = null; // Bootstrap Modal Instance

// Inject CSS for Modal z-index
const style = document.createElement('style');
style.textContent = `
    .modal { z-index: 10050 !important; }
    .modal-backdrop { z-index: 10040 !important; }
`;
document.head.appendChild(style);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    if (!localStorage.getItem('admin_password')) {
        localStorage.setItem('admin_password', '123456');
    }

    const loginModalEl = document.getElementById('loginModal');
    let loginModal = null;
    if (loginModalEl) {
        loginModal = new bootstrap.Modal(loginModalEl);
    }

    // Init Custom Field Modal
    const cfModalEl = document.getElementById('customFieldModal');
    if (cfModalEl) {
        customFieldModal = new bootstrap.Modal(cfModalEl);
    }

    const btnCommander = document.getElementById('btn-commander');
    if (btnCommander) {
        btnCommander.addEventListener('click', () => {
            if (loginModal) {
                loginModal.show();
                setTimeout(() => {
                    const userField = document.getElementById('loginUsername');
                    if (userField) userField.focus();
                }, 500);
            }
        });
    }

    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('loginUsername').value;
            const p = document.getElementById('loginPassword').value;
            const savedPass = localStorage.getItem('admin_password');

            if (u === 'admin' && p === savedPass) {
                if (loginModal) loginModal.hide();
                enterAdminMode();
                adminLoginForm.reset();
            } else {
                showNotification('Tên đăng nhập hoặc mật khẩu không đúng!', 'danger');
            }
        });
    }

    const btnSoldier = document.getElementById('btn-soldier');
    if (btnSoldier) {
        btnSoldier.addEventListener('click', () => {
            enterKioskMode();
        });
    }

    const unitForm = document.getElementById('unitForm');
    if (unitForm) {
        unitForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newUnitName').value;
            const parent = document.getElementById('newUnitParent').value || null;

            const res = await ipcRenderer.invoke('db:addUnit', { name, parentId: parent });
            if (res.success) {
                document.getElementById('unitForm').reset();
                loadUnitsTree();
                showNotification("Thêm đơn vị thành công.", "success");
            } else {
                showNotification(res.error, "danger");
            }
        });
    }

    const changePassForm = document.getElementById('changePasswordForm');
    if (changePassForm) {
        changePassForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentPass = document.getElementById('currentPassword').value;
            const newPass = document.getElementById('newPassword').value;
            const confirmPass = document.getElementById('confirmNewPassword').value;
            const savedPass = localStorage.getItem('admin_password');

            if (currentPass !== savedPass) {
                showNotification('Mật khẩu hiện tại không đúng', 'danger');
                return;
            }

            if (newPass.length < 4) {
                showNotification('Mật khẩu mới phải có ít nhất 4 ký tự', 'danger');
                return;
            }

            if (newPass !== confirmPass) {
                showNotification('Mật khẩu mới không trùng khớp', 'danger');
                return;
            }

            localStorage.setItem('admin_password', newPass);
            showNotification('Đổi mật khẩu thành công!', 'success');
            changePassForm.reset();
        });
    }

    // --- CUSTOM FIELD FORM SUBMIT HANDLER (CREATE & UPDATE) ---
    const cfForm = document.getElementById('customFieldForm');
    if (cfForm) {
        cfForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const data = {
                display_name: document.getElementById('cfDisplayName').value,
                field_key: document.getElementById('cfKey').value.trim(),
                data_type: document.getElementById('cfType').value,
                unit_id: document.getElementById('cfUnit').value || null,
                is_required: document.getElementById('cfRequired').checked ? 1 : 0
            };

            // Validation: Unique, không dấu, không khoảng trắng
            // Strict Regex: Alphanumeric and underscores only
            const keyRegex = /^[a-zA-Z0-9_]+$/;
            if (!keyRegex.test(data.field_key)) {
                showNotification('Khóa dữ liệu (field_key) không hợp lệ. Chỉ chấp nhận chữ cái không dấu, số và ký tự gạch dưới (_).', 'danger');
                document.getElementById('cfKey').focus();
                return;
            }

            let res;
            if (editingFieldId) {
                // UPDATE
                res = await ipcRenderer.invoke('db:updateCustomField', { id: editingFieldId, data });
            } else {
                // CREATE
                res = await ipcRenderer.invoke('db:addCustomField', data);
            }

            if (res.success) {
                showNotification(editingFieldId ? 'Cập nhật thành công!' : 'Thêm trường dữ liệu mới thành công!', 'success');
                if (customFieldModal) customFieldModal.hide();
                loadCustomFieldManager();
            } else {
                // If it's a constraint error, it likely means key is not unique
                if (res.error && res.error.includes('UNIQUE constraint failed')) {
                    showNotification('Lỗi: Khóa dữ liệu này đã tồn tại. Vui lòng chọn khóa khác.', 'danger');
                } else {
                    showNotification(res.error, 'danger');
                }
            }
        });
    }
});


function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const id = 'toast-' + Date.now();
    const html = `
        <div id="${id}" class="alert alert-${type} toast-modern border-0 alert-dismissible fade show d-flex align-items-center" role="alert">
            <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2 fs-5"></i>
            <div>${message}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);

    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 150);
        }
    }, 4000);
}


function enterAdminMode() {
    currentMode = 'admin';
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('d-none');
            document.getElementById('admin-layout').classList.remove('d-none');
            document.getElementById('kiosk-layout').classList.add('d-none');
            loginScreen.style.opacity = '1';
        }, 300);
    }
    loadUnits();
    loadSoldiers();
    loadUnitsTree();
    showNotification("Đã truy cập chế độ Chỉ huy.", "success");
}

function enterKioskMode() {
    currentMode = 'kiosk';
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('d-none');
            document.getElementById('admin-layout').classList.add('d-none');
            document.getElementById('kiosk-layout').classList.remove('d-none');
            loginScreen.style.opacity = '1';
        }, 300);
    }
    injectForm('#kiosk-form-card .card-body');
}

function injectForm(selector) {
    const formTemplate = document.getElementById('form-template');
    if (formTemplate) {
        const formHtml = formTemplate.innerHTML;
        const container = document.querySelector(selector);
        if (container) {
            container.innerHTML = formHtml;
            loadUnitsForForm();
            setupFormListener(container);
            // Default rows
            window.addBioRow();
            window.addFamilyRow();
            window.addSocialRow('facebook');
            // Fetch initial custom fields (Assuming no unit selected initially or fetch globals)
            renderCustomInputsForUnit(null);

            // Show Admin Custom Field Manager if in Admin Mode
            if (currentMode === 'admin') {
                const adminSection = container.querySelector('#admin-custom-field-manager');
                if (adminSection) {
                    adminSection.classList.remove('d-none');
                    loadCustomFieldManager();
                }
            }
        }
    }
}

function logout() {
    location.reload();
}

function switchAdminView(view) {
    const views = ['dashboard', 'units', 'add', 'settings'];
    const navs = ['nav-dashboard', 'nav-units', 'nav-add-admin', 'nav-settings'];

    views.forEach(v => {
        const el = document.getElementById('view-' + (v === 'add' ? 'add-container' : v));
        if (el) el.classList.add('d-none');
    });
    navs.forEach(n => {
        const el = document.getElementById(n);
        if (el) el.classList.remove('active');
    });

    if (view === 'dashboard') {
        document.getElementById('view-dashboard').classList.remove('d-none');
        document.getElementById('nav-dashboard').classList.add('active');
        document.getElementById('page-title').innerText = "DANH SÁCH QUÂN NHÂN";
        loadSoldiers();
    } else if (view === 'units') {
        document.getElementById('view-units').classList.remove('d-none');
        document.getElementById('nav-units').classList.add('active');
        document.getElementById('page-title').innerText = "QUẢN LÝ ĐƠN VỊ";
        loadUnitsTree();
    } else if (view === 'add') {
        document.getElementById('view-add-container').classList.remove('d-none');
        document.getElementById('nav-add-admin').classList.add('active');
        document.getElementById('page-title').innerText = "NHẬP LIỆU MỚI";
        injectForm('#view-add-container');
    } else if (view === 'settings') {
        document.getElementById('view-settings').classList.remove('d-none');
        document.getElementById('nav-settings').classList.add('active');
        document.getElementById('page-title').innerText = "CÀI ĐẶT HỆ THỐNG";
        // Removed loadCustomFieldManager() as it is now in the form tab
    }
}

// --- ADMIN: CUSTOM FIELDS MANAGER ---

// Load data into table
async function loadCustomFieldManager() {
    const tbody = document.getElementById('customFieldTableBody');
    if (!tbody) return;

    // Load Units for cache
    if (unitsCache.length === 0) await loadUnits();

    // Fetch all fields
    const fields = await ipcRenderer.invoke('db:getCustomFields', 'all');
    // Save to cache for edit lookup
    customFieldsCache = fields;

    tbody.innerHTML = '';
    if (fields.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted small py-4">Chưa có trường tùy chỉnh nào được thiết lập.</td></tr>';
        return;
    }

    fields.forEach(f => {
        const unitName = f.unit_id ? (unitsCache.find(u => u.id === f.unit_id)?.ten_don_vi || 'Unknown ID:' + f.unit_id) : '<span class="badge bg-secondary">Toàn cục</span>';
        const reqBadge = f.is_required ? '<span class="text-danger fw-bold">*</span>' : '';

        tbody.innerHTML += `
            <tr>
                <td class="fw-medium">${f.display_name} ${reqBadge}</td>
                <td><code class="text-primary">${f.field_key}</code></td>
                <td><span class="badge bg-light text-dark border">${f.data_type}</span></td>
                <td>${unitName}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-light border text-primary me-1" onclick="openCustomFieldModal('edit', ${f.id})" title="Sửa"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-sm btn-light border text-danger" onclick="deleteCustomField(${f.id})" title="Xóa"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

// Open Modal logic
window.openCustomFieldModal = async function (mode, id = null) {
    if (!customFieldModal) return;

    // Ensure unit select is populated
    const unitSelect = document.getElementById('cfUnit');
    if (unitSelect && unitSelect.options.length <= 1) {
        if (unitsCache.length === 0) await loadUnits();
        unitSelect.innerHTML = '<option value="">-- Toàn Hệ Thống --</option>';
        unitsCache.forEach(u => {
            unitSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }

    const modalTitle = document.getElementById('customFieldModalTitle');
    const form = document.getElementById('customFieldForm');

    // Reset Form
    form.reset();

    if (mode === 'edit' && id) {
        editingFieldId = id;
        modalTitle.innerText = "Cập Nhật Trường Tùy Chỉnh";

        const field = customFieldsCache.find(f => f.id === id);
        if (field) {
            document.getElementById('cfDisplayName').value = field.display_name;
            document.getElementById('cfKey').value = field.field_key;
            document.getElementById('cfKey').disabled = true; // Key is read-only on edit
            document.getElementById('cfType').value = field.data_type;
            document.getElementById('cfUnit').value = field.unit_id || "";
            document.getElementById('cfRequired').checked = !!field.is_required;
        }
    } else {
        editingFieldId = null;
        modalTitle.innerText = "Thêm Trường Tùy Chỉnh Mới";
        document.getElementById('cfKey').disabled = false;
    }

    customFieldModal.show();
}

window.deleteCustomField = async function (id) {
    if (confirm('CẢNH BÁO: Bạn có chắc muốn xóa trường này? Tất cả dữ liệu đã nhập cho trường này trong hồ sơ quân nhân sẽ bị mất và không thể khôi phục.')) {
        const res = await ipcRenderer.invoke('db:deleteCustomField', id);
        if (res.success) {
            showNotification('Đã xóa trường thành công.', 'success');
            loadCustomFieldManager();
        } else {
            showNotification(res.error, 'danger');
        }
    }
}


async function loadUnits() {
    unitsCache = await ipcRenderer.invoke('db:getUnits');
    const filterSelect = document.getElementById('unitFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">Tất cả đơn vị</option>';
        unitsCache.forEach(u => {
            filterSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }
    const parentSelect = document.getElementById('newUnitParent');
    if (parentSelect) {
        parentSelect.innerHTML = '<option value="">-- Cấp cao nhất --</option>';
        unitsCache.forEach(u => {
            parentSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }
}

async function loadUnitsTree() {
    await loadUnits();
    const container = document.getElementById('unitTreeContainer');
    if (!container) return;
    if (!unitsCache.length) {
        container.innerHTML = '<div class="text-center text-muted py-3">Chưa có đơn vị nào</div>';
        return;
    }
    const buildTree = (parentId) => {
        const children = unitsCache.filter(u => u.cap_tren_id === parentId);
        if (!children.length) return '';
        let html = '<ul class="list-unstyled ps-3 border-start border-2">';
        children.forEach(c => {
            html += `
                <li class="mb-2">
                    <div class="d-flex align-items-center p-2 rounded hover-bg-light" style="cursor: pointer;" onclick="selectUnit(${c.id})">
                        <i class="bi bi-diagram-3 me-2 text-military"></i> 
                        <span class="fw-medium">${c.ten_don_vi}</span>
                    </div>
                    ${buildTree(c.id)}
                </li>
            `;
        });
        html += '</ul>';
        return html;
    };
    container.innerHTML = buildTree(null);
}

window.selectUnit = function (id) {
    if (confirm('Bạn có chắc muốn xóa đơn vị này? Hành động này không thể hoàn tác.')) {
        ipcRenderer.invoke('db:deleteUnit', id).then(res => {
            if (res.success) {
                loadUnitsTree();
                showNotification("Đã xóa đơn vị thành công.", "success");
            } else {
                showNotification(res.error, "danger");
            }
        });
    }
}

async function loadSoldiers() {
    const unitFilterEl = document.getElementById('unitFilter');
    const statusFilterEl = document.getElementById('statusFilter');
    if (!unitFilterEl || !statusFilterEl) return;
    const unitId = unitFilterEl.value;
    const type = statusFilterEl.value;
    const soldiers = await ipcRenderer.invoke('db:getSoldiers', { unitId, type });
    const tbody = document.getElementById('soldierTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (soldiers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i>Không tìm thấy dữ liệu phù hợp</td></tr>`;
        return;
    }
    soldiers.forEach(s => {
        let warning = '';
        if (s.co_vay_no) warning += '<span class="badge bg-warning text-dark me-1"><i class="bi bi-cash"></i> Vay nợ</span>';
        if (s.co_ma_tuy) warning += '<span class="badge bg-danger me-1"><i class="bi bi-exclamation-octagon"></i> Ma túy</span>';
        if (!warning) warning = '<span class="text-muted small">An toàn</span>';
        tbody.innerHTML += `
            <tr>
                <td class="ps-4 text-muted">#${s.id}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="rounded-circle bg-secondary me-2 overflow-hidden" style="width: 32px; height: 32px;">
                             ${s.anh_dai_dien ? `<img src="${s.anh_dai_dien}" style="width:100%;height:100%;object-fit:cover">` : '<i class="bi bi-person-fill text-white p-1"></i>'}
                        </div>
                        <div>
                            <div class="fw-bold text-military">${s.ho_ten}</div>
                            <small class="text-muted">${s.ngay_sinh || '---'}</small>
                        </div>
                    </div>
                </td>
                <td><span class="badge bg-light text-dark border">${s.cap_bac}</span></td>
                <td>${s.don_vi}</td>
                <td>${warning}</td>
                <td class="text-end pe-4">
                    <div class="btn-group">
                        <button class="btn btn-sm btn-light text-primary border" onclick="exportPDF(${s.id})" title="Xuất PDF"><i class="bi bi-file-earmark-pdf"></i></button>
                        <button class="btn btn-sm btn-light text-danger border" onclick="deleteSoldier(${s.id})" title="Xóa"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.exportPDF = async function (id) {
    const res = await ipcRenderer.invoke('sys:exportPDF', id);
    if (res.success) showNotification('Xuất file thành công: ' + res.path, "success");
    else if (!res.cancelled) showNotification('Lỗi xuất file: ' + res.error, "danger");
}

window.deleteSoldier = async function (id) {
    if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa hồ sơ này không?')) {
        await ipcRenderer.invoke('db:deleteSoldier', id);
        loadSoldiers();
        showNotification("Đã xóa hồ sơ thành công.", "success");
    }
}

function loadUnitsForForm() {
    const select = document.querySelector('select[name="don_vi_id"]');
    if (!select) return;

    // Logic to fetch custom fields when unit changes
    select.addEventListener('change', (e) => {
        const unitId = e.target.value;
        const text = select.options[select.selectedIndex]?.text;
        const hiddenInput = document.getElementById('formUnitName');
        if (hiddenInput) hiddenInput.value = text;

        // Render custom inputs
        renderCustomInputsForUnit(unitId);
    });

    const populate = () => {
        select.innerHTML = '<option value="" disabled selected>-- Chọn đơn vị --</option>';
        unitsCache.forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    };
    if (unitsCache.length === 0) {
        ipcRenderer.invoke('db:getUnits').then(units => {
            unitsCache = units;
            populate();
        });
    } else {
        populate();
    }
}

async function renderCustomInputsForUnit(unitId) {
    const container = document.getElementById('customFieldsContainer');
    if (!container) return;

    // Fetch fields
    const fields = await ipcRenderer.invoke('db:getCustomFields', unitId);
    customFieldsCache = fields; // Cache for submission

    container.innerHTML = '';

    if (fields.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted py-3">Không có thông tin bổ sung cho đơn vị này.</div>';
        return;
    }

    fields.forEach(f => {
        let inputHtml = '';
        const requiredAttr = f.is_required ? 'required' : '';
        const label = `<label class="form-label">${f.display_name} ${f.is_required ? '<span class="text-danger">*</span>' : ''}</label>`;

        switch (f.data_type) {
            case 'TEXT':
                inputHtml = `${label}<input type="text" class="form-control custom-field-input" data-key="${f.field_key}" ${requiredAttr}>`;
                break;
            case 'INTEGER':
                inputHtml = `${label}<input type="number" class="form-control custom-field-input" data-key="${f.field_key}" ${requiredAttr}>`;
                break;
            case 'DATE':
                inputHtml = `${label}<input type="date" class="form-control custom-field-input" data-key="${f.field_key}" ${requiredAttr}>`;
                break;
            case 'TEXTAREA':
                inputHtml = `${label}<textarea class="form-control custom-field-input" rows="3" data-key="${f.field_key}" ${requiredAttr}></textarea>`;
                break;
            case 'BOOLEAN':
                inputHtml = `
                    <label class="form-label d-block">${f.display_name}</label>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input custom-field-input" type="radio" name="cf_${f.field_key}" value="1" data-key="${f.field_key}">
                        <label class="form-check-label">Có</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input custom-field-input" type="radio" name="cf_${f.field_key}" value="0" data-key="${f.field_key}" checked>
                        <label class="form-check-label">Không</label>
                    </div>
                `;
                break;
        }

        container.insertAdjacentHTML('beforeend', `<div class="col-md-6">${inputHtml}</div>`);
    });
}

// --- VISIBILITY HANDLERS ---
window.toggleSection = function (id, isShown) {
    const el = document.getElementById(id);
    if (el) {
        if (isShown) el.classList.remove('d-none');
        else el.classList.add('d-none');
    }
};

window.removeRow = function (btn) {
    btn.closest('tr, .social-row').remove();
}

window.addBioRow = function () {
    const tbody = document.getElementById('bioTableBody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="bio-row">
            <td><input type="text" class="form-control form-control-sm bio-time" placeholder="VD: 2015 - 2019"></td>
            <td><input type="text" class="form-control form-control-sm bio-job" placeholder="Làm gì?"></td>
            <td><input type="text" class="form-control form-control-sm bio-place" placeholder="Ở đâu?"></td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
        </tr>
    `);
}

window.addSocialRow = function (type) {
    const container = document.getElementById('container-' + type);
    if (!container) return;
    container.insertAdjacentHTML('beforeend', `
        <div class="social-row input-group mb-2" data-type="${type}">
            <input type="text" class="form-control form-control-sm social-name" placeholder="Tên TK/ID">
            <input type="text" class="form-control form-control-sm social-phone" placeholder="SĐT Đăng ký">
            <button class="btn btn-outline-danger btn-sm" onclick="window.removeRow(this)"><i class="bi bi-trash"></i></button>
        </div>
    `);
}

window.addFamilyRow = function () {
    const tbody = document.getElementById('familyTableBody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="fam-row">
            <td>
                <select class="form-select form-select-sm fam-rel">
                    <option value="Bố">Bố</option><option value="Mẹ">Mẹ</option>
                    <option value="Anh ruột">Anh ruột</option><option value="Chị ruột">Chị ruột</option>
                    <option value="Em ruột">Em ruột</option>
                    <option value="Vợ">Vợ</option><option value="Chồng">Chồng</option>
                    <option value="Con">Con</option>
                    <option value="Bạn thân">Bạn thân</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm fam-name"></td>
            <td><input type="text" class="form-control form-control-sm fam-year"></td>
            <td><input type="text" class="form-control form-control-sm fam-job"></td>
            <td><input type="text" class="form-control form-control-sm fam-add" placeholder="Quê quán/Nơi ở"></td>
            <td><input type="text" class="form-control form-control-sm fam-phone" placeholder="SĐT/Zalo"></td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
        </tr>
    `);
}

window.addChildRow = function () {
    document.getElementById('conList').insertAdjacentHTML('beforeend', `
        <div class="row g-2 mb-2 social-row child-row">
            <div class="col-7"><input type="text" class="form-control form-control-sm c-name" placeholder="Tên con"></div>
            <div class="col-4"><input type="text" class="form-control form-control-sm c-year" placeholder="Năm sinh"></div>
            <div class="col-1"><button class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></div>
        </div>
    `);
}

window.addLoverRow = function () {
    document.getElementById('nyList').insertAdjacentHTML('beforeend', `
        <div class="p-2 border rounded mb-2 social-row lover-row bg-white">
            <div class="d-flex justify-content-between mb-1">
                <small class="fw-bold">Người yêu</small>
                <button class="btn btn-sm btn-light text-danger p-0" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button>
            </div>
            <div class="row g-2">
                <div class="col-6"><input type="text" class="form-control form-control-sm l-name" placeholder="Họ tên"></div>
                <div class="col-6"><input type="text" class="form-control form-control-sm l-year" placeholder="Năm sinh"></div>
                <div class="col-12"><input type="text" class="form-control form-control-sm l-job" placeholder="Nghề nghiệp & Nơi ở"></div>
                <div class="col-12"><input type="text" class="form-control form-control-sm l-phone" placeholder="SĐT Liên hệ"></div>
            </div>
        </div>
    `);
}

window.addForeignRow = function () {
    document.getElementById('foreignRelTable').insertAdjacentHTML('beforeend', `
        <tr class="fr-row">
            <td><input type="text" class="form-control form-control-sm fr-name" placeholder="Ai"></td>
            <td><input type="text" class="form-control form-control-sm fr-rel" placeholder="Quan hệ"></td>
            <td><input type="text" class="form-control form-control-sm fr-country" placeholder="Nước nào"></td>
            <td style="width:30px"><button class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
        </tr>
    `);
}

window.addTravelRow = function () {
    document.getElementById('travelTable').insertAdjacentHTML('beforeend', `
        <tr class="tr-row">
            <td><input type="text" class="form-control form-control-sm tr-country" placeholder="Nước"></td>
            <td><input type="text" class="form-control form-control-sm tr-purpose" placeholder="Mục đích"></td>
            <td><input type="text" class="form-control form-control-sm tr-time" placeholder="Thời gian"></td>
            <td style="width:30px"><button class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
        </tr>
    `);
}

function setupFormListener(container) {
    const form = container.querySelector('#soldierForm');
    const imgInput = container.querySelector('#imageInput');
    const imgPreview = container.querySelector('#imagePreview');

    if (imgInput && imgPreview) {
        imgInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) imgPreview.src = URL.createObjectURL(file);
        };
    }

    // Listener to toggle the 'Other' guardian section
    const otherGuardianCheck = document.getElementById('checkKhac');
    if (otherGuardianCheck) {
        otherGuardianCheck.addEventListener('change', e => {
            window.toggleSection('divNguoiNuoiDuong', e.target.checked);
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            showNotification("Vui lòng điền đầy đủ thông tin bắt buộc", "danger");
            return;
        }

        // --- 1. Basic Fields (FormData) ---
        const formData = new FormData(e.target);
        // Note: FormData handling of checkboxes with same name needs manual extraction
        // But for unique names it works fine via Object.fromEntries
        const data = Object.fromEntries(formData.entries());

        // Explicitly handle da_tot_nghiep (Radio) if it wasn't picked up or defaults are tricky
        // (already picked up by name="da_tot_nghiep")

        // --- 2. Handle Image ---
        if (imgInput.files[0] && imgInput.files[0].path) {
            data.anh_dai_dien = await ipcRenderer.invoke('sys:saveImage', imgInput.files[0].path);
        } else {
            data.anh_dai_dien = null;
        }

        // --- 3. Pack JSON Data ---

        // Bio
        const bioList = [];
        container.querySelectorAll('.bio-row').forEach(row => {
            const t = row.querySelector('.bio-time').value;
            if (t) {
                bioList.push({
                    time: t,
                    job: row.querySelector('.bio-job').value,
                    place: row.querySelector('.bio-place').value
                });
            }
        });
        data.tieu_su_ban_than = JSON.stringify(bioList);

        // Social
        const social = { facebook: [], zalo: [], tiktok: [] };
        ['facebook', 'zalo', 'tiktok'].forEach(type => {
            container.querySelectorAll(`.social-row[data-type="${type}"]`).forEach(row => {
                const n = row.querySelector('.social-name').value;
                if (n) {
                    social[type].push({
                        name: n,
                        phone: row.querySelector('.social-phone').value
                    });
                }
            });
        });
        data.mang_xa_hoi = JSON.stringify(social);

        // Living Condition (Handling Checkboxes manually)
        const livingWith = [];
        container.querySelectorAll('input[name="song_chung_voi_option"]:checked').forEach(cb => {
            livingWith.push(cb.value);
        });
        const songChungStr = livingWith.length > 0 ? livingWith.join(' và ') : (document.getElementById('checkKhac').checked ? 'Khác' : '');

        const guardian = document.getElementById('checkKhac').checked ? {
            ten: document.getElementById('nnd_ten').value,
            nghe: document.getElementById('nnd_nghe').value,
            diachi: document.getElementById('nnd_diachi').value
        } : null;

        data.hoan_canh_song = JSON.stringify({
            song_chung_voi: songChungStr,
            chi_tiet_nguoi_nuoi_duong: guardian,
            ly_do_khong_song_cung_bo_me: data.ly_do_khong_song_cung_bo_me
        });

        // Family Relations
        const isMarried = document.querySelector('input[name="radioVo"]:checked').value === '1';
        const hasChildren = document.querySelector('input[name="radioCon"]:checked').value === '1';

        const family = {
            vo: isMarried ? {
                ho_ten: document.getElementById('vo_ten').value,
                nam_sinh: document.getElementById('vo_ns').value,
                sdt: document.getElementById('vo_sdt').value,
                nghe_nghiep: document.getElementById('vo_nghe').value,
                noi_o: document.getElementById('vo_diachi').value
            } : null,
            con: [],
            nguoi_yeu: [],
            cha_me_anh_em: []
        };

        if (hasChildren) {
            container.querySelectorAll('.child-row').forEach(row => {
                family.con.push({
                    ten: row.querySelector('.c-name').value,
                    ns: row.querySelector('.c-year').value
                });
            });
        }

        if (document.getElementById('checkNY').checked) {
            container.querySelectorAll('.lover-row').forEach(row => {
                family.nguoi_yeu.push({
                    ten: row.querySelector('.l-name').value,
                    ns: row.querySelector('.l-year').value,
                    nghe_o: row.querySelector('.l-job').value,
                    sdt: row.querySelector('.l-phone').value
                });
            });
        }

        container.querySelectorAll('.fam-row').forEach(row => {
            const name = row.querySelector('.fam-name').value;
            if (name) {
                family.cha_me_anh_em.push({
                    quan_he: row.querySelector('.fam-rel').value,
                    ho_ten: name,
                    nam_sinh: row.querySelector('.fam-year').value,
                    nghe_nghiep: row.querySelector('.fam-job').value,
                    cho_o: row.querySelector('.fam-add').value,
                    sdt: row.querySelector('.fam-phone').value
                });
            }
        });
        data.quan_he_gia_dinh = JSON.stringify(family);

        // General Family Info
        const familyInfo = {
            nghe_nghiep_chinh: document.getElementById('gd_nghe_nghiep_chinh').value,
            muc_song: document.getElementById('gd_muc_song').value,
            lich_su_vi_pham_nguoi_than: {
                co_khong: document.getElementById('checkFamilyCrime').checked,
                chi_tiet: document.getElementById('gd_vi_pham_chi_tiet').value
            },
            lich_su_covid_gia_dinh: document.getElementById('gd_lich_su_covid').value
        };
        data.thong_tin_gia_dinh_chung = JSON.stringify(familyInfo);

        // Foreign
        const hasForeignRel = document.querySelector('input[name="radioForeignRel"]:checked').value === '1';
        const hasTraveled = document.querySelector('input[name="radioTravel"]:checked').value === '1';
        const hasPassport = document.querySelector('input[name="radioPassport"]:checked').value === '1';
        const isMigrating = document.querySelector('input[name="radioImmigration"]:checked').value === '1';

        const foreign = {
            than_nhan: [],
            di_nuoc_ngoai: [],
            ho_chieu: hasPassport ? {
                da_co: true,
                du_dinh_nuoc: document.getElementById('pp_dest').value
            } : { da_co: false },
            xuat_canh_dinh_cu: isMigrating ? {
                dang_lam_thu_tuc: true,
                nuoc: document.getElementById('im_country').value,
                nguoi_bao_lanh: document.getElementById('im_sponsor').value
            } : { dang_lam_thu_tuc: false }
        };

        if (hasForeignRel) {
            container.querySelectorAll('.fr-row').forEach(row => {
                foreign.than_nhan.push({
                    ten: row.querySelector('.fr-name').value,
                    qh: row.querySelector('.fr-rel').value,
                    nuoc: row.querySelector('.fr-country').value
                });
            });
        }
        if (hasTraveled) {
            container.querySelectorAll('.tr-row').forEach(row => {
                foreign.di_nuoc_ngoai.push({
                    nuoc: row.querySelector('.tr-country').value,
                    muc_dich: row.querySelector('.tr-purpose').value,
                    thoi_gian: row.querySelector('.tr-time').value
                });
            });
        }
        data.yeu_to_nuoc_ngoai = JSON.stringify(foreign);

        // Separate Column for Foreign Violation
        data.vi_pham_nuoc_ngoai = hasTraveled ? document.getElementById('foreign_violation').value : '';

        // History / Violations
        const violations = {
            vi_pham_dia_phuong: document.querySelector('input[name="vp_local"]:checked').value === '1' ? {
                co_khong: true,
                noi_dung: document.getElementById('vp_local_content').value,
                ket_qua: document.getElementById('vp_local_result').value
            } : { co_khong: false },
            danh_bac: document.querySelector('input[name="vp_gambling"]:checked').value === '1' ? {
                co_khong: true,
                hinh_thuc: document.getElementById('gb_form').value,
                dia_diem: document.getElementById('gb_place').value,
                doi_tuong: document.getElementById('gb_partner').value
            } : { co_khong: false },
            ma_tuy: document.querySelector('input[name="vp_drugs"]:checked').value === '1' ? {
                co_khong: true,
                thoi_gian: document.getElementById('dr_time').value,
                loai: document.getElementById('dr_type').value,
                so_lan: document.getElementById('dr_count').value,
                doi_tuong: document.getElementById('dr_partner').value,
                xu_ly: document.getElementById('dr_result').value,
                hinh_thuc_xu_ly: document.getElementById('dr_details').value
            } : { co_khong: false }
        };
        data.lich_su_vi_pham = JSON.stringify(violations);

        // Set Filter Flags
        data.co_danh_bac = violations.danh_bac.co_khong ? 1 : 0;
        data.co_ma_tuy = violations.ma_tuy.co_khong ? 1 : 0;

        // Finance / Health
        const hasDebt = document.querySelector('input[name="radioDebt"]:checked').value === '1';
        const hasBusiness = document.querySelector('input[name="radioBusiness"]:checked').value === '1';
        const hasCovid = document.querySelector('input[name="radioCovid"]:checked').value === '1';

        const finance = {
            vay_no: hasDebt ? {
                co_khong: true,
                ai_vay: document.getElementById('debt_who').value,
                nguoi_dung_ten: document.getElementById('debt_borrower_name').value,
                so_tien: document.getElementById('debt_amount').value,
                muc_dich: document.getElementById('debt_purpose').value,
                hinh_thuc: document.getElementById('debt_type').value,
                han_tra: document.getElementById('debt_deadline').value,
                gia_dinh_biet: document.getElementById('debt_family_knows').checked,
                nguoi_tra: document.getElementById('debt_payer').value
            } : { co_khong: false },
            kinh_doanh: hasBusiness ? {
                co_khong: true,
                chi_tiet: document.getElementById('bus_details').value
            } : { co_khong: false },
            covid_ban_than: hasCovid ? {
                da_mac: true,
                thoi_gian: document.getElementById('covid_time').value
            } : { da_mac: false }
        };
        data.tai_chinh_suc_khoe = JSON.stringify(finance);
        data.co_vay_no = finance.vay_no.co_khong ? 1 : 0;

        // --- 4. Capture Custom Fields ---
        const customData = {};
        const customInputs = container.querySelectorAll('.custom-field-input');
        customInputs.forEach(input => {
            const key = input.dataset.key;
            if (input.type === 'radio') {
                if (input.checked) customData[key] = input.value;
            } else {
                customData[key] = input.value;
            }
        });
        data.custom_data = JSON.stringify(customData);

        // Submit
        const res = await ipcRenderer.invoke('db:addSoldier', data);
        if (res.success) {
            showNotification('Lưu hồ sơ thành công!', "success");
            // Reload View
            if (currentMode === 'kiosk') {
                container.innerHTML = document.getElementById('form-template').innerHTML;
                setupFormListener(container);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Re-init default for unit (fetch globals)
                renderCustomInputsForUnit(null);
            } else {
                switchAdminView('dashboard');
            }
        } else {
            showNotification('Lỗi: ' + res.error, "danger");
        }
    });
}
