"use strict";

const express = require("express");
const login = require("../lib/login");
const fs = require("fs");
const path = require("path");
const router = express.Router();

// Asumsi router sudah dideklarasikan
router.get("/", (req, res) => {
  // 1. Set header khusus untuk menjaga koneksi tetap terbuka (SSE)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // 2. Buat fungsi untuk mengekstrak dan mengirim data terbaru
  const sendData = () => {
    try {
      // PENGAMAN 1: Gunakan fallback {} jika login.jobs belum ada / undefined
      const dat = login?.jobs || {};

      let allData = Object.values(dat).map((item) => item.statusData);
      if (global.shouldStop) {
        allData = []; // Kosongkan data jika proses dihentikan
      }

      // PENGAMAN 2: Gunakan d?.pin?.length agar tidak crash jika 'pin' undefined
      const berhasil = allData?.berhasil;
      const gagal = allData?.gagal;

      const total = Object.values(dat).reduce(
        (sum, item) => sum + (item.count || 0),
        0,
      );

      // PENGAMAN 3: Masukkan 'berhasil' dan 'gagal' ke dalam payload agar terkirim ke Frontend
      const payload = JSON.stringify({
        status: "ok",
        total,
        berhasil,
        gagal,
        data: allData.filter((item) => item != null),
      });

      // ATURAN SSE: Data HARUS diawali dengan "data: " dan diakhiri dengan "\n\n"
      res.write(`data: ${payload}\n\n`);
    } catch (error) {
      console.error("Stream Error:", error);
      // Agar kalaupun ada error logika lain, server tidak mati total
    }
  };

  // Kirim data langsung saat client pertama kali connect
  sendData();

  // 3. Jalankan interval untuk mengirim data setiap 1 detik (1000 ms)
  const intervalId = setInterval(sendData, 1000);

  // 4. SANGAT PENTING: Hentikan interval jika client menutup tab browser / disconnect
  req.on("close", () => {
    clearInterval(intervalId);
    res.end();
  });
});

router.get("/error", (req, res) => {
  const filePath = path.join(__dirname, "../lib", "axios-error.json");

  if (!fs.existsSync(filePath)) {
    return res.json({
      status: "ok",
      data: [],
    });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json({ status: "ok", data });
  } catch (err) {
    res.json({
      status: "ok",
      data: [],
    });
  }
});

router.get("/data", (req, res) => {
  const dir = path.join(__dirname, "../lib");

  const data = Array.from(
    { length: 5 },
    (_, i) => `data${i + 1}.json`,
  ).flatMap((file) => {
    const filePath = path.join(dir, file);

    if (!fs.existsSync(filePath)) return [];

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  });
  const berhasil = data.filter((d) => d?.data?.pin?.length === 8)?.length || 0;
  const gagal = data.filter((d) => d?.data?.pin?.length !== 8)?.length || 0;
  res.json({ status: "ok", data, total: data.length, berhasil, gagal });
});
const activeSlots = new Set();

router.get("/reset", (req, res) => {
  try {
    global.shouldStop = true; // Set global flag untuk menghentikan proses login
    const dir = path.join(__dirname, "../lib");
    let fileTerhapus = 0;

    // Looping untuk mengecek dan menghapus data1.json sampai data20.json
    for (let i = 1; i <= 5; i++) {
      const filePath = path.join(dir, `data${i}.json`);

      // Jika file ada, hapus filenya
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        fileTerhapus++;
      }
    }
    return res.json({
      status: "ok",
      message: "Seluruh task aktif dan file data berhasil direset.",
    });
  } catch (error) {
    console.error("Error saat reset:", error);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan internal saat mereset data.",
    });
  }
});
// 1. Set global HANYA untuk melacak nomor (1 sampai 5)

