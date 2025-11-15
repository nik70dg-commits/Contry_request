import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');
const customForm = document.getElementById('custom-form');
const customTitleInput = document.getElementById('custom-title');
const customArtistInput = document.getElementById('custom-artist');

// Stato locale
let myRequested = JSON.parse(localStorage.getItem("my_requested_songs") || "[]");
let myCustomRequested = JSON.parse(localStorage.getItem("my_custom_requested") || "[]");
let currentSongs = [];
let hiddenIds = [];
let lastCustomRequestId = null; // Per evidenziare l'ultima richiesta

// Configurazione
const MAX_REQUESTS_PER_USER = 50;

// ====== FORM RICHIESTA CUSTOM ======
customForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = customTitleInput.value.trim();
  const artist = customArtistInput.value.trim();
  
  if (!title) {
    customTitleInput.focus();
    return;
  }

  // Controlla limite richieste
  const totalRequests = myRequested.length + myCustomRequested.length;
  if (totalRequests >= MAX_REQUESTS_PER_USER) {
    customTitleInput.value = '';
    customArtistInput.value = '';
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  console.log('📝 Inviando richiesta custom:', title, artist);

  try {
    const submitBtn = customForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳';

    // Inserisci richiesta con song_id NULL e dati custom
    const { data, error } = await supabase
      .from('requests')
      .insert([{
        song_id: null,
        custom_title: title,
        custom_artist: artist || null
      }])
      .select();

    if (error) throw error;

    console.log('✅ Richiesta custom inviata:', data);
    
    // Salva in locale e memorizza ID per evidenziare
    const requestId = data[0].id;
    lastCustomRequestId = requestId;
    myCustomRequested.push(`custom_${requestId}`);
    localStorage.setItem("my_custom_requested", JSON.stringify(myCustomRequested));
    
    // Reset form
    customTitleInput.value = '';
       
    submitBtn.disabled = false;
    submitBtn.textContent = '➕ Richiedi';
    
    // Ricarica e mostra evidenziata (dopo 200ms per dare tempo al DB)
    setTimeout(() => {
      loadSongs();
      // Rimuovi evidenziazione dopo 5 secondi
      setTimeout(() => {
        lastCustomRequestId = null;
        renderSongs();
      }, 5000);
    }, 200);

  } catch (error) {
    console.error('❌ Errore invio richiesta:', error);
    customTitleInput.value = '';
    customArtistInput.value = '';
    
    const submitBtn = customForm.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = '➕ Richiedi';
  }
});

// ====== CARICAMENTO CANZONI ======
async function loadSongs() {
  const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
  hiddenIds = hiddenData.map(h => h.song_id);

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
  const totalRequests = myRequested.length + myCustomRequested.length;
  if (totalRequests >= MAX_REQUESTS_PER_USER) {
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

  myRequested.push(songId);
  localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));
  loadSongs();
}

// Ricerca live
searchInput.addEventListener('input', renderSongs);

// REALTIME
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
        myCustomRequested = [];
        lastCustomRequestId = null;
        localStorage.removeItem("my_requested_songs");
        localStorage.removeItem("my_custom_requested");
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

// Inizializza
loadSongs();

