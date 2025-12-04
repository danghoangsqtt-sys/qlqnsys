const Database = require('better-sqlite3');
const path = require('path');

class SoldierDB {
  constructor() {
    // Determine database path (userData folder is safer in production, but local is fine for dev)
    const dbPath = path.resolve(__dirname, 'soldiers.db');
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS soldiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- Identity
        ho_ten TEXT,
        ten_khac TEXT,
        ngay_sinh TEXT,
        cccd TEXT,
        cap_bac TEXT,
        chuc_vu TEXT,
        don_vi TEXT,
        nhap_ngu_ngay TEXT,
        vao_dang_ngay TEXT,
        
        -- Contact & Social
        sdt_rieng TEXT,
        tk_facebook TEXT,
        sdt_facebook TEXT,
        tk_zalo TEXT,
        sdt_zalo TEXT,
        tk_tiktok TEXT,

        -- Family
        ho_ten_bo TEXT,
        ho_ten_me TEXT,
        vo_chong TEXT,
        con_cai TEXT,
        hoan_canh_gia_dinh TEXT,

        -- Background (0 = No, 1 = Yes)
        tien_an_tien_su TEXT,
        tien_su_benh TEXT,
        vay_no INTEGER DEFAULT 0,
        chi_tiet_vay_no TEXT,
        su_dung_ma_tuy INTEGER DEFAULT 0,
        tham_gia_danh_bac INTEGER DEFAULT 0
      )
    `;
    this.db.exec(createTableQuery);
  }

  addSoldier(data) {
    const stmt = this.db.prepare(`
      INSERT INTO soldiers (
        ho_ten, ten_khac, ngay_sinh, cccd, cap_bac, chuc_vu, don_vi, nhap_ngu_ngay, vao_dang_ngay,
        sdt_rieng, tk_facebook, sdt_facebook, tk_zalo, sdt_zalo, tk_tiktok,
        ho_ten_bo, ho_ten_me, vo_chong, con_cai, hoan_canh_gia_dinh,
        tien_an_tien_su, tien_su_benh, vay_no, chi_tiet_vay_no, su_dung_ma_tuy, tham_gia_danh_bac
      ) VALUES (
        @ho_ten, @ten_khac, @ngay_sinh, @cccd, @cap_bac, @chuc_vu, @don_vi, @nhap_ngu_ngay, @vao_dang_ngay,
        @sdt_rieng, @tk_facebook, @sdt_facebook, @tk_zalo, @sdt_zalo, @tk_tiktok,
        @ho_ten_bo, @ho_ten_me, @vo_chong, @con_cai, @hoan_canh_gia_dinh,
        @tien_an_tien_su, @tien_su_benh, @vay_no, @chi_tiet_vay_no, @su_dung_ma_tuy, @tham_gia_danh_bac
      )
    `);
    return stmt.run(data);
  }

  getSoldiers(filterType) {
    let query = 'SELECT * FROM soldiers';
    
    // Smart Filter Logic
    if (filterType === 'dang_vien') {
      // Assuming if vao_dang_ngay is not empty, they are a party member
      query += " WHERE vao_dang_ngay IS NOT NULL AND vao_dang_ngay != ''";
    } else if (filterType === 'vay_no') {
      query += ' WHERE vay_no = 1';
    } else if (filterType === 'gia_dinh_kho_khan') {
      query += " WHERE hoan_canh_gia_dinh LIKE 'Khó khăn'";
    } else if (filterType === 'ma_tuy') {
        query += ' WHERE su_dung_ma_tuy = 1';
    }

    query += ' ORDER BY id DESC';
    return this.db.prepare(query).all();
  }

  getSoldierById(id) {
    return this.db.prepare('SELECT * FROM soldiers WHERE id = ?').get(id);
  }

  deleteSoldier(id) {
    return this.db.prepare('DELETE FROM soldiers WHERE id = ?').run(id);
  }
}

module.exports = SoldierDB;