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
    <title>Live Job Status</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :root {
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-color: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
                radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), 
                radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%);
            background-size: cover;
            background-attachment: fixed;
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .container {
            width: 100%;
            max-width: 800px;
            padding: 2rem;
        }

        /* Glassmorphism Header Card */
        .header-card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 2rem;
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        }

        .header-info h1 {
            margin: 0;
            font-size: 1.8rem;
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .header-info p {
            margin: 0.5rem 0 0 0;
            color: var(--text-secondary);
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .live-indicator {
            width: 8px;
            height: 8px;
            background-color: var(--success);
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 8px var(--success);
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .stat-box {
            text-align: right;
        }

        .stat-label {
            font-size: 0.85rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
        }

        .stat-value {
            font-size: 3rem;
            font-weight: 700;
            color: var(--accent-color);
            line-height: 1;
            margin-top: 0.2rem;
            transition: color 0.3s ease;
        }

        /* Jobs Grid */
        .jobs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 1.5rem;
        }

        /* Individual Job Card */
        .job-card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 1.5rem;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            position: relative;
            overflow: hidden;
        }

        .job-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            border-color: rgba(255, 255, 255, 0.15);
        }

        /* Flash effect on update */
        .job-card.updated::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.05);
            animation: flash 0.5s ease-out;
            pointer-events: none;
        }

        @keyframes flash {
            0% { opacity: 1; }
            100% { opacity: 0; }
        }

        .job-id {
            font-size: 0.75rem;
            color: var(--text-secondary);
            font-family: monospace;
            margin-bottom: 0.5rem;
            display: block;
        }

        .job-name {
            font-size: 1.1rem;
            font-weight: 600;
            margin: 0 0 1rem 0;
            color: #e2e8f0;
        }

        .job-status {
            display: inline-flex;
            align-items: center;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .status-running { background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2); }
        .status-idle { background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2); }
        .status-failed { background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }

        /* Loader if no data yet */
        #loader {
            text-align: center;
            color: var(--text-secondary);
            font-style: italic;
            padding: 2rem;
            grid-column: 1 / -1;
        }

        @media (max-width: 600px) {
            .header-card {
                flex-direction: column;
                align-items: flex-start;
                gap: 1.5rem;
            }
            .stat-box { text-align: left; }
        }
    </style>
</head>
<body>

    <div class="container">
        <!-- Header Section -->
        <div class="header-card">
            <div class="header-info">
                <h1>Sistem Monitor</h1>
                <p><span class="live-indicator"></span> Menunggu koneksi stream...</p>
            </div>
            <div class="stat-box">
                <div class="stat-label">Total Load</div>
                <div class="stat-value" id="total-count">0</div>
            </div>
        </div>

        <!-- Grid for Dynamic Jobs -->
        <div class="jobs-grid" id="jobs-container">
            <div id="loader">Menghubungkan ke server realtime...</div>
        </div>
    </div>

    <script>
        // DOM Elements
        const totalCountEl = document.getElementById('total-count');
        const jobsContainer = document.getElementById('jobs-container');
        const statusText = document.querySelector('.header-info p');
        const liveIndicator = document.querySelector('.live-indicator');

        // Setup Server-Sent Events (SSE) koneksi ke Express route '/api/stream'
        const eventSource = new EventSource('/cek');

        // Fungsi pembantu untuk menentukan class CSS berdasarkan status
        function getStatusClass(status) {
            const s = status.toLowerCase();
            if (s.includes('run')) return 'status-running';
            if (s.includes('fail') || s.includes('error')) return 'status-failed';
            return 'status-idle'; // Default
        }

        // Event listener saat koneksi terbuka
        eventSource.onopen = () => {
            statusText.innerHTML = '<span class="live-indicator"></span> Live Update Aktif';
            liveIndicator.style.backgroundColor = 'var(--success)';
        };

        // Event listener saat data baru masuk dari server
        eventSource.onmessage = (event) => {
            const response = JSON.parse(event.data);
            
            // Animasi angka total jika berubah
            if(totalCountEl.innerText !== response.total.toString()) {
                totalCountEl.style.color = '#fff';
                setTimeout(() => totalCountEl.style.color = 'var(--accent-color)', 300);
            }
            totalCountEl.innerText = response.total;

            // Hapus loader jika masih ada
            const loader = document.getElementById('loader');
            if(loader) loader.remove();

            // Render ulang atau update Job Cards
            renderJobs(response.data);
        };

        // Event listener saat error/putus
        eventSource.onerror = () => {
            statusText.innerHTML = '<span class="live-indicator" style="background-color: var(--danger); animation: none; box-shadow: none;"></span> Terputus. Mencoba reconnect...';
        };

        // Fungsi untuk merender HTML dari data array
        function renderJobs(jobsArray) {
            // Jika array kosong
            if (!jobsArray || jobsArray.length === 0) {
                jobsContainer.innerHTML = '<div id="loader">Tidak ada job yang berjalan.</div>';
                return;
            }

            // Kita buat logic update yg cerdas: hanya update yg berubah untuk hindari re-render full
            jobsArray.forEach(job => {
                const existingCard = document.getElementById('card-' + job.id);
                
                if (existingCard) {
                    // Update card yang sudah ada jika status berubah
                    const statusSpan = existingCard.querySelector('.job-status');
                    if(statusSpan.innerText !== job.status) {
                        statusSpan.innerText = job.status;
                        statusSpan.className = 'job-status ' + getStatusClass(job.status);
                        
                        // Berikan efek flash
                        existingCard.classList.remove('updated');
                        void existingCard.offsetWidth; // trigger DOM reflow
                        existingCard.classList.add('updated');
                    }
                } else {
                    // Buat card baru
                    const card = document.createElement('div');
                    card.className = 'job-card';
                    card.id = 'card-' + job.id;
                    
                    card.innerHTML = \`
                        <span class="job-id">#\${job.id}</span>
                        <h3 class="job-name">\${job.name || 'Unknown Task'}</h3>
                        <span class="job-status \${getStatusClass(job.status)}">\${job.status}</span>
                    \`;
                    
                    jobsContainer.appendChild(card);
                }
            });
            
            // Opsional: Hapus card jika ada id yang sudah tidak ada di server (Cleanup)
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