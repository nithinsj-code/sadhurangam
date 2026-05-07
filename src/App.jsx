import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';
import Navbar from './components/Navbar';
import './index.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4 text-center">
        <h1 className="text-2xl font-bold mb-2">Missing Configuration</h1>
        <p>Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel Environment Variables.</p>
      </div>
    );
  }
  
  if (loading) return <div className="loading-screen text-white">Loading...</div>;
  if (!user) return <Navigate to="/auth" />;
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route 
                path="/lobby" 
                element={
                  <ProtectedRoute>
                    <Lobby />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/game/:roomCode" 
                element={
                  <ProtectedRoute>
                    <GameRoom />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
