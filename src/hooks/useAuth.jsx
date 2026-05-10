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
    console.log('fetchProfile started for:', userId);
    // Safety timeout: don't hang for more than 10 seconds
    const timeout = setTimeout(() => {
      console.warn('Profile fetch timed out after 10s, continuing with default profile.');
      setLoading(false);
    }, 10000);

    try {
      console.log('Querying "users" table...');
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching from "users":', error.message);
      }

      if (error || !data) {
        console.warn('No profile found in "users" table, checking "profiles"...');
        const { data: profData, error: profError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        
        if (profError) {
          console.error('Error fetching from "profiles":', profError.message);
        }

        if (profData) {
          console.log('Found profile in "profiles" table.');
          setProfile(profData);
        } else {
          console.warn('Profile absolutely not found for user:', userId);
        }
      } else {
        console.log('Profile found in "users" table.');
        setProfile(data);
      }
    } catch (error) {
      console.error('Fetch profile crashed:', error);
    } finally {
      console.log('fetchProfile finished.');
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const signUp = async ({ email, password, username, displayName }) => {
    const cleanEmail = email.trim();
    const cleanUsername = username.trim();
    const cleanDisplayName = displayName.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanDisplayName,
          }
        }
      });

      // If we get an error but also a user, or if we get a 422 (which sometimes happens if the trigger fails but user is created)
      if (error) {
        console.warn('Signup returned error, checking if user was still created:', error.message);
        
        // If it's a 422, it's almost certainly the trigger failing
        if (error.status === 422 || error.message.includes('Database error')) {
          // Try to sign in to see if the account was actually created
          const { data: signInData, error: signInError } = await signIn(cleanEmail, password);
          if (!signInError && signInData?.user) {
            console.log('User was created despite signup error, proceeding to manual profile creation.');
            await ensureProfile(signInData.user.id, cleanUsername, cleanDisplayName);
            return signInData;
          }
        }
        throw error;
      }

      if (data?.user) {
        await ensureProfile(data.user.id, cleanUsername, cleanDisplayName);
      }

      return data;
    } catch (err) {
      console.error('Signup process failed:', err);
      throw err;
    }
  };

  const ensureProfile = async (userId, username, displayName) => {
    try {
      const { error: profileError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          username: username,
          display_name: displayName,
          avatar_initials: displayName.substring(0, 2).toUpperCase()
        }]);
      
      if (profileError) {
        if (profileError.code === '23505') {
          console.log('Profile already exists.');
        } else {
          console.warn('Manual profile creation failed:', profileError.message);
        }
      } else {
        console.log('Profile created successfully.');
      }
    } catch (err) {
      console.error('Profile insertion error:', err);
    }
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
