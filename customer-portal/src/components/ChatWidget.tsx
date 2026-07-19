'use client';
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { portalApi } from '@/lib/api';
import type { ChatMessage } from '@/types';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const openChat = async () => {
    setOpen(true);
    if (!sessionId) {
      try {
        const session = await portalApi.startChat();
        setSessionId(session.id);
        setMessages(session.messages || []);
        if (!session.messages?.length) {
          setMessages([{
            role: 'assistant',
            content: "Hi! I'm the EBA Insurance assistant. Ask me about your policies, claims, or payments.",
            timestamp: new Date().toISOString(),
          }]);
        }
      } catch {
        setMessages([{
          role: 'assistant',
          content: "I'm having trouble connecting right now - please try again shortly or visit Support.",
          timestamp: new Date().toISOString(),
        }]);
      }
    }
  };

  const send = async () => {
    if (!input.trim() || !sessionId || sending) return;
    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setSending(true);

    try {
      const result = await portalApi.sendChatMessage(sessionId, userMsg.content);
      setMessages(m => [...m, { role: 'assistant', content: result.reply, timestamp: new Date().toISOString() }]);
    } catch {
      setMessages(m => [...m, {
        role: 'assistant',
        content: "Sorry, I couldn't process that. Please try again or visit Support for help.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={openChat}
        className="fixed bottom-20 right-4 w-14 h-14 bg-brand-red text-white rounded-full shadow-lg flex items-center justify-center z-50 active:scale-95 transition-transform"
        aria-label="Open chat assistant"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white max-w-md mx-auto">
      <div className="flex items-center justify-between px-4 py-3 bg-brand-red text-white flex-shrink-0">
        <div>
          <p className="font-semibold text-sm">EBA Insurance Assistant</p>
          <p className="text-xs text-white/70">Usually replies instantly</p>
        </div>
        <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/10 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-brand-red text-white rounded-br-sm'
                : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about your policy, claim, or payment..."
          className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="w-10 h-10 bg-brand-red text-white rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
