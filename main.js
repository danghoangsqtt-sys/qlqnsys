
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const SoldierDB = require('./database');

// THIẾT LẬP QUAN TRỌNG: Buộc Chromium sử dụng locale Tiếng Việt ngay từ lúc khởi động
// Điều này sẽ thay đổi định dạng input date thành dd/mm/yyyy
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
      // Đảm bảo môi trường render cũng nhận diện ngôn ngữ vi
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

// 2. Custom Fields (NEW)
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

// NEW: Get Single Soldier
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

// NEW: Update Soldier
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

        // Create dir if not exists
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

// 5. Export PDF (Cập nhật Logic xử lý JSON)
ipcMain.handle('sys:exportPDF', async (event, soldierId) => {
  try {
    const soldier = db.getSoldierById(soldierId);
    if (!soldier) throw new Error('Soldier not found');

    const templatePath = path.join(__dirname, 'assets', 'templates', '1.pdf');

    // **NEW: Kiểm tra template và trả về lỗi rõ ràng**
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: "LỖI: Không tìm thấy file template PDF tại đường dẫn 'assets/templates/1.pdf'. Vui lòng thêm file mẫu để chức năng hoạt động." };
    }

    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Xử lý dữ liệu JSON (Chuyển đổi thành chuỗi tóm tắt cho PDF)
    const vi_pham_obj = JSON.parse(soldier.lich_su_vi_pham || '{}');
    const viPhamSummary = vi_pham_obj.vi_pham_dia_phuong?.co_khong ? `VP Địa phương: ${vi_pham_obj.vi_pham_dia_phuong.noi_dung}` : 'Không vi phạm tại địa phương.';
    const custom_data_obj = JSON.parse(soldier.custom_data || '{}');
    const customSummary = Object.keys(custom_data_obj).length > 0 ? `Đã nhập ${Object.keys(custom_data_obj).length} trường bổ sung.` : 'Không có TT bổ sung.';

    const coords = {
      ho_ten: { x: 150, y: 700 },
      ngay_sinh: { x: 150, y: 680 },
      cap_bac: { x: 400, y: 700 },
      don_vi: { x: 150, y: 660 },
      sdt_rieng: { x: 150, y: 640 },
      lich_su_vi_pham_summary: { x: 150, y: 620 }, 
      thong_tin_bo_sung_summary: { x: 150, y: 600 } 
    };

    const drawText = (text, key) => {
      if (!text || !coords[key]) return;
      firstPage.drawText(String(text), {
        x: coords[key].x,
        y: coords[key].y,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });
    };

    drawText(soldier.ho_ten, 'ho_ten');
    drawText(soldier.ngay_sinh, 'ngay_sinh');
    drawText(soldier.cap_bac, 'cap_bac');
    drawText(soldier.don_vi, 'don_vi');
    drawText(soldier.sdt_rieng, 'sdt_rieng');
    drawText(viPhamSummary, 'lich_su_vi_pham_summary');
    drawText(customSummary, 'thong_tin_bo_sung_summary');

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu Hồ Sơ PDF',
      defaultPath: `HoSo_${soldier.ho_ten.replace(/\s+/g, '_')}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (filePath) {
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(filePath, pdfBytes);
      return { success: true, path: filePath };
    }

    return { success: false, cancelled: true };

  } catch (err) {
    console.error("Export PDF Error:", err);
    return { success: false, error: err.message };
  }
});

// **NEW: 6. Export CSV Handler**
ipcMain.handle('sys:exportUnitsCSV', async () => {
    try {
        const units = db.getUnits();
        
        // 1. Tạo headers tiếng Việt
        const headers = ['ID', 'Tên Đơn Vị', 'ID Cấp Trên'];
        
        // 2. Định dạng dữ liệu
        let csvContent = headers.join(',') + '\n';
        units.forEach(unit => {
            const row = [
                unit.id,
                `"${unit.ten_don_vi.replace(/"/g, '""')}"`, // Xử lý dấu nháy kép
                unit.cap_tren_id || '' // NULL thành rỗng
            ];
            csvContent += row.join(',') + '\n';
        });

        // 3. Thêm BOM (Byte Order Mark) để Excel nhận diện UTF-8 (tiếng Việt)
        const BOM = "\uFEFF";
        const contentWithBOM = BOM + csvContent;

        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Lưu Danh Sách Đơn Vị',
            defaultPath: 'Danh_Sach_Don_Vi.csv',
            filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        });

        if (filePath) {
            fs.writeFileSync(filePath, contentWithBOM, 'utf8');
            return { success: true, path: filePath };
        }
        
        return { success: false, cancelled: true };

    } catch (err) {
        console.error("Export CSV Error:", err);
        return { success: false, error: err.message };
    }
});
