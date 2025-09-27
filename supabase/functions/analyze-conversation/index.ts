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
    const { conversationId } = await req.json();
    
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    // @ts-ignore Deno global available
    const GEMINI_API_KEY = (globalThis.Deno ?? Deno).env.get('GEMINI_API_KEY');
    // @ts-ignore Deno global available
    const GEMINI_MODEL = ((globalThis as any).Deno ?? Deno).env.get('GEMINI_MODEL') || 'gemini-pro';
    // @ts-ignore Deno global available
    const SUPABASE_URL = (globalThis.Deno ?? Deno).env.get('SUPABASE_URL');
    // @ts-ignore Deno global available
    const SUPABASE_SERVICE_ROLE_KEY = (globalThis.Deno ?? Deno).env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get conversation details and messages
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('*, profiles(full_name)')
      .eq('id', conversationId)
      .single();

    if (conversationError || !conversation) {
      throw new Error('Conversation not found');
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      throw new Error('Failed to fetch conversation messages');
    }

    if (!messages || messages.length === 0) {
      throw new Error('No messages found in conversation');
    }

    // Prepare conversation text for analysis
    const conversationText = messages
      .map((msg: { role: string; content: string }) => `${msg.role === 'user' ? 'Student' : 'Therapist'}: ${msg.content}`)
      .join('\n\n');

    console.log('Analyzing conversation with', messages.length, 'messages using Gemini');

    const systemInstruction = `You are a professional psychological assessment AI that analyzes therapy conversations for educational institutions. Provide objective, structured reports for teachers about student wellbeing.\n\nCRITICAL: Return ONLY a valid JSON object. No surrounding text.\n\nJSON format: {"severity_level":1-5,"categories":["category1"],"summary":"...","recommendations":"...","key_concerns":["..."],"ai_analysis":{"emotional_state":"...","risk_factors":["..."],"protective_factors":["..."],"immediate_actions_needed":false}}\n\nSeverity Scale: 1=Low,2=Mild,3=Moderate,4=High,5=Critical. Valid categories: academic, social, family, anxiety, depression, bullying, physical_harm, eating_disorder, substance_abuse, self_harm, other. Focus on safety, objectivity, actionable insights.`;

    // Build contents for Gemini (user role messages)
    const geminiContents = [
      {
        role: 'user',
        parts: [{ text: `Analyze this therapy conversation and produce the required JSON report.\n\nConversation:\n${conversationText}` }]
      }
    ];

    const geminiBody: Record<string, unknown> = {
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      contents: geminiContents,
      generationConfig: {
        temperature: 0.25,
        topP: 0.9,
        maxOutputTokens: 800
      }
    };

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    let raw;
    try {
      raw = await response.json();
    } catch (err) {
      console.error('Failed to parse Gemini response JSON', err);
      throw new Error('Invalid Gemini JSON response');
    }

    const analysisContent = raw?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Raw Gemini analysis content length:', analysisContent.length);

    if (!analysisContent.trim()) {
      throw new Error('Empty analysis response from Gemini');
    }

    let analysisData;
    try {
      analysisData = JSON.parse(analysisContent.trim());
    } catch (parseError) {
      console.error('Failed to parse Gemini analysis JSON:', parseError, 'Raw:', analysisContent);
      throw new Error('Failed to parse analysis JSON');
    }

    // Validate required fields
    const requiredTop = ['severity_level','categories','summary'];
    for (const key of requiredTop) {
      if (analysisData[key] === undefined || analysisData[key] === null) {
        throw new Error(`Analysis JSON missing required field: ${key}`);
      }
    }
    if (typeof analysisData.severity_level !== 'number' || analysisData.severity_level < 1 || analysisData.severity_level > 5) {
      throw new Error('Invalid severity_level value');
    }
    if (!Array.isArray(analysisData.categories)) {
      throw new Error('categories must be an array');
    }

    // Create the report
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        conversation_id: conversationId,
        student_id: conversation.student_id,
        severity_level: analysisData.severity_level,
        categories: analysisData.categories,
        summary: analysisData.summary,
        recommendations: analysisData.recommendations,
        key_concerns: analysisData.key_concerns || [],
        ai_analysis: analysisData.ai_analysis || {}
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error creating report:', reportError);
      throw new Error('Failed to create report');
    }

    // Mark conversation as ended
    await supabase
      .from('conversations')
      .update({ 
        status: 'ended',
        ended_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    console.log('Analysis complete, report created');

    return new Response(JSON.stringify({ 
      success: true,
      report: report,
      analysis: analysisData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-conversation function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});