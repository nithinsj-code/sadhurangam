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
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          white_player:white_player_id(*),
          black_player:black_player_id(*)
        `)
        .eq('code', roomCode)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setError('Room not found');
        setLoading(false);
        return;
      }
      
      setRoom(data);
      let initialGame;
      try {
        initialGame = new Chess(data.fen || undefined);
      } catch (e) {
        console.error('Invalid FEN in room:', data.fen);
        initialGame = new Chess();
      }
      setGame(initialGame);
      setTimers({ 
        white: data.white_time_remaining ?? 600, 
        black: data.black_time_remaining ?? 600 
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
        
        // Merge the new data safely
        setRoom(prev => prev ? { ...prev, ...newRoom } : newRoom);
        
        if (newRoom.fen) {
          setGame(prevGame => {
            try {
              if (!prevGame || typeof prevGame.fen !== 'function' || newRoom.fen !== prevGame.fen()) {
                console.log('Syncing FEN from DB:', newRoom.fen);
                return new Chess(newRoom.fen);
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
            return gameCopy;
          }
          return prevGame;
        });
      })
      .on('broadcast', { event: 'emoji' }, ({ payload }) => {
        window.dispatchEvent(new CustomEvent('chess-emoji', { detail: payload }));
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
    // isMyTurn: true if our color matches the game turn
    // In a waiting room with 1 player, we allow local play (isMyTurn mirrors game turn for our color)
    setIsMyTurn(myColor !== null ? myColor === turn : false);
    
    setMoveHistory(game.history({ verbose: true }));
    updateCaptured(game);
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
    const winnerId = playerColor === 'w' ? room.black_player_id : room.white_player_id;
    await supabase
      .from('rooms')
      .update({ status: 'finished', winner_id: winnerId })
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
      // Broadcast new room code or navigate both?
      // For simplicity, we just broadcast the code via the old room channel
      supabase.channel(`room:${roomCode}`).send({
        type: 'broadcast',
        event: 'rematch_accepted',
        payload: { newCode: code }
      });
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
    requestRematch,
    acceptRematch
  };
};
