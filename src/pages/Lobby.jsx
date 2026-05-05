import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Users, Swords, UserPlus, Check, X } from 'lucide-react';

const Lobby = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const fetchFriends = useCallback(async () => {
    const { data } = await supabase
      .from('friendships')
      .select(`
        *,
        sender:users!friendships_sender_id_fkey(*),
        receiver:users!friendships_receiver_id_fkey(*)
      `)
      .or(`sender_id.eq.${profile?.id},receiver_id.eq.${profile?.id}`)
      .eq('status', 'accepted');
    
    if (data) {
      const friendList = data.map(f => f.sender_id === profile.id ? f.receiver : f.sender);
      setFriends(friendList);
    }
  }, [profile]);

  const fetchChallenges = useCallback(async () => {
    const { data } = await supabase
      .from('challenges')
      .select('*, challenger:users!challenges_challenger_id_fkey(*)')
      .eq('opponent_id', profile?.id)
      .eq('status', 'pending');
    
    if (data) setChallenges(data);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    fetchFriends();
    fetchChallenges();
    
    // Subscribe to changes
    const challengesSub = supabase
      .channel('public:challenges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, () => {
        fetchChallenges();
      })
      .subscribe();

    const friendsSub = supabase
      .channel('public:friendships')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        fetchFriends();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(challengesSub);
      supabase.removeChannel(friendsSub);
    };
  }, [profile, fetchFriends, fetchChallenges]);

  const [timeControl, setTimeControl] = useState(10);

  const handleCreateRoom = async () => {
    setLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { data, error } = await supabase
      .from('rooms')
      .insert([{ 
        code, 
        white_player_id: profile.id, 
        status: 'waiting',
        time_control_minutes: timeControl,
        white_time_remaining: timeControl * 60,
        black_time_remaining: timeControl * 60
      }])
      .select()
      .single();

    if (error) {
      console.error('Room creation error:', error);
      alert('Failed to create room: ' + error.message);
    } else if (data) {
      navigate(`/game/${code}`);
    }
    setLoading(false);
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode) return;
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode.toUpperCase())
      .single();

    if (data) {
      if (data.status === 'waiting' && data.white_player_id !== profile.id) {
        await supabase
          .from('rooms')
          .update({ black_player_id: profile.id, status: 'active' })
          .eq('id', data.id);
      }
      navigate(`/game/${data.code}`);
    } else {
      alert('Room not found');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    const { data } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${searchQuery}%`)
      .neq('id', profile.id)
      .limit(5);
    
    setSearchResults(data || []);
  };

  const sendFriendRequest = async (friendId) => {
    await supabase.from('friendships').insert([
      { sender_id: profile.id, receiver_id: friendId, status: 'pending' }
    ]);
    alert('Friend request sent!');
  };

  const acceptChallenge = async (challenge) => {
    // Create room if not exists
    let code = '';
    if (!challenge.room_id) {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: room, error } = await supabase
        .from('rooms')
        .insert([{ 
          code, 
          white_player_id: challenge.challenger_id, 
          black_player_id: profile.id,
          time_control_minutes: challenge.time_control,
          status: 'active' 
        }])
        .select()
        .single();
      
      await supabase
        .from('challenges')
        .update({ status: 'accepted', room_id: room.id })
        .eq('id', challenge.id);
    } else {
      // Get room code
      const { data: room } = await supabase.from('rooms').select('code').eq('id', challenge.room_id).single();
      code = room.code;
      await supabase.from('challenges').update({ status: 'accepted' }).eq('id', challenge.id);
    }
    
    navigate(`/game/${code}`);
  };

  return (
    <div className="lobby-container container animate-fade">
      <div className="lobby-grid">
        {/* Left Column: Quick Actions */}
        <div className="lobby-sidebar">
          <div className="lobby-card nm-card">
            <h3>Quick Play</h3>
            <div className="actions flex-col gap-4 mt-4">
              <div className="time-picker">
                <label className="text-xs text-muted uppercase mb-2 block">Time Control (minutes)</label>
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
                className="btn btn-primary w-full" 
                onClick={handleCreateRoom}
                disabled={loading}
              >
                <Plus size={20} /> Create Room
              </button>
              
              <div className="separator text-muted">OR</div>
              
              <form onSubmit={handleJoinRoom} className="join-form">
                <div className="input-with-btn">
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Enter Room Code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                  />
                  <button type="submit" className="btn btn-outline" style={{padding: '10px 15px'}}>Join</button>
                </div>
              </form>
            </div>
          </div>

          <div className="lobby-card nm-card mt-4">
            <h3>Pending Challenges</h3>
            <div className="challenge-list mt-4">
              {challenges.length === 0 ? (
                <p className="text-muted text-sm">No incoming challenges</p>
              ) : (
                challenges.map(c => (
                  <div key={c.id} className="challenge-item nm-flat">
                    <div className="flex items-center gap-2">
                      <Swords size={16} className="text-primary" />
                      <span>{c.challenger.display_name}</span>
                      <span className="text-xs text-muted">({c.time_control}m)</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-icon btn-success" onClick={() => acceptChallenge(c)}>
                        <Check size={16} />
                      </button>
                      <button className="btn-icon btn-danger">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Friends & Social */}
        <div className="lobby-main">
          <div className="lobby-card nm-card h-full">
            <div className="flex justify-between items-center mb-6">
              <h3><Users size={20} className="inline mr-2" /> Friends</h3>
              <div className="search-bar">
                <input 
                  type="text" 
                  className="input input-sm" 
                  placeholder="Search users..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && handleSearch()}
                  style={{padding: '10px 15px'}}
                />
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="search-results mb-6 nm-inset p-4">
                <h4 className="text-xs uppercase text-muted mb-2">Search Results</h4>
                {searchResults.map(u => (
                  <div key={u.id} className="friend-item">
                    <span>{u.display_name} (@{u.username})</span>
                    <button className="btn btn-ghost btn-sm" style={{boxShadow: 'none'}} onClick={() => sendFriendRequest(u.id)}>
                      <UserPlus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="friends-list">
              {friends.length === 0 ? (
                <div className="empty-state text-muted">
                  <p>You haven't added any friends yet.</p>
                </div>
              ) : (
                friends.map(f => (
                  <div key={f.id} className="friend-item nm-flat">
                    <div className="flex items-center gap-3">
                      <div className="status-indicator online"></div>
                      <div>
                        <div className="font-semibold">{f.display_name}</div>
                        <div className="text-xs text-muted">@{f.username}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-outline btn-sm">Challenge</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Lobby;
