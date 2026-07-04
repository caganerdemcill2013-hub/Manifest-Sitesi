/**
 * Spotify'dan sanatçının son şarkı/albümlerini çeker ve
 * data/sarkilar.json dosyasını günceller.
 *
 * Gerekli ortam değişkenleri (GitHub Secrets):
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *
 * Opsiyonel:
 *   SPOTIFY_ARTIST_ID    -> biliyorsan direkt sanatçı ID'si (en güvenilir)
 *   SPOTIFY_ARTIST_NAME  -> bilmiyorsan isimle arama yapılır (varsayılan: "Manifest")
 *
 * Node 18+ gerektirir (global fetch built-in).
 */

const fs = require("fs");
const path = require("path");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const ARTIST_ID = process.env.SPOTIFY_ARTIST_ID || "";
const ARTIST_NAME = process.env.SPOTIFY_ARTIST_NAME || "Manifest";

const DATA_FILE = path.join(__dirname, "..", "data", "sarkilar.json");

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET tanımlı değil. GitHub Secrets'a eklemen gerekiyor."
    );
  }
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Spotify token alınamadı: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function resolveArtistId(token) {
  if (ARTIST_ID) return ARTIST_ID;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    ARTIST_NAME
  )}&type=artist&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sanatçı arama başarısız: ${res.status}`);
  const json = await res.json();
  const artist = json.artists?.items?.[0];
  if (!artist) throw new Error(`"${ARTIST_NAME}" adında sanatçı bulunamadı.`);
  console.log(`Sanatçı bulundu: ${artist.name} (${artist.id})`);
  return artist.id;
}

async function fetchReleases(token, artistId) {
  const url = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=single,album&market=TR&limit=20`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Albüm listesi alınamadı: ${res.status}`);
  const json = await res.json();
  return (json.items || [])
    .map((item) => ({
      id: item.id,
      isim: item.name,
      tur: item.album_type, // "album" | "single"
      cikisTarihi: item.release_date,
      kapakUrl: item.images?.[0]?.url || "",
      spotifyUrl: item.external_urls?.spotify || "",
      embedUrl: `https://open.spotify.com/embed/album/${item.id}`,
    }))
    .sort((a, b) => new Date(b.cikisTarihi) - new Date(a.cikisTarihi));
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

async function main() {
  const token = await getAccessToken();
  const artistId = await resolveArtistId(token);
  const releases = await fetchReleases(token, artistId);
  const existing = loadExisting();
  const existingIds = new Set(existing.map((s) => s.id));

  const yeniler = releases.filter((r) => !existingIds.has(r.id));
  if (yeniler.length === 0) {
    console.log("Yeni şarkı/albüm yok.");
    return;
  }

  console.log(`${yeniler.length} yeni yayın bulundu:`, yeniler.map((y) => y.isim));
  const guncelListe = [...yeniler, ...existing];
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(guncelListe, null, 2), "utf-8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
