"use client";
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [stage, setStage] = useState("loading");
  const [name, setName] = useState("");
  const [inputName, setInputName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [seenMessages, setSeenMessages] = useState<Record<string, number>>({});
  const [pendingQ, setPendingQ] = useState<any>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("seenMessages");
    if (saved) setSeenMessages(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const savedId = localStorage.getItem("userId");
    const savedName = localStorage.getItem("userName");
    if (savedId && savedName) {
      setUserId(savedId);
      setName(savedName);
      setStage("home");
    } else {
      setStage("welcome");
    }
  }, []);

  useEffect(() => {
    if (!userId || (stage !== "tickets" && stage !== "home")) return;
    const fetchChats = async () => {
      const res = await fetch(`/api/chats?userId=${userId}`);
      const data = await res.json();
      setChats(data);
    };
    fetchChats();
    const interval = setInterval(fetchChats, 3000);
    return () => clearInterval(interval);
  }, [userId, stage]);

  useEffect(() => {
    if (stage === "tickets" && chats.length > 0 && !selectedChatId) {
      setSelectedChatId(chats[0].id);
    }
  }, [stage, chats]);

  useEffect(() => {
    if (!selectedChatId) return;
    const fetchMessages = async () => {
      const res = await fetch(`/api/messages?chatId=${selectedChatId}`);
      const data = await res.json();
      setMessages(data);
      const updated = { ...seenMessages, [selectedChatId]: data.length };
      setSeenMessages(updated);
      localStorage.setItem("seenMessages", JSON.stringify(updated));
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedChatId]);

  // Check for pending questionnaire
  useEffect(() => {
    if (!selectedChatId) return;
    const checkQ = async () => {
      const res = await fetch(`/api/questionnaire?chatId=${selectedChatId}`);
      const data = await res.json();
      if (data) {
        setPendingQ(data);
        setAnswers(new Array(data.questions.length).fill(""));
      } else {
        setPendingQ(null);
      }
    };
    checkQ();
    const interval = setInterval(checkQ, 4000);
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
    setStage("tickets");
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

  const submitQuestionnaire = async () => {
    if (!selectedChatId || !pendingQ) return;
    const formatted = pendingQ.questions.map((q: any, i: number) => ({
      question: q.question,
      answer: answers[i] || "(no answer)",
    }));
    await fetch("/api/questionnaire", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedChatId, answers: formatted }),
    });
    setPendingQ(null);
    setAnswers([]);
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
    setPendingQ(null);
    setStage("tickets");
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); action(); }
  };

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const isClosed = selectedChat?.status === "closed";

  const formatTime = (ts: string) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasNewMessage = (chat: any) => {
    const seen = seenMessages[chat.id] ?? 0;
    return chat.last_sender === "admin" && (chat.message_count ?? 0) > seen;
  };

  const renderMessage = (m: any) => {
    const isQ = m.text?.startsWith("📋");
    return (
      <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.sender === "user" ? "flex-end" : "flex-start", gap: "3px" }}>
        <div style={isQ ? styles.questionnaireMsg : m.sender === "user" ? styles.userMsg : styles.adminMsg}>
          {isQ
            ? m.text.split("\n").map((line: string, i: number) => (
              <div key={i} style={{ lineHeight: "1.7", fontWeight: line.match(/^\d+\./) ? "600" : line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "700" : "400", color: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "#fff" : line.startsWith("   →") ? "#22c55e" : "#ccc", fontSize: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "0.88rem" : "0.83rem" }}>{line || "\u00A0"}</div>
            ))
            : m.text}
        </div>
        <span style={styles.timestamp}>{formatTime(m.created_at)}</span>
      </div>
    );
  };

  if (stage === "loading") return <div style={{ background: "#000", height: "100vh" }} />;

  if (stage === "welcome") return (
    <div style={styles.homePage}>
      <div style={styles.homeNav}><span style={styles.logo}>Cold Email Help</span></div>
      <div style={styles.homeHero}>
        <h1 style={styles.homeTitle}>Get help cold emailing professors</h1>
        <p style={styles.homeSubtitle}>Personal advice on reaching out to professors for research opportunities — from someone who figured it out the hard way.</p>
        <button style={styles.homeBtn} onClick={() => setStage("name")}>Get Started</button>
      </div>
    </div>
  );

  if (stage === "home") return (
    <div style={styles.homePage}>
      <div style={styles.homeNav}><span style={styles.logo}>Cold Email Help</span></div>
      <div style={styles.homeHero}>
        <h1 style={styles.homeTitle}>Welcome back, {name}!</h1>
        <p style={styles.homeSubtitle}>What would you like to do?</p>
        <div style={styles.homeBtnRow}>
          <button style={styles.homeBtn} onClick={() => setStage("tickets")}>View My Tickets</button>
          <button style={styles.homeBtnOutline} onClick={openNewTicket}>Open New Ticket</button>
        </div>
      </div>
    </div>
  );

  if (stage === "name") return (
    <div style={styles.center}>
      <h2 style={styles.title}>What's your first name?</h2>
      <input style={styles.input} type="text" placeholder="Your first name" value={inputName}
        onChange={(e) => setInputName(e.target.value)} onKeyDown={(e) => handleKeyDown(e, handleStart)} autoFocus />
      <button style={styles.btn} onClick={handleStart}>Next →</button>
    </div>
  );

  return (
    <div style={styles.wrap}>
      {confirmClose && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Close this ticket?</h3>
            <p style={styles.modalText}>You won't be able to send more messages. You can open a new ticket anytime.</p>
            <div style={styles.modalBtns}>
              <button style={styles.modalCancel} onClick={() => setConfirmClose(false)}>Cancel</button>
              <button style={styles.modalConfirm} onClick={closeTicket}>Close Ticket</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending questionnaire overlay */}
      {pendingQ && !isClosed && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, maxWidth: "480px", maxHeight: "85vh", overflowY: "auto" as const }}>
            <h3 style={styles.modalTitle}>📋 You have a questionnaire</h3>
            <p style={styles.modalText}>Please answer the following to help get better advice.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {pendingQ.questions.map((q: any, i: number) => (
                <div key={i} style={styles.qItem}>
                  <label style={styles.qLabel}>{i + 1}. {q.question}</label>
                  {q.type === "multiple" ? (
                    <div style={styles.qOptions}>
                      {q.options.filter((o: string) => o.trim()).map((opt: string, oi: number) => (
                        <button key={oi}
                          onClick={() => { const a = [...answers]; a[i] = opt; setAnswers(a); }}
                          style={{ ...styles.qOption, background: answers[i] === opt ? "#fff" : "#111", color: answers[i] === opt ? "#000" : "#fff", borderColor: answers[i] === opt ? "#fff" : "#333" }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      style={styles.qTextarea}
                      placeholder="Your answer..."
                      value={answers[i] || ""}
                      onChange={(e) => { const a = [...answers]; a[i] = e.target.value; setAnswers(a); }}
                      rows={2}
                    />
                  )}
                </div>
              ))}
            </div>
            <button style={styles.sendQBtn} onClick={submitQuestionnaire}>Submit Answers</button>
          </div>
        </div>
      )}

      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <button style={styles.logoBtn} onClick={() => setStage("home")}>Cold Email Help</button>
          <button style={styles.newTicketBtn} onClick={openNewTicket}>+ New</button>
        </div>
        {chats.map((chat, i) => {
          const isNew = hasNewMessage(chat);
          return (
            <div key={chat.id} onClick={() => setSelectedChatId(chat.id)}
              style={{ ...styles.ticketItem, background: selectedChatId === chat.id ? "#1a1a1a" : "transparent" }}>
              <div style={styles.ticketItemTop}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span style={styles.ticketLabel}>Ticket #{chats.length - i}</span>
                  {isNew && <span style={styles.newBadge}>New</span>}
                </div>
                <span style={{ ...styles.statusDot, background: chat.status === "closed" ? "#ef4444" : "#22c55e" }} />
              </div>
              <span style={styles.ticketPreview}>{chat.last_message?.slice(0, 35) || "No messages yet"}</span>
            </div>
          );
        })}
      </div>

      <div style={styles.main}>
        {!selectedChatId ? (
          <div style={styles.empty}>Select a ticket</div>
        ) : (
          <>
            <div style={styles.chatHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ ...styles.statusDotSm, background: isClosed ? "#ef4444" : "#22c55e" }} />
                <div>
                  <div style={{ fontWeight: "700", fontSize: "0.95rem" }}>{isClosed ? "Ticket Closed" : "Cold Email Help"}</div>
                  <div style={{ fontSize: "0.72rem", color: "#444", marginTop: "1px" }}>{isClosed ? "Closed" : "Open"}</div>
                </div>
              </div>
            </div>
            <div style={styles.messages}>
              <div style={styles.introMsg}>
                Hi {name}! 👋 Ask me anything about cold emailing professors — how to get started, what to write, how to follow up, anything.
              </div>
              {messages.map(renderMessage)}
              <div ref={bottomRef} />
            </div>
            {isClosed ? (
              <div style={styles.closedBanner}>
                This ticket is closed.
                <button style={styles.openNewBtn} onClick={openNewTicket}>Open New Ticket</button>
              </div>
            ) : (
              <div style={styles.inputRow}>
                <textarea style={styles.chatInput} placeholder="Type your question..." value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, sendMessage)} rows={1} />
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
  homePage: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#000" },
  homeNav: { padding: "20px 32px", borderBottom: "1px solid #1a1a1a" },
  logo: { fontWeight: "700", fontSize: "1rem", color: "#fff" },
  logoBtn: { fontWeight: "700", fontSize: "0.9rem", color: "#fff", background: "none", border: "none", cursor: "pointer", padding: 0 },
  homeHero: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "48px 24px", textAlign: "center" as const },
  homeTitle: { fontSize: "2.2rem", fontWeight: "700", letterSpacing: "-0.5px", maxWidth: "500px", lineHeight: "1.2" },
  homeSubtitle: { color: "#666", fontSize: "1rem", maxWidth: "420px", lineHeight: "1.6" },
  homeBtn: { background: "#fff", color: "#000", border: "none", padding: "13px 32px", borderRadius: "8px", fontSize: "1rem", fontWeight: "600", cursor: "pointer" },
  homeBtnOutline: { background: "transparent", color: "#fff", border: "1px solid #333", padding: "13px 32px", borderRadius: "8px", fontSize: "1rem", fontWeight: "600", cursor: "pointer" },
  homeBtnRow: { display: "flex", gap: "12px", flexWrap: "wrap" as const, justifyContent: "center" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "24px", padding: "24px" },
  title: { fontSize: "2rem", fontWeight: "700", textAlign: "center" as const },
  btn: { background: "#fff", color: "#000", border: "none", padding: "12px 32px", borderRadius: "8px", fontSize: "1rem", fontWeight: "600", cursor: "pointer" },
  input: { background: "#111", border: "1px solid #333", color: "#fff", padding: "12px 16px", borderRadius: "8px", fontSize: "1rem", width: "100%", maxWidth: "320px", outline: "none" },
  wrap: { display: "flex", height: "100vh", background: "#000" },
  sidebar: { width: "220px", borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" as const },
  sidebarHeader: { padding: "16px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" },
  newTicketBtn: { background: "#1a1a1a", color: "#fff", border: "none", padding: "4px 10px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" },
  ticketItem: { padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #111", display: "flex", flexDirection: "column", gap: "4px" },
  ticketItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  ticketLabel: { fontWeight: "600", fontSize: "0.85rem", color: "#ccc" },
  newBadge: { background: "#22c55e", color: "#000", fontSize: "0.62rem", fontWeight: "700", padding: "2px 6px", borderRadius: "20px" },
  statusDot: { width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  statusDotSm: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  ticketPreview: { color: "#555", fontSize: "0.78rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  empty: { margin: "auto", color: "#444", fontSize: "0.95rem" },
  chatHeader: { padding: "14px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
  messages: { flex: 1, overflowY: "auto" as const, padding: "24px 16px", display: "flex", flexDirection: "column", gap: "14px" },
  introMsg: { background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: "12px", padding: "14px 16px", color: "#888", maxWidth: "480px", fontSize: "0.9rem", lineHeight: "1.6" },
  userMsg: { alignSelf: "flex-end" as const, background: "#fff", color: "#000", borderRadius: "12px 12px 2px 12px", padding: "10px 14px", maxWidth: "75%", fontSize: "0.92rem", lineHeight: "1.6" },
  adminMsg: { alignSelf: "flex-start" as const, background: "#111", color: "#fff", border: "1px solid #1e1e1e", borderRadius: "12px 12px 12px 2px", padding: "10px 14px", maxWidth: "75%", fontSize: "0.92rem", lineHeight: "1.6" },
  questionnaireMsg: { background: "#0a140a", border: "1px solid #1a301a", borderRadius: "12px", padding: "14px 16px", maxWidth: "85%", fontSize: "0.88rem" },
  timestamp: { fontSize: "0.68rem", color: "#333" },
  inputRow: { display: "flex", gap: "10px", padding: "14px 16px", borderTop: "1px solid #1a1a1a", alignItems: "flex-end", flexShrink: 0 },
  chatInput: { flex: 1, background: "#0a0a0a", border: "1px solid #222", color: "#fff", padding: "12px 14px", borderRadius: "8px", fontSize: "0.92rem", outline: "none", resize: "none" as const, lineHeight: "1.5" },
  closeBtn: { background: "transparent", color: "#ef4444", border: "1px solid #ef4444", padding: "10px 14px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" as const, fontSize: "0.82rem" },
  sendBtn: { background: "#fff", color: "#000", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" },
  closedBanner: { padding: "16px", borderTop: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "16px", color: "#555", fontSize: "0.9rem" },
  openNewBtn: { background: "#fff", color: "#000", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer", fontSize: "0.85rem" },
  modalOverlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#0d0d0d", border: "1px solid #222", borderRadius: "14px", padding: "28px", maxWidth: "400px", width: "90%", display: "flex", flexDirection: "column", gap: "16px" },
  modalTitle: { fontSize: "1.1rem", fontWeight: "700" },
  modalText: { color: "#666", fontSize: "0.88rem", lineHeight: "1.5" },
  modalBtns: { display: "flex", gap: "10px", justifyContent: "flex-end" },
  modalCancel: { background: "#1a1a1a", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  modalConfirm: { background: "#ef4444", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  qItem: { display: "flex", flexDirection: "column" as const, gap: "10px" },
  qLabel: { color: "#ddd", fontSize: "0.9rem", lineHeight: "1.5", fontWeight: "600" },
  qOptions: { display: "flex", flexWrap: "wrap" as const, gap: "8px" },
  qOption: { border: "1px solid", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "0.88rem", fontWeight: "600", transition: "all 0.1s" },
  qTextarea: { background: "#111", border: "1px solid #2a2a2a", color: "#fff", padding: "10px 12px", borderRadius: "8px", fontSize: "0.88rem", outline: "none", resize: "none" as const, lineHeight: "1.5" },
  sendQBtn: { background: "#fff", color: "#000", border: "none", padding: "12px", borderRadius: "8px", fontWeight: "700", cursor: "pointer", fontSize: "0.92rem" },
};