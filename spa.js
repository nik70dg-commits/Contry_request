import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');
const customInput = document.getElementById('custom-request');
const customBtn = document.getElementById('custom-request-btn');

let myRequested = JSON.parse(localStorage.getItem("my_requested_songs") || "[]");
let currentSongs = [];
let hiddenIds = [];

// CONFIG
const MAX_REQUESTS_PER_USER = 6;

// --------------------
// FUNZIONI PRINCIPALI
// --------------------

async function loadSongs() {
  try {
    // Prendi canzoni nascoste
    const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
    hiddenIds = hiddenData.map(h => h.song_id);

    // Lista canzoni con conteggi
    const { data: songsData, error } = await supabase
      .from('song_counts')
      .select('*')
      .order('requests', { ascending: false })
      .order('title', { ascending: true });

    if (error) {
      console.error("Errore caricamento canzoni:", error);
      return;
    }

    currentSongs = songsData.filter(s => !hiddenIds.includes(s.id));
    renderSongs();
  } catch (err) {
    console.error("Errore loadSongs:", err);
  }
}

function renderSongs() {
  const term = searchInput.value.toLowerCase();

  const filtered = currentSongs.filter(
    s => s.title.toLowerCase().includes(term) ||
         (s.artist && s.artist.toLowerCase().includes(term))
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

  // Listener bottoni
  container.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = () => requestSong(parseInt(btn.dataset.id), btn);
  });
}

async function requestSong(songId, button) {
  if (myRequested.length >= MAX_REQUESTS_PER_USER) {
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  button.disabled = true;

  const { error } = await supabase.from('requests').insert([{ song_id: songId }]);
  button.disabled = false;

  if (!error) {
    myRequested.push(songId);
    localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));
    loadSongs();
  }
}

// --------------------
// RICHIESTE PERSONALIZZATE
// --------------------
customBtn.addEventListener('click', sendCustomRequest);
customInput.addEventListener('keypress', e => { if(e.key==='Enter') sendCustomRequest(); });

async function sendCustomRequest() {
  const text = customInput.value.trim();
  if (!text || text.length < 2) return alert("Inserisci almeno 2 caratteri.");

  if (myRequested.length >= MAX_REQUESTS_PER_USER) {
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  customBtn.disabled = true;
  const { error } = await supabase.from('custom_requests').insert([{ text }]);
  customBtn.disabled = false;

  if (error) {
    console.error("Errore richiesta personalizzata:", error);
    return alert("Errore, riprova.");
  }

  myRequested.push("custom_" + Date.now());
  localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));
  customInput.value = "";
  loadSongs();
}

// --------------------
// REaltime
// --------------------
supabase
  .channel('realtime-client')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, payload => {
    // Se DELETE globale, reset stato locale
    if(payload.eventType==='DELETE' && payload.old?.id===undefined){
      myRequested = [];
      localStorage.removeItem("my_requested_songs");
    }
    loadSongs();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_requests' }, () => loadSongs())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'hidden_songs' }, () => loadSongs())
  .subscribe();

// --------------------
// LISTENER INPUT
// --------------------
searchInput.addEventListener('input', renderSongs);

// --------------------
// INIT
// --------------------
loadSongs();
