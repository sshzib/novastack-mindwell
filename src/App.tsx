import React, { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/AuthLayout";
import StudentChat from "@/components/StudentChat";
import TeacherDashboard from "@/components/TeacherDashboard";
import type { User, Session } from '@supabase/supabase-js';

const queryClient = new QueryClient();

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true; // safeguard against state updates after unmount

    const fetchOrEnsureUserRole = async (user: User) => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();
        if (!isActive) return;
        if (profile && !error) {
          setUserRole(profile.role);
          return;
        }

        console.warn('Profile missing; attempting to create a new one for user:', user.id, error?.message);
        const inferredRole = (user.user_metadata as any)?.role || 'student';
        const inferredFullName = (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || 'User';
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            email: user.email,
            full_name: inferredFullName,
            role: inferredRole
          })
          .select('role')
          .single();
        if (!isActive) return;
        if (createdProfile && !createError) {
            setUserRole(createdProfile.role);
            return;
        }
        if (createError && (createError as any).code === '23505') {
          // Race: another insert succeeded; refetch
          const { data: refetched } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();
          if (!isActive) return;
          if (refetched) {
            setUserRole(refetched.role);
            return;
          }
        }
        console.error('Unable to resolve user role after creation attempt:', createError);
        setUserRole(null);
      } catch (err) {
        if (!isActive) return;
        console.error('Unexpected error fetching user role:', err);
        setUserRole(null);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchOrEnsureUserRole(session.user);
        } else {
          setUserRole(null);
        }
        
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isActive) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchOrEnsureUserRole(session.user);
      }

      if (isActive) setIsLoading(false);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
  };

  const renderMainApp = () => {
    if (!user || !userRole) {
      return <AuthLayout user={user} userRole={userRole}>{null}</AuthLayout>;
    }

    if (userRole === 'student') {
      return <StudentChat user={user} onSignOut={handleSignOut} />;
    } else if (userRole === 'teacher') {
      return <TeacherDashboard user={user} onSignOut={handleSignOut} />;
    }

    return <AuthLayout user={user} userRole={userRole}>{null}</AuthLayout>;
  };

  if (isLoading) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-gradient-to-br from-background via-muted to-primary/10 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center mx-auto animate-pulse">
                <div className="w-8 h-8 bg-primary-foreground rounded-full"></div>
              </div>
              <p className="text-muted-foreground">Loading MindWell...</p>
            </div>
          </div>
          <Toaster />
          <Sonner />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {renderMainApp()}
        <Toaster />
        <Sonner />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
