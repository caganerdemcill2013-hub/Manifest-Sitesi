/**
 * Bandsintown'dan grubun konser tarihlerini çeker ve
 * data/konserler.json dosyasını günceller.
 *
 * Opsiyonel ortam değişkenleri:
 *   BANDSINTOWN_ARTIST_NAME  -> varsayılan: "Manifest"
 *   BANDSINTOWN_APP_ID       -> Bandsintown'a kayıtlı uygulama adı.
 *                               Kaydın yoksa geçici bir isim de çalışır
 *                               (bkz. README), yoğun kullanımda rate-limit'e takılabilir.
 *
 * Node 18+ gerektirir (global fetch built-in).
 */

const fs = require("fs");
const path = require("path");

const ARTIST_NAME = process.env.BANDSINTOWN_ARTIST_NAME || "Manifest";
const APP_ID = process.env.BANDSINTOWN_APP_ID || "manifest-sitesi-otomasyon";

const DATA_FILE = path.join(__dirname, "..", "data", "konserler.json");

async function fetchEvents() {
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(
    ARTIST_NAME
  )}/events?app_id=${encodeURIComponent(APP_ID)}&date=upcoming`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Bandsintown isteği başarısız: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    // Sanatçı bulunamadığında Bandsintown boş obje / hata objesi dönebilir
    console.log("Bandsintown yanıtı beklenen formatta değil, muhtemelen konser yok.");
    return [];
  }
  return json.map((e) => ({
    id: e.id,
    tarih: e.datetime,
    mekan: e.venue?.name || "",
    sehir: e.venue?.city || "",
    ulke: e.venue?.country || "",
    biletUrl: e.offers?.[0]?.url || e.url || "",
  }));
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

async function main() {
  const events = await fetchEvents();
  const existing = loadExisting();
  const existingIds = new Set(existing.map((k) => k.id));

  const yeniler = events.filter((e) => !existingIds.has(e.id));
  if (yeniler.length === 0) {
    console.log("Yeni konser yok.");
    // Geçmiş tarihli konserleri de temizleyip listeyi güncel tutalım
    const guncel = events; // Bandsintown zaten sadece "upcoming" döner
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(guncel, null, 2), "utf-8");
    return;
  }

  console.log(`${yeniler.length} yeni konser bulundu:`, yeniler.map((y) => `${y.sehir} - ${y.tarih}`));
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), "utf-8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
