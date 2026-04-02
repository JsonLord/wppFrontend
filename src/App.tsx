import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal,
  Users,
  MessageSquare,
  Play,
  Lock,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Group {
  id: {
    _serialized: string;
    user: string;
  };
  name: string;
}

function App() {
  const [passkey, setPasskey] = useState(localStorage.getItem('passkey') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginError, setLoginError] = useState('');

  const [status, setStatus] = useState('DISCONNECTED');
  const [qrCode, setQrCode] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'direct' | 'group'>('direct');
  const [template, setTemplate] = useState<'normal' | 'poll' | 'date'>('normal');
  const [pollName, setPollName] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [links, setLinks] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      'x-passkey': passkey,
      'Content-Type': 'application/json'
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      handleLogout();
      throw new Error('Unauthorized');
    }
    return response;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('passkey', passkey);
        setIsLoggedIn(true);
      } else {
        setLoginError(data.error || 'Invalid passkey');
      }
    } catch (err) {
      setLoginError('Failed to connect to server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('passkey');
    setPasskey('');
    setIsLoggedIn(false);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const savedPasskey = localStorage.getItem('passkey');
      if (savedPasskey) {
        try {
          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passkey: savedPasskey })
          });
          const data = await res.json();
          if (data.success) {
            setIsLoggedIn(true);
          } else {
            localStorage.removeItem('passkey');
          }
        } catch (err) {
          console.error('Auth check failed', err);
        }
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth('/api/status');
        const data = await res.json();
        setStatus(data.status);
        setQrCode(data.qrCode);
        setLogs(data.logs);
      } catch (error) {
        console.error('Failed to fetch status', error);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoggedIn, passkey]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const startService = async () => {
    try {
      await fetchWithAuth('/api/start', { method: 'POST' });
    } catch (error) {
      console.error('Failed to start service', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetchWithAuth('/api/groups');
      const data = await res.json();
      if (data.success) setGroups(data.groups);
    } catch (error) {
      console.error('Failed to fetch groups', error);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    try {
      let endpoint = '/api/send';
      let body: any = {
        message: template === 'date' ? `${message}\n\n${links}` : message,
        isGroup: activeTab === 'group'
      };

      if (activeTab === 'direct') {
        body.phone = phone;
      } else {
        body.phone = selectedGroup;
      }

      if (template === 'poll') {
        endpoint = '/api/send-poll';
        body = {
          recipient: body.phone,
          pollName,
          options: pollOptions.filter(o => o.trim() !== ''),
          isGroup: activeTab === 'group'
        };
      }

      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      const result = await res.json();
      if (result.success) {
        alert('Message sent successfully!');
        if (template === 'poll') {
          setPollName('');
          setPollOptions(['', '']);
        } else {
          setMessage('');
          setLinks('');
        }
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 font-sans selection:bg-orange-100 selection:text-orange-900">
      <AnimatePresence>
        {!isLoggedIn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gray-900/10 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 to-red-500" />
              <div className="flex flex-col items-center mb-8 pt-4">
                <div className="w-20 h-20 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 rotate-3 shadow-inner">
                  <Lock className="w-10 h-10 text-orange-600 -rotate-3" />
                </div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight text-center">Authentication Required</h1>
                <p className="text-gray-500 text-center mt-3 font-medium">Please enter your UI Passkey to unlock the WPPConnect dashboard</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <input
                    type="password"
                    placeholder="UI Passkey..."
                    value={passkey}
                    onChange={(e) => setPasskey(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 outline-none transition-all text-center text-xl font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
                    autoFocus
                  />
                </div>
                {loginError && (
                  <p className="text-red-500 text-sm flex items-center justify-center gap-2 font-semibold bg-red-50 py-2 rounded-lg border border-red-100">
                    <AlertCircle className="w-4 h-4" /> {loginError}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl transition-all shadow-xl hover:shadow-orange-200 hover:-translate-y-0.5 active:translate-y-0"
                >
                  Unlock Dashboard
                </button>
              </form>
              <div className="mt-8 pt-6 border-t border-gray-50 text-center">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Hugging Face Space Security</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">WPPConnect Portal</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${status === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{status}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={startService}
              disabled={status === 'CONNECTED' || status === 'INITIALIZING'}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-orange-100"
            >
              {status === 'INITIALIZING' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {status === 'INITIALIZING' ? 'Starting...' : 'Connect WhatsApp'}
            </button>
            <button
              onClick={handleLogout}
              className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Messaging Control */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex gap-1 p-1 bg-gray-50 rounded-xl mb-6">
                <button
                  onClick={() => setActiveTab('direct')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'direct' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MessageSquare className="w-4 h-4" /> Direct Message
                </button>
                <button
                  onClick={() => {
                    setActiveTab('group');
                    if (groups.length === 0) fetchGroups();
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'group' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Users className="w-4 h-4" /> Group Message
                </button>
              </div>

              {status !== 'CONNECTED' ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Not Connected</h3>
                    <p className="text-sm text-gray-500 max-w-[200px] mx-auto mt-1">Please authenticate with WhatsApp to start messaging.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSend} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'direct' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Recipient Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. 5511999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Select Group</label>
                      <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        disabled={status !== 'CONNECTED'}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        <option value="">-- Choose a group --</option>
                        {groups.map((g) => (
                          <option key={g.id._serialized} value={g.id._serialized}>
                            {g.name || g.id.user}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Or enter group ID/name manually..."
                          value={selectedGroup}
                          onChange={(e) => setSelectedGroup(e.target.value)}
                          disabled={status !== 'CONNECTED'}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                        />
                        <button 
                          type="button"
                          onClick={fetchGroups}
                          className="p-2 text-gray-500 hover:text-orange-500 transition-colors"
                          title="Refresh groups"
                        >
                          <Play className="w-4 h-4 rotate-90" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Template</label>
                  <div className="flex gap-2">
                    {(['normal', 'poll', 'date'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTemplate(t)}
                        className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${template === t ? 'bg-orange-50 border-orange-200 text-orange-600 ring-1 ring-orange-200' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {template === 'poll' ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Poll Question</label>
                      <input
                        type="text"
                        placeholder="What is your favorite color?"
                        value={pollName}
                        onChange={(e) => setPollName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Options</label>
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            placeholder={`Option ${idx + 1}`}
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...pollOptions];
                              newOpts[idx] = e.target.value;
                              setPollOptions(newOpts);
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-600 px-2"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ''])}
                        className="text-xs text-orange-600 font-medium hover:underline"
                      >
                        + Add Option
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {template === 'date' ? 'Additional Message (Optional)' : 'Message'}
                    </label>
                    <textarea
                      rows={4}
                      placeholder={template === 'date' ? 'Message to include with date...' : 'Type your message here...'}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      disabled={status !== 'CONNECTED'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                )}

                {template !== 'poll' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Links (one per line)</label>
                    <textarea
                      rows={2}
                      placeholder="https://example.com"
                      value={links}
                      onChange={(e) => setLinks(e.target.value)}
                      disabled={status !== 'CONNECTED'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none disabled:bg-gray-100 disabled:text-gray-500 text-sm"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status !== 'CONNECTED' || isSending || (activeTab === 'direct' ? !phone : !selectedGroup) || (template === 'poll' ? !pollName : !message && template !== 'date' && !links)}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  {isSending ? 'Sending...' : 'Send Message'}
                </button>
              </form>
              )}
            </div>
          </div>

          {/* Right Column: QR Code & Logs */}
          <div className="space-y-6 flex flex-col">
            {/* QR Code Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center justify-center min-h-[300px]">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2 w-full text-left">Authentication</h2>
              {status === 'QR_CODE' && qrCode ? (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 border-4 border-white shadow-sm rounded-lg" />
                  <p className="text-sm text-gray-500 mt-4 text-center">Scan this QR code with your WhatsApp app to connect.</p>
                </div>
              ) : status === 'CONNECTED' ? (
                <div className="flex flex-col items-center text-green-500">
                  <CheckCircle2 className="w-20 h-20 mb-4" />
                  <p className="font-medium text-gray-700">Authenticated & Ready</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-gray-400">
                  <QrCode className="w-20 h-20 mb-4 opacity-50" />
                  <p className="text-sm">QR Code will appear here</p>
                </div>
              )}
            </div>

            {/* Logs Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-700">System Logs</h2>
              </div>
              <div className="bg-[#1e1e1e] text-[#d4d4d4] p-4 font-mono text-xs overflow-y-auto h-[300px] flex-1">
                {logs.length === 0 ? (
                  <p className="text-gray-500 italic">Waiting for logs...</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="mb-1 hover:bg-white/5 px-1 rounded">
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
