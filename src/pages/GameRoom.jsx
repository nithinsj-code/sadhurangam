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
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [emojiMessage, setEmojiMessage] = useState(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const {
    game, room, loading, error, playerColor, 
    timers, isMyTurn, moveHistory, captured,
    makeMove, sendEmoji, resign, offerDraw, acceptDraw, declineDraw, requestRematch, acceptRematch
  } = useChessGame(roomCode, profile, user);

  // Compute effective player color — fallback to game turn color if hook hasn't resolved yet
  // This ensures pieces are always clickable for the right side
  const myId = profile?.id || user?.id;
  const effectivePlayerColor = playerColor || (
    room?.white_player_id === myId ? 'w' :
    room?.black_player_id === myId ? 'b' :
    null
  );

  // Memoize chessboard props to prevent re-render cancellations
  const customDarkSquareStyle = useMemo(() => ({ backgroundColor: 'var(--board-dark)' }), []);
  const customLightSquareStyle = useMemo(() => ({ backgroundColor: 'var(--board-light)' }), []);

  const findKingSquare = useCallback((chess, color) => {
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const square = board[r][c];
        if (square && square.type === 'k' && square.color === color) {
          return String.fromCharCode(97 + c) + (8 - r);
        }
      }
    }
    return null;
  }, []);

  const boardStyles = useMemo(() => {
    const styles = { ...optionSquares };
    
    if (game.inCheck()) {
      const kingSquare = findKingSquare(game, game.turn());
      if (kingSquare) {
        styles[kingSquare] = {
          ...styles[kingSquare],
          background: 'radial-gradient(circle, rgba(239, 68, 68, .5) 85%, transparent 85%)',
          borderRadius: '50%',
          boxShadow: 'inset 0 0 0 4px rgba(239, 68, 68, 0.8)'
        };
      }
    }
    
    return styles;
  }, [optionSquares, game, findKingSquare]);

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
    stateRef.current = { moveFrom, playerColor: effectivePlayerColor, isMyTurn, game, makeMove, isWaiting: room?.status !== 'active' };
  }, [moveFrom, effectivePlayerColor, isMyTurn, game, makeMove, room?.status]);

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
    // Lock ALL interaction until a second player has joined
    if (state.isWaiting) return;

    const currentGame = state.game;
    const myColor = state.playerColor;
    
    // --- PHASE 1: No piece selected yet ---
    if (!state.moveFrom) {
      const piece = currentGame.get(square);
      if (piece && piece.color === currentGame.turn()) {
        if (!myColor || piece.color === myColor) {
          setMoveFrom(square);
          getMoveOptions(square, currentGame);
        }
      }
      return;
    }

    // --- PHASE 2: A piece is already selected — try to move ---
    try {
      const testGame = new Chess(currentGame.fen());
      const moveResult = testGame.move({ from: state.moveFrom, to: square, promotion: 'q' });
      if (moveResult) {
        // Check if it's actually a promotion move
        const moves = currentGame.moves({ square: state.moveFrom, verbose: true });
        const isPromotion = moves.some(m => m.to === square && m.promotion);

        if (isPromotion) {
          setPendingPromotion({ from: state.moveFrom, to: square });
        } else {
          if (state.isMyTurn) {
            state.makeMove({ from: state.moveFrom, to: square, promotion: 'q' });
          }
        }
        setMoveFrom('');
        setOptionSquares({});
        return;
      }
    } catch (e) {
      console.warn('Move validation error:', e.message);
    }

    // --- PHASE 3: Re-select another own piece ---
    const piece = currentGame.get(square);
    if (piece && piece.color === currentGame.turn() && (!myColor || piece.color === myColor)) {
      setMoveFrom(square);
      getMoveOptions(square, currentGame);
    } else {
      setMoveFrom('');
      setOptionSquares({});
    }
  }, []);

  const handlePieceClick = useCallback((piece, square) => {
    const state = stateRef.current;
    if (state.isWaiting) return; // locked until opponent joins

    const currentGame = state.game;
    const myColor = state.playerColor;
    const pieceColor = piece[0] === 'w' ? 'w' : 'b';

    if (myColor && pieceColor !== myColor) return;
    if (pieceColor !== currentGame.turn()) return;

    setMoveFrom(square);
    getMoveOptions(square, currentGame);
  }, []);

  const handlePieceDrop = useCallback((sourceSquare, targetSquare) => {
    const state = stateRef.current;
    if (state.isWaiting) return false; // locked until opponent joins

    const myColor = state.playerColor;
    if (myColor && myColor !== state.game.turn()) return false;
    if (!state.isMyTurn) return false;

    try {
      const testGame = new Chess(state.game.fen());
      const result = testGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (result) {
        const moves = state.game.moves({ square: sourceSquare, verbose: true });
        const isPromotion = moves.some(m => m.to === targetSquare && m.promotion);

        if (isPromotion) {
          setPendingPromotion({ from: sourceSquare, to: targetSquare });
        } else {
          state.makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        }
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

    const handleRematch = (e) => {
      navigate(`/game/${e.detail.newCode}`);
    };
    
    window.addEventListener('chess-emoji', handleEmoji);
    window.addEventListener('chess-rematch', handleRematch);

    return () => {
      window.removeEventListener('chess-emoji', handleEmoji);
      window.removeEventListener('chess-rematch', handleRematch);
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
        <p className="text-muted mb-4">Setting up the board...</p>
        <div className="flex flex-col gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Retry Load</button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/lobby')}>Back to Lobby</button>
        </div>
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

  const confirmPromotion = (pieceType) => {
    if (pendingPromotion) {
      makeMove({ ...pendingPromotion, promotion: pieceType });
      setPendingPromotion(null);
    }
  };

  return (

    <div className="game-container animate-fade">
      <div className="game-layout">
        {/* Main Board Area */}
        <div className="board-section">
          {/* Opponent Info */}
          <PlayerBar 
            player={effectivePlayerColor === 'w' ? room?.black_player : room?.white_player}
            time={effectivePlayerColor === 'w' ? (timers?.black ?? 600) : (timers?.white ?? 600)}
            isTurn={game && typeof game.turn === 'function' && game.turn() === (effectivePlayerColor === 'w' ? 'b' : 'w')}
            captured={effectivePlayerColor === 'w' ? (captured?.white ?? []) : (captured?.black ?? [])}
            color={effectivePlayerColor === 'w' ? 'black' : 'white'}
          />

          <div className="chessboard-wrapper nm-card" style={{position: 'relative'}}>
            {/* Waiting overlay — blocks board until opponent joins */}
            {room?.status === 'waiting' && (
              <div className="waiting-banner">
                <div className="waiting-pulse" />
                <h3>Waiting for Opponent</h3>
                <p>Share this room code with a friend to start the game</p>
                <div className="room-code-badge">
                  {roomCode}
                  <button 
                    onClick={copyRoomCode} 
                    style={{background:'none',border:'none',cursor:'pointer',color:'inherit',padding:0,display:'flex'}}
                    title="Copy room code"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <p style={{fontSize:'12px',marginTop:4}}>Moves are locked until the match begins</p>
              </div>
            )}
            {game && typeof game.fen === 'function' && (
              <Chessboard 
                id="main-board"
                position={game.fen()} 
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                onPieceClick={handlePieceClick}
                boardOrientation={effectivePlayerColor === 'b' ? 'black' : 'white'}
                arePiecesDraggable={room?.status === 'active'}
                customDarkSquareStyle={customDarkSquareStyle}
                customLightSquareStyle={customLightSquareStyle}
                customSquareStyles={boardStyles}
                animationDuration={200}
              />
            )}

            {/* Promotion Modal Overlay */}
            {pendingPromotion && (
              <div className="promotion-overlay animate-fade">
                <div className="promotion-card nm-card">
                  <h4 className="text-center mb-4 uppercase text-xs tracking-wider">Promote To</h4>
                  <div className="promotion-options">
                    {[
                      { type: 'q', label: 'Queen' },
                      { type: 'r', label: 'Rook' },
                      { type: 'b', label: 'Bishop' },
                      { type: 'n', label: 'Knight' }
                    ].map((p) => (
                      <button 
                        key={p.type} 
                        className="promotion-btn nm-flat"
                        onClick={() => confirmPromotion(p.type)}
                      >
                        <span className="piece-icon">{getPieceIcon(p.type, effectivePlayerColor)}</span>
                        <span className="piece-label">{p.label}</span>
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-ghost btn-sm w-full mt-4" onClick={() => setPendingPromotion(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Player Info */}
          <PlayerBar 
            player={profile || { display_name: user?.email, avatar_initials: '??' }}
            time={effectivePlayerColor === 'w' ? (timers?.white ?? 600) : (timers?.black ?? 600)}
            isTurn={isMyTurn}
            captured={effectivePlayerColor === 'w' ? (captured?.black ?? []) : (captured?.white ?? [])}
            color={effectivePlayerColor === 'w' ? 'white' : 'black'}
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
              <button 
                className="btn btn-outline flex-1" 
                onClick={offerDraw}
                disabled={!!room?.draw_offered_by}
              >
                <RotateCcw size={16} /> {room?.draw_offered_by ? 'Draw Pending' : 'Draw'}
              </button>
            </div>
            
            {room?.draw_offered_by && room.draw_offered_by !== profile?.id && (
              <div className="draw-offer-alert nm-flat animate-fade mt-4">
                <p className="text-sm mb-2">Opponent offered a draw</p>
                <div className="flex gap-2">
                  <button className="btn btn-primary btn-sm flex-1" onClick={acceptDraw}>Accept</button>
                  <button className="btn btn-outline btn-sm flex-1" onClick={declineDraw}>Decline</button>
                </div>
              </div>
            )}
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
              {room.winner_id ? (
                room.winner_id === profile.id ? 'You Won!' : 'Opponent Won'
              ) : 'Match Drawn'}
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
