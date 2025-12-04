const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const SoldierDB = require('./database');

const db = new SoldierDB();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Per requirements for ease of use
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

// 1. Get List
ipcMain.handle('db:getSoldiers', (event, filter) => {
  try {
    return db.getSoldiers(filter);
  } catch (err) {
    console.error(err);
    return [];
  }
});

// 2. Add Soldier
ipcMain.handle('db:addSoldier', (event, data) => {
  try {
    const result = db.addSoldier(data);
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

// 3. Delete Soldier
ipcMain.handle('db:deleteSoldier', (event, id) => {
  try {
    db.deleteSoldier(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 4. Export PDF
ipcMain.handle('sys:exportPDF', async (event, soldierId) => {
  try {
    const soldier = db.getSoldierById(soldierId);
    if (!soldier) throw new Error('Soldier not found');

    // Load Template
    // NOTE: Ensure 'assets/templates/1.pdf' exists in your project folder
    const templatePath = path.join(__dirname, 'assets', 'templates', '1.pdf');
    
    if (!fs.existsSync(templatePath)) {
        throw new Error("Template file 'assets/templates/1.pdf' not found.");
    }

    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    
    // Embed a font that supports Vietnamese if needed, 
    // but StandardFonts.Helvetica is limited. 
    // For Vietnamese, you usually need to embed a custom font file (.ttf).
    // Using StandardFonts for demonstration.
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Coordinate Mapping (Placeholder Coordinates - X, Y from bottom-left)
    // You MUST adjust these values based on your actual 1.pdf layout.
    const coords = {
        ho_ten: { x: 150, y: 700 },
        ngay_sinh: { x: 150, y: 680 },
        cap_bac: { x: 400, y: 700 },
        don_vi: { x: 150, y: 660 },
        sdt_rieng: { x: 150, y: 640 },
        hoan_canh_gia_dinh: { x: 150, y: 600 },
        // ... add other mappings
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

    // Draw fields
    drawText(soldier.ho_ten, 'ho_ten');
    drawText(soldier.ngay_sinh, 'ngay_sinh');
    drawText(soldier.cap_bac, 'cap_bac');
    drawText(soldier.don_vi, 'don_vi');
    drawText(soldier.sdt_rieng, 'sdt_rieng');
    drawText(soldier.hoan_canh_gia_dinh, 'hoan_canh_gia_dinh');

    // Save Dialog
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Lưu Hồ Sơ Chi tiết',
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