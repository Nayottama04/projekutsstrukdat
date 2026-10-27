# RaceParts

Website toko suku cadang motor racing. Frontend HTML/CSS/JavaScript bergaya Apple minimalis, backend C++ (Crow), database MySQL lokal (XAMPP).
Mengikuti `PRD_RaceParts_v0_3.md`: katalog, pencarian, keranjang, checkout, **pembayaran simulasi**, pelacakan pesanan, ulasan, chat, dan dashboard penjual.

## Isi paket

```
raceparts/
├─ database/raceparts_db.sql   <- file database (skema 24 tabel + data demo), impor ke MySQL
├─ config/app.conf             <- host/user/password MySQL dan port server
├─ src/                        <- backend C++ (main.cpp, algo.hpp, db.hpp, routes_*.hpp, util.hpp)
├─ frontend/                   <- index.html, css/, js/, img/
├─ third_party/                <- Crow + Asio (sudah disertakan, tidak perlu dipasang)
├─ CMakeLists.txt
├─ run.sh                      <- Linux/WSL: build + jalan
├─ build-windows.bat           <- Windows: build
└─ run-windows.bat             <- Windows: jalan
```

## Yang perlu dipasang

| Kebutuhan | Keterangan |
|---|---|
| MySQL / MariaDB | Paling mudah: **XAMPP** (aktifkan modul MySQL) |
| Compiler C++17 + CMake | Windows: Visual Studio 2019/2022 (workload "Desktop development with C++"). Linux/WSL: `sudo apt install build-essential cmake` |
| MySQL Connector/C++ (API legacy "jdbc") | Windows: unduh paket **8.x** dari dev.mysql.com/downloads/connector/cpp (pilih arsitektur 64-bit). Linux/WSL: `sudo apt install libmysqlcppconn-dev` |
| Visual Studio Code | Hanya untuk membuka dan mengedit proyek (folder `raceparts`) |

Crow dan Asio sudah ada di `third_party/`, jadi tidak ada langkah pemasangan untuk keduanya.

## Langkah 1 - Impor database

1. Buka XAMPP Control Panel, klik **Start** pada MySQL.
2. Buka `http://localhost/phpmyadmin` > tab **Import** > pilih `database/raceparts_db.sql` > **Go**.
   (Atau terminal: `mysql -u root < database/raceparts_db.sql`.)
3. Database `raceparts_db` terbentuk lengkap dengan 24 produk, 44 varian, 3 akun, dan 4 pesanan contoh.

Pengaturan bawaan XAMPP (user `root`, tanpa password, port 3306) sudah sama dengan `config/app.conf`. Ubah file itu bila berbeda.

## Langkah 2 - Build dan jalankan

**Windows (Visual Studio + XAMPP)**
1. Pasang MySQL Connector/C++ 8.x. Bila foldernya bukan `C:\Program Files\MySQL\MySQL Connector C++ 8.0`, ubah baris `MYSQLCPPCONN_ROOT` di `build-windows.bat`.
2. Buka *x64 Native Tools Command Prompt for VS*, masuk ke folder proyek, jalankan `build-windows.bat`.  
3. Jalankan `run-windows.bat`, lalu buka **http://localhost:8080**.

**Linux / WSL**
```bash
./run.sh        # build otomatis pada percobaan pertama, lalu server menyala
```
Buka **http://localhost:8080**.

Server harus dijalankan dari folder utama proyek (tempat `config/` dan `frontend/` berada); kedua skrip di atas sudah mengurusnya.

## Akun demo

| Peran | Username | Password |
|---|---|---|
| Penjual (dashboard) | `penjual` | `penjual123` |
| Pelanggan | `pelanggan` | `pelanggan123` |
| Pelanggan | `rizky` | `rizky12345` |

Ganti password akun demo bila aplikasi dibuka di luar komputer sendiri. Server hanya mendengarkan `127.0.0.1` secara bawaan.

## Cara memeriksa persyaratan C++ (Array, Pointer, Struct, Sorting, Searching)

Semua ada di `src/algo.hpp` dan dipakai oleh `catalogHandler` di `src/routes_public.hpp`:

| Konsep | Lokasi |
|---|---|
| **Struct** | `struct Product` |
| **Array** | `static Product catalog[MAX_PRODUCTS]`, `results[]`, `matchIdx[]` |
| **Pointer** | `bubbleSort(Product* arr, ...)`, aritmetika pointer `arr + j`, pengecekan `nullptr` |
| **Sorting** | `bubbleSort` : nama A-Z, harga terendah/tertinggi, terbaru |
| **Searching** | `linearSearch` : nama, merek, atau kategori (tidak peka huruf besar/kecil) |

Alur setiap permintaan katalog: data dari MySQL > array `Product` > **Linear Search** (bila ada kata kunci) > **Bubble Sort** > ditampilkan.
Log dibuat oleh proses yang benar-benar berjalan (sebelum/sesudah, setiap perbandingan dan pertukaran, total), disimpan di tabel `algorithm_logs`, dan bisa dilihat di:
- halaman **Katalog** > tombol *Lihat log algoritma*
- **Dashboard penjual** > *Log algoritma* (berisi tombol skenario uji)

Pengujian algoritma tanpa database (data terurut, terbalik, duplikat, kosong, satu elemen, kata kunci kosong/tidak ditemukan):
```
build/raceparts --selftest        (Windows: build\Release\raceparts.exe --selftest)
```

## Fitur

- **Pelanggan**: daftar/masuk, katalog dengan filter (kategori, merek, motor, harga), detail produk dengan varian dan kompatibilitas motor, keranjang (pilih item), checkout (alamat, pengiriman, pembayaran), status dan riwayat pesanan, konfirmasi diterima, ulasan, chat penjual, profil dan alamat.
- **Penjual**: ringkasan penjualan, CRUD produk (varian, stok, gambar, kompatibilitas motor), pesanan + status + kurir/resi manual, ulasan, master data (kategori, merek, motor), log algoritma.
- **Keamanan dasar**: password di-hash PBKDF2-HMAC-SHA256 dengan salt, semua query memakai prepared statement, harga/stok/total selalu dihitung ulang di server, otorisasi per peran dan per pemilik pesanan, perlindungan path traversal pada file statis.
- **Stok**: dikurangi saat pesanan dibuat (dengan penguncian baris), dikembalikan bila dibatalkan atau tidak dibayar dalam 15 menit.

## Hal yang perlu Anda ketahui

- **Pembayaran hanya simulasi** (QRIS/Virtual Account contoh). Tidak ada uang yang diproses, dan kode QR di halaman pesanan hanya gambar contoh.
- **Tarif pengiriman adalah tarif lokal** di tabel `shipping_rates`, bukan tarif live kurir. Nomor resi diisi manual oleh penjual.
- **Foto produk adalah ilustrasi SVG** per kategori. Untuk foto sendiri, taruh file di `frontend/img/` lalu isi path-nya (misal `/img/kampas.jpg`) di form produk dashboard.
- **Sesi login disimpan di memori server**: restart server berarti semua pengguna harus masuk lagi.
- Aplikasi ditujukan untuk localhost. Untuk dipublikasikan perlu HTTPS, pembatasan percobaan login, dan password database sendiri.
- Font memakai font sistem (SF Pro di perangkat Apple; Segoe UI di Windows) agar tampil mirip Apple tanpa memuat file font.

## Status pengujian

Diuji pada Ubuntu 24.04 (g++ 13, MariaDB 10.11, MySQL Connector/C++ 8.0): `--selftest` 10/10 lulus, 56 pemeriksaan API (registrasi, keranjang, checkout, stok, pembayaran, kedaluwarsa, ulasan, chat, CRUD penjual, otorisasi), dan 33 langkah antarmuka otomatis tanpa error JavaScript.
**Belum diuji**: build di Windows/Visual Studio, dan tampilan visual di browser sungguhan. Jika ada kendala di Windows, lihat bagian berikut.

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| Halaman memuat tetapi muncul "Tidak dapat terhubung ke database MySQL" | MySQL XAMPP belum Start, database belum diimpor, atau `db_user`/`db_pass` di `config/app.conf` salah |
| `MySQL Connector/C++ tidak ditemukan` saat CMake | Isi `MYSQLCPPCONN_ROOT` (lihat `build-windows.bat`); pastikan folder berisi `include\jdbc\mysql_driver.h` |
| Windows: `.exe` langsung tertutup / error DLL | Salin semua `*.dll` dari `<Connector>\lib64\` ke folder `build\Release\` |
| `Tidak dapat menghubungi server RaceParts` di browser | Server C++ belum jalan atau port 8080 dipakai; ubah `server_port` di `config/app.conf` |
| Layar putih/404 untuk file CSS/JS | Server tidak dijalankan dari folder utama proyek |
