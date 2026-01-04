
const { ipcRenderer } = require('electron');
const bootstrap = require('bootstrap/dist/js/bootstrap.bundle.min.js');

let currentMode = 'login'; 
let unitsCache = [];
let customFieldsCache = [];
let editingFieldId = null; 
let editingSoldierId = null; 
let customFieldModal = null; 

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
    
    const cfModalEl = document.getElementById('customFieldModal');
    if (cfModalEl) {
        customFieldModal = new bootstrap.Modal(cfModalEl);
    }

    // --- PASSWORD & CAPSLOCK HANDLERS ---
    setupPasswordToggles();
    setupCapsLockDetection();

    // --- KEYBOARD SHORTCUTS HANDLER ---
    setupKeyboardShortcuts();

    const btnCommander = document.getElementById('btn-commander');
    if (btnCommander) {
        btnCommander.addEventListener('click', () => {
            if (loginModal) {
                loginModal.show();
                setTimeout(() => {
                    const userField = document.getElementById('loginUsername');
                    if(userField) userField.focus();
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

            // NEW: Strong Password Validation (8+ chars, uppercase, special char)
            const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])[a-zA-Z0-9!@#$%^&*(),.?":{}|<>]{8,}$/;
            if (!passwordRegex.test(newPass)) {
                 showNotification('Mật khẩu mới không đủ mạnh! Cần ít nhất 8 ký tự, bao gồm 1 chữ cái viết HOA và 1 ký tự đặc biệt.', 'danger');
                 return;
            }

            if (newPass !== confirmPass) {
                showNotification('Xác nhận mật khẩu mới không trùng khớp.', 'danger');
                return;
            }

            localStorage.setItem('admin_password', newPass);
            showNotification('Đổi mật khẩu quản trị thành công!', 'success');
            changePassForm.reset();
        });
    }

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
            const keyRegex = /^[a-zA-Z0-9_]+$/;
            if (!keyRegex.test(data.field_key)) {
                showNotification('Khóa dữ liệu (field_key) không hợp lệ. Chỉ chấp nhận chữ cái không dấu, số và ký tự gạch dưới (_).', 'danger');
                document.getElementById('cfKey').focus();
                return;
            }
            let res;
            if (editingFieldId) {
                res = await ipcRenderer.invoke('db:updateCustomField', { id: editingFieldId, data });
            } else {
                res = await ipcRenderer.invoke('db:addCustomField', data);
            }
            if (res.success) {
                showNotification(editingFieldId ? 'Cập nhật thành công!' : 'Thêm trường dữ liệu mới thành công!', 'success');
                if (customFieldModal) customFieldModal.hide();
                loadCustomFieldManager();
            } else {
                if (res.error && res.error.includes('UNIQUE constraint failed')) {
                    showNotification('Lỗi: Khóa dữ liệu này đã tồn tại. Vui lòng chọn khóa khác.', 'danger');
                } else {
                    showNotification(res.error, 'danger');
                }
            }
        });
    }
});

// --- HELPER FUNCTIONS ---

/**
 * Lắng nghe sự kiện phím tắt toàn hệ thống
 */
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        // Chế độ Admin mới có hiệu lực các phím Alt + Số
        if (currentMode === 'admin') {
            // Chuyển tab Menu (Alt + 1,2,3,4)
            if (e.altKey && e.key === '1') switchAdminView('dashboard');
            if (e.altKey && e.key === '2') switchAdminView('units');
            if (e.altKey && e.key === '3') switchAdminView('add');
            if (e.altKey && e.key === '4') switchAdminView('settings');

            // Thêm mới (Alt + N)
            if (e.altKey && (e.key === 'n' || e.key === 'N')) switchAdminView('add');

            // Làm mới (Alt + R)
            if (e.altKey && (e.key === 'r' || e.key === 'R')) loadSoldiers();

            // Tìm kiếm (Alt + S)
            if (e.altKey && (e.key === 's' || e.key === 'S')) {
                const searchInput = document.getElementById('globalSearchInput');
                if (searchInput) {
                    e.preventDefault(); // Ngăn chặn lưu file của trình duyệt
                    switchAdminView('dashboard');
                    searchInput.focus();
                }
            }
        }

        // Đăng xuất / Quay lại (Esc)
        if (e.key === 'Escape') {
            // Nếu đang trong form Nhập liệu ở Admin, có thể quay lại dashboard thay vì logout
            const addView = document.getElementById('view-add-container');
            if (currentMode === 'admin' && addView && !addView.classList.contains('d-none')) {
                switchAdminView('dashboard');
            } else if (currentMode !== 'login') {
                window.logout();
            }
        }
    });
}

function setupPasswordToggles() {
    const toggleBtns = document.querySelectorAll('.toggle-password');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('.password-input');
            const icon = btn.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('bi-eye', 'bi-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('bi-eye-slash', 'bi-eye');
            }
        });
    });
}

