import React, { useState, useRef, useEffect } from 'react';

export default function ChatWindow({ courseMap, onRevision, isRevising }) {
  const [messages, setMessages] = useState([
    {
      role: 'system',
      text: 'Course map generated! You can ask me to make changes — for example: "Add more assessment activities to Lesson 3" or "Change the technology platform to Canvas for all lessons".',
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isRevising) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);

    try {
      const result = await onRevision(text);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Done! I\'ve updated the course map based on your request. You can review the changes in the preview below.',
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: `Revision failed: ${err.message}` },
      ]);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h3 className="text-sm font-semibold text-white">Revision Chat</h3>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50/50">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isRevising && (
          <div className="flex items-center gap-2 text-sm text-blue-600 px-3 py-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Revising course map...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the changes you'd like..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isRevising}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isRevising}
          className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all flex-shrink-0 ${
            input.trim() && !isRevising
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  if (message.role === 'system') {
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-800 max-w-[85%]">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex gap-2 justify-end">
        <div className="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm max-w-[85%]">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm text-green-800 max-w-[85%]">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === 'error') {
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700 max-w-[85%]">
          {message.text}
        </div>
      </div>
    );
  }

  return null;
}
