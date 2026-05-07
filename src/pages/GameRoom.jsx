import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useAuth } from '../hooks/useAuth';
import { useChessGame } from '../hooks/useChessGame';
import { 
  Copy, Flag, RotateCcw, Menu, X, Trophy
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase } from '../lib/supabase';

const GameRoom = () => {
  const { roomCode } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [emojiMessage, setEmojiMessage] = useState(null);
  const [moveFrom, setMoveFrom] = useState('');
  const [optionSquares, setOptionSquares] = useState({});

  const {
    game, room, loading, error, playerColor, 
    timers, isMyTurn, moveHistory, captured,
    makeMove, sendEmoji, resign, requestRematch, acceptRematch
  } = useChessGame(roomCode, profile);

  // Memoize chessboard props to prevent re-render cancellations
  const customDarkSquareStyle = useMemo(() => ({ backgroundColor: 'var(--board-dark)' }), []);
  const customLightSquareStyle = useMemo(() => ({ backgroundColor: 'var(--board-light)' }), []);

  function getMoveOptions(square, currentGame) {
    const chessInstance = currentGame || game;
    const moves = chessInstance.moves({ square, verbose: true });
    
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares = {};
    moves.forEach((move) => {
      newSquares[move.to] = {
        background:
          chessInstance.get(move.to) && chessInstance.get(move.to).color !== chessInstance.get(square).color
            ? 'radial-gradient(circle, rgba(168, 85, 247, .4) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(168, 85, 247, .4) 20%, transparent 20%)',
        borderRadius: '50%',
      };
    });
    newSquares[square] = { background: 'rgba(168, 85, 247, 0.4)' };
    setOptionSquares(newSquares);
    return true;
  }

  // Use a ref to bypass react-chessboard's stale closure bug
  // react-chessboard caches onPieceDrop and onSquareClick on mount, 
  // so they will forever see playerColor as null if we don't use a ref.
  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { moveFrom, playerColor, isMyTurn, game, makeMove };
  }, [moveFrom, playerColor, isMyTurn, game, makeMove]);

  // Debug logging
  useEffect(() => {
    console.log('GameRoom Stats:', { 
      playerColor, 
      isMyTurn, 
      turn: game.turn(), 
      roomStatus: room?.status,
      fen: game.fen().substring(0, 20) + '...'
    });
  }, [playerColor, isMyTurn, game, room?.status]);

  const handleSquareClick = useCallback((square) => {
    const state = stateRef.current;
    
    if (!state.moveFrom) {
      const piece = state.game.get(square);
      // Check if it's a piece of the player's color and it's their turn
      if (piece && piece.color === state.playerColor && state.isMyTurn) {
        setMoveFrom(square);
        getMoveOptions(square, state.game);
      }
      return;
    }

    try {
      const testGame = new Chess(state.game.fen());
      const moveResult = testGame.move({ from: state.moveFrom, to: square, promotion: 'q' });
      
      if (moveResult) {
        state.makeMove({ from: state.moveFrom, to: square, promotion: 'q' });
        setMoveFrom('');
        setOptionSquares({});
        return;
      }
    } catch (e) {
      console.warn('Move validation error:', e.message);
    }

    // If we click another piece of our color, select it instead
    const piece = state.game.get(square);
    if (piece && piece.color === state.playerColor && state.isMyTurn) {
      setMoveFrom(square);
      getMoveOptions(square, state.game);
    } else {
      setMoveFrom('');
      setOptionSquares({});
    }
  }, []); // Depend on nothing as we use stateRef for everything

  const handlePieceDrop = useCallback((sourceSquare, targetSquare) => {
    const state = stateRef.current;
    
    if (state.playerColor !== state.game.turn()) {
      return false;
    }

    try {
      const testGame = new Chess(state.game.fen());
      const result = testGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      
      if (result) {
        state.makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        setMoveFrom('');
        setOptionSquares({});
        return true;
      }
    } catch (e) {
      console.error('Drop move error:', e.message);
    }
    return false;
  }, []);

  // Emoji + rematch listeners
  useEffect(() => {
    const handleEmoji = (e) => {
      setEmojiMessage(e.detail);
      setTimeout(() => setEmojiMessage(null), 3000);
    };

    window.addEventListener('chess-emoji', handleEmoji);
    
    const channelId = `rematch:${roomCode}`;
    const channel = supabase.channel(channelId);
    
    channel
      .on('broadcast', { event: 'rematch_accepted' }, ({ payload }) => {
        navigate(`/game/${payload.newCode}`);
      })
      .subscribe();

    return () => {
      window.removeEventListener('chess-emoji', handleEmoji);
      supabase.removeChannel(channel);
    };
  }, [roomCode, navigate]);

  // Confetti on win
  useEffect(() => {
    if (room?.status === 'finished' && room.winner_id) {
      if (room.winner_id === profile?.id) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    }
  }, [room?.status, room?.winner_id, profile?.id]);

  // Loading state
  if (loading) return (
    <div className="game-container flex items-center justify-center">
      <div className="nm-card p-8 text-center animate-pulse">
        <h2 className="serif text-2xl mb-2">Sadhurangam</h2>
        <p className="text-muted">Setting up the board...</p>
      </div>
    </div>
  );

  // Error state
  if (error || !room) return (
    <div className="game-container flex items-center justify-center">
      <div className="nm-card p-8 text-center" style={{borderColor: 'var(--danger)'}}>
        <h2 className="serif text-2xl mb-2 text-danger">Match Not Found</h2>
        <p className="text-muted mb-4">{error || "This room doesn't exist or you don't have access."}</p>
        <button className="btn btn-primary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
    </div>
  );

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room code copied!');
  };

  return (
    <div className="game-container animate-fade">
      <div className="game-layout">
        {/* Main Board Area */}
        <div className="board-section">
          {/* Opponent Info */}
          <PlayerBar 
            player={playerColor === 'w' ? room?.black_player : room?.white_player}
            time={playerColor === 'w' ? (timers?.black ?? 600) : (timers?.white ?? 600)}
            isTurn={game && typeof game.turn === 'function' && game.turn() === (playerColor === 'w' ? 'b' : 'w')}
            captured={playerColor === 'w' ? (captured?.white ?? []) : (captured?.black ?? [])}
            color={playerColor === 'w' ? 'black' : 'white'}
          />

          <div className="chessboard-wrapper nm-card">
            {game && (
              <Chessboard 
                id="main-board"
                position={game.fen()} 
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                boardOrientation={playerColor === 'b' ? 'black' : 'white'}
                arePiecesDraggable={true}
                customDarkSquareStyle={customDarkSquareStyle}
                customLightSquareStyle={customLightSquareStyle}
                customSquareStyles={optionSquares}
                animationDuration={200}
              />
            )}
          </div>

          {/* Player Info */}
          <PlayerBar 
            player={profile}
            time={playerColor === 'w' ? (timers?.white ?? 600) : (timers?.black ?? 600)}
            isTurn={isMyTurn}
            captured={playerColor === 'w' ? (captured?.black ?? []) : (captured?.white ?? [])}
            color={playerColor === 'w' ? 'white' : 'black'}
            isSelf={true}
          />
        </div>

        {/* Sidebar Info */}
        <div className={`game-sidebar nm-card ${showMobileSidebar ? 'mobile-open' : ''}`}>
          <div className="sidebar-header">
            <h3>Match Info</h3>
            <button className="mobile-toggle hide-desktop" onClick={() => setShowMobileSidebar(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="room-info nm-inset">
            <div className="flex justify-between items-center" style={{padding: '12px 16px'}}>
              <div>
                <span className="text-muted text-xs block">Room Code</span>
                <span className="font-bold text-lg">{roomCode}</span>
              </div>
              <button onClick={copyRoomCode} className="btn-icon" style={{boxShadow: 'none'}}>
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div className="game-stats">
            <div className="history-panel">
              <h4 className="text-sm uppercase text-muted mb-2">Move History</h4>
              <div className="moves-list nm-inset">
                {moveHistory.map((move, i) => (
                  <div key={i} className={`move-item ${i % 2 === 0 ? 'move-white' : 'move-black'}`}>
                    <span className="move-num">{Math.floor(i / 2) + 1}.</span>
                    <span className="move-san">{move.san}</span>
                  </div>
                ))}
                {moveHistory.length === 0 && <div className="text-muted text-center p-4">Game started</div>}
              </div>
            </div>
          </div>

          <div className="game-controls">
            <div className="emoji-row flex justify-between mb-4">
              {['👏', '😮', '🤔', '🔥', 'GG'].map(e => (
                <button key={e} onClick={() => sendEmoji(e)} className="btn-emoji">{e}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline flex-1" onClick={resign}>
                <Flag size={16} /> Resign
              </button>
              <button className="btn btn-outline flex-1">
                <RotateCcw size={16} /> Draw
              </button>
            </div>
          </div>
        </div>

        <button className="mobile-fab hide-desktop" onClick={() => setShowMobileSidebar(true)}>
          <Menu size={24} />
        </button>
      </div>

      {room?.status === 'finished' && (
        <div className="game-overlay nm-card" style={{borderRadius: 0}}>
          <div className="result-card text-center nm-card">
            <Trophy size={64} className="text-accent mb-4 mx-auto" />
            <h2 className="serif text-3xl mb-2">Game Over</h2>
            <p className="text-xl mb-6">
              {room.winner_id === profile.id ? 'You Won!' : 'Opponent Won'}
            </p>
            <div className="flex gap-4 justify-center">
              {room.rematch_offered_by && room.rematch_offered_by !== profile.id ? (
                <button className="btn btn-primary btn-lg" onClick={acceptRematch}>
                  Accept Rematch
                </button>
              ) : (
                <button 
                  className="btn btn-primary btn-lg" 
                  onClick={requestRematch}
                  disabled={room.rematch_offered_by === profile.id}
                >
                  {room.rematch_offered_by === profile.id ? 'Rematch Offered' : 'Rematch'}
                </button>
              )}
              <button className="btn btn-outline btn-lg" onClick={() => navigate('/lobby')}>
                Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {emojiMessage && (
        <div className="emoji-popup animate-fade">
          <span className="emoji-large">{emojiMessage.emoji}</span>
        </div>
      )}
    </div>
  );
};

const PlayerBar = ({ player, time, isTurn, captured, color, isSelf }) => {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = time < 120;

  return (
    <div className={`player-bar nm-flat ${isTurn ? 'active-turn' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="player-avatar nm-inset">{player?.avatar_initials || '??'}</div>
        <div className="player-info">
          <div className="flex items-center gap-2">
            <span className="player-name">{player?.display_name || 'Searching...'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${color === 'white' ? 'bg-white text-black border-gray-300' : 'bg-black text-white border-gray-700'}`}>
              {color.toUpperCase()}
            </span>
            {isSelf && <span className="text-[10px] text-primary">(You)</span>}
          </div>
          <div className="captured-row">
            {captured?.map((p, i) => (
              <span key={i} className="captured-piece">{getPieceIcon(p, color === 'white' ? 'b' : 'w')}</span>
            ))}
          </div>
        </div>
      </div>
      
      <div className={`timer nm-inset ${isLowTime ? 'timer-low' : ''} ${isTurn ? 'timer-active' : ''}`}>
        {formatTime(time)}
      </div>
    </div>
  );
};

const getPieceIcon = (type, color) => {
  console.log('Rendering piece icon for:', color);
  const icons = {
    p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚'
  };
  return icons[type] || '';
};

export default GameRoom;