function setupCapsLockDetection() {
    const passwordInputs = document.querySelectorAll('.password-input');
    passwordInputs.forEach(input => {
        const warning = input.closest('.mb-3, .mb-4').querySelector('.caps-warning');
        
        const checkCapsLock = (event) => {
            if (event.getModifierState && event.getModifierState('CapsLock')) {
                if (warning) warning.style.display = 'block';
            } else {
                if (warning) warning.style.display = 'none';
            }
        };

        input.addEventListener('keydown', checkCapsLock);
        input.addEventListener('keyup', checkCapsLock);
        input.addEventListener('focus', checkCapsLock);
        input.addEventListener('blur', () => {
            if (warning) warning.style.display = 'none';
        });
    });
}

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
    const adminLayout = document.getElementById('admin-layout');
    const kioskLayout = document.getElementById('kiosk-layout');
    
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('d-none');
            if (adminLayout) adminLayout.classList.remove('d-none');
            if (kioskLayout) kioskLayout.classList.add('d-none');
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
    const adminLayout = document.getElementById('admin-layout');
    const kioskLayout = document.getElementById('kiosk-layout');

    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('d-none');
            if (adminLayout) adminLayout.classList.add('d-none');
            if (kioskLayout) kioskLayout.classList.remove('d-none');
            loginScreen.style.opacity = '1';
        }, 300);
    }
    injectForm('#kiosk-form-card .card-body');
}

window.logout = function() {
    currentMode = 'login';
    const loginScreen = document.getElementById('login-screen');
    const adminLayout = document.getElementById('admin-layout');
    const kioskLayout = document.getElementById('kiosk-layout');

    if (loginScreen) {
        if (adminLayout) adminLayout.classList.add('d-none');
        if (kioskLayout) kioskLayout.classList.add('d-none');
        loginScreen.classList.remove('d-none');
        loginScreen.style.opacity = '1';
        location.reload();
    }
};

