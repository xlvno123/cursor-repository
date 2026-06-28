/**
 * Google Apps Script untuk cek sisa limit pengiriman email Google.
 *
 * Cara pakai cepat:
 * 1. Buka https://script.google.com/
 * 2. Buat project baru.
 * 3. Tempel isi file ini ke Code.gs.
 * 4. Jalankan fungsi cekLimitPengiriman().
 *
 * Catatan:
 * - MailApp.getRemainingDailyQuota() mengembalikan sisa kuota penerima email
 *   untuk eksekusi Apps Script pada akun yang menjalankan script.
 * - Angka ini bukan hasil uji kirim massal SMTP. Jangan mengetes limit dengan
 *   mengirim banyak email sampai gagal.
 */

const CONFIG = {
  /**
   * Isi jika ingin menghitung estimasi "terpakai".
   *
   * Contoh umum:
   * - Gmail personal via SMTP sering dibatasi sekitar 500 penerima/hari.
   * - Google Workspace via SMTP sering dibatasi sekitar 2000 penerima/hari.
   *
   * Quota Apps Script/MailApp bisa berbeda dari limit SMTP, jadi biarkan null
   * jika hanya ingin melihat sisa kuota yang dilaporkan Apps Script.
   */
  DAILY_LIMIT_ESTIMATE: null,

  /**
   * Email tujuan untuk fungsi kirimEmailTes().
   * Ganti sebelum menjalankan kirimEmailTes().
   */
  TEST_RECIPIENT: 'tujuan@example.com',

  /**
   * Jika true, simpan riwayat cek ke spreadsheet Google Sheets.
   */
  WRITE_TO_SHEET: false,

  /**
   * Nama sheet log jika WRITE_TO_SHEET = true.
   */
  SHEET_NAME: 'smtp_limit_log',
};

/**
 * Wrapper untuk tombol Run default Apps Script.
 *
 * Jika editor masih memilih fungsi myFunction, fungsi ini akan tetap menjalankan
 * pengecekan limit pengiriman.
 *
 * @return {Object} Ringkasan limit yang juga muncul di execution log.
 */
function myFunction() {
  return cekLimitPengiriman();
}

/**
 * Fungsi utama untuk cek sisa limit pengiriman email.
 *
 * Jalankan fungsi ini dari Apps Script editor.
 *
 * @return {Object} Ringkasan limit yang juga muncul di execution log.
 */
function cekLimitPengiriman() {
  const result = getLimitPengiriman_();

  Logger.log('=== Cek Limit Pengiriman Google ===');
  Logger.log('Email aktif       : %s', result.email);
  Logger.log('Waktu cek         : %s', result.checkedAt);
  Logger.log('Sisa kuota        : %s penerima', result.remainingQuota);

  if (result.dailyLimitEstimate !== null) {
    Logger.log('Estimasi limit    : %s penerima/hari', result.dailyLimitEstimate);
    Logger.log('Estimasi terpakai : %s penerima', result.estimatedUsed);
  } else {
    Logger.log('Estimasi limit    : belum diset di CONFIG.DAILY_LIMIT_ESTIMATE');
  }

  Logger.log('Status            : %s', result.status);
  Logger.log('Catatan           : %s', result.note);

  if (CONFIG.WRITE_TO_SHEET) {
    tulisLogKeSheet_(result);
  }

  return result;
}

/**
 * Kirim satu email tes dan cek ulang sisa kuota.
 *
 * Fungsi ini hanya untuk memastikan akun bisa mengirim email dari Apps Script.
 * Jangan dipakai untuk mengetes limit dengan loop/mass send.
 *
 * @return {Object} Ringkasan limit setelah email tes dikirim.
 */
function kirimEmailTes() {
  if (!CONFIG.TEST_RECIPIENT || CONFIG.TEST_RECIPIENT === 'tujuan@example.com') {
    throw new Error('Ganti CONFIG.TEST_RECIPIENT dengan email tujuan tes dulu.');
  }

  MailApp.sendEmail({
    to: CONFIG.TEST_RECIPIENT,
    subject: 'Tes Google Apps Script - Cek Limit Pengiriman',
    body: 'Email tes ini dikirim satu kali dari Apps Script untuk cek fungsi kirim.',
  });

  Logger.log('Email tes terkirim ke %s', CONFIG.TEST_RECIPIENT);
  return cekLimitPengiriman();
}

