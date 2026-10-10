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
    "Connection": "keep-alive"
  });

  // 2. Buat fungsi untuk mengekstrak dan mengirim data terbaru
  const sendData = () => {
    // Ambil data terbaru dari variabel yang berubah-ubah
    const data = login.jobs; 
    const allData = Object.values(data).map(item => item.statusData);
    const total = Object.values(data).reduce((sum, item) => sum + item.count, 0);

    // Format payload menjadi string JSON
    const payload = JSON.stringify({ status: "ok", total, data: allData });

    // ATURAN SSE: Data HARUS diawali dengan "data: " dan diakhiri dengan "\n\n"
    res.write(`data: ${payload}\n\n`);
  };

  // Kirim data langsung saat client pertama kali connect
  sendData();

  // 3. Jalankan interval untuk mengirim data setiap 1 detik (1000 ms)
  const intervalId = setInterval(sendData, 1000);

  // 4. SANGAT PENTING: Hentikan interval jika client menutup tab browser / disconnect
  // Jika ini tidak ditambahkan, memori server akan bocor (memory leak)
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
      data: []
    });
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json({ status: "ok", data });
  } catch (err) {
    res.json({
      status: "ok",
      data: []
    });
  }
});

router.get("/data", (req, res) => {
  const dir = path.join(__dirname, "../lib");
  
  const data = Array.from({ length: 20 }, (_, i) => `data${i + 1}.json`)
    .flatMap(file => {
      const filePath = path.join(dir, file);
      
      if (!fs.existsSync(filePath)) return [];
      
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    });
  res.json({ status: "ok", data, total: data.length });
});

