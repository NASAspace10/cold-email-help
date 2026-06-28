"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [chats, setChats] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem("adminAuth") !== "true") router.push("/admin");
  }, []);

  const fetchChats = async () => {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data);
  };

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchMessages = async (id: string) => {
    const res = await fetch(`/api/messages?chatId=${id}`);
    const data = await res.json();
    setMessages(data);
  };

  useEffect(() => {
    if (!selectedId) return;
    fetchMessages(selectedId);
    const interval = setInterval(() => fetchMessages(selectedId), 3000);
    return () => clearInterval(interval);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectChat = async (chat: any) => {
    setSelectedId(chat.id);
    await fetch("/api/chats/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id }),
    });
  };

  const sendReply = async () => {
    if (!reply.trim() || !selectedId) return;
    const text = reply.trim();
    setReply("");
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, text, sender: "admin" }),
    });
    fetchMessages(selectedId);
  };

  const selectedChat = chats.find((c) => c.id === selectedId);

  return (
    <div style={styles.wrap}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>Tickets</div>
        {chats.map((chat) => (
          <div key={chat.id} onClick={() => selectChat(chat)}
            style={{ ...styles.chatItem, background: selectedId === chat.id ? "#1a1a1a" : "transparent" }}>
            <div style={styles.chatItemTop}>
              <span style={styles.chatName}>{chat.name}</span>
              {chat.status === "closed"
              ? <span style={{ ...styles.unreadDot, background: "#ef4444" }} />
              : chat.has_unread && <span style={styles.unreadDot} />}
            </div>
            <span style={styles.lastMsg}>{chat.last_message?.slice(0, 40) || "No messages yet"}</span>
          </div>
        ))}
      </div>
      <div style={styles.main}>
        {!selectedId ? (
          <div style={styles.empty}>Select a chat to view messages</div>
        ) : (
          <>
            <div style={styles.chatHeader}>{selectedChat?.name}</div>
            <div style={styles.messages}>
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
                placeholder={`Reply to ${selectedChat?.name}...`}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }}}
                rows={1}
              />
              <button style={styles.sendBtn} onClick={sendReply}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display:"flex", height:"100vh", background:"#000" },
  sidebar: { width:"280px", borderRight:"1px solid #222", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" },
  sidebarHeader: { padding:"20px 16px", fontWeight:"700", fontSize:"1rem", borderBottom:"1px solid #222" },
  chatItem: { padding:"14px 16px", cursor:"pointer", borderBottom:"1px solid #111", display:"flex", flexDirection:"column", gap:"4px" },
  chatItemTop: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  chatName: { fontWeight:"600", fontSize:"0.95rem" },
  unreadDot: { width:"10px", height:"10px", borderRadius:"50%", background:"#f97316", flexShrink:0 },
  lastMsg: { color:"#666", fontSize:"0.8rem", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  main: { flex:1, display:"flex", flexDirection:"column" },
  empty: { margin:"auto", color:"#444", fontSize:"0.95rem" },
  chatHeader: { padding:"16px 20px", borderBottom:"1px solid #222", fontWeight:"600" },
  messages: { flex:1, overflowY:"auto", padding:"24px 16px", display:"flex", flexDirection:"column", gap:"12px" },
  userMsg: { alignSelf:"flex-end", background:"#fff", color:"#000", borderRadius:"12px 12px 2px 12px", padding:"10px 14px", maxWidth:"70%", fontSize:"0.9rem", lineHeight:"1.5" },
  adminMsg: { alignSelf:"flex-start", background:"#1a1a1a", color:"#fff", border:"1px solid #2a2a2a", borderRadius:"12px 12px 12px 2px", padding:"10px 14px", maxWidth:"70%", fontSize:"0.9rem", lineHeight:"1.5" },
  inputRow: { display:"flex", gap:"10px", padding:"16px", borderTop:"1px solid #222", alignItems:"flex-end" },
  chatInput: { flex:1, background:"#111", border:"1px solid #333", color:"#fff", padding:"12px 14px", borderRadius:"8px", fontSize:"0.95rem", outline:"none", resize:"none", lineHeight:"1.5" },
  sendBtn: { background:"#fff", color:"#000", border:"none", padding:"12px 20px", borderRadius:"8px", fontWeight:"600", cursor:"pointer" },
};