/**
 * Buat trigger harian untuk mencatat sisa kuota otomatis.
 *
 * Jalankan sekali saja. Setelah itu fungsi cekLimitPengiriman() akan berjalan
 * otomatis setiap hari pada rentang jam yang dipilih Google.
 *
 * @return {string} Pesan hasil pembuatan trigger.
 */
function buatTriggerCekHarian() {
  const functionName = 'cekLimitPengiriman';
  const existingTrigger = ScriptApp.getProjectTriggers().find(function(trigger) {
    return trigger.getHandlerFunction() === functionName;
  });

  if (existingTrigger) {
    const message = 'Trigger harian sudah ada untuk ' + functionName + '.';
    Logger.log(message);
    return message;
  }

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  const message = 'Trigger harian berhasil dibuat untuk ' + functionName + '.';
  Logger.log(message);
  return message;
}

/**
 * Hapus semua trigger cekLimitPengiriman() yang dibuat di project ini.
 *
 * @return {number} Jumlah trigger yang dihapus.
 */
function hapusTriggerCekHarian() {
  const functionName = 'cekLimitPengiriman';
  let deleted = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      deleted += 1;
    }
  });

  Logger.log('Trigger yang dihapus: %s', deleted);
  return deleted;
}

/**
 * Ambil data sisa quota dari MailApp.
 *
 * @return {Object}
 * @private
 */
function getLimitPengiriman_() {
  const remainingQuota = MailApp.getRemainingDailyQuota();
  const dailyLimitEstimate = getDailyLimitEstimate_();
  const estimatedUsed =
    dailyLimitEstimate === null ? null : Math.max(dailyLimitEstimate - remainingQuota, 0);

  return {
    email: getActiveEmail_(),
    checkedAt: new Date().toISOString(),
    remainingQuota: remainingQuota,
    dailyLimitEstimate: dailyLimitEstimate,
    estimatedUsed: estimatedUsed,
    status: getStatus_(remainingQuota, dailyLimitEstimate),
    note: [
      'Kuota ini berasal dari MailApp.getRemainingDailyQuota().',
      'Limit SMTP Google dan quota Apps Script bisa berbeda tergantung jenis akun/admin.',
    ].join(' '),
  };
}

/**
 * @return {?number}
 * @private
 */
function getDailyLimitEstimate_() {
  if (CONFIG.DAILY_LIMIT_ESTIMATE === null || CONFIG.DAILY_LIMIT_ESTIMATE === '') {
    return null;
  }

  const parsed = Number(CONFIG.DAILY_LIMIT_ESTIMATE);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('CONFIG.DAILY_LIMIT_ESTIMATE harus null atau angka lebih dari 0.');
  }

  return parsed;
}

/**
 * @param {number} remainingQuota
 * @param {?number} dailyLimitEstimate
 * @return {string}
 * @private
 */
function getStatus_(remainingQuota, dailyLimitEstimate) {
  if (remainingQuota <= 0) {
    return 'HABIS';
  }

  if (dailyLimitEstimate === null) {
    return 'TERSEDIA';
  }

  const ratio = remainingQuota / dailyLimitEstimate;
  if (ratio <= 0.1) {
    return 'HAMPIR HABIS';
  }
  if (ratio <= 0.25) {
    return 'RENDAH';
  }
  return 'AMAN';
}

/**
 * @return {string}
 * @private
 */
function getActiveEmail_() {
  const email = Session.getActiveUser().getEmail();
  return email || '(email tidak tersedia untuk konteks eksekusi ini)';
}

/**
 * Tulis hasil cek ke spreadsheet aktif, atau buat spreadsheet baru jika script
 * tidak terikat ke Google Sheets.
 *
 * @param {Object} result
 * @private
 */
function tulisLogKeSheet_(result) {
  const spreadsheet = getOrCreateSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      'checked_at',
      'email',
      'remaining_quota',
      'daily_limit_estimate',
      'estimated_used',
      'status',
      'note',
    ]);
  }

  sheet.appendRow([
    result.checkedAt,
    result.email,
    result.remainingQuota,
    result.dailyLimitEstimate,
    result.estimatedUsed,
    result.status,
    result.note,
  ]);
}

/**
 * @return {SpreadsheetApp.Spreadsheet}
 * @private
 */
function getOrCreateSpreadsheet_() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    return activeSpreadsheet;
  }

  return SpreadsheetApp.create('Google SMTP Limit Log');
}
