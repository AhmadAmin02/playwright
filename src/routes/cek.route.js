"use strict";

const express = require("express");
const login = require("../lib/login");
const fs = require("fs");
const path = require("path");
const path = require("node:path");
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

      const allData = Object.values(dat).map((item) => item.statusData);

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
        data: allData,
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
    { length: 20 },
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
    const paramNomor = req.query.nomor;

    if (paramNomor && paramNomor.toLowerCase() !== "all") {
      // ============================================
      // 1. RESET SPESIFIK (Contoh: nomor=1,3,5)
      // ============================================
      const listNomor = paramNomor.split(",").map((n) => n.trim());

      listNomor.forEach((nomor) => {
        // Hapus job dari memory
        if (login.jobs && login.jobs[nomor]) {
          delete login.jobs[nomor];
        }
        if (activeSlots && activeSlots.has(nomor)) {
          activeSlots.delete(nomor);
        }

        // Kosongkan file data spesifik (contoh: data1.json)
        const filePath = path.join(__dirname, `data${nomor}.json`);
        if (fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf8");
        }
      });

      return res.json({
        status: "ok",
        message: `Data nomor ${listNomor.join(", ")} berhasil direset.`,
      });
    } else {
      // ============================================
      // 2. RESET SEMUA (Default)
      // ============================================

      // Kosongkan memory global
      if (login.jobs) login.jobs = {};
      if (activeSlots) activeSlots.clear();

      // Baca semua file di dalam folder tempat script ini berjalan (__dirname)
      const files = fs.readdirSync(__dirname);

      files.forEach((file) => {
        // Gunakan Regex untuk mencocokkan file seperti "data1.json", "data2.json", dll.
        // \d+ berarti wajib ada angka setelah kata "data"
        // Jika ada juga file "data.json", gunakan regex: /^data\d*\.json$/
        if (/^data\d*\.json$/.test(file)) {
          const filePath = path.join(__dirname, file);
          // Timpa isi filenya dengan array kosong []
          fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf8");
        }
      });

      return res.json({
        status: "ok",
        message: "Seluruh task aktif dan file data berhasil direset.",
      });
    }
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
  const nomor = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;

  const id = generateSequence(prefix);

  if (nomor < 1 || nomor > 5) {
    return res.status(400).json({
      status: "error",
      message: "Parameter nomor tidak valid (Maksimal 5)",
    });
  }

  if (limit > id.length) {
    return res
      .status(400)
      .json({ status: "error", message: "Limit exceeds available IDs" });
  }

  // 2. Kumpulkan nomor mana saja yang tersedia untuk dijalankan
  const availableToRun = [];
  for (let i = 1; i <= nomor; i++) {
    if (!activeSlots.has(i)) {
      availableToRun.push(i); // Tambahkan jika nomor 'i' sedang tidak dipakai
    }
  }

  // 3. Jika semua nomor yang diminta sedang penuh, tolak request
  if (availableToRun.length === 0) {
    return res.status(429).json({
      status: "warning",
      message:
        "Semua nomor (slot) tersebut sedang digunakan oleh proses lain. Harap tunggu.",
    });
  }

  // 4. Jalankan HANYA nomor yang tersedia
  availableToRun.forEach((i) => {
    // Tandai nomor ini sedang berjalan
    activeSlots.add(i);

    console.log(`Memulai proses login untuk nomor: ${i} (Prefix: ${prefix})`);

    // 5. Eksekusi login.main sebagai Promise
    login
      .main(i, startDate, endDate, dapatkanHalaman(id, i, limit))
      .then((result) => {
        // Jika login.main sukses
        console.log(`Task nomor ${i} selesai dengan sukses.`);
      })
      .catch((error) => {
        // Jika login.main error / gagal
        console.error(`Task nomor ${i} mengalami error:`, error);
      })
      .finally(() => {
        // 6. Lepaskan / hapus nomor dari memori agar bisa dipakai lagi nanti
        activeSlots.delete(i);
        console.log(`Slot nomor ${i} telah dikosongkan dan siap digunakan.`);
      });
  });

  // 7. Berikan response ke client (hanya memberi tahu task yang berhasil dijalankan)
  res.json({
    status: "ok",
    message: `Proses login telah diinisiasi.`,
    data: {
      berhasilDijalankan: availableToRun,
      dilewatiKarenaPenuh:
        nomor - availableToRun.length > 0
          ? "Sebagian nomor dilewati karena sedang berjalan."
          : "Tidak ada",
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
        
        /* Tambahan style untuk Option Select agar rapih di dark mode */
        select.form-input { cursor: pointer; appearance: auto; }
        select.form-input option { background: var(--bg-color); color: #fff; }
        
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
                <button class="btn-submit" id="btn-send-login">Submit (GET)</button>
            </div>
            <div id="login-response" class="response-text"></div>
            
            <div class="divider"></div>
            
            <!-- Section Reset (MENGGUNAKAN DROPDOWN OTOMATIS) -->
            <div class="form-title">Reset Data (/cek/reset)</div>
            <div class="form-group">
                <select class="form-input" id="select-reset-nomor" style="flex: 1; min-width: 250px; max-width: 400px;">
                    <option value="">Semua (Reset Default)</option>
                    <!-- Opsi lainnya akan dimuat otomatis via Javascript dari EventStream -->
                </select>
                <button class="btn-reset" id="btn-reset-data">Reset Data</button>
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
                limit: document.getElementById('inp-limit').value
            });

            btn.disabled = true;
            btn.innerText = "Mengirim...";
            respEl.innerText = "Memproses Request...";
            respEl.style.color = "var(--text-secondary)";

            try {
                const response = await fetch(\`/cek/sendLogin?\${params.toString()}\`);
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
            const selectNomor = document.getElementById('select-reset-nomor');
            
            // Ambil value dari dropdown select
            const targetNomor = selectNomor.value;
            const targetText = selectNomor.options[selectNomor.selectedIndex].text;
            
            const confirmMsg = targetNomor 
                ? \`Apakah Anda yakin ingin mereset data: "\${targetText}"?\`
                : \`Apakah Anda yakin ingin mereset SEMUA data secara default?\`;

            if (!confirm(confirmMsg)) return;

            btn.disabled = true;
            btn.innerText = "Mereset...";
            respEl.innerText = "Mengirim perintah reset...";
            respEl.style.color = "var(--warning)";

            try {
                // Set query parameter ke fetch URL
                let fetchUrl = '/cek/reset';
                if (targetNomor) {
                    const params = new URLSearchParams();
                    params.append('nomor', targetNomor);
                    fetchUrl += \`?\${params.toString()}\`;
                }

                const response = await fetch(fetchUrl);
                const data = await response.json();

                if (data.status === 'ok') {
                    respEl.innerText = "Status: OK (" + (data.message || 'Berhasil di-reset') + ")";
                    respEl.style.color = "var(--success)";
                    
                    // JIKA Reset Semua, hapus seluruh container secara instan
                    if (!targetNomor) {
                        document.getElementById('jobs-container').innerHTML = ''; 
                        document.getElementById('val-total').innerText = '0';
                        document.getElementById('val-berhasil').innerText = '0';
                        document.getElementById('val-gagal').innerText = '0';
                        document.getElementById('bar-succ').style.width = '0%';
                        document.getElementById('bar-dang').style.width = '0%';
                    }

                } else {
                    respEl.innerText = "Status: ERROR (" + (data.message || 'Gagal Reset') + ")";
                    respEl.style.color = "var(--danger)";
                }
            } catch (error) {
                respEl.innerText = "Status: ERROR (Gagal terhubung ke endpoint reset)";
                respEl.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
                btn.innerText = "Reset Data";
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
                    tbody.innerHTML += \`
                        <tr>
                            <td>#\${item.nomor}</td>
                            <td>\${item.nama}</td>
                            <td>\${item.id}</td>
                            <td style="color: #93c5fd;">\${item.pin}</td>
                        </tr>
                    \`;
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
        const selectResetNomor = document.getElementById('select-reset-nomor');

        const valTotal = document.getElementById('val-total');
        const valBerhasil = document.getElementById('val-berhasil');
        const valGagal = document.getElementById('val-gagal');
        const barSucc = document.getElementById('bar-succ');
        const barDang = document.getElementById('bar-dang');

        // Variabel untuk melacak status jobs apa saja yang sedang aktif agar Dropdown tidak perlu di-render ulang setiap detik
        let activeJobsStringTracker = ""; 

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

            return \`
                <div class="card-header">
                    <div>
                        <div class="job-meta">
                            <span>#\${job.nomor}</span> • 
                            <span>ID: \${job.id}</span> • 
                            <span class="badge-pepek">Try PIN: \${job.tryPin}</span>
                        </div>
                        <h3 class="job-name">\${job.nama}</h3>
                    </div>
                    <span class="job-status \${status.class}">\${status.text}</span>
                </div>
                
                <div class="card-progress">
                    <div class="progress-labels">
                        <span class="pl-succ">Berhasil <b>\${berhasil}</b></span>
                        <span class="pl-tot">Total <b>\${total}</b></span>
                        <span class="pl-dang">Gagal <b>\${gagal}</b></span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="bar-succ" style="width: \${percBerhasil}%"></div>
                        <div class="bar-dang" style="width: \${percGagal}%"></div>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-item"><span class="lbl">Progress</span><span class="val">\${job.count}</span></div>
                    <div class="stat-item"><span class="lbl">Sisa</span><span class="val">\${job.sisa}</span></div>
                    <div class="stat-item"><span class="lbl">Err / Coba</span><span class="val">\${job.err} / \${job.coba}</span></div>
                    <div class="stat-item"><span class="lbl">Running</span><span class="val">\${job.running}</span></div>
                </div>

                <div class="card-footer">
                    <div class="footer-text">\${job.waktuPrev}</div>
                    <div class="footer-text">\${job.waktuNext}</div>
                </div>
            \`;
        }

        eventSource.onmessage = (event) => {
            const response = JSON.parse(event.data);
            
            const gTotal = response.total || 0;
            
            if (!response.data || response.data.length === 0) {
                jobsContainer.innerHTML = '';
                valTotal.innerText = '0';
                valBerhasil.innerText = '0';
                valGagal.innerText = '0';
                barSucc.style.width = '0%';
                barDang.style.width = '0%';
                
                // Kosongkan Dropdown
                if (activeJobsStringTracker !== "[]") {
                    activeJobsStringTracker = "[]";
                    selectResetNomor.innerHTML = '<option value="">Semua (Reset Default)</option>';
                }
                return;
            }

            // MENGELOLA ISI OPTIONS DROPDOWN RESET (Update hanya jika daftar Job bertambah/berkurang/berubah nama)
            const currentActiveJobs = response.data.map(j => ({ n: j.nomor, name: j.nama }));
            const currentJobsString = JSON.stringify(currentActiveJobs);
            
            if (currentJobsString !== activeJobsStringTracker) {
                activeJobsStringTracker = currentJobsString;
                
                // Simpan value dropdown yang sedang dipilih agar tidak ter-reset
                const userSelectedValue = selectResetNomor.value;
                
                // Render ulang option
                selectResetNomor.innerHTML = '<option value="">Semua (Reset Default)</option>';
                response.data.forEach(job => {
                    const option = document.createElement('option');
                    option.value = job.nomor;
                    option.textContent = \`Nomor \${job.nomor} - \${job.nama}\`;
                    selectResetNomor.appendChild(option);
                });

                // Terapkan kembali pilihan user sebelumnya jika masih tersedia
                if (Array.from(selectResetNomor.options).some(opt => opt.value === userSelectedValue)) {
                    selectResetNomor.value = userSelectedValue;
                }
            }
            // ========================================================

            const totalStatus = response.data.reduce((acc, curr) => {
              acc.berhasil += curr.berhasil;
              acc.gagal += curr.gagal;
              return acc;
            }, { berhasil: 0, gagal: 0 });
            
            const gBerhasil = totalStatus?.berhasil || 0;
            const gGagal = totalStatus?.gagal || 0;
            const calcGTotal = gTotal > 0 ? gTotal : 1;

            valTotal.innerText = gTotal;
            valBerhasil.innerText = gBerhasil;
            valGagal.innerText = gGagal;
            barSucc.style.width = \`\${Math.min((gBerhasil / calcGTotal) * 100, 100)}%\`;
            barDang.style.width = \`\${Math.min((gGagal / calcGTotal) * 100, 100)}%\`;

            response.data.forEach(job => {
                const cardId = 'card-' + job.id;
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

function generateSequence(prefix) {
  const result = [];

  // Looping dari 0 sampai 9999
  for (let i = 0; i <= 9999; i++) {
    // Mengubah angka menjadi string dan menambahkan '0' di depan hingga panjangnya 4 karakter
    const suffix = String(i).padStart(4, "0");
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
