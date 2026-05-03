import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { useAuth } from '../hooks/useAuth';
import { useChessGame } from '../hooks/useChessGame';
import { 
  Copy, Share2, Flag, RotateCcw, MessageCircle, 
  ChevronLeft, ChevronRight, Menu, X, Trophy
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
  const [rightClickedSquares, setRightClickedSquares] = useState({});
  const [optionSquares, setOptionSquares] = useState({});

  const {
    game, room, loading, error, playerColor, 
    timers, isMyTurn, moveHistory, captured,
    makeMove, sendEmoji, resign, requestRematch, acceptRematch
  } = useChessGame(roomCode, profile);

  useEffect(() => {
    console.log('GameRoom State Update:', { playerColor, isMyTurn, turn: game.turn(), status: room?.status });
  }, [playerColor, isMyTurn, game.fen(), room?.status]);

  useEffect(() => {
    const handleEmoji = (e) => {
      setEmojiMessage(e.detail);
      setTimeout(() => setEmojiMessage(null), 3000);
    };

    const handleRematchAccepted = (e) => {
      navigate(`/game/${e.detail.newCode}`);
    };

    window.addEventListener('chess-emoji', handleEmoji);
    
    // Subscribe to rematch broadcast
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
  }, [roomCode]);

  useEffect(() => {
    if (room?.status === 'finished' && room.winner_id) {
      if (room.winner_id === profile.id) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }
  }, [room?.status]);

  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { moveFrom, playerColor, isMyTurn, game, room, makeMove };
  }, [moveFrom, playerColor, isMyTurn, game, room, makeMove]);

  if (loading) return (
    <div className="game-container flex items-center justify-center">
      <div className="nm-card p-8 text-center animate-pulse">
        <h2 className="serif text-2xl mb-2">Sadhurangam</h2>
        <p className="text-muted">Setting up the board...</p>
      </div>
    </div>
  );

  if (error || !room) return (
    <div className="game-container flex items-center justify-center">
      <div className="nm-card p-8 text-center" style={{borderColor: 'var(--danger)'}}>
        <h2 className="serif text-2xl mb-2 text-danger">Match Not Found</h2>
        <p className="text-muted mb-4">{error || "This room doesn't exist or you don't have access."}</p>
        <button className="btn btn-primary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
    </div>
  );

  function getMoveOptions(square) {
    const { game } = stateRef.current;
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to) && game.get(move.to).color !== game.get(square).color
            ? 'radial-gradient(circle, rgba(168, 85, 247, .4) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(168, 85, 247, .4) 20%, transparent 20%)',
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = {
      background: 'rgba(168, 85, 247, 0.4)',
    };
    setOptionSquares(newSquares);
    return true;
  }

  async function onSquareClick(square) {
    const { moveFrom, playerColor, isMyTurn, game, makeMove } = stateRef.current;
    setRightClickedSquares({});

    // from square
    if (!moveFrom) {
      const piece = game.get(square);
      if (piece && piece.color === playerColor && isMyTurn) {
        setMoveFrom(square);
        getMoveOptions(square);
      }
      return;
    }

    // Try to move
    const gameCopy = new Chess(game.fen());
    let isValidMove = false;
    try {
      const move = gameCopy.move({
        from: moveFrom,
        to: square,
        promotion: 'q',
      });
      if (move) isValidMove = true;
    } catch (e) {
      isValidMove = false;
    }

    if (isValidMove) {
      await makeMove({
        from: moveFrom,
        to: square,
        promotion: 'q',
      });
      setMoveFrom('');
      setOptionSquares({});
    } else {
      const piece = game.get(square);
      if (piece && piece.color === playerColor && isMyTurn) {
        setMoveFrom(square);
        getMoveOptions(square);
      } else {
        setMoveFrom('');
        setOptionSquares({});
      }
    }
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    const { playerColor, game, makeMove } = stateRef.current;
    if (playerColor !== game.turn()) return false;
    
    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
      if (move) {
        makeMove({
          from: sourceSquare,
          to: targetSquare,
          promotion: 'q',
        });
        setMoveFrom('');
        setOptionSquares({});
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room code copied!');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardOrientation={playerColor === 'b' ? 'black' : 'white'}
                arePiecesDraggable={true}
                customDarkSquareStyle={{ backgroundColor: 'var(--board-dark)' }}
                customLightSquareStyle={{ backgroundColor: 'var(--board-light)' }}
                customSquareStyles={{
                  ...optionSquares,
                  ...rightClickedSquares,
                }}
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
  const icons = {
    p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚'
  };
  return icons[type] || '';
};

export default GameRoom;
