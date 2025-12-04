
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const SoldierDB = require('./database');

const db = new SoldierDB();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // allow loading local resources (images)
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

ipcMain.handle('db:addSoldier', (event, data) => {
  try {
    const result = db.addSoldier(data);
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    console.error(err);
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

// 5. Export PDF
ipcMain.handle('sys:exportPDF', async (event, soldierId) => {
  try {
    const soldier = db.getSoldierById(soldierId);
    if (!soldier) throw new Error('Soldier not found');

    const templatePath = path.join(__dirname, 'assets', 'templates', '1.pdf');

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return { success: false, error: "Template file 'assets/templates/1.pdf' not found." };
    }

    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Placeholder Coords (Update these based on real PDF)
    const coords = {
      ho_ten: { x: 150, y: 700 },
      ngay_sinh: { x: 150, y: 680 },
      cap_bac: { x: 400, y: 700 },
      don_vi: { x: 150, y: 660 },
      sdt_rieng: { x: 150, y: 640 },
      hoan_canh_gia_dinh: { x: 150, y: 600 },
      tien_an_tien_su: { x: 150, y: 550 }
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
    drawText(soldier.hoan_canh_gia_dinh, 'hoan_canh_gia_dinh');
    drawText(soldier.tien_an_tien_su, 'tien_an_tien_su');

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu Hồ Sơ',
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
    console.error(err);
    return { success: false, error: err.message };
  }
});