async function injectForm(selector, soldierId = null) {
    const formTemplate = document.getElementById('form-template');
    if (formTemplate) {
        const formHtml = formTemplate.innerHTML;
        const container = document.querySelector(selector);
        if (container) {
            container.innerHTML = formHtml;
            loadUnitsForForm();
            setupFormListener(container);

            if (soldierId) {
                editingSoldierId = soldierId;
                const submitBtn = container.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>CẬP NHẬT HỒ SƠ';
                }
                const soldier = await ipcRenderer.invoke('db:getSoldier', soldierId);
                if (soldier) {
                    populateForm(container, soldier);
                } else {
                    showNotification("Không tìm thấy dữ liệu quân nhân!", "danger");
                }
            } else {
                editingSoldierId = null;
                window.addBioRow();
                window.addFamilyRow();
                window.addSocialRow('facebook');
                renderCustomInputsForUnit(null);
            }
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

async function populateForm(container, s) {
    const inputs = container.querySelectorAll('input:not([type=radio]):not([type=checkbox]), select, textarea');
    inputs.forEach(input => {
        if (input.name && s[input.name] !== undefined) {
            input.value = s[input.name];
        }
    });
    if (s.anh_dai_dien) {
    // Chuyển đổi đường dẫn ổ đĩa thành định dạng mà phần mềm hiểu được
    const cleanPath = s.anh_dai_dien.replace(/\\/g, '/');
    container.querySelector('#imagePreview').src = `file:///${cleanPath}?t=${Date.now()}`;
    }
    if (s.da_tot_nghiep !== undefined) {
        const rad = container.querySelector(`input[name="da_tot_nghiep"][value="${s.da_tot_nghiep}"]`);
        if (rad) rad.checked = true;
    }
    if (s.don_vi_id) {
        await renderCustomInputsForUnit(s.don_vi_id);
    }
    const bio = JSON.parse(s.tieu_su_ban_than || '[]');
    const bioTbody = document.getElementById('bioTableBody');
    if (bioTbody) {
        bioTbody.innerHTML = '';
        bio.forEach(b => {
            window.addBioRow();
            const rows = bioTbody.querySelectorAll('.bio-row');
            const last = rows[rows.length - 1];
            last.querySelector('.bio-time').value = b.time || '';
            last.querySelector('.bio-job').value = b.job || '';
            last.querySelector('.bio-place').value = b.place || '';
        });
    }
    const social = JSON.parse(s.mang_xa_hoi || '{}');
    ['facebook', 'zalo', 'tiktok'].forEach(type => {
        const div = document.getElementById('container-' + type);
        if (div && social[type]) {
            div.innerHTML = ''; 
            social[type].forEach(acc => {
                window.addSocialRow(type);
                const rows = div.querySelectorAll('.social-row');
                const last = rows[rows.length - 1];
                last.querySelector('.social-name').value = acc.name || '';
                last.querySelector('.social-phone').value = acc.phone || '';
            });
        }
    });
    const living = JSON.parse(s.hoan_canh_song || '{}');
    if (living.song_chung_voi) {
        const parts = living.song_chung_voi.split(' và ');
        parts.forEach(p => {
            const cb = container.querySelector(`input[name="song_chung_voi_option"][value="${p}"]`);
            if (cb) cb.checked = true;
        });
        if (living.song_chung_voi.includes('Khác') || living.chi_tiet_nguoi_nuoi_duong) {
            const ck = document.getElementById('checkKhac');
            if (ck) {
                ck.checked = true;
                window.toggleSection('divNguoiNuoiDuong', true);
            }
        }
    }
    if (living.chi_tiet_nguoi_nuoi_duong) {
        document.getElementById('nnd_ten').value = living.chi_tiet_nguoi_nuoi_duong.ten || '';
        document.getElementById('nnd_nghe').value = living.chi_tiet_nguoi_nuoi_duong.nghe || '';
        document.getElementById('nnd_diachi').value = living.chi_tiet_nguoi_nuoi_duong.diachi || '';
    }
    if (living.ly_do_khong_song_cung_bo_me) {
        container.querySelector('textarea[name="ly_do_khong_song_cung_bo_me"]').value = living.ly_do_khong_song_cung_bo_me;
    }
    const famInfo = JSON.parse(s.thong_tin_gia_dinh_chung || '{}');
    document.getElementById('gd_nghe_nghiep_chinh').value = famInfo.nghe_nghiep_chinh || '';
    document.getElementById('gd_muc_song').value = famInfo.muc_song || 'Đủ ăn';
    document.getElementById('gd_lich_su_covid').value = famInfo.lich_su_covid_gia_dinh || '';
    if (famInfo.lich_su_vi_pham_nguoi_than?.co_khong) {
        document.getElementById('checkFamilyCrime').checked = true;
        window.toggleSection('divFamilyCrime', true);
        document.getElementById('gd_vi_pham_chi_tiet').value = famInfo.lich_su_vi_pham_nguoi_than.chi_tiet || '';
    }
    const famRel = JSON.parse(s.quan_he_gia_dinh || '{}');
    const famBody = document.getElementById('familyTableBody');
    if (famBody && famRel.cha_me_anh_em) {
        famBody.innerHTML = '';
        famRel.cha_me_anh_em.forEach(f => {
            window.addFamilyRow();
            const rows = famBody.querySelectorAll('.fam-row');
            const last = rows[rows.length - 1];
            last.querySelector('.fam-rel').value = f.quan_he || 'Bố';
            last.querySelector('.fam-name').value = f.ho_ten || '';
            last.querySelector('.fam-year').value = f.nam_sinh || '';
            last.querySelector('.fam-job').value = f.nghe_nghiep || '';
            last.querySelector('.fam-add').value = f.cho_o || '';
            last.querySelector('.fam-phone').value = f.sdt || '';
        });
    }
    if (famRel.vo) {
        const r = container.querySelector('input[name="radioVo"][value="1"]');
        if (r) { r.checked = true; window.toggleSection('divVoDetails', true); }
        document.getElementById('vo_ten').value = famRel.vo.ho_ten || '';
        document.getElementById('vo_ns').value = famRel.vo.nam_sinh || '';
        document.getElementById('vo_sdt').value = famRel.vo.sdt || '';
        document.getElementById('vo_nghe').value = famRel.vo.nghe_nghiep || '';
        document.getElementById('vo_diachi').value = famRel.vo.noi_o || '';
    }
    if (famRel.con && famRel.con.length > 0) {
         const r = container.querySelector('input[name="radioCon"][value="1"]');
         if (r) { r.checked = true; window.toggleSection('divConDetails', true); }
         const cList = document.getElementById('conList');
         cList.innerHTML = '';
         famRel.con.forEach(c => {
             window.addChildRow();
             const rows = cList.querySelectorAll('.child-row');
             const last = rows[rows.length - 1];
             last.querySelector('.c-name').value = c.ten || '';
             last.querySelector('.c-year').value = c.ns || '';
         });
    }
    if (famRel.nguoi_yeu && famRel.nguoi_yeu.length > 0) {
        const ck = document.getElementById('checkNY');
        if (ck) { ck.checked = true; window.toggleSection('divNYDetails', true); }
        const nyList = document.getElementById('nyList');
        nyList.innerHTML = '';
        famRel.nguoi_yeu.forEach(ny => {
            window.addLoverRow();
            const rows = nyList.querySelectorAll('.lover-row');
            const last = rows[rows.length - 1];
            last.querySelector('.l-name').value = ny.ten || '';
            last.querySelector('.l-year').value = ny.ns || '';
            last.querySelector('.l-job').value = ny.nghe_o || '';
            last.querySelector('.l-phone').value = ny.sdt || '';
        });
    }
    const foreign = JSON.parse(s.yeu_to_nuoc_ngoai || '{}');
    if (foreign.than_nhan && foreign.than_nhan.length > 0) {
        const r = container.querySelector('input[name="radioForeignRel"][value="1"]');
        if (r) { r.checked = true; window.toggleSection('divForeignRel', true); }
        const ft = document.getElementById('foreignRelTable');
        ft.innerHTML = '';
        foreign.than_nhan.forEach(x => {
            window.addForeignRow();
            const rows = document.querySelectorAll('.fr-row');
            const last = rows[rows.length - 1];
            last.querySelector('.fr-name').value = x.ten || '';
            last.querySelector('.fr-rel').value = x.qh || '';
            last.querySelector('.fr-country').value = x.nuoc || '';
        });
    }
    if (foreign.di_nuoc_ngoai && foreign.di_nuoc_ngoai.length > 0) {
        const r = container.querySelector('input[name="radioTravel"][value="1"]');
        if (r) { r.checked = true; window.toggleSection('divTravel', true); }
        const tt = document.getElementById('travelTable');
        tt.innerHTML = '';
        foreign.di_nuoc_ngoai.forEach(x => {
            window.addTravelRow();
            const rows = document.querySelectorAll('.tr-row');
            const last = rows[rows.length - 1];
            last.querySelector('.tr-country').value = x.nuoc || '';
            last.querySelector('.tr-purpose').value = x.muc_dich || '';
            last.querySelector('.tr-time').value = x.thoi_gian || '';
        });
    }
    if (s.vi_pham_nuoc_ngoai) {
        document.getElementById('foreign_violation').value = s.vi_pham_nuoc_ngoai;
    }
    if (foreign.ho_chieu?.da_co) {
        const r = container.querySelector('input[name="radioPassport"][value="1"]');
        if (r) { r.checked = true; window.toggleSection('divPassport', true); }
        document.getElementById('pp_dest').value = foreign.ho_chieu.du_dinh_nuoc || '';
    }
    if (foreign.xuat_canh_dinh_cu?.dang_lam_thu_tuc) {
        const r = container.querySelector('input[name="radioImmigration"][value="1"]');
        if (r) { r.checked = true; window.toggleSection('divImmigration', true); }
        document.getElementById('im_country').value = foreign.xuat_canh_dinh_cu.nuoc || '';
        document.getElementById('im_sponsor').value = foreign.xuat_canh_dinh_cu.nguoi_bao_lanh || '';
    }
    const v = JSON.parse(s.lich_su_vi_pham || '{}');
    if (v.vi_pham_dia_phuong?.co_khong) {
        container.querySelector('input[name="vp_local"][value="1"]').checked = true;
        window.toggleSection('divVPLocal', true);
        document.getElementById('vp_local_content').value = v.vi_pham_dia_phuong.noi_dung || '';
        document.getElementById('vp_local_result').value = v.vi_pham_dia_phuong.ket_qua || '';
    }
    if (v.danh_bac?.co_khong) {
        container.querySelector('input[name="vp_gambling"][value="1"]').checked = true;
        window.toggleSection('divGambling', true);
        document.getElementById('gb_form').value = v.danh_bac.hinh_thuc || '';
        document.getElementById('gb_partner').value = v.danh_bac.doi_tuong || '';
        document.getElementById('gb_place').value = v.danh_bac.dia_diem || '';
    }
    if (v.ma_tuy?.co_khong) {
        container.querySelector('input[name="vp_drugs"][value="1"]').checked = true;
        window.toggleSection('divDrugs', true);
        document.getElementById('dr_time').value = v.ma_tuy.thoi_gian || '';
        document.getElementById('dr_type').value = v.ma_tuy.loai || '';
        document.getElementById('dr_count').value = v.ma_tuy.so_lan || '';
        document.getElementById('dr_partner').value = v.ma_tuy.doi_tuong || '';
        document.getElementById('dr_result').value = v.ma_tuy.xu_ly || '';
        document.getElementById('dr_details').value = v.ma_tuy.hinh_thuc_xu_ly || '';
    }
    const fin = JSON.parse(s.tai_chinh_suc_khoe || '{}');
    if (fin.vay_no?.co_khong) {
        container.querySelector('input[name="radioDebt"][value="1"]').checked = true;
        window.toggleSection('divDebt', true);
        document.getElementById('debt_borrower_name').value = fin.vay_no.nguoi_dung_ten || '';
        document.getElementById('debt_payer').value = fin.vay_no.nguoi_tra || '';
        document.getElementById('debt_who').value = fin.vay_no.ai_vay || '';
        document.getElementById('debt_amount').value = fin.vay_no.so_tien || '';
        document.getElementById('debt_deadline').value = fin.vay_no.han_tra || '';
        document.getElementById('debt_type').value = fin.vay_no.hinh_thuc || '';
        document.getElementById('debt_purpose').value = fin.vay_no.muc_dich || '';
        if (fin.vay_no.gia_dinh_biet) document.getElementById('debt_family_knows').checked = true;
    }
    if (fin.kin_doanh?.co_khong) {
        container.querySelector('input[name="radioBusiness"][value="1"]').checked = true;
        window.toggleSection('divBusiness', true);
        document.getElementById('bus_details').value = fin.kinh_doanh.chi_tiet || '';
    }
    if (fin.covid_ban_than?.da_mac) {
         container.querySelector('input[name="radioCovid"][value="1"]').checked = true;
         window.toggleSection('divCovid', true);
         document.getElementById('covid_time').value = fin.covid_ban_than.thoi_gian || '';
    }
    const cd = JSON.parse(s.custom_data || '{}');
    setTimeout(() => {
        Object.keys(cd).forEach(key => {
            const input = container.querySelector(`.custom-field-input[data-key="${key}"]:not([type="radio"])`);
            if (input) {
                input.value = cd[key];
            }
            const radios = container.querySelectorAll(`.custom-field-input[data-key="${key}"][type="radio"]`);
            radios.forEach(r => {
                if (r.value == cd[key]) r.checked = true;
            });
        });
    }, 100);
}

function switchAdminView(view, id = null) {
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
        injectForm('#view-add-container', null); 
    } else if (view === 'edit') {
        document.getElementById('view-add-container').classList.remove('d-none');
        document.getElementById('page-title').innerText = "CHI TIẾT HỒ SƠ";
        injectForm('#view-add-container', id); 
    } else if (view === 'settings') {
        document.getElementById('view-settings').classList.remove('d-none');
        document.getElementById('nav-settings').classList.add('active');
        document.getElementById('page-title').innerText = "CÀI ĐẶT & HƯỚNG DẪN";
    }
}

window.viewSoldierDetails = function(id) {
    switchAdminView('edit', id);
}

async function loadCustomFieldManager() {
    const tbody = document.getElementById('customFieldTableBody');
    if (!tbody) return;
    if (unitsCache.length === 0) await loadUnits();
    const fields = await ipcRenderer.invoke('db:getCustomFields', 'all');
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

window.openCustomFieldModal = async function(mode, id = null) {
    if (!customFieldModal) return;
    const unitSelect = document.getElementById('cfUnit');
    if (unitSelect && unitSelect.options.length <= 1) {
        if(unitsCache.length === 0) await loadUnits();
        unitSelect.innerHTML = '<option value="">-- Toàn Hệ Thống --</option>';
        unitsCache.forEach(u => {
            unitSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }
    const modalTitle = document.getElementById('customFieldModalTitle');
    const form = document.getElementById('customFieldForm');
    form.reset();
    if (mode === 'edit' && id) {
        editingFieldId = id;
        modalTitle.innerText = "Cập Nhật Trường Tùy Chỉnh";
        const field = customFieldsCache.find(f => f.id === id);
        if (field) {
            document.getElementById('cfDisplayName').value = field.display_name;
            document.getElementById('cfKey').value = field.field_key;
            document.getElementById('cfKey').disabled = true; 
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

window.deleteCustomField = async function(id) {
    if(confirm('CẢNH BÁO: Bạn có chắc muốn xóa trường này? Tất cả dữ liệu đã nhập cho trường này trong hồ sơ quân nhân sẽ bị mất và không thể khôi phục.')) {
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
    const searchInputEl = document.getElementById('globalSearchInput'); 
    if (!unitFilterEl || !statusFilterEl || !searchInputEl) return;
    const unitId = unitFilterEl.value;
    const type = statusFilterEl.value;
    const keyword = searchInputEl.value; 
    const soldiers = await ipcRenderer.invoke('db:getSoldiers', { unitId, type, keyword });
    const tbody = document.getElementById('soldierTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (soldiers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i>Không tìm thấy dữ liệu phù hợp</td></tr>`;
        return;
    }
    soldiers.forEach(s => {
        // --- 1. PHÂN TÍCH DỮ LIỆU JSON ĐỂ LỌC TRẠNG THÁI ---
        const famInfo = JSON.parse(s.thong_tin_gia_dinh_chung || '{}');
        const isPoor = famInfo.muc_song === 'Khó khăn';
        
        // --- 2. XÂY DỰNG HỆ THỐNG BADGE CẢNH BÁO ---
        let warnings = [];
        
        // Nhóm trạng thái Chính trị
        if (s.vao_dang_ngay) {
            warnings.push('<span class="badge bg-success me-1" title="Đảng viên Đảng CSVN"><i class="bi bi-flag-fill"></i> ĐP</span>');
        } else if (s.ngay_vao_doan) {
            warnings.push('<span class="badge bg-primary me-1" title="Đoàn viên TNCS HCM"><i class="bi bi-bookmark-star-fill"></i> ĐV</span>');
        }

        // Nhóm Học vấn & Hoàn cảnh
        if (s.da_tot_nghiep === 1) {
            warnings.push('<span class="badge bg-info text-dark me-1" title="Đã tốt nghiệp Đại học/Cao đẳng"><i class="bi bi-mortarboard-fill"></i> TN</span>');
        }
        if (isPoor) {
            warnings.push('<span class="badge bg-warning text-dark me-1" title="Gia đình hoàn cảnh khó khăn"><i class="bi bi-heart-pulse-fill"></i> KT</span>');
        }

        // Nhóm An ninh - Kỷ luật
        if (s.co_vay_no) warnings.push('<span class="badge bg-danger me-1" title="Đang có khoản vay nợ/Tín dụng"><i class="bi bi-cash-stack"></i> Nợ</span>');
        if (s.co_ma_tuy) warnings.push('<span class="badge bg-dark me-1" title="Tiền sử sử dụng Ma túy/Chất cấm"><i class="bi bi-exclamation-octagon"></i> MT</span>');
        if (s.co_danh_bac) warnings.push('<span class="badge bg-secondary me-1" title="Tham gia đánh bạc/Cá độ"><i class="bi bi-dice-5"></i> ĐB</span>');
        
        let warningHtml = warnings.length > 0 ? warnings.join('') : '<span class="text-muted small">Bình thường</span>';

        // --- 3. RENDER HÀNG DỮ LIỆU ---
        tbody.innerHTML += `
            <tr>
                <td class="ps-4 text-muted" style="font-size: 0.8rem;">#${s.id}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="rounded-circle bg-secondary me-3 overflow-hidden shadow-sm border border-2 border-white" style="width: 44px; height: 44px; flex-shrink: 0;">
                             ${s.anh_dai_dien ? `<img src="${s.anh_dai_dien}" style="width:100%;height:100%;object-fit:cover">` : '<i class="bi bi-person-fill text-white fs-4 d-flex justify-content-center mt-1"></i>'}
                        </div>
                        <div>
                            <div class="fw-bold text-military mb-0" style="font-size: 0.95rem;">${s.ho_ten}</div>
                            <div class="text-muted" style="font-size: 0.75rem;">
                                <span><i class="bi bi-card-heading me-1"></i>${s.cccd || '---'}</span>
                                <span class="ms-2"><i class="bi bi-calendar3 me-1"></i>${s.ngay_sinh || '---'}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="fw-bold text-dark" style="font-size: 0.85rem;">${s.cap_bac}</div>
                    <div class="text-muted small">${s.chuc_vu || 'N/A'}</div>
                </td>
                <td style="max-width: 250px;">
                    <div class="badge bg-light text-military border mb-1">${s.don_vi}</div>
                    <div class="text-muted truncate-text" style="font-size: 0.75rem;" title="Quê quán: ${s.noi_sinh || 'N/A'}">
                        <i class="bi bi-geo-alt-fill me-1"></i>QQ: ${s.noi_sinh || 'N/A'}
                    </div>
                    <div class="text-muted truncate-text" style="font-size: 0.75rem;" title="Địa chỉ: ${s.ho_khau_thuong_tru || 'N/A'}">
                        <i class="bi bi-house-door-fill me-1"></i>ĐC: ${s.ho_khau_thuong_tru || 'N/A'}
                    </div>
                </td>
                <td><div class="d-flex flex-wrap gap-1">${warningHtml}</div></td>
                <td class="text-end pe-4">
                    <div class="btn-group shadow-sm">
                        <button class="btn btn-sm btn-outline-success" onclick="viewSoldierDetails(${s.id})" title="Xem Chi Tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewSoldierDetails(${s.id})" title="Chỉnh sửa / Điều chuyển">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info" onclick="exportPDF(${s.id})" title="Xuất PDF">
                            <i class="bi bi-file-earmark-pdf"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteSoldier(${s.id})" title="Xóa Hồ Sơ">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.exportPDF = async function (id) {
    const res = await ipcRenderer.invoke('sys:exportPDF', id);
    if (res.success) {
        showNotification('Xuất file thành công: ' + res.path, "success");
    } else if (res.warning) {
        showNotification('Không tìm thấy template PDF. Đã xuất file JSON: ' + res.path, "warning");
    } else if (!res.cancelled) {
        showNotification('Lỗi xuất file: ' + res.error, "danger");
    }
}

window.exportUnitsToCSV = async function () {
    const res = await ipcRenderer.invoke('sys:exportUnitsCSV');
    if (res.success) {
        showNotification('Xuất danh sách đơn vị thành công: ' + res.path, "success");
    } else if (!res.cancelled) {
        showNotification('Lỗi xuất file CSV: ' + res.error, "danger");
    } else {
        showNotification('Đã hủy lưu file.', "info");
    }
}

window.deleteSoldier = async function (id) {
    if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa hồ sơ này không? Hành động này không thể hoàn tác!')) {
        await ipcRenderer.invoke('db:deleteSoldier', id);
        loadSoldiers();
        showNotification("Đã xóa hồ sơ thành công.", "success");
    }
}

function loadUnitsForForm() {
    const select = document.querySelector('select[name="don_vi_id"]');
    if (!select) return;
    select.addEventListener('change', (e) => {
        const unitId = e.target.value;
        const text = select.options[select.selectedIndex]?.text;
        const hiddenInput = document.getElementById('formUnitName');
        if(hiddenInput) hiddenInput.value = text;
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
    const fields = await ipcRenderer.invoke('db:getCustomFields', unitId);
    customFieldsCache = fields; 
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

window.toggleSection = function(id, isShown) {
    const el = document.getElementById(id);
    if(el) {
        if(isShown) el.classList.remove('d-none');
        else el.classList.add('d-none');
    }
};

window.removeRow = function(btn) {
    btn.closest('tr, .social-row').remove();
}

window.addBioRow = function() {
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

window.addSocialRow = function(type) {
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

window.addFamilyRow = function() {
    const tbody = document.getElementById('familyTableBody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="fam-row">
            <td>
                <select class="form-select form-select-sm fam-rel">
                    <option value="Bố">Bố</option><option value="Mẹ">Mẹ</option>
                    <option value="Anh ruột">Anh ruột</option><option value="Chị ruột">Chị ruột</option>
                    <option value="Em ruột">Em ruột</option>
                    <option value="Ông/Bà">Ông/Bà</option>
                    <option value="Khác">Khác</option>
                </select>
            </td>
            <td><input type="text" class="form-control form-control-sm fam-name" placeholder="Họ tên"></td>
            <td><input type="text" class="form-control form-control-sm fam-year" placeholder="Năm sinh"></td>
            <td><input type="text" class="form-control form-control-sm fam-job" placeholder="Nghề nghiệp"></td>
            <td><input type="text" class="form-control form-control-sm fam-add" placeholder="Quê quán/Chỗ ở"></td>
            <td><input type="text" class="form-control form-control-sm fam-phone" placeholder="SĐT"></td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
        </tr>
    `);
}

window.addChildRow = function() {
    const div = document.getElementById('conList');
    if(!div) return;
    div.insertAdjacentHTML('beforeend', `
        <div class="child-row row g-2 mb-2 align-items-center">
            <div class="col-7"><input type="text" class="form-control form-control-sm c-name" placeholder="Họ tên con"></div>
            <div class="col-3"><input type="text" class="form-control form-control-sm c-year" placeholder="Năm sinh"></div>
            <div class="col-2 text-end"><button type="button" class="btn btn-sm btn-light text-danger" onclick="this.closest('.child-row').remove()"><i class="bi bi-trash"></i></button></div>
        </div>
    `);
}

window.addLoverRow = function() {
    const div = document.getElementById('nyList');
    if(!div) return;
    div.insertAdjacentHTML('beforeend', `
        <div class="lover-row card card-body bg-light p-2 mb-2">
            <div class="d-flex justify-content-between mb-2">
                <span class="fw-bold small">Người yêu</span>
                <button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="this.closest('.lover-row').remove()"><i class="bi bi-x-circle"></i></button>
            </div>
            <div class="row g-2">
                <div class="col-6"><input type="text" class="form-control form-control-sm l-name" placeholder="Họ tên"></div>
                <div class="col-6"><input type="text" class="form-control form-control-sm l-year" placeholder="Năm sinh"></div>
                <div class="col-6"><input type="text" class="form-control form-control-sm l-phone" placeholder="SĐT"></div>
                <div class="col-6"><input type="text" class="form-control form-control-sm l-job" placeholder="Nghề nghiệp/Nơi ở"></div>
            </div>
        </div>
    `);
}

window.addForeignRow = function() {
    const tbody = document.getElementById('foreignRelTable');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="fr-row">
            <td><input type="text" class="form-control form-control-sm fr-name" placeholder="Họ tên"></td>
            <td><input type="text" class="form-control form-control-sm fr-rel" placeholder="Quan hệ"></td>
            <td><input type="text" class="form-control form-control-sm fr-country" placeholder="Nước nào"></td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
        </tr>
    `);
}

window.addTravelRow = function() {
    const tbody = document.getElementById('travelTable');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="tr-row">
            <td><input type="text" class="form-control form-control-sm tr-country" placeholder="Nước nào"></td>
            <td><input type="text" class="form-control form-control-sm tr-purpose" placeholder="Mục đích"></td>
            <td><input type="text" class="form-control form-control-sm tr-time" placeholder="Thời gian"></td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-light text-danger" onclick="window.removeRow(this)"><i class="bi bi-x"></i></button></td>
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
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        delete data.song_chung_voi_option;
        delete data.radioVo;
        delete data.radioCon;
        delete data.vp_local;
        delete data.vp_gambling;
        delete data.vp_drugs;
        delete data.radioDebt;
        delete data.radioBusiness;
        delete data.radioCovid;
        delete data.radioForeignRel;
        delete data.radioTravel;
        delete data.radioPassport;
        delete data.radioImmigration;
        const imgInput = container.querySelector('#imageInput');
        if (imgInput.files[0] && imgInput.files[0].path) {
            data.anh_dai_dien = await ipcRenderer.invoke('sys:saveImage', imgInput.files[0].path);
        } else if (editingSoldierId) {
                 delete data.anh_dai_dien;
        } else {
                 data.anh_dai_dien = null;
        }
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
        delete data.ly_do_khong_song_cung_bo_me;
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
        data.vi_pham_nuoc_ngoai = hasTraveled ? document.getElementById('foreign_violation').value : '';
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
        data.co_danh_bac = violations.danh_bac.co_khong ? 1 : 0;
        data.co_ma_tuy = violations.ma_tuy.co_khong ? 1 : 0;
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
        delete data.debt_who;
        delete data.debt_borrower_name;
        delete data.debt_amount;
        delete data.debt_purpose;
        delete data.debt_type;
        delete data.debt_deadline;
        delete data.debt_family_knows;
        delete data.debt_payer;
        delete data.bus_details;
        delete data.covid_time;
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
        let res;
        if (editingSoldierId) {
            res = await ipcRenderer.invoke('db:updateSoldier', { id: editingSoldierId, data });
        } else {
            res = await ipcRenderer.invoke('db:addSoldier', data);
        }
        if (res.success) {
            showNotification(editingSoldierId ? 'Cập nhật hồ sơ thành công!' : 'Lưu hồ sơ thành công!', "success");
            if (currentMode === 'kiosk') {
                container.innerHTML = document.getElementById('form-template').innerHTML;
                setupFormListener(container);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                renderCustomInputsForUnit(null);
            } else {
                switchAdminView('dashboard');
            }
        } else {
            showNotification('Lỗi: ' + res.error, "danger");
        }
    });
}
// --- LOGIC QUẢN TRỊ DỮ LIỆU ---

// Hàm sao lưu
window.backupDatabase = async function() {
    const res = await ipcRenderer.invoke('sys:backupDB');
    if (res.success) {
        showNotification(`Sao lưu thành công! Tệp được lưu tại: ${res.path}`, "success");
    } else if (res.error) {
        showNotification(`Lỗi sao lưu: ${res.error}`, "danger");
    }
};

// Hàm khôi phục
window.restoreDatabase = async function() {
    const isConfirmed = confirm("CẢNH BÁO QUAN TRỌNG:\n\nViệc khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại bằng dữ liệu từ bản sao lưu. Ứng dụng sẽ tự động khởi động lại sau khi hoàn tất.\n\nBạn có chắc chắn muốn tiếp tục không?");
    
    if (isConfirmed) {
        const res = await ipcRenderer.invoke('sys:restoreDB');
        if (res.error) {
            showNotification(`Lỗi khôi phục: ${res.error}`, "danger");
        }
    }
};

// Hàm xóa dữ liệu
window.clearAllData = async function() {
    const isConfirmed = confirm("CẢNH BÁO NGUY HIỂM:\n\nHành động này sẽ XÓA VĨNH VIỄN toàn bộ hồ sơ quân nhân, đơn vị và các cấu hình đã lưu. Bạn sẽ không thể khôi phục lại dữ liệu này trừ khi có bản sao lưu.\n\nBạn có thực sự muốn xóa sạch dữ liệu không?");
    
    if (isConfirmed) {
        const secondConfirm = confirm("XÁC NHẬN LẦN CUỐI: Tôi đồng ý xóa toàn bộ dữ liệu hệ thống.");
        if (secondConfirm) {
            const res = await ipcRenderer.invoke('sys:clearAllData');
            if (res.error) {
                showNotification(`Lỗi khi xóa dữ liệu: ${res.error}`, "danger");
            }
        }
    }
};

window.updateSoftware = async function() {
    const confirmUpdate = confirm("Bạn có muốn thực hiện cập nhật phần mềm không? Phần mềm sẽ khởi động lại.");
    if (confirmUpdate) {
        const res = await ipcRenderer.invoke('sys:applyUpdate');
        if (res.success) {
            alert("Cập nhật thành công!");
        } else if (!res.cancelled) {
            alert("Lỗi cập nhật: " + res.error);
        }
    }
};