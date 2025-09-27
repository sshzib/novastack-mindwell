import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Send, MessageCircle, Heart, LogOut } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface StudentChatProps {
  user: User;
  onSignOut: () => void;
}

const StudentChat: React.FC<StudentChatProps> = ({ user, onSignOut }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startNewConversation = async () => {
    try {
      const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
          student_id: user.id,
          title: 'Therapy Session'
        })
        .select()
        .single();

      if (error) throw error;

      setConversationId(conversation.id);
      setIsConversationActive(true);
      setMessages([]);
      
      toast({
        title: "Session Started",
        description: "You're now connected with Dr. Sarah, your AI therapist.",
      });

      // Add welcome message
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: "Hello! I'm Dr. Sarah, and I'm here to support you. This is a safe space where you can share whatever is on your mind. How are you feeling today?",
        created_at: new Date().toISOString()
      };
      setMessages([welcomeMessage]);

    } catch (error: any) {
      console.error('Error starting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to start conversation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !conversationId || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: newMessage.trim(),
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-therapist', {
        body: {
          message: userMessage.content,
          conversationId: conversationId
        }
      });

      if (error) throw error;

      if (data.success && data.response) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }

    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async () => {
    if (!conversationId) return;

    try {
      // End the conversation
      await supabase
        .from('conversations')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      // Generate analysis report
      const { data, error } = await supabase.functions.invoke('analyze-conversation', {
        body: { conversationId }
      });

      if (error) {
        console.error('Error analyzing conversation:', error);
      } else {
        console.log('Analysis complete:', data);
      }

      setIsConversationActive(false);
      setConversationId(null);
      setMessages([]);

      toast({
        title: "Session Ended",
        description: "Thank you for using MindWell. Your session has been saved securely.",
      });

    } catch (error: any) {
      console.error('Error ending session:', error);
      toast({
        title: "Error",
        description: "There was an issue ending your session.",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-primary/10">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b border-border shadow-gentle">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">MindWell</h1>
              <p className="text-sm text-muted-foreground">AI Therapy Platform</p>
            </div>
          </div>
          <Button
            onClick={onSignOut}
            variant="outline"
            size="sm"
            className="flex items-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {!isConversationActive ? (
          // Welcome Screen
          <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
            <Card className="w-full max-w-md text-center shadow-card border-0 bg-card/95 backdrop-blur-sm">
              <CardHeader className="space-y-4">
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center shadow-gentle">
                  <MessageCircle className="w-10 h-10 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-foreground">
                    Welcome to Your Safe Space
                  </CardTitle>
                  <p className="text-muted-foreground mt-2">
                    Ready to start a confidential conversation with Dr. Sarah, your AI therapist?
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={startNewConversation}
                  className="w-full bg-gradient-to-r from-primary to-primary-light hover:from-primary-light hover:to-primary text-primary-foreground font-medium py-3 shadow-gentle hover:shadow-card transition-all duration-300"
                >
                  Start New Session
                </Button>
                <p className="text-xs text-muted-foreground mt-4">
                  All conversations are confidential and analyzed only for your wellbeing.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Chat Interface
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center">
                  <Heart className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Dr. Sarah</h2>
                  <p className="text-sm text-muted-foreground">AI Therapist • Online</p>
                </div>
              </div>
              <Button
                onClick={endSession}
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                End Session
              </Button>
            </div>

            {/* Messages */}
            <Card className="h-[60vh] shadow-card border-0 bg-card/95 backdrop-blur-sm">
              <CardContent className="p-0 h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-2xl ${
                          message.role === 'user'
                            ? 'bg-gradient-to-r from-primary to-primary-light text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted p-3 rounded-2xl">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="border-t border-border p-4">
                  <div className="flex space-x-2">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Share what's on your mind..."
                      className="flex-1 border-border focus:ring-primary"
                      disabled={isLoading}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || isLoading}
                      className="bg-gradient-to-r from-primary to-primary-light hover:from-primary-light hover:to-primary text-primary-foreground shadow-gentle hover:shadow-card transition-all duration-300"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentChat;