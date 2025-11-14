import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');

let currentSongs = [];
let hiddenIds = [];

// Memorizza le richieste lato client per limitare per IP/browser
let requestedSongs = JSON.parse(localStorage.getItem('requestedSongs')) || [];

async function loadSongs() {
  // Prendi le canzoni nascoste
  const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
  hiddenIds = hiddenData.map(h => h.song_id);

  // Prendi tutte le canzoni
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

  container.innerHTML = filtered.map(s => `
    <div class="song ${s.requests > 0 ? 'requested' : ''} ${requestedSongs.includes(s.id) ? 'already-requested' : ''}">
      <div><strong>${s.title}</strong>${s.artist ? ' – ' + s.artist : ''}</div>
      <div>
        <button data-id="${s.id}" ${requestedSongs.includes(s.id) ? 'disabled' : ''}>${requestedSongs.includes(s.id) ? 'Richiesta inviata' : 'Richiedi'}</button>
        <span class="count">(${s.requests})</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);

      // Limite richieste lato client: max 1 richiesta per canzone
      if (requestedSongs.includes(id)) return;

      btn.disabled = true;
      btn.textContent = 'Inviando...';

      const { error } = await supabase.from('requests').insert([{ song_id: id }]);
      if (error) {
        console.error('Errore richiesta:', error);
        btn.disabled = false;
        btn.textContent = 'Richiedi';
        return;
      }

      // Aggiorna localStorage
      requestedSongs.push(id);
      localStorage.setItem('requestedSongs', JSON.stringify(requestedSongs));

      btn.textContent = '✓ Richiesta inviata';
      loadSongs(); // aggiorna lista
    };
  });
}

// Aggiorna la lista in tempo reale
searchInput.addEventListener('input', renderSongs);

const requestsChannel = supabase.channel('realtime-requests')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, loadSongs)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'hidden_songs' }, loadSongs)
  .subscribe();

loadSongs();
