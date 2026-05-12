import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Plus } from 'lucide-react';

const Lobby = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeControl, setTimeControl] = useState(10);

  const handleCreateRoom = async () => {
    setLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const playerId = profile?.id || user?.id;

    if (!playerId) {
      alert('Authentication error: User ID not found. Please try logging out and in again.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert([{ 
          code, 
          white_player_id: playerId, 
          status: 'waiting',
          time_control_minutes: timeControl,
          white_time_remaining: timeControl * 60,
          black_time_remaining: timeControl * 60
        }])
        .select()
        .single();

      if (error) {
        alert(`Failed to create room: ${error.message}`);
      } else if (data) {
        navigate(`/game/${code}`);
      }
    } catch (err) {
      console.error('Room creation crash:', err);
      alert('An unexpected error occurred while creating the room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode) return;
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode.toUpperCase())
      .single();

    if (error) {
      alert('Room not found');
      return;
    }

    if (data) {
      // If the room is waiting, join as black
      if (data.status === 'waiting' && data.white_player_id !== (profile?.id || user?.id)) {
        await supabase
          .from('rooms')
          .update({ black_player_id: profile?.id || user?.id, status: 'active' })
          .eq('id', data.id);
      }
      navigate(`/game/${data.code}`);
    }
  };

  return (
    <div className="lobby-container container animate-fade flex items-center justify-center" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="lobby-card nm-card" style={{ maxWidth: '450px', width: '100%', padding: '40px' }}>
        <h2 className="serif text-3xl mb-6 text-center">Play Sadhurangam</h2>
        
        <div className="actions flex-col gap-6">
          <div className="time-picker">
            <label className="text-xs text-muted uppercase mb-3 block text-center">Choose Time Control</label>
            <div className="time-grid">
              {[1, 3, 5, 10, 15, 30].map(t => (
                <button 
                  key={t} 
                  className={`time-pill ${timeControl === t ? 'active' : ''}`}
                  onClick={() => setTimeControl(t)}
                >
                  {t}m
                </button>
              ))}
            </div>
          </div>

          <button 
            className="btn btn-primary w-full btn-xl" 
            onClick={handleCreateRoom}
            disabled={loading}
          >
            <Plus size={22} /> Create New Room
          </button>
          
          <div className="separator text-muted text-center py-2">
            <span style={{ padding: '0 15px', background: 'var(--bg-soft)', position: 'relative', zIndex: 1 }}>OR</span>
            <hr style={{ marginTop: '-12px', borderColor: 'rgba(255,255,255,0.05)' }} />
          </div>
          
          <form onSubmit={handleJoinRoom} className="join-form">
            <div className="flex flex-col gap-3">
              <label className="text-xs text-muted uppercase block text-center">Join Existing Room</label>
              <div className="input-with-btn flex gap-2">
                <input 
                  type="text" 
                  className="input" 
                  placeholder="ROOM CODE"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center', fontWeight: '700' }}
                />
                <button type="submit" className="btn btn-outline" style={{ padding: '0 25px' }}>Join</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
