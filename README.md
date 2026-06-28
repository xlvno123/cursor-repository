# cursor-repository

## Google SMTP Limit Checker

Script `google_smtp_limit_checker.py` membantu memantau pemakaian limit kirim
SMTP Gmail/Google Workspace secara lokal.

Penting: SMTP Google tidak menyediakan perintah untuk membaca sisa kuota
real-time. Script ini memakai counter lokal dan hanya melakukan cek login atau
kirim satu email uji jika diminta.

### Contoh penggunaan

Cek estimasi pemakaian hari ini tanpa login SMTP:

```bash
python3 google_smtp_limit_checker.py --account nama@gmail.com
```

Catat manual 25 penerima yang sudah dikirim oleh aplikasi lain:

```bash
python3 google_smtp_limit_checker.py \
  --account nama@gmail.com \
  --record 25 \
  --record-note "campaign pagi"
```

Cek login SMTP tanpa mengirim email:

```bash
export GOOGLE_SMTP_PASSWORD="app-password-google"
python3 google_smtp_limit_checker.py \
  --account nama@gmail.com \
  --check-auth
```

Kirim satu email uji dan catat pemakaiannya:

```bash
export GOOGLE_SMTP_PASSWORD="app-password-google"
python3 google_smtp_limit_checker.py \
  --account nama@gmail.com \
  --send-test \
  --to tujuan@example.com
```

Untuk akun Google Workspace, gunakan profil workspace atau override limit:

```bash
python3 google_smtp_limit_checker.py \
  --account user@domain.com \
  --profile workspace
```

```bash
python3 google_smtp_limit_checker.py \
  --account user@domain.com \
  --daily-limit 1500
```

### Catatan keamanan

- Jangan gunakan password utama akun Google. Gunakan App Password atau kredensial
  SMTP yang disediakan admin.
- File `.google_smtp_limit_state.json` hanya menyimpan counter lokal, bukan
  password.
- Jangan mengecek limit dengan mengirim email massal sampai gagal; itu bisa
  memicu rate limit, reputasi buruk, atau suspend akun.
