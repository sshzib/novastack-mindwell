-- Create user roles enum
CREATE TYPE public.user_role AS ENUM ('student', 'teacher');

-- Create conversation categories enum
CREATE TYPE public.conversation_category AS ENUM ('academic', 'social', 'family', 'anxiety', 'depression', 'bullying', 'physical_harm', 'eating_disorder', 'substance_abuse', 'self_harm', 'other');

-- Create profiles table for additional user information
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'student',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create conversations table
CREATE TABLE public.conversations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL,
    title TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ended_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create messages table for chat history
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reports table for AI-generated analysis
CREATE TABLE public.reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL UNIQUE,
    student_id UUID NOT NULL,
    severity_level INTEGER NOT NULL CHECK (severity_level >= 1 AND severity_level <= 5),
    categories public.conversation_category[] NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL,
    recommendations TEXT,
    key_concerns TEXT[],
    ai_analysis JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create policies for conversations (students can only see their own)
CREATE POLICY "Students can view their own conversations" 
ON public.conversations 
FOR SELECT 
USING (auth.uid() = student_id);

CREATE POLICY "Students can create their own conversations" 
ON public.conversations 
FOR INSERT 
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update their own conversations" 
ON public.conversations 
FOR UPDATE 
USING (auth.uid() = student_id);

-- Create policies for messages (tied to conversation access)
CREATE POLICY "Users can view messages from their conversations" 
ON public.messages 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.conversations 
        WHERE conversations.id = messages.conversation_id 
        AND conversations.student_id = auth.uid()
    )
);

CREATE POLICY "Users can insert messages to their conversations" 
ON public.messages 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.conversations 
        WHERE conversations.id = messages.conversation_id 
        AND conversations.student_id = auth.uid()
    )
);

-- Create policies for reports
CREATE POLICY "Students can view their own reports" 
ON public.reports 
FOR SELECT 
USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view all reports" 
ON public.reports 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.user_id = auth.uid() 
        AND profiles.role = 'teacher'
    )
);

CREATE POLICY "System can insert reports" 
ON public.reports 
FOR INSERT 
WITH CHECK (true);

-- Add foreign key constraints
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_conversation_id_fkey 
FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.reports 
ADD CONSTRAINT reports_conversation_id_fkey 
FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.reports 
ADD CONSTRAINT reports_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();