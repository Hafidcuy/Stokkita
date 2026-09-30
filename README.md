# Stokita — Final Web Inventory

Versi final ini memakai Supabase untuk Auth, PostgreSQL, RLS, Storage, CRUD produk, dan transaksi stok.

## 1. Setup Supabase Utama

1. Project utama Supabase yang digunakan adalah `stokkita`.
2. Buka `supabase-config.js` untuk melihat konfigurasi frontend.
3. Jangan mengganti Project URL atau publishable key kecuali memang memindahkan deployment.
4. Buka `supabase-config.js` dan cek:
   - `SUPABASE_URL` dengan Project URL.
   - `SUPABASE_KEY` dengan publishable key/anon key.
5. Jangan masukkan `service_role` key ke file frontend.

## 2. Jalankan website

Untuk GitHub Pages, upload **isi folder ini** ke root repository yang dipakai GitHub Pages. Pastikan `index.html` berada langsung di root repository.

Untuk XAMPP, letakkan folder ini di `htdocs`, lalu buka melalui Apache, misalnya:

`http://localhost/Stokita-Web/`

Jangan membuka file dengan `file://` jika ingin memakai Auth/redirect OAuth.

## 3. Fitur backend yang sudah aktif

- Register dan login email/password melalui Supabase Auth.
- Google OAuth button (memerlukan Google provider di Supabase).
- Profile user otomatis dibuat setelah register.
- Tambah, edit, hapus, cari, dan filter produk.
- Upload gambar produk ke Supabase Storage.
- RLS untuk membatasi data setiap user.
- Transaksi stok masuk dan stok keluar.
- Stok berubah otomatis ketika transaksi disimpan.
- Stok keluar ditolak jika jumlah melebihi stok.
- Transaksi dan perubahan stok dilakukan oleh satu RPC database transaction.
- Dashboard membaca data langsung dari Supabase.
- Link Google Spreadsheet disimpan ke profile.
- Import produk dari Google Spreadsheet publik ke Supabase.

## 4. Format Google Spreadsheet

Untuk tombol **Import Data**, spreadsheet harus dapat dibaca publik sebagai Viewer melalui link.

Header minimum:

`Kode | Nama | Stok`

Header tambahan yang didukung:

`Kategori | Harga | Satuan | Supplier | Deskripsi | Image URL`

Contoh:

| Kode | Nama | Kategori | Harga | Stok | Satuan | Supplier | Deskripsi |
|---|---|---|---:|---:|---|---|---|
| BRG001 | Laptop | Elektronik | 7500000 | 10 | Unit | Supplier A | Laptop sekolah |
| BRG002 | Mouse | Elektronik | 150000 | 25 | Unit | Supplier B | Mouse USB |

Tekan **Simpan Link**, lalu **Import Data**. Data akan di-upsert berdasarkan kombinasi `user_id + kode`.

### Spreadsheet privat

Import langsung memakai link tidak dapat membaca spreadsheet privat tanpa autentikasi Google. Untuk akses privat, aktifkan Google provider/OAuth di Supabase dan gunakan tombol Google. Google Sheets API memang membutuhkan OAuth scope untuk membaca spreadsheet pengguna. Lihat dokumentasi resmi Google dan Supabase sebelum mengaktifkannya.

## 5. Google OAuth

Untuk tombol Google bekerja, konfigurasi Google provider di Supabase Authentication dan Google Cloud OAuth Client.

### Konfigurasi URL di Dashboard Supabase (wajib untuk deployment GitHub Pages)

Login Google hanya akan mengembalikan user ke URL yang terdaftar di Supabase. Lakukan sekali saja:

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → pilih project **stokkita**.
2. Buka **Authentication** → **URL Configuration**.
3. Isi **Site URL** dengan: `https://hafidcuy.github.io/Stokkita/`
4. Di bagian **Redirect URLs**, klik **Add URL** lalu tambahkan:
   - `https://hafidcuy.github.io/Stokkita/**`
   - `http://localhost/**` (opsional, untuk uji lokal)
5. Klik **Save**.

Tanpa langkah ini, setelah memilih akun Google, user akan diarahkan ke URL Site URL lama (bukan ke aplikasi), sehingga login Google terlihat gagal.

Untuk lokal, tambahkan origin aplikasi lokal, misalnya `http://localhost`, dan callback URL yang ditampilkan di halaman Google provider Supabase.

Kode meminta scope read-only Google Sheets untuk akses spreadsheet.

## 6. Keamanan

Frontend hanya menggunakan publishable/anon key. RLS membatasi data berdasarkan `auth.uid()`. Credential rahasia seperti service-role key atau Google client secret tidak dimasukkan ke frontend.


## 7. GitHub Pages

Untuk deployment sebagai situs pengguna `hafidcuy.github.io`, repository GitHub harus bernama `hafidcuy.github.io` dan GitHub Pages harus memakai branch `main` serta folder `/ (root)`.

Pastikan struktur repository:

```text
index.html
app.js
style.css
supabase-config.js
README.md
```

URL final: `https://hafidcuy.github.io/`

Jika repository memakai nama lain, URL Pages biasanya menjadi `https://hafidcuy.github.io/NAMA-REPOSITORY/`.


## 8. PWA (Progressive Web App)

Stokita sudah terpasang sebagai PWA dan bisa dipasang seperti aplikasi biasa di HP/desktop.

**Komponen yang aktif**

| Bagian | Isi |
|---|---|
| `manifest.json` | nama, `display: standalone`, `start_url`/`scope` `./`, warna tema `#1E2D51`, ikon 192 & 512 (+ maskable), `shortcuts` "Daftar Barang" & "Transaksi Stok" |
| `service-worker.js` (v7) | app shell di-cache → **buka offline**; HTML/JS/CSS *network-first* (update GitHub Pages langsung terpakai), aset statis *stale-while-revalidate*, request Supabase/Google Fonts lewat langsung |
| `<head>` | `link rel=manifest`, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-capable` |
| Pengaturan → Tentang Aplikasi | tombol **Pasang Aplikasi** (menangkap `beforeinstallprompt` + panduan iOS) |

**Cara memasang**

- **Android (Chrome)**: buka situs → menu ⋮ → **Pasang aplikasi** / **Tambahkan ke layar utama**. Atau: Pengaturan → Tentang Aplikasi → Pasang.
- **iPhone (Safari)**: tombol **Bagikan** → **Tambahkan ke Layar Utama**.
- **Desktop (Chrome/Edge)**: ikon pasang di ujung address bar, atau menu ⋮ → Pasang Stokita.

**Perilaku offline**

- Shell aplikasi (halaman, CSS, JS, ikon) tampil tanpa internet.
- Data barang/transaksi tetap butuh koneksi ke Supabase; jika offline, proses simpan akan gagal dengan pesan error.
- Saat versi cache berubah (mis. `v7`), service worker menghapus cache lama otomatis.

**Pintasan (shortcut)**: tekan lama ikon aplikasi (Android) → "Daftar Barang" / "Transaksi Stok" langsung membuka halaman itu (`?page=products` / `?page=transactions`).

**Cara verifikasi**: DevTools → *Application* → *Manifest* & *Service Workers*, atau jalankan Lighthouse → audit PWA.