router.get('/app', (req, res) => {
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
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.6);
            --card-inner: rgba(15, 23, 42, 0.4);
            --border-color: rgba(255, 255, 255, 0.08);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-color: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
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
            display: flex; justify-content: space-between; align-items: center;
        }
        .header-info h1 { margin: 0; font-size: 1.8rem; font-weight: 700; }
        .header-info p { margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem; }
        
        .live-indicator {
            width: 8px; height: 8px; background-color: var(--success);
            border-radius: 50%; display: inline-block; margin-right: 6px;
            box-shadow: 0 0 8px var(--success); animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .action-area { display: flex; flex-direction: column; align-items: flex-end; gap: 1rem; }
        .stat-label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; }
        .stat-value { font-size: 2rem; font-weight: 700; color: var(--accent-color); line-height: 1; text-align: right;}

        /* Styled Button */
        .btn-fetch {
            background: var(--accent-color); color: #fff; border: none;
            padding: 10px 20px; border-radius: 8px; font-weight: 600;
            font-size: 0.85rem; cursor: pointer; transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); font-family: inherit;
        }
        .btn-fetch:hover { background: #2563eb; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4); }
        .btn-fetch:active { transform: translateY(0); }

        /* JSON Result Panel */
        #json-panel {
            background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;
            display: none; backdrop-filter: blur(12px); animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        
        .json-panel-title { margin: 0 0 1rem 0; font-size: 1rem; color: #93c5fd; font-weight: 600; display: flex; justify-content: space-between;}
        .close-btn { cursor: pointer; color: #94a3b8; font-size: 1.2rem; line-height: 1; }
        
        table.static-data { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.9rem; }
        table.static-data th, table.static-data td { padding: 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
        table.static-data th { color: #94a3b8; font-weight: 500; font-family: 'Inter', sans-serif; font-size: 0.8rem; text-transform: uppercase; }

        /* Jobs Grid */
        .jobs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; }
        
        .job-card {
            background: var(--card-bg); backdrop-filter: blur(16px);
            border: 1px solid var(--border-color); border-radius: 14px;
            padding: 1.5rem; position: relative; transition: transform 0.2s, box-shadow 0.2s;
        }
        .job-card:hover { border-color: rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.2); }
        .job-card.updated::after {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.06); animation: flash 0.5s ease-out; pointer-events: none;
        }
        @keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }

        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .job-meta { color: var(--text-secondary); font-size: 0.75rem; font-family: var(--font-mono); display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .badge-pepek { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: #e2e8f0; }
        
        .job-name { margin: 0; font-size: 1.2rem; font-weight: 600; color: #fff; }
        .job-status { padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; }
        .status-running { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .status-idle { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
        
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
        .stat-item { background: var(--card-inner); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 4px; }
        .stat-item .lbl { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 500; }
        .stat-item .val { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; font-family: var(--font-mono); }

        .card-footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px; }
        .footer-text { font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-mono); }
    </style>
</head>
<body>

    <div class="container">
        <!-- Header -->
        <div class="header-card">
            <div class="header-info">
                <h1>Sistem Monitor</h1>
                <p><span class="live-indicator"></span> Koneksi stream aktif</p>
            </div>
            <div class="action-area">
                <div>
                    <div class="stat-label">Total Data</div>
                    <div class="stat-value" id="total-count">0</div>
                </div>
                <!-- Tombol Manual Fetch -->
                <button class="btn-fetch" id="btn-load-json">Ambil Data Statis</button>
            </div>
        </div>

        <!-- Panel untuk Data.json -->
        <div id="json-panel">
            <h3 class="json-panel-title">
                Hasil data.json 
                <span class="close-btn" onclick="document.getElementById('json-panel').style.display='none'">&times;</span>
            </h3>
            <table class="static-data">
                <thead>
                    <tr>
                        <th>Nomor</th>
                        <th>Nama</th>
                        <th>ID</th>
                        <th>Ya (Tgl)</th>
                    </tr>
                </thead>
                <tbody id="json-table-body">
                    <!-- Diisi lewat JS -->
                </tbody>
            </table>
        </div>

        <!-- Grid untuk Live Stream -->
        <div class="jobs-grid" id="jobs-container"></div>
    </div>

    <script>
        // =====================================
        // LOGIKA FETCH DATA.JSON (KLIK MANUAL)
        // =====================================
        document.getElementById('btn-load-json').addEventListener('click', async () => {
            const btn = document.getElementById('btn-load-json');
            const panel = document.getElementById('json-panel');
            const tbody = document.getElementById('json-table-body');
            
            btn.innerText = "Memuat...";
            btn.disabled = true;

            try {
                // Request manual hanya saat tombol diklik
                const response = await fetch('/cek/data');
                const result = await response.json();

                // Render tabel statis
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
                btn.innerText = "Ambil Data Statis";
            } catch (error) {
                console.error("Gagal mengambil data:", error);
                btn.innerText = "Gagal Fetch!";
                setTimeout(() => btn.innerText = "Ambil Data Statis", 2000);
            } finally {
                btn.disabled = false;
            }
        });

        // =====================================
        // LOGIKA STREAM DATA (LIVE)
        // =====================================
        const totalCountEl = document.getElementById('total-count');
        const jobsContainer = document.getElementById('jobs-container');
        const eventSource = new EventSource('/cek');

        function getStatusInfo(statusInt) {
            return (parseInt(statusInt) === 1) 
                ? { text: 'RUNNING', class: 'status-running' }
                : { text: 'STANDBY', class: 'status-idle' };
        }

        function buildCardHTML(job) {
            const status = getStatusInfo(job.status);
            // ======= VARIABEL PEPEK ADA DI SINI ======= //
            return \`
                <div class="card-header">
                    <div>
                        <div class="job-meta">
                            <span>#\${job.nomor}</span> • 
                            <span>ID: \${job.id}</span> • 
                            <span class="badge-pepek">Try Pin: \${job.tryPin}</span>
                        </div>
                        <h3 class="job-name">\${job.nama}</h3>
                    </div>
                    <span class="job-status \${status.class}">\${status.text}</span>
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
            totalCountEl.innerText = response.total;

            if (!response.data || response.data.length === 0) return;

            response.data.forEach(job => {
                const cardId = 'card-' + job.id;
                const existingCard = document.getElementById(cardId);
                const jobString = JSON.stringify(job);
                
                if (existingCard) {
                    if(existingCard.dataset.raw !== jobString) {
                        existingCard.dataset.raw = jobString;
                        existingCard.innerHTML = buildCardHTML(job);
                        
                        existingCard.classList.remove('updated');
                        void existingCard.offsetWidth; 
                        existingCard.classList.add('updated');
                    }
                } else {
                    const card = document.createElement('div');
                    card.className = 'job-card';
                    card.id = cardId;
                    card.dataset.raw = jobString;
                    card.innerHTML = buildCardHTML(job);
                    jobsContainer.appendChild(card);
                }
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
    const suffix = String(i).padStart(4, '0');
    result.push({
      id: `${prefix}${suffix}`,
      nama: `Nama ${suffix}`
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
const id = generateSequence("2506");
login.main(1, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 1, 200));
login.main(2, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 2, 200));
login.main(3, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 3, 200));

module.exports = router;