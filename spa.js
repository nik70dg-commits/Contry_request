import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');

// Stato locale: richieste fatte dal singolo utente
let myRequested = JSON.parse(localStorage.getItem("my_requested_songs") || "[]");

let currentSongs = [];
let hiddenIds = [];

// ===== LIMITE RICHIESTE PER UTENTE =====
const MAX_REQUESTS_PER_USER = 5;
// ======================================

// Carica dati dal database
async function loadSongs() {

  // Legge canzoni nascoste
  const { data: hiddenData } = await supabase
    .from('hidden_songs')
    .select('song_id');

  hiddenIds = hiddenData?.map(h => h.song_id) || [];

  // Legge tutte le canzoni con conteggio richieste
  const { data: songsData, error } = await supabase
    .from('song_counts')
    .select('*')
    .order('requests', { ascending: false })
    .order('title', { ascending: true });

  if (error) {
    console.error("Errore caricamento canzoni:", error);
    return;
  }

  // Filtra le nascoste (public non le deve vedere)
  currentSongs = songsData.filter(s => !hiddenIds.includes(s.id));

  renderSongs();
}


// Mostra la lista delle canzoni
function renderSongs() {
  const searchTerm = searchInput.value.toLowerCase();

  const filtered = currentSongs.filter(s =>
    s.title.toLowerCase().includes(searchTerm) ||
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
        <div><strong>${s.title}</strong>${s.artist ? " – " + s.artist : ""}</div>
        <div>
          <button data-id="${s.id}">Richiedi</button>
          <span class="count">(${s.requests})</span>
        </div>
      </div>
    `;
  }).join("");

  // Aggiunge eventi ai pulsanti
  container.querySelectorAll("button[data-id]").forEach(btn => {
    btn.onclick = () => requestSong(parseInt(btn.dataset.id), btn);
  });
}


// Richiesta canzone da parte dell’utente
async function requestSong(songId, btn) {

  // Limite massimo richieste
  if (myRequested.length >= MAX_REQUESTS_PER_USER) {
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste`);
    return;
  }

  // Non può richiedere due volte la stessa canzone
  if (myRequested.includes(songId)) {
    alert("Hai già richiesto questa canzone!");
    return;
  }

  btn.disabled = true;

  const { error } = await supabase
    .from('requests')
    .insert([{ song_id: songId }]);

  btn.disabled = false;

  if (error) {
    console.error("Errore invio richiesta:", error);
    return;
  }

  // Salva localmente
  myRequested.push(songId);
  localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));

  loadSongs();
}


// Aggiorna lista durante la ricerca
searchInput.addEventListener('input', renderSongs);


// ===== REALTIME SUPABASE =====
supabase.channel('realtime-requests')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'requests' },
    payload => {

      console.log("📡 Realtime:", payload.eventType);

      // Se il DJ resetta → reset locale lato public
      if (payload.eventType === 'DELETE') {
        console.log("🧽 Reset locale (DJ ha azzerato tutto)");
        myRequested = [];
        localStorage.removeItem("my_requested_songs");
      }

      loadSongs();
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'hidden_songs' },
    loadSongs
  )
  .subscribe();


// Caricamento iniziale
loadSongs();
