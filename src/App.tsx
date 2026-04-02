import React, { useState, useEffect, useRef } from 'react';
import { Play, Send, Smartphone, Terminal, AlertCircle, CheckCircle2, QrCode } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState('DISCONNECTED');
  const [qrCode, setQrCode] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'direct' | 'groups' | 'join'>('direct');
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [template, setTemplate] = useState<'normal' | 'poll' | 'date'>('normal');
  const [pollName, setPollName] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [links, setLinks] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setStatus(data.status);
        setQrCode(data.qrCode);
        setLogs(data.logs);
      } catch (err) {
        console.error("Failed to fetch status", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'CONNECTED') {
      fetchGroups();
    }
  }, [status]);

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error("Failed to fetch groups", err);
    }
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleStartSession = async () => {
    try {
      await fetch('/api/start', { method: 'POST' });
    } catch (err) {
      console.error("Failed to start session", err);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteLink) return;

    setIsJoining(true);
    try {
      await fetch('/api/join-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: inviteLink })
      });
      setInviteLink('');
      fetchGroups(); // Refresh groups after joining
    } catch (err) {
      console.error("Failed to join group", err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipient = activeTab === 'direct' ? phone : selectedGroup;
    if (!recipient) return;

    setIsSending(true);
    try {
      if (template === 'poll') {
        await fetch('/api/send-poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient,
            pollName,
            options: pollOptions.filter(o => o.trim() !== ''),
            isGroup: activeTab === 'groups'
          })
        });
      } else {
        let finalMessage = message;
        if (template === 'date') {
          finalMessage = `📅 Date: ${new Date().toLocaleDateString()}\n⏰ Time: ${new Date().toLocaleTimeString()}\n\n${message}`;
        }

        if (links.trim()) {
          finalMessage += `\n\n🔗 Links:\n${links}`;
        }

        await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            phone: recipient, 
            message: finalMessage,
            isGroup: activeTab === 'groups'
          })
        });
      }
      setMessage('');
      setPollName('');
      setPollOptions(['', '']);
      setLinks('');
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setIsSending(false);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'CONNECTED': return 'text-green-600 bg-green-100 border-green-200';
      case 'QR_CODE': return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'INITIALIZING': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'ERROR': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-gray-800 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-orange-500" />
              WPPConnect Interface
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              A Gradio-inspired web wrapper for WhatsApp Web automation.
            </p>
          </div>
          <div className={`px-4 py-2 rounded-full border text-sm font-medium flex items-center gap-2 ${getStatusColor()}`}>
            {status === 'CONNECTED' && <CheckCircle2 className="w-4 h-4" />}
            {status === 'QR_CODE' && <QrCode className="w-4 h-4" />}
            {status === 'ERROR' && <AlertCircle className="w-4 h-4" />}
            {status}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: Controls & Messaging */}
          <div className="space-y-6">
            {/* Session Control Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">Session Control</h2>
              <button
                onClick={handleStartSession}
                disabled={status === 'INITIALIZING' || status === 'CONNECTED'}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                {status === 'INITIALIZING' ? 'Initializing...' : status === 'CONNECTED' ? 'Session Active' : 'Start Session'}
              </button>
            </div>

            {/* Messaging Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 opacity-100 transition-opacity">
              <div className="flex items-center justify-between mb-4 border-b pb-2">
                <h2 className="text-lg font-semibold">Messaging</h2>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab('direct')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === 'direct' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Direct
                  </button>
                  <button
                    onClick={() => setActiveTab('groups')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === 'groups' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Groups
                  </button>
                  <button
                    onClick={() => setActiveTab('join')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTab === 'join' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Join Group
                  </button>
                </div>
              </div>

              {activeTab === 'join' ? (
                <form onSubmit={handleJoinGroup} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Group Invite Link</label>
                    <input
                      type="text"
                      placeholder="e.g. https://chat.whatsapp.com/..."
                      value={inviteLink}
                      onChange={(e) => setInviteLink(e.target.value)}
                      disabled={status !== 'CONNECTED'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Paste the WhatsApp group invite link to test connection and join.</p>
                  </div>
                  <button
                    type="submit"
                    disabled={status !== 'CONNECTED' || isJoining || !inviteLink}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isJoining ? 'Testing Connection...' : 'Test Connection & Join'}
                  </button>
                </form>
              ) : (
              <form onSubmit={handleSendMessage} className="space-y-4">
                {activeTab === 'direct' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 5511999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={status !== 'CONNECTED'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Include country code, no plus sign.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Group</label>
                    <div className="space-y-2">
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
