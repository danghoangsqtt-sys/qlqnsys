const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const SoldierDB = require('./database');

// THIẾT LẬP: Buộc Chromium sử dụng locale Tiếng Việt để định dạng ngày tháng dd/mm/yyyy
app.commandLine.appendSwitch('lang', 'vi-VN');

const db = new SoldierDB();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, 
      webSecurity: false,
      spellcheck: false
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---

// 1. Units
ipcMain.handle('db:getUnits', () => {
    return db.getUnits();
});

ipcMain.handle('db:addUnit', (event, { name, parentId }) => {
    try {
        db.addUnit(name, parentId);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('db:deleteUnit', (event, id) => {
    try {
        db.deleteUnit(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 2. Custom Fields
ipcMain.handle('db:getCustomFields', (event, unitId) => {
    try {
        return db.getCustomFields(unitId);
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('db:addCustomField', (event, data) => {
    try {
        db.addCustomField(data);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('db:updateCustomField', (event, { id, data }) => {
    try {
        db.updateCustomField(id, data);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('db:deleteCustomField', (event, id) => {
    try {
        db.deleteCustomField(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// 3. Soldiers
ipcMain.handle('db:getSoldiers', (event, filter) => {
  try {
    return db.getSoldiers(filter);
  } catch (err) {
    console.error(err);
    return [];
  }
});

ipcMain.handle('db:getSoldier', (event, id) => {
  try {
    return db.getSoldierById(id);
  } catch (err) {
    console.error(err);
    return null;
  }
});

ipcMain.handle('db:addSoldier', (event, data) => {
  try {
    const result = db.addSoldier(data);
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:updateSoldier', (event, { id, data }) => {
  try {
    db.updateSoldier(id, data);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:deleteSoldier', (event, id) => {
  try {
    db.deleteSoldier(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 4. Image Handling
ipcMain.handle('sys:saveImage', async (event, sourcePath) => {
    try {
        if (!sourcePath) return null;
        
        const userDataPath = app.getPath('userData');
        const imagesDir = path.join(userDataPath, 'profile_images');

        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        const ext = path.extname(sourcePath);
        const fileName = `img_${Date.now()}${ext}`;
        const destPath = path.join(imagesDir, fileName);

        fs.copyFileSync(sourcePath, destPath);
        
        return destPath;
    } catch (err) {
        console.error("Save Image Error:", err);
        return null;
    }
});

// 5. NÂNG CẤP: Export PDF chi tiết (Sử dụng HTML-to-PDF)
ipcMain.handle('sys:exportPDF', async (event, soldierId) => {
  try {
    const s = db.getSoldierById(soldierId);
    if (!s) throw new Error('Không tìm thấy quân nhân');

    // Giải mã toàn bộ dữ liệu JSON từ Database
    const bio = JSON.parse(s.tieu_su_ban_than || '[]');
    const social = JSON.parse(s.mang_xa_hoi || '{"facebook":[], "zalo":[], "tiktok":[]}');
    const familyRel = JSON.parse(s.quan_he_gia_dinh || '{"cha_me_anh_em":[], "vo":null, "con":[], "nguoi_yeu":[]}');
    const familyGen = JSON.parse(s.thong_tin_gia_dinh_chung || '{}');
    const foreign = JSON.parse(s.yeu_to_nuoc_ngoai || '{}');
    const violations = JSON.parse(s.lich_su_vi_pham || '{}');
    const finance = JSON.parse(s.tai_chinh_suc_khoe || '{}');
    const customData = JSON.parse(s.custom_data || '{}');

    let printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true } });

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: "Times New Roman", Times, serif; padding: 1.5cm; font-size: 11pt; line-height: 1.3; color: black; }
            .header-table { width: 100%; border: none; margin-bottom: 10px; }
            .nation { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 12pt; }
            .motto { text-align: center; font-weight: bold; border-bottom: 1px solid black; display: inline-block; padding-bottom: 2px; }
            .doc-title { text-align: center; font-size: 16pt; font-weight: bold; margin: 20px 0; text-transform: uppercase; }
            
            .photo-section { display: flex; margin-bottom: 20px; }
            .photo-box { width: 3cm; height: 4cm; border: 1px solid black; text-align: center; display: flex; align-items: center; justify-content: center; margin-right: 20px; flex-shrink: 0; overflow: hidden; }
            .photo-box img { width: 100%; height: 100%; object-fit: cover; }
            
            .basic-grid { flex-grow: 1; }
            .info-line { margin-bottom: 5px; border-bottom: 1px dotted #ccc; }
            .label { font-weight: bold; }
            
            .section-title { font-weight: bold; text-transform: uppercase; background: #eee; padding: 4px; margin: 15px 0 10px 0; border-left: 5px solid #14452F; }
            
            table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10pt; }
            table.data-table th, table.data-table td { border: 1px solid black; padding: 4px; text-align: left; }
            table.data-table th { background-color: #f2f2f2; font-weight: bold; text-align: center; }

            .footer-table { width: 100%; margin-top: 40px; }
            .footer-table td { text-align: center; width: 50%; vertical-align: top; }
        </style>
    </head>
    <body>
        <table class="header-table">
            <tr>
                <td class="nation">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br><span class="motto">Độc lập - Tự do - Hạnh phúc</span></td>
            </tr>
        </table>

        <h1 class="doc-title">LÝ LỊCH QUÂN NHÂN</h1>

        <div class="photo-section">
            <div class="photo-box">
                ${s.anh_dai_dien ? `<img src="file://${s.anh_dai_dien}">` : 'Ảnh 3x4'}
            </div>
            <div class="basic-grid">
                <div class="info-line"><span class="label">Họ và tên:</span> <span style="text-transform: uppercase; font-weight: bold;">${s.ho_ten}</span></div>
                <div class="info-line"><span class="label">Tên khác:</span> ${s.ten_khac || 'Không'}</div>
                <div class="info-line"><span class="label">Ngày sinh:</span> ${s.ngay_sinh || '...'} | <span class="label">CCCD:</span> ${s.cccd || '...'}</div>
                <div class="info-line"><span class="label">Cấp bậc:</span> ${s.cap_bac} | <span class="label">Chức vụ:</span> ${s.chuc_vu || '...'}</div>
                <div class="info-line"><span class="label">Đơn vị:</span> ${s.don_vi}</div>
                <div class="info-line"><span class="label">SĐT:</span> ${s.sdt_rieng || '...'}</div>
                <div class="info-line"><span class="label">Quê quán:</span> ${s.noi_sinh || '...'}</div>
                <div class="info-line"><span class="label">HKTT:</span> ${s.ho_khau_thuong_tru || '...'}</div>
            </div>
        </div>

        <div class="section-title">I. QUÁ TRÌNH CÔNG TÁC & CHÍNH TRỊ</div>
        <div class="info-line"><span class="label">Ngày nhập ngũ:</span> ${s.nhap_ngu_ngay || '...'}</div>
        <div class="info-line"><span class="label">Ngày vào Đảng:</span> ${s.vao_dang_ngay || 'Chưa'} | <span class="label">Ngày vào Đoàn:</span> ${s.ngay_vao_doan || '...'}</div>
        <div class="info-line"><span class="label">Trình độ văn hóa:</span> ${s.trinh_do_van_hoa || '...'} (${s.da_tot_nghiep ? 'Đã tốt nghiệp' : 'Chưa tốt nghiệp'})</div>
        
        <p class="label" style="margin-bottom:0">Tóm tắt tiểu sử bản thân:</p>
        <table class="data-table">
            <tr><th>Thời gian</th><th>Làm gì? Chức vụ?</th><th>Ở đâu?</th></tr>
            ${bio.length > 0 ? bio.map(b => `<tr><td>${b.time}</td><td>${b.job}</td><td>${b.place}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center">Trống</td></tr>'}
        </table>

        <div class="section-title">II. QUAN HỆ GIA ĐÌNH</div>
        <div class="info-line"><span class="label">Mức sống GĐ:</span> ${familyGen.muc_song || '...'} | <span class="label">Nghề chính:</span> ${familyGen.nghe_nghiep_chinh || '...'}</div>
        
        <p class="label" style="margin-bottom:0">Thân nhân (Bố, mẹ, anh chị em ruột):</p>
        <table class="data-table">
            <tr><th>Quan hệ</th><th>Họ tên</th><th>Năm sinh</th><th>Nghề nghiệp</th><th>Địa chỉ</th></tr>
            ${familyRel.cha_me_anh_em?.length > 0 ? familyRel.cha_me_anh_em.map(f => `<tr><td>${f.quan_he}</td><td>${f.ho_ten}</td><td>${f.nam_sinh}</td><td>${f.nghe_nghiep}</td><td>${f.cho_o}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center">Trống</td></tr>'}
        </table>

        ${familyRel.vo ? `
        <p class="label" style="margin-top:10px">Vợ / Chồng:</p>
        <div class="info-line">Họ tên: ${familyRel.vo.ho_ten} | Năm sinh: ${familyRel.vo.nam_sinh} | SĐT: ${familyRel.vo.sdt}</div>
        ` : ''}

        <div class="section-title">III. LỊCH SỬ VI PHẠM & AN NINH</div>
        <div class="info-line"><span class="label">Vi phạm địa phương:</span> ${violations.vi_pham_dia_phuong?.co_khong ? violations.vi_pham_dia_phuong.noi_dung : 'Không'}</div>
        <div class="info-line"><span class="label">Tệ nạn:</span> Đánh bạc (${violations.danh_bac?.co_khong ? 'Có' : 'Không'}), Ma túy (${violations.ma_tuy?.co_khong ? 'Có' : 'Không'})</div>
        <div class="info-line"><span class="label">Tài chính:</span> ${finance.vay_no?.co_khong ? `Đang nợ ${finance.vay_no.so_tien} VNĐ (${finance.vay_no.muc_dich})` : 'Không vay nợ'}</div>
        <div class="info-line"><span class="label">Yếu tố nước ngoài:</span> ${foreign.than_nhan?.length > 0 ? `Có thân nhân ở ${foreign.than_nhan.map(x=>x.nuoc).join(', ')}` : 'Không'}</div>

        <div class="section-title">IV. Ý KIẾN & NGUYỆN VỌNG</div>
        <p style="font-style: italic;">${s.y_kien_nguyen_vong || 'Không có ý kiến cụ thể.'}</p>

        <table class="footer-table">
            <tr>
                <td><strong>XÁC NHẬN CỦA ĐƠN VỊ</strong><br><br><br><br><br>................................................</td>
                <td><em>Ngày...... tháng...... năm 20...</em><br><strong>NGƯỜI KHAI HỒ SƠ</strong><br><br><br><br><br><strong>${s.ho_ten.toUpperCase()}</strong></td>
            </tr>
        </table>
    </body>
    </html>
    `;

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu Hồ Sơ PDF',
      defaultPath: `HoSo_${s.ho_ten.replace(/\s+/g, '_')}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (filePath) {
      const data = await printWindow.webContents.printToPDF({ marginsType: 0, pageSize: 'A4', printBackground: true });
      fs.writeFileSync(filePath, data);
      printWindow.close();
      return { success: true, path: filePath };
    }

    printWindow.close();
    return { success: false, cancelled: true };

  } catch (err) {
    console.error("Export PDF Error:", err);
    return { success: false, error: err.message };
  }
});

// 6. Export CSV Handler
ipcMain.handle('sys:exportUnitsCSV', async () => {
    try {
        const units = db.getUnits();
        const headers = ['ID', 'Tên Đơn Vị', 'ID Cấp Trên'];
        let csvContent = headers.join(',') + '\n';
        units.forEach(unit => {
            const row = [unit.id, `"${unit.ten_don_vi.replace(/"/g, '""')}"`, unit.cap_tren_id || ''];
            csvContent += row.join(',') + '\n';
        });

        const BOM = "\uFEFF"; // Byte Order Mark cho UTF-8 Excel
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Lưu Danh Sách Đơn Vị',
            defaultPath: 'Danh_Sach_Don_Vi.csv',
            filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        });

        if (filePath) {
            fs.writeFileSync(filePath, BOM + csvContent, 'utf8');
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});