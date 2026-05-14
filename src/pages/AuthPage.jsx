import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock, User, AtSign, Loader2 } from 'lucide-react';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
    displayName: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error: signInError } = await signIn(formData.email, formData.password);
        if (signInError) throw signInError;
      } else {
        await signUp(formData);
      }
      navigate('/lobby');
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'An unexpected authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container animate-fade">
      <div className="auth-card nm-card">
        <div className="auth-header">
          <h2 className="serif">{isLogin ? 'வீரரே, மீண்டும் வரவேற்கிறோம்' : 'சதுரங்கத்தில் இணையுங்கள்'}</h2>
          <p className="text-muted">
            {isLogin ? 'உங்கள் பயணத்தை தொடர உள்நுழையுங்கள்' : 'ஆட்டத்தை தொடங்க ஒரு கணக்கை உருவாக்கவும்'}
          </p>
        </div>

        {error && <div className="error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <>
              <div className="input-group">
                <label><User size={16} /> Display Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Nithin"
                  required
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label><AtSign size={16} /> Username</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. nithin_90"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="input-group">
            <label><Mail size={16} /> Email Address</label>
            <input
              type="email"
              className="input"
              placeholder="name@example.com"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label><Lock size={16} /> Password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="auth-footer">
          <button
            className="btn btn-ghost"
            style={{ boxShadow: 'none', background: 'transparent' }}
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "கணக்கு இல்லையா? பதிவு செய்யுங்கள்" : "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழையுங்கள்"}
          </button>
        </div>
      </div>

    </div>
  );
};

export default AuthPage;
