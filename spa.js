import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');

// Stato locale (richieste dell’utente)
let myRequested = JSON.parse(localStorage.getItem("my_requested_songs") || "[]");

let currentSongs = [];
let hiddenIds = [];

// ====== CONFIGURAZIONE ======
const MAX_REQUESTS_PER_USER = 50;   // Limite richieste per IP/utente
// ============================

async function loadSongs() {
  // Prendi canzoni nascoste
  const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
  hiddenIds = hiddenData.map(h => h.song_id);

  // Prendi lista canzoni con conteggio
  const { data: songsData, error } = await supabase
    .from('song_counts')
    .select('*')
    .order('requests', { ascending: false })
    .order('title', { ascending: true });

  if (error) {
    console.error('Errore caricamento canzoni:', error);
    return;
  }

  currentSongs = songsData.filter(s => !hiddenIds.includes(s.id));
  renderSongs();
}

function renderSongs() {
  const searchTerm = searchInput.value.toLowerCase();

  const filtered = currentSongs.filter(
    s => s.title.toLowerCase().includes(searchTerm) ||
         (s.artist && s.artist.toLowerCase().includes(searchTerm))
  );

  container.innerHTML = filtered.map(s => {
    const requestedByUser = myRequested.includes(s.id);
    const requestedByOthers = s.requests > 0;

    let cssClass = "";
    if (requestedByUser) cssClass = "requested-user";
    else if (requestedByOthers) cssClass = "requested-others";

    return `
      <div class="song ${cssClass}">
        <div><strong>${s.title}</strong>${s.artist ? ' – ' + s.artist : ''}</div>
        <div>
          <button data-id="${s.id}">Richiedi</button>
          <span class="count">(${s.requests})</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.id);
      requestSong(id, btn);
    };
  });
}

async function requestSong(songId, button) {
  // Impedisci più richieste dell'utente
  if (myRequested.length >= MAX_REQUESTS_PER_USER) {
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  button.disabled = true;

  const { error } = await supabase.from('requests').insert([{ song_id: songId }]);

  button.disabled = false;

  if (error) {
    console.error("Errore richiesta:", error);
    return;
  }

  // Salva richiesta utente
  myRequested.push(songId);
  localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));

  loadSongs();
}

// Aggiorna lista durante la ricerca
searchInput.addEventListener('input', renderSongs);

// ====== REALTIME ======
const requestsChannel = supabase
  .channel('realtime-requests')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'requests' },
    payload => {
      console.log("📡 Realtime event:", payload.eventType);

      if (payload.eventType === 'DELETE') {
        console.log("🧽 RESET DJ — pulizia stato locale");
        myRequested = [];
        localStorage.removeItem("my_requested_songs");
      }

      loadSongs();
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'hidden_songs' },
    () => loadSongs()
  )
  .subscribe();

// Caricamento iniziale
loadSongs();

