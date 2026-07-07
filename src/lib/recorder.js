"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");

// /tmp selalu writable di Railway/serverless
const REC_DIR = "/tmp/recordings";
const DELETE_AFTER_MS = 60 * 1000; // hapus 1 menit setelah stop

fs.mkdirSync(REC_DIR, { recursive: true });

// simpan session yang sedang berjalan
const sessions = new Map();

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Mulai rekam sebuah puppeteer `page`.
 * @returns {Promise<{ id: string, filePath: string }>}
 */
async function startRecording(page, options = {}) {
  const id = newId();
  const filePath = path.join(REC_DIR, `${id}.mp4`);
  
  const recorder = new PuppeteerScreenRecorder(page, {
    fps: options.fps || 25,
    videoFrame: {
      width: options.width || 1280,
      height: options.height || 720,
    },
    aspectRatio: "16:9",
  });
  
  await recorder.start(filePath);
  sessions.set(id, { recorder, filePath });
  
  return { id, filePath };
}

/**
 * Stop rekaman. Video langsung tersedia via URL, lalu dihapus 1 menit kemudian.
 * @returns {Promise<{ id: string, path: string }>}  path relatif utk URL
 */
async function stopRecording(id) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Recording "${id}" tidak ditemukan / sudah stop`);
  
  await session.recorder.stop();
  sessions.delete(id);
  
  // jadwalkan penghapusan file setelah 1 menit
  setTimeout(() => {
    fs.promises.unlink(session.filePath).catch(() => {});
  }, DELETE_AFTER_MS).unref();
  
  return { id, path: `/videos/${id}.mp4` };
}

/** Resolve path file video (buat route serving). */
function resolveVideo(fileName) {
  const safe = path.basename(fileName); // cegah path traversal
  const filePath = path.join(REC_DIR, safe);
  return fs.existsSync(filePath) ? filePath : null;
}

module.exports = { startRecording, stopRecording, resolveVideo, DELETE_AFTER_MS };