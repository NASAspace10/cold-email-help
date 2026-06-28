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
  // Use a ref to hold answers so polling doesn't clear them
  const answersRef = useRef<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingQRef = useRef<any>(null);

  const setAnswersSafe = (vals: string[]) => {
    answersRef.current = vals;
    setAnswers(vals);
  };

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

  // Questionnaire polling — only updates if no answers have been entered yet
  useEffect(() => {
    if (!selectedChatId) return;
    const checkQ = async () => {
      const res = await fetch(`/api/questionnaire?chatId=${selectedChatId}`);
      const data = await res.json();
      if (data) {
        // Only set if we don't already have this questionnaire loaded
        if (!pendingQRef.current || pendingQRef.current.id !== data.id) {
          pendingQRef.current = data;
          setPendingQ(data);
          const blank = new Array(data.questions.length).fill("");
          answersRef.current = blank;
          setAnswers(blank);
        }
      } else {
        pendingQRef.current = null;
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
    const currentAnswers = answersRef.current;
    const formatted = pendingQ.questions.map((q: any, i: number) => ({
      question: q.question,
      answer: currentAnswers[i] || "(no answer)",
    }));
    await fetch("/api/questionnaire", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedChatId, answers: formatted }),
    });
    pendingQRef.current = null;
    setPendingQ(null);
    setAnswersSafe([]);
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
    pendingQRef.current = null;
    setStage("tickets");
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); action(); }
  };

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const isClosed = selectedChat?.status === "closed";

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasNewMessage = (chat: any) => {
    const seen = seenMessages[chat.id] ?? 0;
    return chat.last_sender === "admin" && (chat.message_count ?? 0) > seen;
  };

  const renderMessage = (m: any) => {
    const isQ = m.text?.startsWith("📋");
    const isAdmin = m.sender === "admin";
    return (
      <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isAdmin ? "flex-start" : "flex-end", gap: "4px" }}>
        <div style={isQ ? { ...styles.questionnaireMsg, alignSelf: isAdmin ? "flex-start" : "flex-end" } : isAdmin ? styles.adminMsg : styles.userMsg}>
          {isQ
            ? m.text.split("\n").map((line: string, i: number) => (
              <div key={i} style={{
                lineHeight: "1.7",
                fontWeight: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "700" : line.match(/^\d+\./) ? "600" : "400",
                color: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "#fff" : line.startsWith("   →") ? "#4ade80" : "#aaa",
                fontSize: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "0.88rem" : "0.83rem",
              }}>{line || "\u00A0"}</div>
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
        <h1 style={styles.homeTitle}>Get help cold emailing<br />professors</h1>
        <p style={styles.homeSubtitle}>Personal advice on reaching out to professors for research opportunities — from someone who figured it out the hard way.</p>
        <button style={styles.homeBtn} onClick={() => setStage("name")}>Get Started →</button>
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
      <div style={styles.nameCard}>
        <h2 style={styles.nameTitle}>What's your first name?</h2>
        <p style={styles.nameSub}>So I know who I'm talking to.</p>
        <input style={styles.input} type="text" placeholder="Your first name" value={inputName}
          onChange={(e) => setInputName(e.target.value)} onKeyDown={(e) => handleKeyDown(e, handleStart)} autoFocus />
        <button style={styles.btn} onClick={handleStart}>Next →</button>
      </div>
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

      {pendingQ && !isClosed && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, maxWidth: "460px", maxHeight: "88vh", overflowY: "auto" as const }}>
            <div style={styles.qModalHeader}>
              <span style={styles.qModalIcon}>📋</span>
              <div>
                <h3 style={styles.modalTitle}>You have a questionnaire</h3>
                <p style={styles.modalText}>Fill this out to help me give better advice.</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {pendingQ.questions.map((q: any, i: number) => (
                <div key={i} style={styles.qItem}>
                  <label style={styles.qLabel}><span style={styles.qNum}>{i + 1}</span>{q.question}</label>
                  {q.type === "multiple" ? (
                    <div style={styles.qOptions}>
                      {q.options.filter((o: string) => o.trim()).map((opt: string, oi: number) => (
                        <button key={oi}
                          onClick={() => { const a = [...answersRef.current]; a[i] = opt; setAnswersSafe(a); }}
                          style={{ ...styles.qOption, background: answers[i] === opt ? "#fff" : "#0f0f0f", color: answers[i] === opt ? "#000" : "#ccc", borderColor: answers[i] === opt ? "#fff" : "#222" }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      style={styles.qTextarea}
                      placeholder="Your answer..."
                      value={answers[i] || ""}
                      onChange={(e) => { const a = [...answersRef.current]; a[i] = e.target.value; setAnswersSafe(a); }}
                      rows={2}
                    />
                  )}
                </div>
              ))}
            </div>
            <button style={styles.submitQBtn} onClick={submitQuestionnaire}>Submit Answers →</button>
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
              style={{ ...styles.ticketItem, background: selectedChatId === chat.id ? "#111" : "transparent" }}>
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
        ) : (<>
          <div style={styles.chatHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ ...styles.statusDotSm, background: isClosed ? "#ef4444" : "#22c55e" }} />
              <div>
                <div style={styles.chatHeaderName}>{isClosed ? "Ticket Closed" : "Cold Email Help"}</div>
                <div style={styles.chatHeaderSub}>{isClosed ? "This ticket is closed" : "Typically replies within a day"}</div>
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
              <span>This ticket is closed.</span>
              <button style={styles.openNewBtn} onClick={openNewTicket}>Open New Ticket</button>
            </div>
          ) : (
            <div style={styles.inputRow}>
              <textarea style={styles.chatInput} placeholder="Type your question..." value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, sendMessage)} rows={1} />
              <button style={styles.closeBtn} onClick={() => setConfirmClose(true)}>Close</button>
              <button style={styles.sendBtn} onClick={sendMessage}>Send</button>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  homePage: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#000" },
  homeNav: { padding: "22px 36px", borderBottom: "1px solid #111" },
  logo: { fontWeight: "700", fontSize: "0.95rem", color: "#fff", letterSpacing: "-0.2px" },
  logoBtn: { fontWeight: "700", fontSize: "0.88rem", color: "#fff", background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: "-0.2px" },
  homeHero: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "22px", padding: "60px 24px", textAlign: "center" as const },
  homeTitle: { fontSize: "2.4rem", fontWeight: "700", letterSpacing: "-0.8px", maxWidth: "480px", lineHeight: "1.15", color: "#fff" },
  homeSubtitle: { color: "#555", fontSize: "0.97rem", maxWidth: "400px", lineHeight: "1.7" },
  homeBtn: { background: "#fff", color: "#000", border: "none", padding: "13px 30px", borderRadius: "9px", fontSize: "0.95rem", fontWeight: "700", cursor: "pointer" },
  homeBtnOutline: { background: "transparent", color: "#888", border: "1px solid #222", padding: "13px 30px", borderRadius: "9px", fontSize: "0.95rem", fontWeight: "600", cursor: "pointer" },
  homeBtnRow: { display: "flex", gap: "10px", flexWrap: "wrap" as const, justifyContent: "center" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#000" },
  nameCard: { background: "#080808", border: "1px solid #1a1a1a", borderRadius: "16px", padding: "40px 36px", display: "flex", flexDirection: "column" as const, gap: "18px", width: "340px" },
  nameTitle: { fontSize: "1.3rem", fontWeight: "700", letterSpacing: "-0.3px" },
  nameSub: { color: "#444", fontSize: "0.88rem", marginTop: "-10px" },
  btn: { background: "#fff", color: "#000", border: "none", padding: "12px", borderRadius: "9px", fontSize: "0.95rem", fontWeight: "700", cursor: "pointer" },
  input: { background: "#000", border: "1px solid #222", color: "#fff", padding: "12px 14px", borderRadius: "9px", fontSize: "0.95rem", outline: "none" },
  wrap: { display: "flex", height: "100vh", background: "#000", color: "#fff" },
  sidebar: { width: "220px", borderRight: "1px solid #111", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" as const },
  sidebarHeader: { padding: "16px 14px", borderBottom: "1px solid #111", display: "flex", justifyContent: "space-between", alignItems: "center" },
  newTicketBtn: { background: "#141414", color: "#888", border: "1px solid #1e1e1e", padding: "4px 10px", borderRadius: "6px", fontSize: "0.76rem", cursor: "pointer", fontWeight: "600" },
  ticketItem: { padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #0d0d0d", display: "flex", flexDirection: "column", gap: "5px", transition: "background 0.1s" },
  ticketItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  ticketLabel: { fontWeight: "600", fontSize: "0.82rem", color: "#bbb" },
  newBadge: { background: "#22c55e", color: "#000", fontSize: "0.6rem", fontWeight: "700", padding: "2px 6px", borderRadius: "20px" },
  statusDot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  statusDotSm: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  ticketPreview: { color: "#444", fontSize: "0.76rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  empty: { margin: "auto", color: "#333", fontSize: "0.9rem" },
  chatHeader: { padding: "14px 20px", borderBottom: "1px solid #111", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
  chatHeaderName: { fontWeight: "700", fontSize: "0.92rem" },
  chatHeaderSub: { fontSize: "0.7rem", color: "#3a3a3a", marginTop: "2px" },
  messages: { flex: 1, overflowY: "auto" as const, padding: "28px 20px", display: "flex", flexDirection: "column", gap: "14px" },
  introMsg: { background: "#080808", border: "1px solid #141414", borderRadius: "14px", padding: "14px 16px", color: "#666", maxWidth: "400px", fontSize: "0.88rem", lineHeight: "1.65" },
  userMsg: { alignSelf: "flex-end" as const, background: "#fff", color: "#000", borderRadius: "14px 14px 3px 14px", padding: "11px 15px", maxWidth: "72%", fontSize: "0.9rem", lineHeight: "1.6" },
  adminMsg: { alignSelf: "flex-start" as const, background: "#0f0f0f", color: "#ddd", border: "1px solid #1a1a1a", borderRadius: "14px 14px 14px 3px", padding: "11px 15px", maxWidth: "72%", fontSize: "0.9rem", lineHeight: "1.6" },
  questionnaireMsg: { background: "#081208", border: "1px solid #142014", borderRadius: "14px", padding: "16px 18px", maxWidth: "82%", fontSize: "0.88rem" },
  timestamp: { fontSize: "0.7rem", color: "#2e2e2e", letterSpacing: "0.2px" },
  inputRow: { display: "flex", gap: "8px", padding: "14px 16px", borderTop: "1px solid #111", alignItems: "flex-end", flexShrink: 0 },
  chatInput: { flex: 1, background: "#080808", border: "1px solid #1a1a1a", color: "#fff", padding: "12px 14px", borderRadius: "10px", fontSize: "0.9rem", outline: "none", resize: "none" as const, lineHeight: "1.5" },
  closeBtn: { background: "transparent", color: "#555", border: "1px solid #1e1e1e", padding: "10px 13px", borderRadius: "9px", fontWeight: "600", cursor: "pointer", fontSize: "0.82rem" },
  sendBtn: { background: "#fff", color: "#000", border: "none", padding: "11px 20px", borderRadius: "9px", fontWeight: "700", cursor: "pointer", fontSize: "0.9rem" },
  closedBanner: { padding: "14px 16px", borderTop: "1px solid #111", display: "flex", alignItems: "center", gap: "14px", color: "#444", fontSize: "0.88rem" },
  openNewBtn: { background: "#fff", color: "#000", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "700", cursor: "pointer", fontSize: "0.82rem" },
  modalOverlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#080808", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "28px", maxWidth: "380px", width: "90%", display: "flex", flexDirection: "column", gap: "18px" },
  modalTitle: { fontSize: "1.05rem", fontWeight: "700" },
  modalText: { color: "#555", fontSize: "0.85rem", lineHeight: "1.5", marginTop: "4px" },
  modalBtns: { display: "flex", gap: "10px", justifyContent: "flex-end" },
  modalCancel: { background: "#141414", color: "#888", border: "1px solid #222", padding: "10px 20px", borderRadius: "9px", cursor: "pointer", fontWeight: "600", fontSize: "0.88rem" },
  modalConfirm: { background: "#ef4444", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "9px", cursor: "pointer", fontWeight: "700", fontSize: "0.88rem" },
  qModalHeader: { display: "flex", gap: "14px", alignItems: "flex-start" },
  qModalIcon: { fontSize: "1.6rem", flexShrink: 0 },
  qItem: { display: "flex", flexDirection: "column" as const, gap: "10px" },
  qLabel: { color: "#ccc", fontSize: "0.9rem", lineHeight: "1.5", fontWeight: "600", display: "flex", gap: "10px", alignItems: "flex-start" },
  qNum: { background: "#111", color: "#555", minWidth: "22px", height: "22px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: "700", flexShrink: 0, marginTop: "1px" },
  qOptions: { display: "flex", flexWrap: "wrap" as const, gap: "8px" },
  qOption: { border: "1px solid", padding: "9px 18px", borderRadius: "9px", cursor: "pointer", fontSize: "0.88rem", fontWeight: "600", transition: "all 0.12s" },
  qTextarea: { background: "#0f0f0f", border: "1px solid #1e1e1e", color: "#fff", padding: "11px 13px", borderRadius: "9px", fontSize: "0.88rem", outline: "none", resize: "none" as const, lineHeight: "1.5" },
  submitQBtn: { background: "#fff", color: "#000", border: "none", padding: "13px", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "0.92rem" },
};