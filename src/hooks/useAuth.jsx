import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    const checkUser = async () => {
      try {
        if (!supabase) {
          setLoading(false);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user ?? null);
        if (user) {
          await fetchProfile(user.id);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    // Safety timeout: don't hang for more than 3 seconds
    const timeout = setTimeout(() => {
      console.warn('Profile fetch timed out, continuing with default profile.');
      setLoading(false);
    }, 3000);

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('No profile found in "users" table, checking "profiles"...');
        // fallback to common table name if users fails
        const { data: profData } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (profData) setProfile(profData);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Fetch profile crash:', error);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const signUp = async ({ email, password, username, displayName }) => {
    const cleanEmail = email.trim();
    const cleanUsername = username.trim();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername,
          display_name: displayName.trim(),
        }
      }
    });

    if (error) throw error;

    // Profile is now handled by database trigger
    return data;
  };

  const signIn = (email, password) => supabase.auth.signInWithPassword({ 
    email: email.trim(), 
    password 
  });
  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