router.get("/sendLogin", (req, res) => {
  const prefix = req.query.prefix || "2505";
  const startDate = req.query.startDate || "01/01/2006";
  const endDate = req.query.endDate || "31/12/2008";
  const max = parseInt(req.query.max) || 9999;
  
  // Ubah istilahnya: 'jumlahWorker' (bukan lagi nomor/page)
  // Misalnya user ketik 3, berarti mau jalankan 3 task sekaligus
  const jumlahWorker = parseInt(req.query.page) || 1; 
  const limit = parseInt(req.query.limit) || 100;

  const id = generateSequence(prefix, max);

  if (jumlahWorker < 1 || jumlahWorker > 5) {
    return res.status(400).json({
      status: "error",
      message: "Parameter jumlah proses tidak valid (Maksimal 5)",
    });
  }

  if (limit > id.length) {
    return res.status(400).json({ status: "error", message: "Limit exceeds available IDs" });
  }

  // 1. Cari slot Worker yang KOSONG untuk menampung jumlah request
  const availableWorkers = [];
  for (let slot = 1; slot <= 5; slot++) { // Anggap maksimal ada 5 slot sistem
    if (!activeSlots.has(slot)) {
      availableWorkers.push(slot);
    }
    // Jika sudah menemukan slot kosong sebanyak yang direquest, hentikan pencarian
    if (availableWorkers.length === jumlahWorker) break; 
  }

  // 2. Jika tidak ada slot sama sekali yang kosong
  if (availableWorkers.length === 0) {
    return res.status(429).json({
      status: "warning",
      message: "Semua slot sistem sedang penuh. Harap tunggu.",
    });
  }

  // 3. Jalankan task sesuai jumlah slot yang berhasil didapat
  availableWorkers.forEach((slotID, index) => {
    activeSlots.add(slotID);

    // PAGINASI: Karena kita mau memproses dari awal, 
    // Worker 1 ambil page 1, Worker 2 ambil page 2, dst.
    // Kita gunakan (index + 1) sebagai pengganti parameter "page" ke dapatkanHalaman
    const halamanUntukDiambil = index + 1; 
    
    console.log(`Worker Slot ${slotID} memulai proses login untuk Halaman Data ${halamanUntukDiambil}`);

    login
      .main(slotID, startDate, endDate, dapatkanHalaman(id, halamanUntukDiambil, limit))
      .then(() => console.log(`Task di Slot ${slotID} selesai.`))
      .catch((err) => console.error(`Task di Slot ${slotID} error:`, err))
      .finally(() => {
        activeSlots.delete(slotID);
        console.log(`Slot ${slotID} dikosongkan.`);
      });
  });

  res.json({
    status: "ok",
    message: "Proses login dimulai.",
    data: {
      workerYangBerjalan: availableWorkers,
      jumlahDiminta: jumlahWorker,
      catatan: availableWorkers.length < jumlahWorker ? "Tidak semua worker dijalankan karena sistem penuh." : "OK"
    },
  });
});

