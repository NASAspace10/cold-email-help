"use client";
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [stage, setStage] = useState("welcome");
  const [name, setName] = useState("");
  const [inputName, setInputName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
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
    const fetchMessages = async () => {
      const res = await fetch(`/api/messages?chatId=${userId}`);
      const data = await res.json();
      setMessages(data);
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [userId]);

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
      body: JSON.stringify({ id, name: trimmed }),
    });
    localStorage.setItem("userId", id);
    localStorage.setItem("userName", trimmed);
    setUserId(id);
    setName(trimmed);
    setStage("chat");
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const text = newMessage.trim();
    setNewMessage("");
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: userId, text, sender: "user" }),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); action(); }
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
    <div style={styles.chatWrap}>
      <div style={styles.chatHeader}>
        <span style={styles.dot} />
        <span>Cold Email Help</span>
      </div>
      <div style={styles.messages}>
        <div style={styles.introMsg}>
          Hi {name}! 👋 Ask me anything about cold emailing professors — how to get started, what to write, how to follow up, anything.
        </div>
        {messages.map((m) => (
          <div key={m.id} style={m.sender === "user" ? styles.userMsg : styles.adminMsg}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={styles.inputRow}>
        <textarea
          style={styles.chatInput}
          placeholder="Type your question..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, sendMessage)}
          rows={1}
        />
        <button style={styles.sendBtn} onClick={sendMessage}>Send</button>
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
  chatWrap: { display:"flex", flexDirection:"column", height:"100vh" },
  chatHeader: { display:"flex", alignItems:"center", gap:"8px", padding:"16px 20px", borderBottom:"1px solid #222", fontWeight:"600" },
  dot: { width:"8px", height:"8px", borderRadius:"50%", background:"#22c55e", display:"inline-block" },
  messages: { flex:1, overflowY:"auto", padding:"24px 16px", display:"flex", flexDirection:"column", gap:"12px" },
  introMsg: { background:"#111", border:"1px solid #222", borderRadius:"12px", padding:"14px 16px", color:"#ccc", maxWidth:"480px", fontSize:"0.95rem", lineHeight:"1.5" },
  userMsg: { alignSelf:"flex-end", background:"#fff", color:"#000", borderRadius:"12px 12px 2px 12px", padding:"10px 14px", maxWidth:"75%", fontSize:"0.95rem", lineHeight:"1.5" },
  adminMsg: { alignSelf:"flex-start", background:"#1a1a1a", color:"#fff", border:"1px solid #2a2a2a", borderRadius:"12px 12px 12px 2px", padding:"10px 14px", maxWidth:"75%", fontSize:"0.95rem", lineHeight:"1.5" },
  inputRow: { display:"flex", gap:"10px", padding:"16px", borderTop:"1px solid #222", alignItems:"flex-end" },
  chatInput: { flex:1, background:"#111", border:"1px solid #333", color:"#fff", padding:"12px 14px", borderRadius:"8px", fontSize:"0.95rem", outline:"none", resize:"none", lineHeight:"1.5" },
  sendBtn: { background:"#fff", color:"#000", border:"none", padding:"12px 20px", borderRadius:"8px", fontWeight:"600", cursor:"pointer" },
};