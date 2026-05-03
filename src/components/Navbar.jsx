import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogOut, User, Users, Home, Swords } from 'lucide-react';

const Navbar = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="navbar nm-card">
      <div className="container flex justify-between items-center h-navbar">
        <Link to="/" className="logo flex items-center gap-3" style={{textDecoration: 'none'}}>
          <div className="logo-icon nm-inset">
            <Swords size={20} className="text-primary" />
          </div>
          <span className="logo-text serif">Sadhurangam</span>
        </Link>

        <div className="nav-links flex items-center gap-4">
          {user ? (
            <>
              <Link to="/lobby" className="btn btn-ghost btn-icon-text">
                <Home size={18} />
                <span className="hide-mobile">Lobby</span>
              </Link>
              <div className="user-profile flex items-center gap-2 nm-inset p-user">
                <div className="avatar nm-flat">{profile?.avatar_initials || '??'}</div>
                <span className="username hide-mobile">{profile?.display_name || 'User'}</span>
              </div>
              <button onClick={handleSignOut} className="btn btn-ghost btn-icon text-danger" title="Sign Out">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign In</Link>
          )}
        </div>
      </div>
      
    </nav>
  );
};

export default Navbar;
