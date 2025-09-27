import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationId } = await req.json();
    
    if (!message || !conversationId) {
      throw new Error('Message and conversation ID are required');
    }

  // @ts-ignore: Deno global is available in Edge Functions
  const GEMINI_API_KEY = (globalThis.Deno ?? Deno).env.get('GEMINI_API_KEY');
  // @ts-ignore: Deno global is available in Edge Functions
  const SUPABASE_URL = (globalThis.Deno ?? Deno).env.get('SUPABASE_URL');
  // @ts-ignore: Deno global is available in Edge Functions
  const SUPABASE_SERVICE_ROLE_KEY = (globalThis.Deno ?? Deno).env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL not configured');
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Service role key missing');

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      throw new Error('Failed to fetch conversation history');
    }

    // Build normalized conversation history (past + new message)
    const fullHistory = [
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];

    // Convert to Gemini contents array (Gemini expects roles: 'user' | 'model')
    const geminiContents = fullHistory.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

  // @ts-ignore: Deno global available in edge runtime
  let GEMINI_MODEL = ((globalThis as any).Deno ?? Deno).env.get('GEMINI_MODEL') || 'gemini-pro';

    const systemPrompt = `You are Dr. Sarah, a professional and compassionate therapist specializing in working with students (ages 13-18). Your role: provide emotional support, active listening, and evidence-based coping strategies while maintaining professional boundaries.\n\nGuidelines:\n- Begin by acknowledging emotion when appropriate\n- Ask 1 reflective/open question if helpful\n- Keep to 2-4 concise, warm sentences\n- Never provide diagnoses or medical instructions\n- If severe distress or self-harm risk is implied: encourage reaching a trusted adult/counselor immediately (without sounding alarmist)\n- Focus on strengths, resilience, and practical coping tools\n- Avoid repetition of prior assistant messages.\nReturn only the response text (no prefixes).`;

    console.log('[ai-therapist] Prepared Gemini request', {
      messageCount: geminiContents.length,
      model: GEMINI_MODEL,
      conversationId,
      supabaseUrlSet: !!SUPABASE_URL
    });

    const geminiRequestBody: Record<string, unknown> = {
      contents: geminiContents,
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
        topP: 0.9
      }
    };

    const callGemini = async (model: string) => {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequestBody),
      });
      const text = await resp.text();
      if (!resp.ok) {
        return { ok: false, status: resp.status, body: text };
      }
      let json: any;
      try {
        json = JSON.parse(text);
      } catch (e) {
        return { ok: false, status: resp.status, body: 'Invalid JSON from Gemini' };
      }
      return { ok: true, status: resp.status, json };
    };

    let aiResponse = '';
    let primary = await callGemini(GEMINI_MODEL);
    if (!primary.ok) {
      console.error('[ai-therapist] Primary model failed', { model: GEMINI_MODEL, status: primary.status, body: primary.body?.slice(0,500) });
      if (GEMINI_MODEL !== 'gemini-pro') {
        console.log('[ai-therapist] Falling back to gemini-pro');
        GEMINI_MODEL = 'gemini-pro';
        const fallback = await callGemini(GEMINI_MODEL);
        if (!fallback.ok) {
          throw new Error(`Gemini failure (primary & fallback). Last status ${fallback.status}`);
        }
        primary = fallback;
      } else {
        throw new Error(`Gemini failure status ${primary.status}`);
      }
    }
    try {
      aiResponse = primary.json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      console.error('[ai-therapist] Could not extract text', e);
      aiResponse = '';
    }

    if (!aiResponse.trim()) {
      console.warn('[ai-therapist] Empty AI response, using fallback');
      aiResponse = "I'm here with you. Could you share a little more about how you're feeling right now?";
    }

    console.log('[ai-therapist] Received response from Gemini (chars):', aiResponse.length);

    // Store both user message and AI response
    const { error: userMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message
      });

    if (userMessageError) {
      console.error('Error storing user message:', userMessageError);
    }

    const { error: aiMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: aiResponse
      });

    if (aiMessageError) {
      console.error('Error storing AI message:', aiMessageError);
    }

    return new Response(JSON.stringify({ 
      response: aiResponse,
      model: GEMINI_MODEL,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-therapist function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      hint: 'Check GEMINI_API_KEY, model name, or function logs',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});