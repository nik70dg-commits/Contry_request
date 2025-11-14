// shared-db.js - Logica condivisa per caricare i dati

async function loadSongsData(supabaseClient) {
  console.log('🔄 Loading songs data...');
  
  try {
    // 1. Prendi TUTTE le canzoni nascoste
    const { data: hiddenData, error: hiddenError } = await supabaseClient
      .from('hidden_songs')
      .select('song_id');
    
    if (hiddenError) {
      console.error('❌ Errore hidden_songs:', hiddenError);
    }
    
    const hiddenIds = (hiddenData || []).map(h => h.song_id);
    console.log('🚫 Hidden IDs:', hiddenIds);

    // 2. Prendi TUTTE le canzoni
    const { data: allSongs, error: songsError } = await supabaseClient
      .from('songs')
      .select('id, title, artist')
      .order('title', { ascending: true });

    if (songsError) {
      console.error('❌ Errore songs:', songsError);
      throw songsError;
    }

    console.log('📀 Canzoni totali nel DB:', allSongs?.length || 0);

    // 3. Prendi TUTTE le richieste (SOLO id e song_id)
    const { data: allRequests, error: requestsError } = await supabaseClient
      .from('requests')
      .select('id, song_id');

    if (requestsError) {
      console.error('❌ Errore requests:', requestsError);
      throw requestsError;
    }

    console.log('📝 Richieste totali nel DB:', allRequests?.length || 0);
    
    if (allRequests && allRequests.length > 0) {
      console.log('📋 Prime 3 richieste:', allRequests.slice(0, 3));
    }

    // 4. Conta le richieste per ogni canzone
    const requestCounts = {};
    (allRequests || []).forEach(req => {
      if (req.song_id) {
        requestCounts[req.song_id] = (requestCounts[req.song_id] || 0) + 1;
      }
    });

    console.log('📊 Request counts:', requestCounts);

    // 5. Combina i dati
    const songsWithCounts = (allSongs || []).map(song => ({
      ...song,
      requests: requestCounts[song.id] || 0
    }));

    console.log('✅ Canzoni con conteggi:', songsWithCounts.length);
    
    // Log canzoni con richieste > 0
    const songsWithRequests = songsWithCounts.filter(s => s.requests > 0);
    console.log('🎵 Canzoni con richieste:', songsWithRequests.length);
    if (songsWithRequests.length > 0) {
      console.log('🎵 Top 5 richieste:', songsWithRequests.slice(0, 5).map(s => `${s.title} (${s.requests})`));
    }

    return {
      allSongs: songsWithCounts,
      hiddenIds,
      totalRequests: allRequests?.length || 0
    };
  } catch (error) {
    console.error('❌ Errore loadSongsData:', error);
    throw error;
  }
}

// Esporta per uso globale
window.loadSongsData = loadSongsData;