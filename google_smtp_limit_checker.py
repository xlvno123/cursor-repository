#!/usr/bin/env python3
"""Safe local usage checker for Google SMTP sending limits.

Google SMTP does not expose a "remaining quota" command. This script keeps a
local daily counter, can verify SMTP authentication, and can optionally send one
test email so you do not check limits by blasting messages.
"""

from __future__ import annotations

import argparse
import datetime as dt
from email.message import EmailMessage
import getpass
import json
import os
from pathlib import Path
import smtplib
import ssl
import sys
from typing import Any


DEFAULT_LIMITS = {
    "gmail": 500,
    "workspace": 2000,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Pantau pemakaian limit kirim SMTP Google secara lokal. "
            "Catatan: SMTP Google tidak menyediakan sisa kuota real-time."
        )
    )
    parser.add_argument(
        "--account",
        required=True,
        help="Alamat Gmail atau Google Workspace yang dipakai untuk login SMTP.",
    )
    parser.add_argument(
        "--profile",
        choices=sorted(DEFAULT_LIMITS),
        default="gmail",
        help="Profil limit default. Pakai --daily-limit jika limit akun Anda berbeda.",
    )
    parser.add_argument(
        "--daily-limit",
        type=positive_int,
        help="Override limit penerima per hari, misalnya 500 atau 2000.",
    )
    parser.add_argument(
        "--state-file",
        type=Path,
        default=Path(".google_smtp_limit_state.json"),
        help="Lokasi file counter lokal. Default: .google_smtp_limit_state.json",
    )
    parser.add_argument(
        "--record",
        type=non_negative_int,
        default=0,
        help="Tambahkan jumlah penerima yang sudah dikirim oleh proses lain.",
    )
    parser.add_argument(
        "--record-note",
        default="manual record",
        help="Catatan untuk --record atau kirim uji.",
    )
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="Cek login SMTP tanpa mengirim email.",
    )
    parser.add_argument(
        "--send-test",
        action="store_true",
        help="Kirim satu email uji ke --to, lalu catat jumlah penerimanya.",
    )
    parser.add_argument(
        "--to",
        help="Alamat tujuan untuk --send-test. Bisa lebih dari satu, pisahkan koma.",
    )
    parser.add_argument(
        "--subject",
        default="Google SMTP limit checker test",
        help="Subject email uji.",
    )
    parser.add_argument(
        "--body",
        default="Email ini dikirim oleh google_smtp_limit_checker.py.",
        help="Isi email uji.",
    )
    parser.add_argument(
        "--password-env",
        default="GOOGLE_SMTP_PASSWORD",
        help="Nama environment variable berisi app password SMTP.",
    )
    parser.add_argument(
        "--smtp-host",
        default="smtp.gmail.com",
        help="Host SMTP Google. Default: smtp.gmail.com",
    )
    parser.add_argument(
        "--smtp-port",
        type=positive_int,
        default=465,
        help="Port SMTP SSL. Default: 465",
    )
    parser.add_argument(
        "--timeout",
        type=positive_int,
        default=30,
        help="Timeout koneksi SMTP dalam detik.",
    )
    return parser.parse_args()


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("nilai harus lebih besar dari 0")
    return parsed


def non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("nilai tidak boleh negatif")
    return parsed


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "accounts": {}}

    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"File state tidak valid: {path} ({exc})") from exc

    if not isinstance(data, dict):
        raise SystemExit(f"File state tidak valid: {path}")
    data.setdefault("version", 1)
    data.setdefault("accounts", {})
    return data


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(state, file, indent=2, sort_keys=True)
        file.write("\n")


def today_key() -> str:
    return dt.datetime.now().astimezone().date().isoformat()


def get_day_entry(state: dict[str, Any], account: str, day: str) -> dict[str, Any]:
    account_data = state["accounts"].setdefault(account, {"days": {}})
    days = account_data.setdefault("days", {})
    return days.setdefault(
        day,
        {
            "sent_recipients": 0,
            "events": [],
        },
    )


