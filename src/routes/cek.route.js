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
            margin: 0; padding: 0;
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
                radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), 
                radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%);
            background-size: cover; background-attachment: fixed;
            color: var(--text-primary);
            min-height: 100vh; display: flex; justify-content: center;
        }

        .container {
            width: 100%; max-width: 1200px; padding: 2rem;
        }

        /* Header Card */
        .header-card {
            background: var(--card-bg);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 16px; padding: 2rem; margin-bottom: 2rem;
            display: flex; justify-content: space-between; align-items: center;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        }

        .header-info h1 { margin: 0; font-size: 1.8rem; font-weight: 700; letter-spacing: -0.02em; }
        .header-info p { margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem; display: flex; align-items: center; gap: 8px; }
        
        .live-indicator {
            width: 8px; height: 8px; background-color: var(--success);
            border-radius: 50%; display: inline-block;
            box-shadow: 0 0 8px var(--success);
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .stat-box { text-align: right; }
        .stat-label { font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
        .stat-value { font-size: 2.5rem; font-weight: 700; color: var(--accent-color); line-height: 1.2; }

        /* Grid Layout */
        .jobs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 1.5rem;
        }

        /* Job Card */
        .job-card {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 1.5rem;
            position: relative;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .job-card:hover { border-color: rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.2); }

        .job-card.updated::after {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.06); animation: flash 0.5s ease-out; pointer-events: none;
        }

        @keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }

        /* Card Header */
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .job-meta { color: var(--text-secondary); font-size: 0.8rem; font-family: var(--font-mono); }
        .job-name { margin: 0.2rem 0; font-size: 1.2rem; font-weight: 600; color: #fff; }
        
        .job-status {
            padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em;
        }
        .status-running { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .status-idle { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
        .status-failed { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }

        /* Card Stats Grid */
        .stats-grid {
            display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0;
        }
        .stat-item {
            background: var(--card-inner); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.2);
            display: flex; flex-direction: column; gap: 4px;
        }
        .stat-item .lbl { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 500; }
        .stat-item .val { font-size: 0.95rem; font-weight: 600; color: #e2e8f0; font-family: var(--font-mono); }

        /* Card Footer */
        .card-footer {
            margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);
            display: flex; flex-direction: column; gap: 6px;
        }
        .footer-text { font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-mono); }
        .footer-text span { color: #94a3b8; }

        @media (max-width: 600px) {
            .header-card { flex-direction: column; align-items: flex-start; gap: 1rem; }
            .jobs-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>

    <div class="container">
        <div class="header-card">
            <div class="header-info">
                <h1>Sistem Monitor</h1>
                <p><span class="live-indicator"></span> Menunggu data stream...</p>
            </div>
            <div class="stat-box">
                <div class="stat-label">Total Data</div>
                <div class="stat-value" id="total-count">0</div>
            </div>
        </div>

        <div class="jobs-grid" id="jobs-container">
            <!-- Data akan di-render di sini -->
        </div>
    </div>

    <script>
        const totalCountEl = document.getElementById('total-count');
        const jobsContainer = document.getElementById('jobs-container');
        const statusText = document.querySelector('.header-info p');
        const liveIndicator = document.querySelector('.live-indicator');

        const eventSource = new EventSource('/cek');

        // Mapping Status Angka ke Teks & Warna
        function getStatusInfo(statusInt) {
            const num = parseInt(statusInt);
            if (num === 1) return { text: 'RUNNING', class: 'status-running' };
            if (num === 2 || num === -1) return { text: 'ERROR', class: 'status-failed' };
            return { text: 'STANDBY', class: 'status-idle' }; // Default status 0
        }

        // Generate HTML untuk satu Card
        function buildCardHTML(job) {
            const status = getStatusInfo(job.status);
            return \`
                <div class="card-header">
                    <div>
                        <div class="job-meta">#\${job.nomor} • ID: \${job.id}</div>
                        <h3 class="job-name">\${job.nama}</h3>
                    </div>
                    <span class="job-status \${status.class}">\${status.text}</span>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="lbl">Progress</span>
                        <span class="val">\${job.count}</span>
                    </div>
                    <div class="stat-item">
                        <span class="lbl">Sisa</span>
                        <span class="val">\${job.sisa}</span>
                    </div>
                    <div class="stat-item">
                        <span class="lbl">Err / Coba</span>
                        <span class="val">\${job.err} / \${job.coba}</span>
                    </div>
                    <div class="stat-item">
                        <span class="lbl">Running</span>
                        <span class="val">\${job.running}</span>
                    </div>
                </div>

                <div class="card-footer">
                    <div class="footer-text">\${job.waktuPrev}</div>
                    <div class="footer-text">\${job.waktuNext}</div>
                </div>
            \`;
        }

        eventSource.onopen = () => {
            statusText.innerHTML = '<span class="live-indicator"></span> Terhubung & Sinkronisasi Realtime';
            liveIndicator.style.backgroundColor = 'var(--success)';
        };

        eventSource.onmessage = (event) => {
            const response = JSON.parse(event.data);
            
            if(totalCountEl.innerText !== response.total.toString()) {
                totalCountEl.innerText = response.total;
            }

            renderJobs(response.data);
        };

        eventSource.onerror = () => {
            statusText.innerHTML = '<span class="live-indicator" style="background-color: var(--danger); animation: none;"></span> Koneksi Terputus...';
        };

        function renderJobs(jobsArray) {
            if (!jobsArray || jobsArray.length === 0) {
                jobsContainer.innerHTML = '<div style="color:#94a3b8; grid-column: 1/-1; text-align:center;">Tidak ada data tersedia.</div>';
                return;
            }

            jobsArray.forEach(job => {
                const cardId = 'card-' + job.id;
                const existingCard = document.getElementById(cardId);
                const jobString = JSON.stringify(job); // Untuk deteksi perubahan data
                
                if (existingCard) {
                    // Cek jika data mentahnya beda, baru kita re-render supaya ada animasi kedip
                    if(existingCard.dataset.raw !== jobString) {
                        existingCard.dataset.raw = jobString;
                        existingCard.innerHTML = buildCardHTML(job);
                        
                        // Trigger CSS flash animation
                        existingCard.classList.remove('updated');
                        void existingCard.offsetWidth; // Force reflow
                        existingCard.classList.add('updated');
                    }
                } else {
                    // Render card baru
                    const card = document.createElement('div');
                    card.className = 'job-card';
                    card.id = cardId;
                    card.dataset.raw = jobString;
                    card.innerHTML = buildCardHTML(job);
                    jobsContainer.appendChild(card);
                }
            });

            // Hapus card yang ID-nya sudah hilang dari response server
            const currentIds = jobsArray.map(j => 'card-' + j.id);
            document.querySelectorAll('.job-card').forEach(el => {
                if(!currentIds.includes(el.id)) el.remove();
            });
        }
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