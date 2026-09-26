const { createClient } = window.supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let products = [], transactions = [], currentUser = null;
const $ = id => document.getElementById(id);
const rupiah = n => new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0}).format(Number(n || 0));
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const status = n => Number(n) <= 0 ? ["Habis","empty"] : Number(n) <= 3 ? ["Menipis","low"] : ["Aman","safe"];
function fail(e){ console.error(e); alert(e?.message || "Terjadi kesalahan."); }

function parseSpreadsheetId(url){
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] || null;
}
function csvToRows(text){
  const rows = []; let row = [], cell = "", quoted = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i], next = text[i+1];
    if(ch === '"'){
      if(quoted && next === '"'){ cell += '"'; i++; } else quoted = !quoted;
    } else if(ch === ',' && !quoted){ row.push(cell); cell = ""; }
    else if((ch === '\n' || ch === '\r') && !quoted){
      if(ch === '\r' && next === '\n') i++;
      row.push(cell);
      if(row.some(x => String(x).trim() !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  if(cell !== "" || row.length){ row.push(cell); if(row.some(x => String(x).trim() !== "")) rows.push(row); }
  return rows;
}
function normHeader(v){
  return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function num(v){
  const s = String(v ?? "").trim().replace(/rp/ig, "").replace(/\s/g, "");
  if(!s) return 0;
  if(/juta/i.test(s)) return Math.round(parseFloat(s.replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", ".")) * 1_000_000);
  if(/miliar|milyar/i.test(s)) return Math.round(parseFloat(s.replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", ".")) * 1_000_000_000);
  const cleaned = s.replace(/[^0-9.,-]/g, "");
  if(cleaned.includes(",") && cleaned.includes(".")) return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(cleaned.replace(/,/g, "")) || 0;
}

async function loadData(){
  let r = await sb.from("products").select("*").order("created_at", {ascending:false});
  if(r.error) throw r.error;
  products = r.data || [];
  r = await sb.from("transactions").select("id,type,jumlah,keterangan,created_at,product_id,products(nama,kode)").order("created_at", {ascending:false}).limit(100);
  if(r.error) throw r.error;
  transactions = r.data || [];
  r = await sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
  if(r.error) throw r.error;
  const p = r.data, name = p?.full_name || currentUser.email?.split("@")[0] || "Admin";
  $("profileName").textContent = name;
  $("profileEmail").textContent = currentUser.email || "-";
  document.querySelectorAll(".user-name").forEach(x => x.textContent = name);
  $("settingsSheetStatus").textContent = p?.spreadsheet_url ? "Link tersimpan" : "Belum terhubung";
  if(p?.spreadsheet_url) $("sheetUrl").value = p.spreadsheet_url;
  render();
}
function render(){
  $("statTotal").textContent = products.length;
  $("statStock").textContent = products.reduce((a,p) => a + Number(p.stok || 0), 0);
  $("statLow").textContent = products.filter(p => Number(p.stok)>0 && Number(p.stok)<=3).length;
  $("statEmpty").textContent = products.filter(p => Number(p.stok)<=0).length;
  renderProducts($("recentProducts"), products.slice(0,5), false);
  renderProducts($("allProducts"), filtered(), true);
  renderTransactions();
  const cats = [...new Set(products.map(p => p.kategori).filter(Boolean))], old = $("categoryFilter").value;
  $("categoryFilter").innerHTML = '<option value="">Semua kategori</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if(cats.includes(old)) $("categoryFilter").value = old;
}
function filtered(){
  const q = ($("searchInput")?.value || "").toLowerCase(), c = $("categoryFilter")?.value || "";
  return products.filter(p => (!q || `${p.kode} ${p.nama} ${p.kategori}`.toLowerCase().includes(q)) && (!c || p.kategori === c));
}
function renderProducts(box, list, actions){
  if(!list.length){ box.innerHTML = '<div class="empty-state">Belum ada barang.</div>'; return; }
  box.innerHTML = list.map(p => {
    const [s,cl] = status(p.stok);
    return `<div class="product-row"><div class="product-img">${p.image_url ? `<img src="${esc(p.image_url)}" style="width:44px;height:44px;object-fit:cover;border-radius:8px">` : "📦"}</div><div><b>${esc(p.nama)}</b><small>${esc(p.kode)}</small></div><div class="hide-mobile"><small>${esc(p.kategori)}</small></div><div><b>${p.stok}</b><small>${esc(p.satuan)}</small></div><div class="hide-mobile"><span class="status ${cl}">${s}</span></div><div class="row-actions">${actions ? `<button onclick="showDetail('${p.id}')">Lihat</button><button onclick="editProduct('${p.id}')">Edit</button><button onclick="deleteProduct('${p.id}')">Hapus</button>` : `<button onclick="showDetail('${p.id}')">→</button>`}</div></div>`;
  }).join("");
}
function renderTransactions(){
  const box = $("transactionList");
  if(!box) return;
  if(!transactions.length){ box.innerHTML = '<div class="empty-state">Belum ada transaksi.</div>'; return; }
  box.innerHTML = transactions.map(t => `<div class="product-row transaction-row" style="grid-template-columns:45px 1fr 110px 1fr"><div class="product-img">${t.type === "masuk" ? "↓" : "↑"}</div><div><b>${esc(t.products?.nama || "Barang")}</b><small>${esc(t.products?.kode || "")}</small></div><div><span class="status ${t.type === "masuk" ? "safe" : "low"}">${t.type === "masuk" ? "Stok Masuk" : "Stok Keluar"}</span></div><div><b>${t.jumlah}</b><small>${esc(t.keterangan || "")} · ${new Date(t.created_at).toLocaleString("id-ID")}</small></div></div>`).join("");
}
function go(page){
  document.querySelectorAll(".page").forEach(x => x.classList.add("hidden"));
  $(`page-${page}`).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.page === page));
  $("sidebar").classList.remove("open");
  render();
}
function openProductModal(p=null){
  $("productModal").classList.remove("hidden");
  $("modalTitle").textContent = p ? "Edit Barang" : "Tambah Barang";
  $("editId").value = p?.id || ""; $("kode").value = p?.kode || ""; $("nama").value = p?.nama || "";
  $("kategori").value = p?.kategori || ""; $("harga").value = p?.harga || ""; $("stok").value = p?.stok ?? "";
  $("satuan").value = p?.satuan || ""; $("supplier").value = p?.supplier || ""; $("deskripsi").value = p?.deskripsi || ""; $("photo").value = "";
}
function editProduct(id){ const p = products.find(x => x.id === id); if(p) openProductModal(p); }
async function uploadPhoto(file){
  if(!file) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase(), path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
  const {error} = await sb.storage.from("product-images").upload(path, file, {upsert:false});
  if(error) throw error;
  return sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
async function saveProduct(e){
  e.preventDefault();
  const id = $("editId").value, old = products.find(p => p.id === id), file = $("photo").files[0];
  let image_url = old?.image_url || null;
  if(file) image_url = await uploadPhoto(file);
  const row = {kode:$("kode").value.trim(), nama:$("nama").value.trim(), kategori:$("kategori").value.trim() || "Umum", harga:Number($("harga").value || 0), stok:Number($("stok").value || 0), satuan:$("satuan").value.trim() || "Unit", supplier:$("supplier").value.trim(), deskripsi:$("deskripsi").value.trim(), image_url};
  const r = id ? await sb.from("products").update(row).eq("id",id) : await sb.from("products").insert({...row,user_id:currentUser.id});
  if(r.error) throw r.error;
  await loadData(); $("productModal").classList.add("hidden"); go("products");
}
async function deleteProduct(id){
  const p = products.find(x => x.id === id); if(!p) return;
  if(!confirm(`Hapus barang "${p.nama}"?`)) return;
  const {error} = await sb.from("products").delete().eq("id",id); if(error) throw error; await loadData();
}
function showDetail(id){
  const p = products.find(x => x.id === id); if(!p) return; const [s,cl] = status(p.stok);
  $("detailContent").innerHTML = `<div class="detail-image">${p.image_url ? `<img src="${esc(p.image_url)}" style="max-width:100%;max-height:190px;border-radius:12px">` : "📦"}</div><div class="detail-title">${esc(p.nama)}</div><span class="status ${cl}">${s}</span><div class="detail-grid"><div class="detail-item"><small>Kode</small><b>${esc(p.kode)}</b></div><div class="detail-item"><small>Kategori</small><b>${esc(p.kategori)}</b></div><div class="detail-item"><small>Harga</small><b>${rupiah(p.harga)}</b></div><div class="detail-item"><small>Stok</small><b>${p.stok} ${esc(p.satuan)}</b></div><div class="detail-item"><small>Supplier</small><b>${esc(p.supplier)}</b></div></div><p style="font-size:11px;color:#66758d">${esc(p.deskripsi)}</p><button class="primary-btn" onclick="editProduct('${p.id}');$('detailModal').classList.add('hidden')">Edit</button> <button class="primary-btn" style="background:#e9364e" onclick="deleteProduct('${p.id}');$('detailModal').classList.add('hidden')">Hapus</button>`;
  $("detailModal").classList.remove("hidden");
}
function openTransactionModal(){
  if(!products.length) return alert("Tambahkan barang terlebih dahulu.");
  $("transactionProduct").innerHTML = products.map(p => `<option value="${p.id}">${esc(p.kode)} — ${esc(p.nama)} (stok: ${p.stok})</option>`).join("");
  $("transactionType").value = "masuk"; $("transactionQty").value = ""; $("transactionNote").value = ""; $("transactionModal").classList.remove("hidden");
}
async function saveTransaction(e){
  e.preventDefault();
  const product_id=$("transactionProduct").value, type=$("transactionType").value, jumlah=Number($("transactionQty").value), keterangan=$("transactionNote").value.trim();
  if(!product_id || !jumlah || jumlah < 1) return alert("Jumlah harus lebih dari 0.");
  const {error} = await sb.rpc("record_stock_transaction", {p_product_id:product_id,p_type:type,p_jumlah:jumlah,p_keterangan:keterangan});
  if(error) throw error;
  $("transactionModal").classList.add("hidden"); await loadData(); go("transactions");
}
async function connectSheet(){
  const url=$("sheetUrl").value.trim();
  if(!url.includes("docs.google.com/spreadsheets")) return alert("Masukkan link Google Spreadsheet yang valid.");
  const {error}=await sb.from("profiles").update({spreadsheet_url:url}).eq("id",currentUser.id); if(error) throw error;
  $("sheetStatus").innerHTML="✓ Link spreadsheet tersimpan di Supabase<br>✓ Tekan Import Data untuk membaca spreadsheet";
  $("settingsSheetStatus").textContent="Link tersimpan";
}
async function importSpreadsheet(){
  const url=$("sheetUrl").value.trim(), id=parseSpreadsheetId(url); if(!id) return alert("Link Google Spreadsheet tidak valid.");
  $("sheetStatus").textContent="Membaca spreadsheet...";
  const endpoints=[`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Sheet1`,`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`];
  let text=null,lastErr=null;
  for(const endpoint of endpoints){
    try{
      const r=await fetch(endpoint); if(!r.ok) throw new Error(`HTTP ${r.status}`); const t=await r.text();
      if(t.trim().startsWith("<!DOCTYPE html") || t.includes("Sign in to continue")) throw new Error("Spreadsheet tidak publik atau membutuhkan login Google");
      text=t; break;
    }catch(e){ lastErr=e; }
  }
  if(text===null){ $("sheetStatus").innerHTML="✕ Tidak bisa membaca spreadsheet. Pastikan spreadsheet dibagikan <b>Anyone with the link → Viewer</b>."; throw lastErr || new Error("Gagal membaca spreadsheet."); }
  const rows=csvToRows(text); if(rows.length<2) throw new Error("Spreadsheet kosong atau hanya memiliki header.");
  const headers=rows[0].map(normHeader);
  const aliases={kode:["kode","code","kodebarang","itemcode"],nama:["nama","name","namabarang","item","product"],kategori:["kategori","category"],harga:["harga","price","cost"],stok:["stok","stock","jumlah","quantity"],satuan:["satuan","unit"],supplier:["supplier","pemasok"],deskripsi:["deskripsi","description","keterangan"],image_url:["imageurl","foto","gambar","image"]};
  const idx=k=>headers.findIndex(h=>aliases[k].includes(h));
  const missing=["kode","nama","stok"].filter(k=>idx(k)<0); if(missing.length) throw new Error("Kolom wajib tidak ditemukan: "+missing.join(", ")+". Gunakan header Kode, Nama, Stok.");
  const imported=[];
  for(const row of rows.slice(1)){
    const kode=String(row[idx("kode")]||"").trim(), nama=String(row[idx("nama")]||"").trim(); if(!kode || !nama) continue;
    imported.push({user_id:currentUser.id,kode,nama,kategori:String(idx("kategori")>=0?row[idx("kategori")]:"Umum").trim()||"Umum",harga:num(idx("harga")>=0?row[idx("harga")]:0),stok:Math.max(0,Math.round(num(idx("stok")>=0?row[idx("stok")]:0))),satuan:String(idx("satuan")>=0?row[idx("satuan")]:"Unit").trim()||"Unit",supplier:String(idx("supplier")>=0?row[idx("supplier")]:"").trim(),deskripsi:String(idx("deskripsi")>=0?row[idx("deskripsi")]:"").trim(),image_url:String(idx("image_url")>=0?row[idx("image_url")]:"").trim()||null});
  }
  if(!imported.length) throw new Error("Tidak ada baris produk yang valid untuk diimpor.");
  const {error}=await sb.from("products").upsert(imported,{onConflict:"user_id,kode"}); if(error) throw error;
  await loadData(); $("sheetStatus").innerHTML=`✓ Berhasil mengimpor <b>${imported.length}</b> produk ke Supabase.`;
}
async function googleAuth(){
  const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{queryParams:{access_type:"offline",prompt:"consent"},scopes:"https://www.googleapis.com/auth/spreadsheets.readonly"}});
  if(error) throw error;
}
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(session){ currentUser=session.user; $("auth").classList.add("hidden"); $("app").classList.remove("hidden"); await loadData(); }
  else { $("splash").classList.add("hidden"); $("auth").classList.remove("hidden"); }
  sb.auth.onAuthStateChange(async(_,session)=>{
    currentUser=session?.user||null;
    if(session){ $("auth").classList.add("hidden"); $("app").classList.remove("hidden"); try{await loadData();}catch(e){fail(e);} }
    else { $("app").classList.add("hidden"); $("auth").classList.remove("hidden"); }
  });
}

document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>{$("splash").classList.add("hidden"); if(!currentUser) $("auth").classList.remove("hidden");},1200);
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{const m=b.dataset.auth;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));$("loginForm").classList.toggle("hidden",m!=="login");$("registerForm").classList.toggle("hidden",m!=="register");}));
  document.querySelectorAll("[data-switch]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();document.querySelector(`.tab[data-auth="${a.dataset.switch}"]`).click();}));
  $("loginForm").addEventListener("submit",async e=>{e.preventDefault();try{const email=$("loginUser").value.trim();const {error}=await sb.auth.signInWithPassword({email,password:$("loginPass").value});if(error)throw error;}catch(e){fail(e);}});
  $("registerForm").addEventListener("submit",async e=>{e.preventDefault();try{const {data,error}=await sb.auth.signUp({email:$("regEmail").value.trim(),password:$("regPass").value,options:{data:{full_name:$("regName").value.trim(),username:$("regUser").value.trim()}}});if(error)throw error;alert(data.session?"Akun dibuat dan sudah login.":"Akun dibuat. Cek email jika konfirmasi email aktif.");document.querySelector('.tab[data-auth="login"]').click();}catch(e){fail(e);}});
  $("googleLoginBtn")?.addEventListener("click",()=>googleAuth().catch(fail));
  $("googleRegisterBtn")?.addEventListener("click",()=>googleAuth().catch(fail));
  document.querySelectorAll(".nav-item").forEach(x=>x.addEventListener("click",()=>go(x.dataset.page)));
  document.querySelectorAll(".text-btn").forEach(x=>x.addEventListener("click",()=>go(x.dataset.page)));
  $("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  $("addProductBtn").addEventListener("click",()=>openProductModal()); $("addFromDash").addEventListener("click",()=>openProductModal()); $("addTransactionBtn").addEventListener("click",openTransactionModal);
  $("sheetSidebarBtn").addEventListener("click",()=>go("dashboard")); $("searchInput").addEventListener("input",render); $("categoryFilter").addEventListener("change",render);
  $("closeModal").addEventListener("click",()=>$("productModal").classList.add("hidden")); $("closeDetail").addEventListener("click",()=>$("detailModal").classList.add("hidden")); $("closeTransaction").addEventListener("click",()=>$("transactionModal").classList.add("hidden"));
  $("productForm").addEventListener("submit",e=>saveProduct(e).catch(fail)); $("transactionForm").addEventListener("submit",e=>saveTransaction(e).catch(fail)); $("connectSheet").addEventListener("click",()=>connectSheet().catch(fail)); $("importSheet").addEventListener("click",()=>importSpreadsheet().catch(fail));
  $("logoutBtn").addEventListener("click",async()=>{const {error}=await sb.auth.signOut();if(error)fail(error);});
  boot().catch(fail);
});
