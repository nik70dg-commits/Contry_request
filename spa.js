import { supabase } from './supabase.js';

const container = document.getElementById('song-list');
const searchInput = document.getElementById('search');

let currentSongs = [];
let hiddenSongs = [];

// Carica canzoni
async function loadSongs() {
  const { data: hiddenData } = await supabase.from('hidden_songs').select('*');
  hiddenSongs = hiddenData.map(h => h.song_id);

  const { data } = await supabase
    .from('song_counts')
    .select('*')
    .order('requests', { ascending: false })
    .order('title', { ascending: true });

  currentSongs = data || [];
  renderSongs();
}

// Render lato pubblico
function renderSongs() {
  const term = searchInput?.value.toLowerCase() || '';
  const songsToShow = currentSongs
    .filter(s => !hiddenSongs.includes(s.id))
    .filter(s => s.title.toLowerCase().includes(term) || (s.artist && s.artist.toLowerCase().includes(term)));

  container.innerHTML = songsToShow.length
    ? songsToShow.map(s => `
      <div class="song">
        <div><strong>${s.title}</strong>${s.artist ? ' – ' + s.artist : ''}</div>
        <div>
          <button data-id="${s.id}" class="request-btn">Richiedi</button>
          <span class="count">(${s.requests})</span>
        </div>
      </div>
    `).join('')
    : "<p style='opacity:0.7'>Nessuna canzone disponibile</p>";

  container.querySelectorAll('.request-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      await supabase.from('requests').insert([{ song_id: id }]);
      btn.disabled = false;
    };
  });
}

// Ricerca live
if (searchInput) searchInput.addEventListener('input', renderSongs);

// Realtime lato pubblico
supabase.channel('realtime-requests')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, loadSongs)
  .subscribe();

supabase.channel('realtime-hidden')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'hidden_songs' }, loadSongs)
  .subscribe();

// Avvio
loadSongs();
