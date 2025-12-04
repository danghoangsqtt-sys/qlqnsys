
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { app } = require('electron');

class SoldierDB {
  constructor() {
    // SECURITY FIX: Use 'userData' (AppData) instead of app root
    const userDataPath = app.getPath('userData');

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'soldiers.db');
    console.log("Database Path:", dbPath);

    this.db = new Database(dbPath);
    this.init();
  }

  // Helper: Hash Password (SHA-256)
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  init() {
    // 1. Soldiers Table Base
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS soldiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ho_ten TEXT,
        ten_khac TEXT,
        ngay_sinh TEXT,
        cccd TEXT,
        cap_bac TEXT,
        chuc_vu TEXT,
        don_vi TEXT,
        don_vi_id INTEGER,
        nhap_ngu_ngay TEXT,
        vao_dang_ngay TEXT,
        sdt_rieng TEXT
      )
    `);

    // 2. Units Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ten_don_vi TEXT NOT NULL,
        cap_tren_id INTEGER DEFAULT NULL
      )
    `);

    // 3. Custom Fields Table (New)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS custom_fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER, -- NULL for global fields
        field_key TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        data_type TEXT NOT NULL, -- TEXT, INTEGER, DATE, BOOLEAN, TEXTAREA
        is_required INTEGER DEFAULT 0
      )
    `);

    // Seed default Unit if empty
    const unitCount = this.db.prepare('SELECT count(*) as count FROM units').get();
    if (unitCount.count === 0) {
      this.db.prepare("INSERT INTO units (ten_don_vi) VALUES ('Đại đội 1')").run();
    }

    // 4. MIGRATION: Add new columns safely (including JSON columns)
    const newColumns = [
      // Basic Text Info
      'anh_dai_dien TEXT',
      'noi_sinh TEXT',
      'ho_khau_thuong_tru TEXT',
      'dan_toc TEXT',
      'ton_giao TEXT',
      'trinh_do_van_hoa TEXT',
      'da_tot_nghiep INTEGER DEFAULT 0', // New column for Graduation status
      'ngay_vao_doan TEXT',
      'y_kien_nguyen_vong TEXT',

      // Flags (Integer 0/1 for easy filtering)
      'co_vay_no INTEGER DEFAULT 0',
      'co_ma_tuy INTEGER DEFAULT 0',
      'co_danh_bac INTEGER DEFAULT 0',

      // JSON Data Columns
      'hoan_canh_song TEXT', //--JSON: song_chung_voi, nguoi_nuoi_duong, ly_do...
      'mang_xa_hoi TEXT', //--JSON: facebook, zalo, tiktok arrays
      'tieu_su_ban_than TEXT', //--JSON: Array of timeline
      'quan_he_gia_dinh TEXT', //--JSON: vo, con, nguoi_yeu, cha_me_anh_em
      'thong_tin_gia_dinh_chung TEXT', //--JSON: kinh_te, vi_pham_nguoi_than...
      'yeu_to_nuoc_ngoai TEXT', //--JSON: than_nhan, di_nuoc_ngoai, ho_chieu, xuat_canh
      'lich_su_vi_pham TEXT', //--JSON: dia_phuong, danh_bac, ma_tuy
      'tai_chinh_suc_khoe TEXT', //--JSON: vay_no, kinh_doanh, covid
      'nang_khieu_so_truong TEXT', //--Textarea
      'vi_pham_nuoc_ngoai TEXT', //--Textarea

      // NEW: Custom Fields Data
      'custom_data TEXT'            //-- JSON: Key - Value storage for dynamic fields
    ];

    newColumns.forEach(colDef => {
      try {
        // Check if column exists, if not add it
        // Simple split to get column name
        const colName = colDef.split(' ')[0];
        const check = this.db.prepare(`SELECT COUNT(*) AS cnt FROM pragma_table_info('soldiers') WHERE name='${colName}'`).get();
        if (check.cnt === 0) {
          this.db.exec(`ALTER TABLE soldiers ADD COLUMN ${colDef}`);
        }
      } catch (e) {
        console.error("Migration warning:", e.message);
      }
    });
  }

  // --- UNITS ---
  getUnits() {
    return this.db.prepare('SELECT * FROM units ORDER BY id ASC').all();
  }

  addUnit(name, parentId) {
    return this.db.prepare('INSERT INTO units (ten_don_vi, cap_tren_id) VALUES (?, ?)').run(name, parentId);
  }

  deleteUnit(id) {
    const soldierCount = this.db.prepare('SELECT count(*) as count FROM soldiers WHERE don_vi_id = ?').get(id);
    if (soldierCount.count > 0) throw new Error('Đơn vị đang có người, không thể xóa.');
    return this.db.prepare('DELETE FROM units WHERE id = ?').run(id);
  }

  // --- CUSTOM FIELDS ---
  getCustomFields(unitId = null) {
    // If unitId is provided, get Global fields (unit_id IS NULL) AND fields for that unit
    // If unitId is 'all' or null, just get all (for admin view) or global
    if (unitId === 'all') {
      return this.db.prepare('SELECT * FROM custom_fields ORDER BY id ASC').all();
    }

    let query = 'SELECT * FROM custom_fields WHERE unit_id IS NULL';
    const params = [];

    if (unitId) {
      query += ' OR unit_id = ?';
      params.push(unitId);
    }

    return this.db.prepare(query).all(...params);
  }

  addCustomField(data) {
    // data: { unit_id, field_key, display_name, data_type, is_required }
    const stmt = this.db.prepare(`
        INSERT INTO custom_fields (unit_id, field_key, display_name, data_type, is_required)
        VALUES (@unit_id, @field_key, @display_name, @data_type, @is_required)
    `);
    return stmt.run(data);
  }

  updateCustomField(id, data) {
    const stmt = this.db.prepare(`
        UPDATE custom_fields 
        SET unit_id = @unit_id, 
            display_name = @display_name, 
            data_type = @data_type, 
            is_required = @is_required
        WHERE id = @id
    `);
    // Note: field_key is typically not updated to preserve data integrity, 
    // or if updated, needs careful handling. Here we skip updating field_key.
    return stmt.run({ ...data, id });
  }

  deleteCustomField(id) {
    return this.db.prepare('DELETE FROM custom_fields WHERE id = ?').run(id);
  }

  // --- SOLDIERS ---
  addSoldier(data) {
    // Dynamic Insert based on provided keys to support flexible schema
    const keys = Object.keys(data);
    const columns = keys.join(', ');
    const placeholders = keys.map(k => `@${k}`).join(', ');

    const stmt = this.db.prepare(`INSERT INTO soldiers (${columns}) VALUES (${placeholders})`);
    return stmt.run(data);
  }

  getSoldiers(filter) {
    let query = 'SELECT * FROM soldiers WHERE 1=1';
    const params = [];

    if (filter.type === 'dang_vien') {
      query += " AND vao_dang_ngay IS NOT NULL AND vao_dang_ngay != ''";
    } else if (filter.type === 'vay_no') {
      query += ' AND co_vay_no = 1';
    } else if (filter.type === 'ma_tuy') {
      query += ' AND co_ma_tuy = 1';
    }

    if (filter.unitId && filter.unitId !== 'all') {
      query += ' AND don_vi_id = ?';
      params.push(filter.unitId);
    }

    query += ' ORDER BY id DESC';
    return this.db.prepare(query).all(...params);
  }

  getSoldierById(id) {
    return this.db.prepare('SELECT * FROM soldiers WHERE id = ?').get(id);
  }

  deleteSoldier(id) {
    return this.db.prepare('DELETE FROM soldiers WHERE id = ?').run(id);
  }
}

module.exports = SoldierDB;
