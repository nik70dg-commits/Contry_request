import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');
const customInput = document.getElementById('custom-request');
const customBtn = document.getElementById('custom-request-btn');

// Stato locale (richieste dell’utente)
let myRequested = JSON.parse(localStorage.getItem("my_requested_songs") || "[]");

let currentSongs = [];
let hiddenIds = [];

// ====== CONFIGURAZIONE ======
const MAX_REQUESTS_PER_USER = 6;   // Limite richieste per IP/utente
// ============================

// ===== CARICAMENTO CANZONI =====
async function loadSongs() {
  // Canzoni nascoste
  const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
  hiddenIds = hiddenData.map(h => h.song_id);

  // Lista canzoni con conteggio
  const { data: songsData, error } = await supabase
    .from('song_counts')
    .select('*')
    .order('requests', { ascending: false })
    .order('title', { ascending: true });

  if (error) {
    console.error('Errore caricamento canzoni:', error);
    return;
  }

  // Richieste personalizzate
  const { data: customData, error: customError } = await supabase
    .from('custom_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (customError) console.error('Errore caricamento richieste personalizzate:', customError);

  const customSongs = (customData || []).map(r => ({
    id: 'custom_' + r.id,
    title: r.text,
    artist: '',
    requests: 1,
    isCustom: true
  }));

  // Filtra canzoni nascoste
  const normalSongs = (songsData || []).filter(s => !hiddenIds.includes(s.id));

  // Combina richieste personalizzate + canzoni normali
  currentSongs = [...customSongs, ...normalSongs];

  renderSongs();
}

// ===== RENDER CANZONI =====
function renderSongs() {
  const term = searchInput.value.toLowerCase();

  const filtered = currentSongs.filter(
    s => s.title.toLowerCase().includes(term) ||
         (s.artist && s.artist.toLowerCase().includes(term))
  );

  container.innerHTML = filtered.map(s => {
    const requestedByUser = myRequested.includes(s.id);
    const requestedByOthers = !requestedByUser && s.requests > 0;

    let cssClass = '';
    if (requestedByUser) cssClass = 'requested-user';
    else if (requestedByOthers) cssClass = 'requested-others';
    if (s.isCustom) cssClass += ' custom-request';

    return `
      <div class="song ${cssClass}">
        <div>
          <strong>${s.title}</strong>${s.artist ? ' – ' + s.artist : ''}${s.isCustom ? ' (Richiesta personalizzata)' : ''}
        </div>
        <div>
          <button data-id="${s.id}">Richiedi</button>
          <span class="count">(${s.requests})</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = () => requestSong(btn.dataset.id, btn);
  });
}

// ===== RICHIESTA CANZONE =====
async function requestSong(songId, button) {
  if (myRequested.length >= MAX_REQUESTS_PER_USER) {
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  button.disabled = true;

  // Se è richiesta personalizzata, salva comunque nella tabella 'requests'
  let payload = {};
  if (songId.toString().startsWith('custom_')) {
    payload = { song_id: null, custom_id: parseInt(songId.replace('custom_', '')) };
  } else {
    payload = { song_id: parseInt(songId) };
  }

  const { error } = await supabase.from('requests').insert([payload]);

  button.disabled = false;

  if (error) {
    console.error("Errore richiesta:", error);
    return;
  }

  myRequested.push(songId);
  localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));

  loadSongs();
}

// ===== RICHIESTA PERSONALIZZATA =====
customBtn.addEventListener('click', sendCustomRequest);
customInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') sendCustomRequest();
});

async function sendCustomRequest() {
  const text = customInput.value.trim();
  if (!text || text.length < 2) return alert("Inserisci almeno 2 caratteri.");

  if (myRequested.length >= MAX_REQUESTS_PER_USER) {
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  customBtn.disabled = true;

  const { data, error } = await supabase.from('custom_requests').insert([{ text }]);

  customBtn.disabled = false;

  if (error) {
    console.error("Errore richiesta personalizzata:", error);
    alert("Errore, riprova.");
    return;
  }

  // salva come richiesta utente
  myRequested.push("custom_" + data[0].id);
  localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));

  customInput.value = "";
  loadSongs();
}

// ===== REALTIME =====
supabase
  .channel('realtime-requests')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, payload => {
    if (payload.eventType === 'DELETE') {
      myRequested = [];
      localStorage.removeItem("my_requested_songs");
    }
    loadSongs();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_requests' }, () => loadSongs())
  .subscribe();

// ===== INIT =====
loadSongs();
