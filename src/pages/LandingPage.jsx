import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Play, Users, Shield, Zap, Star } from 'lucide-react';
import heroImg from '../assets/hero.png';

const LandingPage = () => {
  const { user } = useAuth();

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-v2">
        <div className="container">
          <div className="hero-content">
            <div className="badge animate-fade-in">
              <Star size={14} className="text-primary" />
              <span>Tamil Version of Chess by Nithin</span>
            </div>
            <h1 className="hero-title-v2 serif">
              சதுரங்கம்: The <span className="text-gradient">Ultimate</span> Chess Experience
            </h1>
            <p className="hero-description">
              தமிழில் வடிவமைக்கப்பட்ட modern chess platform. நண்பர்களுடன் விளையாடுங்கள், உலகளாவிய வீரர்களை சவால் செய்யுங்கள், மற்றும் உங்கள் strategy-யை அடுத்த நிலைக்கு கொண்டு செல்லுங்கள்
            </p>
            <div className="hero-cta">
              {user ? (
                <Link to="/lobby" className="btn btn-primary btn-xl">
                  <Play size={20} fill="currentColor" /> Play Now
                </Link>
              ) : (
                <Link to="/auth" className="btn btn-primary btn-xl">
                  ஆட்டத்தை தொடங்கு
                </Link>
              )}
            </div>

          </div>

          <div className="hero-visual">
            <div className="image-stack">
              <div className="image-blob"></div>
              <img src={heroImg} alt="Chess Hero" className="hero-main-img nm-card" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container">
          <div className="section-header text-center mb-12">
            <h2 className="serif text-4xl mb-4">Why Sadhurangam?</h2>
            <p className="text-muted max-w-2xl mx-auto">
              We've reimagined the classic game with modern tech and premium aesthetics.
            </p>
          </div>

          <div className="features-grid-v2">
            <div className="feature-card-v2 nm-card">
              <div className="icon-box nm-inset">
                <Zap size={24} className="text-primary" />
              </div>
              <h3>Ultra Fast</h3>
              <p className="text-muted">Low latency real-time moves powered by Supabase Realtime.</p>
            </div>

            <div className="feature-card-v2 nm-card">
              <div className="icon-box nm-inset">
                <Users size={24} className="text-primary" />
              </div>
              <h3>Play Anywhere</h3>
              <p className="text-muted">Challenge friends across devices with a fully responsive interface.</p>
            </div>

            <div className="feature-card-v2 nm-card">
              <div className="icon-box nm-inset">
                <Shield size={24} className="text-primary" />
              </div>
              <h3>Safe & Secure</h3>
              <p className="text-muted">Enterprise-grade security for your account and game data.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