router.get("/app", (req, res) => {
  const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Task Monitor</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        :root {
            --bg-color: #0f172a; --card-bg: rgba(30, 41, 59, 0.6);
            --card-inner: rgba(15, 23, 42, 0.4); --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #f8fafc; --text-secondary: #94a3b8;
            --accent-color: #3b82f6; --success: #10b981; --danger: #ef4444; --warning: #f59e0b;
            --font-mono: 'JetBrains Mono', monospace;
        }

        body {
            margin: 0; padding: 0; font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
                radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), 
                radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%);
            background-size: cover; background-attachment: fixed;
            color: var(--text-primary); min-height: 100vh;
        }

        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }

        /* Header Card */
        .header-card {
            background: var(--card-bg); backdrop-filter: blur(16px);
            border: 1px solid var(--border-color); border-radius: 16px;
            padding: 2rem; margin-bottom: 1.5rem;
            display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1.5rem;
        }
        .header-info h1 { margin: 0; font-size: 1.8rem; font-weight: 700; }
        .header-info p { margin: 0.5rem 0 1rem 0; color: var(--text-secondary); font-size: 0.9rem; }
        
        .live-indicator {
            width: 8px; height: 8px; background-color: var(--success);
            border-radius: 50%; display: inline-block; margin-right: 6px;
            box-shadow: 0 0 8px var(--success); animation: pulse 1.5s infinite;
        }
        @keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }

        .action-area { display: flex; flex-direction: column; align-items: flex-end; gap: 1rem; width: 100%; max-width: 450px;}

        /* PROGRESS BAR GLOBAL */
        .progress-section { background: var(--card-inner); padding: 16px; width: 100%; border-radius: 12px; border: 1px solid rgba(0,0,0,0.2); box-sizing: border-box; }
        .progress-labels { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .pl-succ { color: var(--success); } .pl-tot { color: var(--text-primary); text-align: center; flex: 1; } .pl-dang { color: var(--danger); text-align: right; }
        .progress-labels span b { font-size: 1.1rem; font-family: var(--font-mono); display: block; margin-top: 2px; }
        
        .progress-bar-container { width: 100%; height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; display: flex; box-shadow: inset 0 1px 3px rgba(0,0,0,0.3); }
        .bar-succ { height: 100%; background: var(--success); transition: width 0.4s ease; }
        .bar-dang { height: 100%; background: var(--danger); transition: width 0.4s ease; }

        .btn-fetch { background: var(--accent-color); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s ease; font-family: inherit; }
        .btn-fetch:hover { background: #2563eb; transform: translateY(-2px); }

        /* Form Panel */
        .form-panel { background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem 2rem; margin-bottom: 2rem; }
        .form-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #fff; }
        .form-group { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .form-input { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px 14px; border-radius: 8px; font-family: inherit; outline: none; flex: 1; min-width: 130px; font-size: 0.9rem; }
        .form-input:focus { border-color: var(--accent-color); box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
        .form-input::placeholder { color: #64748b; color-scheme: dark; }
        
        /* Tombol Submit & Reset */
        .btn-submit { background: var(--success); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; height: 40px; }
        .btn-submit:hover { background: #059669; transform: translateY(-2px); }
        
        .btn-reset { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; height: 40px; }
        .btn-reset:hover { background: var(--danger); color: #fff; transform: translateY(-2px); border-color: var(--danger); }
        
        .response-text { margin-top: 12px; font-size: 0.85rem; font-weight: 600; font-family: var(--font-mono); display: block;}
        .divider { height: 1px; background: rgba(255,255,255,0.08); margin: 1.5rem 0; width: 100%; }

        /* JSON Result Panel */
        #json-panel { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; display: none; }
        .json-panel-title { margin: 0 0 1rem 0; font-size: 1rem; color: #93c5fd; font-weight: 600; display: flex; justify-content: space-between;}
        .close-btn { cursor: pointer; color: #94a3b8; font-size: 1.2rem; line-height: 1; }
        table.static-data { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.9rem; }
        table.static-data th, table.static-data td { padding: 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        table.static-data th { color: #94a3b8; font-weight: 500; font-family: 'Inter', sans-serif; font-size: 0.8rem; text-transform: uppercase; }

        /* Jobs Grid */
        .jobs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.5rem; }
        .job-card { background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.5rem; transition: transform 0.2s, box-shadow 0.2s, opacity 0.3s; }
        .job-card:hover { border-color: rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.2); }
        
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .job-meta { color: var(--text-secondary); font-size: 0.75rem; font-family: var(--font-mono); display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .badge-pepek { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: #e2e8f0; }
        .job-name { margin: 0; font-size: 1.2rem; font-weight: 600; color: #fff; }
        
        .job-status { padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; }
        .status-running { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .status-idle { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
        
        /* PROGRESS BAR PER CARD */
        .card-progress { background: var(--card-inner); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.2); margin-top: 14px; }
        .card-progress .progress-labels { margin-bottom: 8px; font-size: 0.7rem; }
        .card-progress .progress-labels b { font-size: 0.95rem; }
        .card-progress .progress-bar-container { height: 8px; border-radius: 4px; }

        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
        .stat-item { background: var(--card-inner); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 4px; }
        .stat-item .lbl { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 500; }
        .stat-item .val { font-size: 0.9rem; font-weight: 600; color: #e2e8f0; font-family: var(--font-mono); }
        
        .card-footer { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px; }
        .footer-text { font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-mono); }

        @media(max-width: 768px){ .header-card { flex-direction: column; } .action-area { max-width: 100%; align-items: flex-start; } }
    </style>
</head>
<body>

    <div class="container">
        <!-- Header & Global Stats -->
        <div class="header-card">
            <div class="header-info">
                <h1>Sistem Monitor</h1>
                <p><span class="live-indicator"></span> Koneksi stream aktif</p>
                <button class="btn-fetch" id="btn-load-json">Load Data.json</button>
            </div>
            
            <div class="action-area">
                <!-- PROGRESS BAR GLOBAL -->
                <div class="progress-section">
                    <div class="progress-labels">
                        <span class="pl-succ">Berhasil <b id="val-berhasil">0</b></span>
                        <span class="pl-tot">Total <b id="val-total">0</b></span>
                        <span class="pl-dang">Gagal <b id="val-gagal">0</b></span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="bar-succ" id="bar-succ" style="width: 0%"></div>
                        <div class="bar-dang" id="bar-dang" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Form Panel: Send Login & Reset Data -->
        <div class="form-panel">
            <!-- Section Submit -->
            <div class="form-title">Kirim Data Login (/cek/sendLogin)</div>
            <div class="form-group">
                <input type="text" class="form-input" id="inp-prefix" placeholder="Prefix (cth: ID-X)">
                <input type="date" class="form-input" id="inp-start" title="Start Date">
                <input type="date" class="form-input" id="inp-end" title="End Date">
                <input type="number" class="form-input" id="inp-page" placeholder="Page" value="1">
                <input type="number" class="form-input" id="inp-limit" placeholder="Limit" value="100">
                <input type="number" class="form-input" id="inp-max" placeholder="Max" value="10">
                <button class="btn-submit" id="btn-send-login">Submit (GET)</button>
            </div>
            <div id="login-response" class="response-text"></div>
            
            <div class="divider"></div>
            
            <!-- Section Reset (Semua) -->
            <div class="form-title">Reset Semua Data (/cek/reset)</div>
            <div class="form-group">
                <button class="btn-reset" id="btn-reset-data">Reset Semua Data</button>
            </div>
            <div id="reset-response" class="response-text"></div>
        </div>

        <!-- Panel Data JSON -->
        <div id="json-panel">
            <h3 class="json-panel-title">Hasil data.json <span class="close-btn" onclick="document.getElementById('json-panel').style.display='none'">&times;</span></h3>
            <table class="static-data">
                <thead><tr><th>Nomor</th><th>Nama</th><th>ID</th><th>PIN</th></tr></thead>
                <tbody id="json-table-body"></tbody>
            </table>
        </div>

        <!-- Live Streaming Cards -->
        <div class="jobs-grid" id="jobs-container"></div>
    </div>

    <script>
        // =====================================
        // LOGIKA SUBMIT DATA (/cek/sendLogin) 
        // =====================================
        document.getElementById('btn-send-login').addEventListener('click', async () => {
            const btn = document.getElementById('btn-send-login');
            const respEl = document.getElementById('login-response');
            
            const params = new URLSearchParams({
                prefix: document.getElementById('inp-prefix').value,
                startDate: document.getElementById('inp-start').value,
                endDate: document.getElementById('inp-end').value,
                page: document.getElementById('inp-page').value,
                limit: document.getElementById('inp-limit').value,
                max: document.getElementById('inp-max').value 
            });

            btn.disabled = true;
            btn.innerText = "Mengirim...";
            respEl.innerText = "Memproses Request...";
            respEl.style.color = "var(--text-secondary)";

            try {
                // DIUBAH DARI BACKTICK KE PENGGABUNGAN STRING
                const response = await fetch('/cek/sendLogin?' + params.toString());
                const data = await response.json();

                if (data.status === 'ok') {
                    respEl.innerText = "Status: OK (" + (data.message || 'Sukses') + ")";
                    respEl.style.color = "var(--success)";
                } else {
                    respEl.innerText = "Status: ERROR (" + (data.message || 'Gagal') + ")";
                    respEl.style.color = "var(--danger)";
                }
            } catch (error) {
                respEl.innerText = "Status: ERROR (Gagal koneksi ke server)";
                respEl.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
                btn.innerText = "Submit (GET)";
            }
        });

        // =====================================
        // LOGIKA RESET DATA (/cek/reset)
        // =====================================
        document.getElementById('btn-reset-data').addEventListener('click', async () => {
            const btn = document.getElementById('btn-reset-data');
            const respEl = document.getElementById('reset-response');
            
            if (!confirm("Apakah Anda yakin ingin mereset SEMUA data dan menghapus progress saat ini?")) return;

            btn.disabled = true;
            btn.innerText = "Mereset...";
            respEl.innerText = "Mengirim perintah reset...";
            respEl.style.color = "var(--warning)";

            try {
                const response = await fetch('/cek/reset');
                const data = await response.json();

                if (data.status === 'ok') {
                    respEl.innerText = "Status: OK (" + (data.message || 'Berhasil di-reset') + ")";
                    respEl.style.color = "var(--success)";
                    
                    document.getElementById('jobs-container').innerHTML = ''; 
                    document.getElementById('val-total').innerText = '0';
                    document.getElementById('val-berhasil').innerText = '0';
                    document.getElementById('val-gagal').innerText = '0';
                    document.getElementById('bar-succ').style.width = '0%';
                    document.getElementById('bar-dang').style.width = '0%';
                } else {
                    respEl.innerText = "Status: ERROR (" + (data.message || 'Gagal Reset') + ")";
                    respEl.style.color = "var(--danger)";
                }
            } catch (error) {
                respEl.innerText = "Status: ERROR (Gagal terhubung ke endpoint reset)";
                respEl.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
                btn.innerText = "Reset Semua Data";
            }
        });

        // =====================================
        // LOGIKA FETCH DATA.JSON TAMPIL TABEL
        // =====================================
        document.getElementById('btn-load-json').addEventListener('click', async () => {
            const panel = document.getElementById('json-panel');
            const tbody = document.getElementById('json-table-body');
            
            try {
                const response = await fetch('/cek/data');
                const result = await response.json();
                
                tbody.innerHTML = '';
                result.data.forEach(item => {
                    // DIUBAH DARI BACKTICK KE PENGGABUNGAN STRING
                    tbody.innerHTML += '<tr>' +
                        '<td>#' + item.nomor + '</td>' +
                        '<td>' + item.nama + '</td>' +
                        '<td>' + item.id + '</td>' +
                        '<td style="color: #93c5fd;">' + item.pin + '</td>' +
                    '</tr>';
                });
                panel.style.display = 'block';
            } catch (error) {
                alert("Gagal Fetch data.json");
            }
        });

        // =====================================
        // LOGIKA STREAM DATA (LIVE)
        // =====================================
        const jobsContainer = document.getElementById('jobs-container');
        const eventSource = new EventSource('/cek');

        const valTotal = document.getElementById('val-total');
        const valBerhasil = document.getElementById('val-berhasil');
        const valGagal = document.getElementById('val-gagal');
        const barSucc = document.getElementById('bar-succ');
        const barDang = document.getElementById('bar-dang');

        function getStatusInfo(statusInt) {
            return (parseInt(statusInt) === 1) 
                ? { text: 'RUNNING', class: 'status-running' }
                : { text: 'STANDBY', class: 'status-idle' };
        }

        function buildCardHTML(job, response) {
            const status = getStatusInfo(job.status);
            
            const berhasil = job.berhasil || 0;
            const gagal = job.gagal || 0;
            const total = berhasil + gagal; 
            const calcTotal = total > 0 ? total : 1; 

            const percBerhasil = Math.min((berhasil / calcTotal) * 100, 100);
            const percGagal = Math.min((gagal / calcTotal) * 100, 100);

            // DIUBAH DARI BACKTICK KE PENGGABUNGAN STRING
            return '<div class="card-header">' +
                '<div>' +
                    '<div class="job-meta">' +
                        '<span>#' + job.nomor + '</span> • ' +
                        '<span>ID: ' + job.id + '</span> • ' +
                        '<span class="badge-pepek">Try PIN: ' + job.tryPin + '</span>' +
                    '</div>' +
                    '<h3 class="job-name">' + job.nama + '</h3>' +
                '</div>' +
                '<span class="job-status ' + status.class + '">' + status.text + '</span>' +
            '</div>' +
            '<div class="card-progress">' +
                '<div class="progress-labels">' +
                    '<span class="pl-succ">Berhasil <b>' + berhasil + '</b></span>' +
                    '<span class="pl-tot">Total <b>' + total + '</b></span>' +
                    '<span class="pl-dang">Gagal <b>' + gagal + '</b></span>' +
                '</div>' +
                '<div class="progress-bar-container">' +
                    '<div class="bar-succ" style="width: ' + percBerhasil + '%"></div>' +
                    '<div class="bar-dang" style="width: ' + percGagal + '%"></div>' +
                '</div>' +
            '</div>' +
            '<div class="stats-grid">' +
                '<div class="stat-item"><span class="lbl">Progress</span><span class="val">' + job.count + '</span></div>' +
                '<div class="stat-item"><span class="lbl">Sisa</span><span class="val">' + job.sisa + '</span></div>' +
                '<div class="stat-item"><span class="lbl">Err / Coba</span><span class="val">' + job.err + ' / ' + job.coba + '</span></div>' +
                '<div class="stat-item"><span class="lbl">Running</span><span class="val">' + job.running + '</span></div>' +
            '</div>' +
            '<div class="card-footer">' +
                '<div class="footer-text">' + job.waktuPrev + '</div>' +
                '<div class="footer-text">' + job.waktuNext + '</div>' +
            '</div>';
        }

        eventSource.onmessage = (event) => {
            const response = JSON.parse(event.data);
            
            if (!response.data || response.data.length === 0) {
                jobsContainer.innerHTML = '';
                valTotal.innerText = '0';
                valBerhasil.innerText = '0';
                valGagal.innerText = '0';
                barSucc.style.width = '0%';
                barDang.style.width = '0%';
                return;
            }

            const gTotal = response.data.reduce((acc, curr) => acc + (curr?.berhasil + curr?.gagal), 0);
            const totalStatus = response.data.reduce((acc, curr) => {
              acc.berhasil += curr?.berhasil;
              acc.gagal += curr?.gagal;
              return acc;
            }, { berhasil: 0, gagal: 0 });
            
            const gBerhasil = totalStatus?.berhasil || 0;
            const gGagal = totalStatus?.gagal || 0;
            const calcGTotal = gTotal > 0 ? gTotal : 1;

            valTotal.innerText = gTotal;
            valBerhasil.innerText = gBerhasil;
            valGagal.innerText = gGagal;
            // DIUBAH DARI BACKTICK KE PENGGABUNGAN STRING
            barSucc.style.width = Math.min((gBerhasil / calcGTotal) * 100, 100) + "%";
            barDang.style.width = Math.min((gGagal / calcGTotal) * 100, 100) + "%";

            response.data.forEach(job => {
                const cardId = 'card-' + job?.id;
                let existingCard = document.getElementById(cardId);
                
                const jobString = JSON.stringify({job: job, stat: {b: gBerhasil, g: gGagal, t: gTotal}}); 
                
                if (existingCard) {
                    if(existingCard.dataset.raw !== jobString) {
                        existingCard.dataset.raw = jobString;
                        existingCard.innerHTML = buildCardHTML(job, response);
                        existingCard.style.order = job.nomor || 0; 
                    }
                } else {
                    const card = document.createElement('div');
                    card.className = 'job-card';
                    card.id = cardId;
                    card.dataset.raw = jobString;
                    card.style.order = job.nomor || 0; 
                    card.innerHTML = buildCardHTML(job, response);
                    jobsContainer.appendChild(card);
                }
            });

            const currentIds = response.data.map(j => 'card-' + j.id);
            document.querySelectorAll('.job-card').forEach(el => {
                if (!currentIds.includes(el.id)) el.remove(); 
            });
        };
    </script>
</body>
</html>
  `;

  res.send(htmlContent);
});

function generateSequence(prefix, max) {
  const result = [];
  // Menghitung berapa digit angka maksimal
  const maxLength = String(max).length; 

  for (let i = 1; i <= max; i++) {
    const suffix = String(i).padStart(maxLength, "0");
    result.push({
      id: `${prefix}${suffix}`,
      nama: `Nama ${suffix}`,
    });
  }

  return result;
}

function dapatkanHalaman(array, page, limit) {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  return array.slice(startIndex, endIndex);
}

/*for (let i = 1; i <= 5; i++) {
  const file = i === 1 ? "accounts.json" : `acc${i}.json`;
  
  const acc = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../lib", file), "utf8")
  );
  
  }
  */
/*const id = generateSequence("2505");
login.main(1, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 1, 100));
login.main(2, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 2, 100));
login.main(3, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 3, 100));*/

module.exports = router;
