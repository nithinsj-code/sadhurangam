import { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { supabase } from '../lib/supabase';

export const useChessGame = (roomCode, userProfile, user) => {
  const [game, setGame] = useState(new Chess());
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [timers, setTimers] = useState({ white: 600, black: 600 });
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [captured, setCaptured] = useState({ white: [], black: [] });
  
  const timerRef = useRef(null);

  const channelRef = useRef(null);

  const updateCaptured = useCallback((chess) => {
    const starting = { p: 8, r: 2, n: 2, b: 2, q: 1 };
    const current = {
      w: { p: 0, r: 0, n: 0, b: 0, q: 0 },
      b: { p: 0, r: 0, n: 0, b: 0, q: 0 }
    };
    
    chess.board().forEach(row => {
      row.forEach(square => {
        if (square && square.type !== 'k') current[square.color][square.type]++;
      });
    });

    const capturedW = [];
    const capturedB = [];

    ['p', 'r', 'n', 'b', 'q'].forEach(type => {
      for (let i = 0; i < starting[type] - current.w[type]; i++) capturedW.push(type);
      for (let i = 0; i < starting[type] - current.b[type]; i++) capturedB.push(type);
    });

    setCaptured({ white: capturedW, black: capturedB });
  }, []);

  const fetchRoom = useCallback(async () => {
    try {
      setLoading(true);
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select(`
          *,
          white_player:white_player_id(*),
          black_player:black_player_id(*)
        `)
        .eq('code', roomCode)
        .maybeSingle();

      if (roomError) throw roomError;
      if (!roomData) {
        setError('Room not found');
        setLoading(false);
        return;
      }
      
      setRoom(roomData);
      
      // Fetch Move History
      const { data: movesData } = await supabase
        .from('moves')
        .select('*')
        .eq('room_id', roomData.id)
        .order('created_at', { ascending: true });

      const initialGame = new Chess();
      if (movesData && movesData.length > 0) {
        movesData.forEach(m => {
          try {
            initialGame.move(m.move_san);
          } catch (e) {
            console.error('Error replaying move:', m.move_san, e);
          }
        });
        setMoveHistory(initialGame.history({ verbose: true }));
      } else if (roomData.fen) {
        try {
          initialGame.load(roomData.fen);
        } catch (e) {
          console.error('Invalid FEN:', roomData.fen);
        }
      }

      setGame(initialGame);
      setTimers({ 
        white: roomData.white_time_remaining ?? 600, 
        black: roomData.black_time_remaining ?? 600 
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Fetch room error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [roomCode]);

  const handleTimeout = useCallback(async (color) => {
    if (room?.status !== 'active') return;
    
    const winnerId = color === 'white' ? room.black_player_id : room.white_player_id;
    
    await supabase
      .from('rooms')
      .update({
        status: 'finished',
        winner_id: winnerId
      })
      .eq('id', room.id);
  }, [room]);

  // Initial fetch
  useEffect(() => {
    if (roomCode) fetchRoom();
  }, [roomCode, fetchRoom]);

  // Handle Realtime (Moves, Emojis, Room Updates)
  useEffect(() => {
    if (!roomCode) return;

    const channelId = `room:${roomCode}`;
    const channel = supabase.channel(channelId);
    channelRef.current = channel;
    
    console.log('Subscribing to channel:', channelId);

    channel
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'rooms', 
        filter: `code=eq.${roomCode}` 
      }, (payload) => {
        const newRoom = payload.new;
        if (!newRoom) return;
        
        console.log('Realtime Update Received:', newRoom.status);
        
        setRoom(prev => {
          // If a player joined (ID changed from null to value), we need to re-fetch to get profile details
          const whiteJoined = !prev?.white_player_id && newRoom.white_player_id;
          const blackJoined = !prev?.black_player_id && newRoom.black_player_id;
          
          if (whiteJoined || blackJoined) {
            console.log('Player joined! Refreshing room details...');
            fetchRoom();
          }
          
          return prev ? { ...prev, ...newRoom } : newRoom;
        });
        
        if (newRoom.fen) {
          setGame(prevGame => {
            try {
              if (!prevGame || typeof prevGame.fen !== 'function' || newRoom.fen !== prevGame.fen()) {
                console.log('Syncing FEN from DB:', newRoom.fen);
                // If the FEN changed, it means we missed a move or it's a sync.
                // We should NOT overwrite moveHistory here unless we have the full history.
                // For now, we just update the game state. 
                // To keep history synced, we'd ideally fetch moves again, but let's try to be less destructive.
                const gameCopy = new Chess(newRoom.fen);
                return gameCopy;
              }
            } catch (err) {
              console.error('Failed to sync FEN from DB:', err, newRoom.fen);
            }
            return prevGame;
          });
        }

        setTimers({ 
          white: newRoom.white_time_remaining ?? 600, 
          black: newRoom.black_time_remaining ?? 600 
        });
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        console.log('Broadcast Move Received:', payload);
        const { move, senderId } = payload;
        const myId = userProfile?.id || user?.id;
        if (senderId === myId) return;

        setGame(prevGame => {
          const gameCopy = new Chess(prevGame.fen());
          const result = gameCopy.move(move);
          if (result) {
            console.log('Applied broadcast move');
            // Append to history if it's not already the last move
            setMoveHistory(prev => {
              const lastMove = prev[prev.length - 1];
              if (lastMove && lastMove.after === gameCopy.fen()) return prev;
              return [...prev, result];
            });
            return gameCopy;
          }
          return prevGame;
        });
      })
      .on('broadcast', { event: 'emoji' }, ({ payload }) => {
        window.dispatchEvent(new CustomEvent('chess-emoji', { detail: payload }));
      })
      .on('broadcast', { event: 'rematch_accepted' }, ({ payload }) => {
        window.dispatchEvent(new CustomEvent('chess-rematch', { detail: payload }));
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'moves'
      }, (payload) => {
        const newMove = payload.new;
        // Filter by room_id in JS because room.id might not be available at subscription time
        // and using a Ref for room is more complex here.
        setRoom(currentRoom => {
          if (currentRoom && newMove.room_id === currentRoom.id) {
            setMoveHistory(prev => {
              // Avoid duplicates
              if (prev.find(m => m.after === newMove.fen_after)) return prev;
              
              // We need the verbose move object. 
              // Since we only have SAN from the DB, we can derive it or just store SAN.
              // But GameRoom expects the verbose object.
              // Let's create a partial verbose object that matches what the UI needs.
              const partialMove = {
                san: newMove.move_san,
                after: newMove.fen_after,
                color: prev.length % 2 === 0 ? 'w' : 'b'
              };
              return [...prev, partialMove];
            });
          }
          return currentRoom;
        });
      })
      .subscribe((status) => {
        console.log('Supabase Subscription Status:', status);
      });

    return () => {
      console.log('Unsubscribing from channel:', channelId);
      supabase.removeChannel(channel);
    };
  }, [roomCode, userProfile?.id, user?.id]);

  // Timers
  useEffect(() => {
    if (room?.status !== 'active') return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimers(prev => {
        const activeColor = game.turn() === 'w' ? 'white' : 'black';
        const newVal = Math.max(0, prev[activeColor] - 1);
        if (newVal === 0) {
          handleTimeout(activeColor);
        }
        return { ...prev, [activeColor]: newVal };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [room?.status, game, handleTimeout]);

  // Player Color & Turn logic
  useEffect(() => {
    // We need either a profile or a user to identify the player
    const effectiveUser = userProfile || user;
    
    if (!room) {
      console.log('Player assignment delayed: room missing');
      return;
    }

    // If we don't have an identity yet, default to white if we created the room
    // This allows dots to show immediately
    if (!effectiveUser) {
      console.log('No user identity yet, defaulting to white');
      setPlayerColor('w');
      setIsMyTurn(game.turn() === 'w');
      return;
    }
    
    let myColor = null;
    const myId = effectiveUser.id;

    console.log('Identity Debug:', {
      myId,
      roomWhiteId: room.white_player_id,
      roomBlackId: room.black_player_id
    });

    if (room.white_player_id === myId) {
      myColor = 'w';
    } else if (room.black_player_id === myId) {
      myColor = 'b';
    }
    
    setPlayerColor(myColor);
    const turn = game.turn();
    setIsMyTurn(myColor !== null ? myColor === turn : false);
    
    // updateCaptured(game);
  }, [room, game, userProfile?.id, user?.id, updateCaptured]);

  const makeMove = useCallback(async (move) => {
    if (room?.status === 'finished') return false;
    
    const turn = game.turn();
    // Compute effective color at call time to handle cases where state hasn't updated yet
    const effectiveUser = userProfile || user;
    const myId = effectiveUser?.id;
    const effectiveColor = playerColor || (
      myId && room?.white_player_id === myId ? 'w' :
      myId && room?.black_player_id === myId ? 'b' :
      null
    );

    if (effectiveColor !== null && effectiveColor !== turn) {
      console.log('Not your turn!', { effectiveColor, turn });
      return false;
    }

    try {
      const gameCopy = new Chess(game.fen());
      const result = gameCopy.move(move);
      
      if (result) {
        // 1. Update local state immediately for responsiveness
        setGame(gameCopy);
        setMoveHistory(prev => {
          const lastMove = prev[prev.length - 1];
          if (lastMove && lastMove.after === gameCopy.fen()) return prev;
          return [...prev, result];
        });
        updateCaptured(gameCopy);
        
        // 2. Broadcast the move immediately
        if (channelRef.current) {
          console.log('Broadcasting move:', move);
          channelRef.current.send({
            type: 'broadcast',
            event: 'move',
            payload: { move, senderId: myId }
          });
        }

        // 3. Update Supabase Database (only if room is active or has 2 players)
        const isGameOver = gameCopy.isGameOver();
        let status = room.status;
        let winnerId = null;

        if (isGameOver) {
          status = 'finished';
          if (gameCopy.isCheckmate()) {
            winnerId = gameCopy.turn() === 'w' ? room.black_player_id : room.white_player_id;
          }
        }
        // Don't auto-change 'waiting' to 'active' here — that should happen via join

        const { error: updateError } = await supabase
          .from('rooms')
          .update({
            fen: gameCopy.fen(),
            turn: gameCopy.turn() === 'w' ? 'white' : 'black',
            white_time_remaining: timers.white,
            black_time_remaining: timers.black,
            status,
            winner_id: winnerId
          })
          .eq('id', room.id);

        if (updateError) {
          console.warn('DB Update failed (may be RLS if waiting room):', updateError.message);
        }

        // 4. Record move in history table (only for active rooms with 2 players)
        if (room.status === 'active' && room.black_player_id) {
          const { error: moveError } = await supabase.from('moves').insert([{
            room_id: room.id,
            player_id: myId,
            move_san: result.san,
            fen_after: gameCopy.fen()
          }]);
          if (moveError) {
            console.warn('Move insert failed:', moveError.message);
          }
        }

        return true;
      }
    } catch (err) {
      console.error('Move error:', err);
    }
    return false;
  }, [room, game, playerColor, userProfile, user, timers]);

  const sendEmoji = (emoji) => {
    supabase.channel(`room:${roomCode}`).send({
      type: 'broadcast',
      event: 'emoji',
      payload: { emoji, senderId: userProfile?.id || user?.id }
    });
  };

  const resign = async () => {
    if (!room) return;
    const myId = userProfile?.id || user?.id;
    const winnerId = room.white_player_id === myId ? room.black_player_id : room.white_player_id;
    
    await supabase
      .from('rooms')
      .update({ status: 'finished', winner_id: winnerId })
      .eq('id', room.id);
  };

  const offerDraw = async () => {
    if (!room) return;
    const myId = userProfile?.id || user?.id;
    
    await supabase
      .from('rooms')
      .update({ draw_offered_by: myId })
      .eq('id', room.id);
  };

  const acceptDraw = async () => {
    if (!room) return;
    await supabase
      .from('rooms')
      .update({ status: 'finished', winner_id: null, draw_offered_by: null })
      .eq('id', room.id);
  };

  const declineDraw = async () => {
    if (!room) return;
    await supabase
      .from('rooms')
      .update({ draw_offered_by: null })
      .eq('id', room.id);
  };

  const requestRematch = async () => {
    await supabase
      .from('rooms')
      .update({ rematch_offered_by: userProfile?.id || user?.id })
      .eq('id', room.id);
  };

  const acceptRematch = async () => {
    // Create new room with same players but swapped colors
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timeControl = room.time_control_minutes || 10;
    
    const { data: newRoom } = await supabase
      .from('rooms')
      .insert([{ 
        code, 
        white_player_id: room.black_player_id, 
        black_player_id: room.white_player_id,
        status: 'active',
        time_control_minutes: timeControl,
        white_time_remaining: timeControl * 60,
        black_time_remaining: timeControl * 60
      }])
      .select()
      .single();

    if (newRoom) {
      // Broadcast new room code via the existing channel
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'rematch_accepted',
          payload: { newCode: code }
        });
      }
      
      // Also navigate the person who clicked accept!
      window.dispatchEvent(new CustomEvent('chess-rematch', { detail: { newCode: code } }));
    }
  };

  return {
    game,
    room,
    loading,
    error,
    playerColor,
    timers,
    isMyTurn,
    moveHistory,
    captured,
    makeMove,
    sendEmoji,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    requestRematch,
    acceptRematch
  };
};
