const { ipcRenderer } = require('electron');

// --- Navigation ---
function switchView(viewName) {
    const listDiv = document.getElementById('view-list');
    const addDiv = document.getElementById('view-add');
    const navList = document.getElementById('nav-list');
    const navAdd = document.getElementById('nav-add');

    if (viewName === 'list') {
        listDiv.style.display = 'block';
        addDiv.style.display = 'none';
        navList.classList.add('active');
        navAdd.classList.remove('active');
        loadSoldiers();
    } else {
        listDiv.style.display = 'none';
        addDiv.style.display = 'block';
        navList.classList.remove('active');
        navAdd.classList.add('active');
    }
}

// --- Data Loading & Filtering ---
async function loadSoldiers() {
    const filter = document.getElementById('filterDropdown').value;
    const soldiers = await ipcRenderer.invoke('db:getSoldiers', filter);
    
    const tbody = document.getElementById('soldierTableBody');
    tbody.innerHTML = '';

    if (soldiers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Không có dữ liệu</td></tr>';
        return;
    }

    soldiers.forEach(s => {
        let warningBadges = '';
        if(s.vay_no === 1) warningBadges += '<span class="badge bg-warning text-dark me-1">Nợ</span>';
        if(s.su_dung_ma_tuy === 1) warningBadges += '<span class="badge bg-danger me-1">Ma túy</span>';
        if(s.hoan_canh_gia_dinh === 'Khó khăn') warningBadges += '<span class="badge bg-secondary">KK</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.id}</td>
            <td class="fw-bold">${s.ho_ten}</td>
            <td>${s.cap_bac}</td>
            <td>${s.don_vi}</td>
            <td>${s.ngay_sinh || 'N/A'}</td>
            <td>${warningBadges}</td>
            <td>
                <button class="btn btn-sm btn-info text-white table-action-btn" onclick="exportPDF(${s.id})">In PDF</button>
                <button class="btn btn-sm btn-danger table-action-btn" onclick="deleteSoldier(${s.id})">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Form Handling ---
document.getElementById('soldierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Convert checkboxes/selects intended as integers
    data.vay_no = parseInt(data.vay_no);
    data.su_dung_ma_tuy = parseInt(data.su_dung_ma_tuy);
    data.tham_gia_danh_bac = parseInt(data.tham_gia_danh_bac);

    const result = await ipcRenderer.invoke('db:addSoldier', data);
    
    if (result.success) {
        alert('Lưu thành công!');
        e.target.reset();
        switchView('list');
    } else {
        alert('Lỗi: ' + result.error);
    }
});

// --- Actions ---
async function deleteSoldier(id) {
    if(!confirm('Bạn có chắc chắn muốn xóa hồ sơ này?')) return;
    
    const result = await ipcRenderer.invoke('db:deleteSoldier', id);
    if(result.success) {
        loadSoldiers();
    } else {
        alert('Không thể xóa: ' + result.error);
    }
}

async function exportPDF(id) {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = 'Đang tạo...';
    btn.disabled = true;

    const result = await ipcRenderer.invoke('sys:exportPDF', id);
    
    if (result.success) {
        alert('Đã xuất file PDF tại: ' + result.path);
    } else if (!result.cancelled) {
        alert('Lỗi xuất PDF: ' + result.error);
    }

    btn.innerText = originalText;
    btn.disabled = false;
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    loadSoldiers();
});