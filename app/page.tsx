"use client";
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [stage, setStage] = useState("welcome");
  const [name, setName] = useState("");
  const [inputName, setInputName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedId = localStorage.getItem("userId");
    const savedName = localStorage.getItem("userName");
    if (savedId && savedName) {
      setUserId(savedId);
      setName(savedName);
      setStage("chat");
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const fetchChats = async () => {
      const res = await fetch(`/api/chats?userId=${userId}`);
      const data = await res.json();
      setChats(data);
      if (data.length > 0 && !selectedChatId) setSelectedChatId(data[0].id);
    };
    fetchChats();
    const interval = setInterval(fetchChats, 3000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (!selectedChatId) return;
    const fetchMessages = async () => {
      const res = await fetch(`/api/messages?chatId=${selectedChatId}`);
      const data = await res.json();
      setMessages(data);
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStart = async () => {
    if (!inputName.trim()) return;
    const trimmed = inputName.trim();
    const id = crypto.randomUUID();
    await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: trimmed, userId: id }),
    });
    localStorage.setItem("userId", id);
    localStorage.setItem("userName", trimmed);
    setUserId(id);
    setName(trimmed);
    setSelectedChatId(id);
    setStage("chat");
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChatId) return;
    const selectedChat = chats.find(c => c.id === selectedChatId);
    if (selectedChat?.status === "closed") return;
    const text = newMessage.trim();
    setNewMessage("");
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedChatId, text, sender: "user" }),
    });
  };

  const closeTicket = async () => {
    if (!selectedChatId) return;
    await fetch("/api/chats/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedChatId, status: "closed" }),
    });
    setConfirmClose(false);
  };

  const openNewTicket = async () => {
    if (!userId || !name) return;
    const id = crypto.randomUUID();
    await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, userId }),
    });
    setSelectedChatId(id);
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); action(); }
  };

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const isClosed = selectedChat?.status === "closed";

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (stage === "welcome") return (
    <div style={styles.center}>
      <h1 style={styles.title}>Welcome to Cold Email Help!</h1>
      <p style={styles.subtitle}>Get personalized advice on cold emailing professors for research opportunities.</p>
      <button style={styles.btn} onClick={() => setStage("name")}>Get Started</button>
    </div>
  );

  if (stage === "name") return (
    <div style={styles.center}>
      <h2 style={styles.title}>What's your first name?</h2>
      <input
        style={styles.input}
        type="text"
        placeholder="Your first name"
        value={inputName}
        onChange={(e) => setInputName(e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, handleStart)}
        autoFocus
      />
      <button style={styles.btn} onClick={handleStart}>Next →</button>
    </div>
  );

  return (
    <div style={styles.wrap}>
      {/* Confirm close modal */}
      {confirmClose && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Close this ticket?</h3>
            <p style={styles.modalText}>You won't be able to send more messages in this ticket. You can open a new one anytime.</p>
            <div style={styles.modalBtns}>
              <button style={styles.modalCancel} onClick={() => setConfirmClose(false)}>Cancel</button>
              <button style={styles.modalConfirm} onClick={closeTicket}>Close Ticket</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span>My Tickets</span>
          <button style={styles.newTicketBtn} onClick={openNewTicket}>+ New</button>
        </div>
        {chats.map((chat, i) => {
          const hasAdminReply = chat.last_sender === "admin";
          return (
            <div
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              style={{ ...styles.ticketItem, background: selectedChatId === chat.id ? "#1a1a1a" : "transparent" }}
            >
              <div style={styles.ticketItemTop}>
                <span style={styles.ticketLabel}>Ticket #{chats.length - i}</span>
                <div style={{ display:"flex", gap:"5px", alignItems:"center" }}>
                  {hasAdminReply && <span style={styles.repliedDot} title="Admin replied" />}
                  <span style={{ ...styles.statusDot, background: chat.status === "closed" ? "#ef4444" : "#f97316" }} />
                </div>
              </div>
              <span style={styles.ticketPreview}>{chat.last_message?.slice(0, 35) || "No messages yet"}</span>
            </div>
          );
        })}
      </div>

      {/* Main area */}
      <div style={styles.main}>
        {!selectedChatId ? (
          <div style={styles.empty}>Select a ticket</div>
        ) : (
          <>
            <div style={styles.chatHeader}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <span style={{ ...styles.statusDotSm, background: isClosed ? "#ef4444" : "#22c55e" }} />
                <span>{isClosed ? "Ticket Closed" : "Cold Email Help"}</span>
              </div>
              <span style={styles.statusLabel}>{isClosed ? "Closed" : "Open"}</span>
            </div>

            <div style={styles.messages}>
              <div style={styles.introMsg}>
                Hi {name}! 👋 Ask me anything about cold emailing professors — how to get started, what to write, how to follow up, anything.
              </div>
              {messages.map((m) => (
                <div key={m.id} style={{ display:"flex", flexDirection:"column", alignItems: m.sender === "user" ? "flex-end" : "flex-start", gap:"3px" }}>
                  <div style={m.sender === "user" ? styles.userMsg : styles.adminMsg}>
                    {m.text}
                  </div>
                  <span style={styles.timestamp}>{formatTime(m.created_at)}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {isClosed ? (
              <div style={styles.closedBanner}>
                This ticket is closed.
                <button style={styles.openNewBtn} onClick={openNewTicket}>Open New Ticket</button>
              </div>
            ) : (
              <div style={styles.inputRow}>
                <textarea
                  style={styles.chatInput}
                  placeholder="Type your question..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, sendMessage)}
                  rows={1}
                />
                <button style={styles.closeBtn} onClick={() => setConfirmClose(true)}>Close Ticket</button>
                <button style={styles.sendBtn} onClick={sendMessage}>Send</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  center: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:"24px", padding:"24px" },
  title: { fontSize:"2rem", fontWeight:"700", textAlign:"center", letterSpacing:"-0.5px" },
  subtitle: { color:"#888", fontSize:"1rem", textAlign:"center", maxWidth:"400px" },
  btn: { background:"#fff", color:"#000", border:"none", padding:"12px 32px", borderRadius:"8px", fontSize:"1rem", fontWeight:"600", cursor:"pointer" },
  input: { background:"#111", border:"1px solid #333", color:"#fff", padding:"12px 16px", borderRadius:"8px", fontSize:"1rem", width:"100%", maxWidth:"320px", outline:"none" },
  wrap: { display:"flex", height:"100vh", background:"#000" },
  sidebar: { width:"220px", borderRight:"1px solid #222", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" },
  sidebarHeader: { padding:"16px", fontWeight:"700", fontSize:"0.95rem", borderBottom:"1px solid #222", display:"flex", justifyContent:"space-between", alignItems:"center" },
  newTicketBtn: { background:"#222", color:"#fff", border:"none", padding:"4px 10px", borderRadius:"6px", fontSize:"0.8rem", cursor:"pointer" },
  ticketItem: { padding:"12px 16px", cursor:"pointer", borderBottom:"1px solid #111", display:"flex", flexDirection:"column", gap:"4px" },
  ticketItemTop: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  ticketLabel: { fontWeight:"600", fontSize:"0.85rem", color:"#ccc" },
  statusDot: { width:"10px", height:"10px", borderRadius:"50%", flexShrink:0, display:"inline-block" },
  statusDotSm: { width:"8px", height:"8px", borderRadius:"50%", display:"inline-block" },
  repliedDot: { width:"8px", height:"8px", borderRadius:"50%", background:"#22c55e", display:"inline-block" },
  ticketPreview: { color:"#555", fontSize:"0.78rem", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  main: { flex:1, display:"flex", flexDirection:"column" },
  empty: { margin:"auto", color:"#444", fontSize:"0.95rem" },
  chatHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid #222", fontWeight:"600" },
  statusLabel: { fontSize:"0.75rem", color:"#555", fontWeight:"400" },
  messages: { flex:1, overflowY:"auto", padding:"24px 16px", display:"flex", flexDirection:"column", gap:"12px" },
  introMsg: { background:"#111", border:"1px solid #222", borderRadius:"12px", padding:"14px 16px", color:"#ccc", maxWidth:"480px", fontSize:"0.95rem", lineHeight:"1.5" },
  userMsg: { alignSelf:"flex-end", background:"#fff", color:"#000", borderRadius:"12px 12px 2px 12px", padding:"10px 14px", maxWidth:"75%", fontSize:"0.95rem", lineHeight:"1.5" },
  adminMsg: { alignSelf:"flex-start", background:"#1a1a1a", color:"#fff", border:"1px solid #2a2a2a", borderRadius:"12px 12px 12px 2px", padding:"10px 14px", maxWidth:"75%", fontSize:"0.95rem", lineHeight:"1.5" },
  timestamp: { fontSize:"0.7rem", color:"#444" },
  inputRow: { display:"flex", gap:"10px", padding:"16px", borderTop:"1px solid #222", alignItems:"flex-end" },
  chatInput: { flex:1, background:"#111", border:"1px solid #333", color:"#fff", padding:"12px 14px", borderRadius:"8px", fontSize:"0.95rem", outline:"none", resize:"none", lineHeight:"1.5" },
  closeBtn: { background:"transparent", color:"#ef4444", border:"1px solid #ef4444", padding:"10px 14px", borderRadius:"8px", fontWeight:"600", cursor:"pointer", whiteSpace:"nowrap", fontSize:"0.85rem" },
  sendBtn: { background:"#fff", color:"#000", border:"none", padding:"12px 20px", borderRadius:"8px", fontWeight:"600", cursor:"pointer" },
  closedBanner: { padding:"16px", borderTop:"1px solid #222", display:"flex", alignItems:"center", gap:"16px", color:"#666", fontSize:"0.9rem" },
  openNewBtn: { background:"#fff", color:"#000", border:"none", padding:"8px 16px", borderRadius:"8px", fontWeight:"600", cursor:"pointer", fontSize:"0.85rem" },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modal: { background:"#111", border:"1px solid #333", borderRadius:"12px", padding:"28px", maxWidth:"360px", width:"90%", display:"flex", flexDirection:"column", gap:"16px" },
  modalTitle: { fontSize:"1.1rem", fontWeight:"700" },
  modalText: { color:"#888", fontSize:"0.9rem", lineHeight:"1.5" },
  modalBtns: { display:"flex", gap:"10px", justifyContent:"flex-end" },
  modalCancel: { background:"#222", color:"#fff", border:"none", padding:"10px 20px", borderRadius:"8px", cursor:"pointer", fontWeight:"600" },
  modalConfirm: { background:"#ef4444", color:"#fff", border:"none", padding:"10px 20px", borderRadius:"8px", cursor:"pointer", fontWeight:"600" },
};