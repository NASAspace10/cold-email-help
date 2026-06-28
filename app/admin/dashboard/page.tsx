"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [chats, setChats] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem("adminAuth") !== "true") router.push("/admin");
    const saved = localStorage.getItem("adminSeenCounts");
    if (saved) setSeenCounts(JSON.parse(saved));
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
    const updated = { ...seenCounts, [id]: data.length };
    setSeenCounts(updated);
    localStorage.setItem("adminSeenCounts", JSON.stringify(updated));
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

  const toggleStatus = async (chat: any) => {
    const newStatus = chat.status === "closed" ? "open" : "closed";
    await fetch("/api/chats/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id, status: newStatus }),
    });
    fetchChats();
  };

  const formatTime = (ts: string) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasNewMessage = (chat: any) => {
    const seen = seenCounts[chat.id] ?? 0;
    return chat.last_sender === "user" && (chat.message_count ?? 0) > seen;
  };

  const selectedChat = chats.find((c) => c.id === selectedId);
  const filtered = chats.filter(c => filter === "all" ? true : c.status === filter);
  const openCount = chats.filter(c => c.status !== "closed").length;

  return (
    <div style={styles.wrap}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <span style={styles.sidebarTitle}>Tickets</span>
          {openCount > 0 && <span style={styles.inboxCount}>{openCount} open</span>}
        </div>
        <div style={styles.filterRow}>
          {(["all", "open", "closed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...styles.filterBtn, background: filter === f ? "#fff" : "transparent", color: filter === f ? "#000" : "#666" }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {filtered.map((chat) => {
          const isNew = hasNewMessage(chat);
          return (
            <div key={chat.id} onClick={() => selectChat(chat)}
              style={{ ...styles.chatItem, background: selectedId === chat.id ? "#1a1a1a" : "transparent" }}>
              <div style={styles.chatItemTop}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span style={styles.chatName}>{chat.name}</span>
                  {isNew && <span style={styles.newBadge}>New</span>}
                </div>
                <span style={{ ...styles.statusDot, background: chat.status === "closed" ? "#ef4444" : "#22c55e" }} />
              </div>
              <span style={styles.lastMsg}>{chat.last_message?.slice(0, 40) || "No messages yet"}</span>
            </div>
          );
        })}
      </div>

      <div style={styles.main}>
        {!selectedId ? (
          <div style={styles.empty}>Select a ticket to view messages</div>
        ) : (
          <>
            <div style={styles.chatHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ ...styles.statusDotSm, background: selectedChat?.status === "closed" ? "#ef4444" : "#22c55e" }} />
                <span>{selectedChat?.name}</span>
              </div>
              <button onClick={() => toggleStatus(selectedChat)}
                style={{ ...styles.toggleBtn, borderColor: selectedChat?.status === "closed" ? "#22c55e" : "#ef4444", color: selectedChat?.status === "closed" ? "#22c55e" : "#ef4444" }}>
                {selectedChat?.status === "closed" ? "Reopen" : "Close"}
              </button>
            </div>
            <div style={styles.messages}>
              {messages.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.sender === "admin" ? "flex-end" : "flex-start", gap: "3px" }}>
                  <div style={m.sender === "user" ? styles.userMsg : styles.adminMsg}>{m.text}</div>
                  <span style={styles.timestamp}>{formatTime(m.created_at)}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div style={styles.inputRow}>
              <textarea
                style={{ ...styles.chatInput, opacity: selectedChat?.status === "closed" ? 0.4 : 1 }}
                placeholder={selectedChat?.status === "closed" ? "Ticket is closed" : `Reply to ${selectedChat?.name}...`}
                value={reply}
                disabled={selectedChat?.status === "closed"}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                rows={1}
              />
              <button style={{ ...styles.sendBtn, opacity: selectedChat?.status === "closed" ? 0.4 : 1 }}
                onClick={sendReply} disabled={selectedChat?.status === "closed"}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", height: "100vh", background: "#000" },
  sidebar: { width: "280px", borderRight: "1px solid #222", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" as const },
  sidebarTop: { padding: "20px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  sidebarTitle: { fontWeight: "700", fontSize: "1rem" },
  inboxCount: { background: "#22c55e", color: "#000", fontSize: "0.72rem", fontWeight: "700", padding: "3px 8px", borderRadius: "20px" },
  filterRow: { display: "flex", gap: "4px", padding: "8px 12px 12px", borderBottom: "1px solid #222" },
  filterBtn: { border: "1px solid #333", padding: "4px 10px", borderRadius: "6px", fontSize: "0.78rem", cursor: "pointer", fontWeight: "600" },
  chatItem: { padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid #111", display: "flex", flexDirection: "column", gap: "4px" },
  chatItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  chatName: { fontWeight: "600", fontSize: "0.95rem" },
  newBadge: { background: "#22c55e", color: "#000", fontSize: "0.65rem", fontWeight: "700", padding: "2px 6px", borderRadius: "20px" },
  statusDot: { width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0 },
  statusDotSm: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  lastMsg: { color: "#666", fontSize: "0.8rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  main: { flex: 1, display: "flex", flexDirection: "column" },
  empty: { margin: "auto", color: "#444", fontSize: "0.95rem" },
  chatHeader: { padding: "16px 20px", borderBottom: "1px solid #222", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" },
  toggleBtn: { background: "transparent", border: "1px solid", padding: "5px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer", fontWeight: "600" },
  messages: { flex: 1, overflowY: "auto" as const, padding: "24px 16px", display: "flex", flexDirection: "column", gap: "12px" },
  userMsg: { background: "#111", color: "#fff", border: "1px solid #222", borderRadius: "12px 12px 12px 2px", padding: "10px 14px", maxWidth: "70%", fontSize: "0.9rem", lineHeight: "1.5" },
  adminMsg: { background: "#fff", color: "#000", borderRadius: "12px 12px 2px 12px", padding: "10px 14px", maxWidth: "70%", fontSize: "0.9rem", lineHeight: "1.5" },
  timestamp: { fontSize: "0.7rem", color: "#444" },
  inputRow: { display: "flex", gap: "10px", padding: "16px", borderTop: "1px solid #222", alignItems: "flex-end" },
  chatInput: { flex: 1, background: "#111", border: "1px solid #333", color: "#fff", padding: "12px 14px", borderRadius: "8px", fontSize: "0.95rem", outline: "none", resize: "none" as const, lineHeight: "1.5" },
  sendBtn: { background: "#fff", color: "#000", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" },
};