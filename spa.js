import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');
const customForm = document.getElementById('custom-form');
const customTitleInput = document.getElementById('custom-title');

// Stato locale
let myRequested = JSON.parse(localStorage.getItem("my_requested_songs") || "[]");
let myCustomRequested = JSON.parse(localStorage.getItem("my_custom_requested") || "[]");
let currentSongs = [];
let customRequests = [];
let hiddenIds = [];
let lastCustomRequestId = null;

// Configurazione
const MAX_REQUESTS_PER_USER = 50;

// ====== FORM RICHIESTA CUSTOM ======
customForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = customTitleInput.value.trim();
  
  if (!title) {
    customTitleInput.focus();
    return;
  }

  const totalRequests = myRequested.length + myCustomRequested.length;
  if (totalRequests >= MAX_REQUESTS_PER_USER) {
    customTitleInput.value = '';
    alert(`Hai raggiunto il limite massimo di ${MAX_REQUESTS_PER_USER} richieste.`);
    return;
  }

  console.log('📝 Inviando richiesta custom:', title);

  try {
    const submitBtn = customForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳';

    const { data, error } = await supabase
      .from('requests')
      .insert([{
        song_id: null,
        custom_title: title
      }])
      .select();

    if (error) throw error;

    console.log('✅ Richiesta custom inviata:', data);
    
    const requestId = data[0].id;
    lastCustomRequestId = requestId;
    myCustomRequested.push(`custom_${requestId}`);
    localStorage.setItem("my_custom_requested", JSON.stringify(myCustomRequested));
    
    customTitleInput.value = '';
    
    submitBtn.disabled = false;
    submitBtn.textContent = '➕ Richiedi';
    
    setTimeout(() => {
      loadSongs();
      setTimeout(() => {
        lastCustomRequestId = null;
        renderSongs();
      }, 5000);
    }, 200);

  } catch (error) {
    console.error('❌ Errore invio richiesta:', error);
    customTitleInput.value = '';
    
    const submitBtn = customForm.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = '➕ Richiedi';
  }
});

// ====== CARICAMENTO CANZONI E RICHIESTE CUSTOM ======
async function loadSongs() {
  console.log('🔄 Loading songs and custom requests...');
  
  try {
    // 1. Carica canzoni nascoste
    const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
    hiddenIds = (hiddenData || []).map(h => h.song_id);

    // 2. Carica canzoni normali con conteggio
    const { data: songsData, error } = await supabase
      .from('song_counts')
      .select('*')
      .order('requests', { ascending: false })
      .order('title', { ascending: true });

    if (error) {
      console.error('Errore caricamento canzoni:', error);
      return;
    }

    currentSongs = (songsData || []).filter(s => !hiddenIds.includes(s.id));

    // 3. CARICA RICHIESTE CUSTOM (song_id NULL)
    const { data: customData, error: customError } = await supabase
      .from('requests')
      .select('id, custom_title')
      .is('song_id', null)
      .order('id', { ascending: false });

    if (customError) {
      console.error('❌ Errore caricamento richieste custom:', customError);
    } else {
      customRequests = customData || [];
      console.log('✨ Richieste custom caricate:', customRequests.length);
      if (customRequests.length > 0) {
        console.log('Custom requests:', customRequests);
      }
    }

    // 🔑 PUNTO CHIAVE: Pulisci la cache locale se non ci sono più richieste nel DB
    const { data: allRequests } = await supabase
      .from('requests')
      .select('id, song_id');
    
    if (!allRequests || allRequests.length === 0) {
      console.log('🧹 Nessuna richiesta nel DB - pulisco cache locale');
      myRequested = [];
      myCustomRequested = [];
      localStorage.removeItem("my_requested_songs");
      localStorage.removeItem("my_custom_requested");
    } else {
      // Rimuovi dalla cache locale le richieste che non esistono più nel DB
      const dbRequestIds = allRequests
        .filter(r => r.song_id !== null)
        .map(r => r.song_id);
      
      const dbCustomIds = allRequests
        .filter(r => r.song_id === null)
        .map(r => `custom_${r.id}`);
      
      // Filtra solo le richieste che esistono ancora nel DB
      myRequested = myRequested.filter(id => dbRequestIds.includes(id));
      myCustomRequested = myCustomRequested.filter(id => dbCustomIds.includes(id));
      
      localStorage.setItem("my_requested_songs", JSON.stringify(myRequested));
      localStorage.setItem("my_custom_requested", JSON.stringify(myCustomRequested));
    }

    renderSongs();
  } catch (error) {
    console.error('❌ Errore generale loadSongs:', error);
  }
}

function renderSongs() {
  const searchTerm = searchInput.value.toLowerCase();
  
  let html = '';

  // 1. MOSTRA RICHIESTE CUSTOM IN CIMA
  if (customRequests.length > 0) {
    console.log('Rendering custom requests:', customRequests.length);
    
    const filteredCustom = customRequests.filter(c => 
      c.custom_title && c.custom_title.toLowerCase().includes(searchTerm)
    );

    if (filteredCustom.length > 0) {
      filteredCustom.forEach(c => {
        const isNew = lastCustomRequestId === c.id;
        const requestedByMe = myCustomRequested.includes(`custom_${c.id}`);

        html += `
          <div class="song custom-request ${isNew ? 'highlight' : ''} ${requestedByMe ? 'requested-user' : ''}">
            <div>
              <strong>✨ ${c.custom_title}</strong>
              <span class="custom-badge">Richiesta personalizzata</span>
            </div>
            <div>
              <span class="custom-label">IN CODA</span>
            </div>
          </div>
        `;
      });
    }
  } else {
    console.log('Nessuna richiesta custom da mostrare');
  }

  // 2. MOSTRA CANZONI NORMALI
  const filtered = currentSongs.filter(
    s => s.title.toLowerCase().includes(searchTerm) ||
         (s.artist && s.artist.toLowerCase().includes(searchTerm))
  );

  html += filtered.map(s => {
    const requestedByUser = myRequested.includes(s.id);
    const requestedByOthers = s.requests > 0;
    
    let cssClass = '';
    if (requestedByUser) {
      cssClass = 'requested-user';
    } else if (requestedByOthers) {
      cssClass = 'requested-others';
    }

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

  if (!html) {
    container.innerHTML = '<p class="empty">Nessuna canzone trovata</p>';
    return;
  }

  container.innerHTML = html;

  // Event listeners per richieste normali
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
console.log('⚡ Setting up realtime...');

const requestsChannel = supabase
  .channel('realtime-requests')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'requests' },
    payload => {
      console.log("📡 Realtime event:", payload.eventType, payload);
      
      // Ricarica sempre dopo qualsiasi modifica
      loadSongs();
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'hidden_songs' },
    payload => {
      console.log("📡 Hidden songs changed:", payload.eventType);
      loadSongs();
    }
  )
  .subscribe((status) => {
    console.log('⚡ Realtime subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('✅ Realtime connesso!');
    }
  });

// Inizializza
console.log('🚀 Initializing public page...');
loadSongs();
