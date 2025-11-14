if (typeof supabase === 'undefined') {
  console.error('Supabase non caricato!');
} else if (typeof loadSongsData === 'undefined') {
  console.error('shared-db.js non caricato!');
} else {
  initPublic();
}

function initPublic() {
  console.log('👥 Public.js caricato');

  const supabaseUrl = 'https://zkzlrdtloormhlyyvpax.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpremxyZHRsb29ybWhseXl2cGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMTkzOTAsImV4cCI6MjA3ODU5NTM5MH0.dj6w3SGs3qPmoKxGLhYYbceQwpgLd4CZYo_2ua0H6fU';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

  const container = document.getElementById('song-list');
  const searchInput = document.getElementById('search');

  let currentSongs = [];
  let hiddenIds = [];

  async function loadSongs() {
    console.log('👥 Public - Loading songs...');
    
    try {
      const { allSongs, hiddenIds: hidden, totalRequests } = await window.loadSongsData(supabaseClient);
      
      hiddenIds = hidden;
      
      // Filtra le canzoni nascoste
      currentSongs = allSongs.filter(s => !hiddenIds.includes(s.id));
      currentSongs.sort((a, b) => b.requests - a.requests);
      
      console.log('👥 Public - Canzoni visibili:', currentSongs.length);
      console.log('👥 Public - Total requests in DB:', totalRequests);
      
      renderSongs();
    } catch (error) {
      console.error('❌ Public - Errore:', error);
      container.innerHTML = `<p style="color: red;">Errore: ${error.message}</p>`;
    }
  }

  function renderSongs() {
    const searchTerm = searchInput.value.toLowerCase();
    const filtered = currentSongs.filter(
      s => s.title.toLowerCase().includes(searchTerm) ||
           (s.artist && s.artist.toLowerCase().includes(searchTerm))
    );

    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty">Nessuna canzone disponibile</p>';
      return;
    }

    container.innerHTML = filtered.map(s => `
      <div class="song">
        <div class="song-info">
          <strong>${s.title}</strong>
          ${s.artist ? `<span class="artist"> - ${s.artist}</span>` : ''}
        </div>
        <div class="song-actions">
          <span class="count">${s.requests} ${s.requests === 1 ? 'richiesta' : 'richieste'}</span>
          <button class="request-btn" data-id="${s.id}">Richiedi</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.request-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.dataset.id);
        await requestSong(id, btn);
      };
    });
  }

  async function requestSong(songId, button) {
    console.log('📝 Public - Requesting song:', songId);
    
    try {
      button.disabled = true;
      button.textContent = 'Inviando...';

      const { error } = await supabaseClient
        .from('requests')
        .insert([{ song_id: songId }]);

      if (error) throw error;

      console.log('✅ Public - Richiesta inviata');
      button.textContent = '✓ Richiesta inviata!';
      
      setTimeout(() => {
        button.textContent = 'Richiedi';
        button.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('❌ Public - Errore:', error);
      alert('Errore: ' + error.message);
      button.textContent = 'Richiedi';
      button.disabled = false;
    }
  }

  searchInput.addEventListener('input', renderSongs);

  // REALTIME
  const channel = supabaseClient
    .channel('public-updates')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'requests' }, 
      () => {
        console.log('🔔 Public - Requests changed');
        loadSongs();
      }
    )
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'hidden_songs' }, 
      () => {
        console.log('🔔 Public - Hidden changed');
        loadSongs();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Public - Realtime connesso!');
      }
    });

  setInterval(loadSongs, 5000);
  
  loadSongs();
}