def add_usage(
    state: dict[str, Any],
    account: str,
    day: str,
    count: int,
    note: str,
) -> None:
    if count == 0:
        return

    entry = get_day_entry(state, account, day)
    entry["sent_recipients"] = int(entry.get("sent_recipients", 0)) + count
    events = entry.setdefault("events", [])
    events.append(
        {
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "recipients": count,
            "note": note,
        }
    )
    entry["events"] = events[-50:]


def parse_recipients(raw_recipients: str | None) -> list[str]:
    if not raw_recipients:
        return []
    return [item.strip() for item in raw_recipients.split(",") if item.strip()]


def get_password(env_name: str) -> str:
    password = os.environ.get(env_name)
    if password:
        return password
    if sys.stdin.isatty():
        return getpass.getpass(f"Masukkan app password SMTP ({env_name}): ")
    raise SystemExit(
        f"Password tidak ditemukan. Set environment variable {env_name}."
    )


def check_auth(
    account: str,
    password: str,
    host: str,
    port: int,
    timeout: int,
) -> None:
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=context, timeout=timeout) as smtp:
        smtp.login(account, password)


def send_test_email(
    account: str,
    password: str,
    recipients: list[str],
    subject: str,
    body: str,
    host: str,
    port: int,
    timeout: int,
) -> None:
    message = EmailMessage()
    message["From"] = account
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=context, timeout=timeout) as smtp:
        smtp.login(account, password)
        smtp.send_message(message)


def print_status(account: str, profile: str, limit: int, sent: int, day: str) -> None:
    remaining = max(limit - sent, 0)
    usage_percent = (sent / limit) * 100

    print("=== Google SMTP Limit Checker ===")
    print(f"Akun        : {account}")
    print(f"Tanggal     : {day}")
    print(f"Profil      : {profile}")
    print(f"Limit lokal : {limit} penerima/hari")
    print(f"Terpakai    : {sent} penerima ({usage_percent:.1f}%)")
    print(f"Sisa estimasi: {remaining} penerima")
    print()
    print(
        "Catatan: angka ini adalah counter lokal. Google menghitung limit di sisi "
        "server dan bisa memakai jendela waktu/aturan tambahan."
    )


def print_smtp_error(exc: smtplib.SMTPException) -> None:
    print("SMTP gagal:", file=sys.stderr)
    print(f"  {exc}", file=sys.stderr)
    print(
        "Jika pesan error menyebut 'Daily user sending quota exceeded' atau "
        "'Too many recipients', akun kemungkinan sudah menyentuh limit Google.",
        file=sys.stderr,
    )


def main() -> int:
    args = parse_args()
    day = today_key()
    limit = args.daily_limit or DEFAULT_LIMITS[args.profile]
    state = load_state(args.state_file)

    if args.record:
        add_usage(state, args.account, day, args.record, args.record_note)
        save_state(args.state_file, state)

    recipients = parse_recipients(args.to)

    if args.send_test and not recipients:
        raise SystemExit("--send-test membutuhkan --to")

    needs_smtp_password = args.check_auth or args.send_test
    password = get_password(args.password_env) if needs_smtp_password else None

    if args.check_auth:
        try:
            check_auth(
                args.account,
                password or "",
                args.smtp_host,
                args.smtp_port,
                args.timeout,
            )
        except smtplib.SMTPException as exc:
            print_smtp_error(exc)
            return 2
        print("Login SMTP berhasil.")

    if args.send_test:
        try:
            send_test_email(
                args.account,
                password or "",
                recipients,
                args.subject,
                args.body,
                args.smtp_host,
                args.smtp_port,
                args.timeout,
            )
        except smtplib.SMTPException as exc:
            print_smtp_error(exc)
            return 2

        add_usage(
            state,
            args.account,
            day,
            len(recipients),
            args.record_note or "send test",
        )
        save_state(args.state_file, state)
        print(f"Email uji berhasil dikirim ke {len(recipients)} penerima.")

    entry = get_day_entry(state, args.account, day)
    sent = int(entry.get("sent_recipients", 0))
    print_status(args.account, args.profile, limit, sent, day)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
