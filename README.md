# Google SMTP Limit Checker - Apps Script

File `Code.gs` berisi Google Apps Script untuk mengecek sisa kuota pengiriman
email dari akun Google yang menjalankan script.

Script memakai:

```javascript
MailApp.getRemainingDailyQuota()
```

Jadi cara ceknya aman: membaca sisa kuota yang dilaporkan Apps Script, bukan
mengirim email massal sampai terkena limit.

## Cara pakai

1. Buka <https://script.google.com/>.
2. Buat project baru.
3. Hapus isi default `Code.gs`.
4. Tempel isi file `Code.gs` dari repo ini.
5. Jalankan fungsi `cekLimitPengiriman`.
6. Izinkan permission yang diminta Google.
7. Buka **Executions** atau **Logs** untuk melihat hasil.

Output log akan berisi:

- email aktif
- waktu pengecekan
- sisa kuota penerima email
- estimasi limit harian jika diisi
- status: `AMAN`, `RENDAH`, `HAMPIR HABIS`, atau `HABIS`

## Konfigurasi penting

Di bagian atas `Code.gs`, ubah `CONFIG` sesuai kebutuhan:

```javascript
const CONFIG = {
  DAILY_LIMIT_ESTIMATE: null,
  TEST_RECIPIENT: 'tujuan@example.com',
  WRITE_TO_SHEET: false,
  SHEET_NAME: 'smtp_limit_log',
};
```

### Estimasi total limit

`MailApp.getRemainingDailyQuota()` hanya memberi sisa kuota. Jika ingin
menghitung estimasi yang sudah terpakai, isi `DAILY_LIMIT_ESTIMATE`.

Contoh:

```javascript
DAILY_LIMIT_ESTIMATE: 500
```

atau:

```javascript
DAILY_LIMIT_ESTIMATE: 2000
```

Catatan: quota Apps Script/MailApp bisa berbeda dari limit SMTP Gmail atau
Google Workspace. Angka final tetap bergantung pada jenis akun dan aturan admin.

## Fungsi yang tersedia

### `cekLimitPengiriman()`

Fungsi utama untuk cek sisa kuota. Jalankan ini dari Apps Script editor.

### `kirimEmailTes()`

Mengirim satu email tes ke `CONFIG.TEST_RECIPIENT`, lalu cek ulang sisa kuota.

Sebelum menjalankan, ganti:

```javascript
TEST_RECIPIENT: 'tujuan@example.com'
```

menjadi email tujuan tes yang valid.

### `buatTriggerCekHarian()`

Membuat trigger otomatis harian untuk menjalankan `cekLimitPengiriman()`.

### `hapusTriggerCekHarian()`

Menghapus trigger harian `cekLimitPengiriman()` dari project Apps Script.

## Simpan log ke Google Sheets

Jika ingin menyimpan riwayat cek ke Google Sheets:

```javascript
WRITE_TO_SHEET: true
```

Jika script ditempel di project yang terikat Google Sheets, log akan masuk ke
spreadsheet aktif. Jika script standalone, script akan membuat spreadsheet baru
bernama `Google SMTP Limit Log`.

## Catatan keamanan

- Jangan mengecek limit dengan loop kirim email massal.
- Jangan menaruh password Gmail/App Password di script ini.
- Script ini tidak login SMTP manual; ia berjalan sebagai akun Google yang
  memberi izin pada Apps Script.
