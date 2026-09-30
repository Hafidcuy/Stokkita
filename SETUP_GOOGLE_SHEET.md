# Setup: Kirim Data Stokita ke Google Spreadsheet

Fitur ini membuat data barang & transaksi Stokita terkirim otomatis ke Google Spreadsheet
dan **sudah tertata rapi** (header navy, baris dibekukan, format Rupiah, lebar kolom otomatis,
warna status Aman/Menipis/Habis, tab terpisah **Barang** dan **Transaksi**).

Cara kerjanya: Stokita → (kirim data) → **Google Apps Script Web App** → Spreadsheet Anda.
Semuanya gratis dan berjalan di akun Google Anda sendiri. Setup cukup **sekali**.

---

## Langkah 1 — Buat Spreadsheet kosong

1. Buka <https://docs.google.com/spreadsheets/create>
2. Beri nama, misal: **Stokita**
3. Buka tab **Ekstensi → Apps Script**

## Langkah 2 — Tempel kode

1. Hapus semua isi file `Code.gs` yang tampil
2. Tempel kode di bawah ini
3. Tekan **Ctrl+S** untuk simpan, beri nama proyek: `Stokita Sync`

```js
/** Stokita Sync — terima data dari Stokita lalu tulis rapi ke Spreadsheet. */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    const first = ss.getSheets()[0];
    // pakai Sheet1 bila masih kosong, supaya tidak menumpuk tab
    if (ss.getSheets().length === 1 && first.getLastRow() === 0) first.setName(name);
    else sh = ss.insertSheet(name);
    sh = ss.getSheetByName(name) || sh;
  }
  return sh;
}

function rapi_(sh, rows, headers) {
  sh.clear();
  sh.getRange(1, 1, rows.length + 1, headers.length).setValues([headers].concat(rows));
  const head = sh.getRange(1, 1, 1, headers.length);
  head.setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1E2D51")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setFrozenRows(1);
  const all = sh.getRange(1, 1, rows.length + 1, headers.length);
  all.setFontFamily("Poppins").setFontSize(10).setVerticalAlignment("middle");
  sh.autoResizeColumns(1, headers.length);
}

function doPost(e) {
  const lock = LockService.getPublicLock();
  lock.waitLock(30000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.app !== "Stokita") return json_({ ok: false, message: "Payload tidak dikenal." });

    const barang = data.products || [];
    const transaksi = data.transactions || [];

    // ---- Tab Barang ----
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    const rowsB = barang.map(p => {
      const stok = Number(p.stok || 0);
      return [p.kode, p.nama, p.kategori, Number(p.harga || 0), stok,
              p.satuan, p.supplier, p.deskripsi,
              stok <= 0 ? "Habis" : stok <= 3 ? "Menipis" : "Aman", now];
    });
    const shB = sheet_("Barang");
    rapi_(shB, rowsB, ["Kode", "Nama", "Kategori", "Harga", "Stok", "Satuan",
                       "Supplier", "Deskripsi", "Status", "Diperbarui"]);
    if (rowsB.length) {
      shB.getRange(2, 4, rowsB.length, 1).setNumberFormat('"Rp"#,##0');
      shB.getRange(2, 5, rowsB.length, 1).setNumberFormat("#,##0");
      rowsB.forEach((r, i) => {
        const c = shB.getRange(2 + i, 9);
        if (r[8] === "Habis") c.setBackground("#FEECEC").setFontColor("#D92D20");
        else if (r[8] === "Menipis") c.setBackground("#FEF0E7").setFontColor("#B54708");
        else c.setBackground("#E7F6EC").setFontColor("#067647");
      });
    }

    // ---- Tab Transaksi ----
    const byId = {};
    barang.forEach(p => { byId[p.id] = p; });
    const rowsT = transaksi.map(t => {
      const p = byId[t.product_id] || {};
      return [t.created_at ? new Date(t.created_at) : new Date(),
              p.kode || t.product_id || "-", p.nama || "-",
              t.type || "-", Number(t.jumlah || 0), t.keterangan || ""];
    });
    const shT = sheet_("Transaksi");
    rapi_(shT, rowsT, ["Waktu", "Kode Barang", "Nama Barang", "Jenis", "Jumlah", "Keterangan"]);
    if (rowsT.length) {
      shT.getRange(2, 1, rowsT.length, 1).setNumberFormat("dd/MM/yyyy HH:mm");
      shT.getRange(2, 5, rowsT.length, 1).setNumberFormat("#,##0");
    }

    return json_({ ok: true, barang: barang.length, transaksi: transaksi.length });
  } catch (err) {
    return json_({ ok: false, message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, app: "Stokita", time: new Date().toISOString() });
}
```

## Langkah 3 — Deploy sebagai Web App

1. Klik tombol **Deploy → New deployment**
2. Klik ikon gerigi ⚙ → pilih **Web app**
3. Isi:
   - **Description**: `Stokita Sync`
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone**
4. Klik **Deploy** → muncul **Authorize access**
5. Pilih akun Google Anda → jika muncul peringatan
   *"Google hasn't verified this app"* → klik **Advanced → Go to Stokita Sync (unsafe)**
   → **Allow** (aman, ini script milik Anda sendiri)
6. Salin **Web app URL** yang diakhiri `/exec`

> ⚠️ Setiap kali kode di langkah 2 diubah, klik lagi
> **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy**

## Langkah 4 — Pasang di Stokita

1. Buka Stokita → **Pengaturan** → grup **OPERASIONAL & PERANGKAT**
2. Buka **Kirim ke Spreadsheet**
3. Tempel URL `/exec` tadi (otomatis tersimpan di perangkat)
4. Klik **Uji Koneksi** → muncul "Koneksi berhasil"
5. Klik **Kirim Data** → semua barang & transaksi terkirim

---

## Hasil di Spreadsheet

| Tab | Isi |
|---|---|
| **Barang** | Kode, Nama, Kategori, Harga (Rp), Stok, Satuan, Supplier, Deskripsi, Status berwarna, Diperbarui |
| **Transaksi** | Waktu, Kode Barang,Nama Barang, Jenis (masuk/keluar), Jumlah, Keterangan |

- Baris 1 di-*freeze* (tetap terlihat saat digulir)
- Header: tebal, huruf putih, latar navy `#1E2D51`
- Kolom menyesuaikan isi (auto-resize), huruf Poppins 10
- Status: hijau = Aman, oranye = Menipis, merah = Habis

## Troubleshooting

| Masalah | Solusi |
|---|---|
| "Spreadsheet tidak merespons" | Pastikan **Who has access = Anyone** dan URL diakhiri `/exec` |
| Perubahan kode tidak masuk | Deploy ulang dengan **Version: New version** (langkah 3.6) |
| Data lama tidak hilang, malah numpuk | Tidak masalah — setiap kirim, isi tab di-reset ulang dari awal (`clear()`) |
| Mau ganti spreadsheet | Buat spreadsheet & script baru, deploy, ganti URL di Stokita |

## Catatan keamanan

- URL `/exec` bersifat publik: siapa pun yang tahu URL **hanya bisa menulis** ke spreadsheet ini
  (tidak bisa membaca data lain, tidak bisa menyentuh akun/Supabase Anda).
  Script tidak menerima perintah apa pun selain menimpa 2 tab di atas.
- Data dikirim sebagai JSON lewat HTTPS. Tidak ada kredensial yang disertakan.
