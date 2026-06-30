"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

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
  const [showSidebar, setShowSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>("default");
  const answersRef = useRef<string[]>([]);
  const pendingQRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);

  const setAnswersSafe = (vals: string[]) => {
    answersRef.current = vals;
    setAnswers(vals);
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const registerPush = async (chatId: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub, chatId, role: "user" }),
      });
    } catch (e) {}
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === "granted" && selectedChatId) {
      await registerPush(selectedChatId);
    }
  };

  const markSeen = useCallback(async (chatId: string) => {
    await fetch("/api/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });
  }, []);

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

  // Fetch messages, mark seen only when tab is actually focused
  useEffect(() => {
    if (!selectedChatId) return;
    const fetchMessages = async () => {
      const res = await fetch(`/api/messages?chatId=${selectedChatId}`);
      const data = await res.json();
      setMessages(data);
      const updated = { ...seenMessages, [selectedChatId]: data.length };
      setSeenMessages(updated);
      localStorage.setItem("seenMessages", JSON.stringify(updated));
      if (!document.hidden) {
        markSeen(selectedChatId);
      }
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [selectedChatId]);

  // Presence heartbeat — tells the server "I'm actively viewing this exact ticket right now"
  useEffect(() => {
    if (!selectedChatId) return;

    const updatePresence = (active: boolean) => {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChatId, role: "user", active }),
      });
    };

    const handleVisibility = () => updatePresence(!document.hidden);
    const handleFocus = () => updatePresence(true);
    const handleBlur = () => updatePresence(false);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    updatePresence(!document.hidden);
    const heartbeat = setInterval(() => {
      if (!document.hidden) updatePresence(true);
    }, 4000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      clearInterval(heartbeat);
      updatePresence(false);
    };
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId || !userId) return;
    const checkTyping = async () => {
      const res = await fetch(`/api/chats?userId=${userId}`);
      const data = await res.json();
      const chat = data.find((c: any) => c.id === selectedChatId);
      if (chat?.typing_admin && chat?.typing_admin_at) {
        const age = Date.now() - new Date(chat.typing_admin_at).getTime();
        setAdminTyping(age < 4000);
      } else {
        setAdminTyping(false);
      }
    };
    const interval = setInterval(checkTyping, 1500);
    return () => clearInterval(interval);
  }, [selectedChatId, userId]);

  useEffect(() => {
    if (!selectedChatId) return;
    const checkQ = async () => {
      const res = await fetch(`/api/questionnaire?chatId=${selectedChatId}`);
      const data = await res.json();
      if (data) {
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
  }, [messages, adminTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [newMessage]);

  const sendTyping = async (chatId: string, isTyping: boolean) => {
    await fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, sender: "user", isTyping }),
    });
  };

  const handleTyping = (val: string) => {
    setNewMessage(val);
    if (!selectedChatId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(selectedChatId, true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(selectedChatId, false);
    }, 2500);
  };

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
    isTypingRef.current = false;
    clearTimeout(typingTimeoutRef.current);
    await sendTyping(selectedChatId, false);
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedChatId, text, sender: "user" }),
    });
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedChatId, role: "admin", title: `Message from ${name}`, body: text.slice(0, 80) }),
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
    setShowSidebar(false);
    setStage("tickets");
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); action(); }
  };

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const isClosed = selectedChat?.status === "closed";
  const totalNew = chats.filter(c => {
    const seen = seenMessages[c.id] ?? 0;
    return c.last_sender === "admin" && (c.message_count ?? 0) > seen;
  }).length;

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return `Yesterday · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasNewMessage = (chat: any) => {
    const seen = seenMessages[chat.id] ?? 0;
    return chat.last_sender === "admin" && (chat.message_count ?? 0) > seen;
  };

  const renderMessage = (m: any, index: number, arr: any[]) => {
    const isQ = m.text?.startsWith("📋");
    const isUser = m.sender === "user";
    const prev = arr[index - 1];
    const showTime = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;

    return (
      <div key={m.id}>
        {showTime && <div style={s.timeDivider}>{formatTime(m.created_at)}</div>}
        <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "4px" }}>
          <div style={isQ ? s.questionnaireMsg : isUser ? s.userMsg : s.adminMsg}>
            {isQ
              ? m.text.split("\n").map((line: string, i: number) => (
                <div key={i} style={{ lineHeight: "1.75", fontWeight: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "600" : "400", color: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "#fff" : line.startsWith("   →") ? "#4ade80" : "#999", fontSize: "0.82rem" }}>{line || "\u00A0"}</div>
              ))
              : m.text}
          </div>
        </div>
      </div>
    );
  };

  if (stage === "loading") return <div style={{ background: "#000", height: "100vh" }} />;

  if (stage === "welcome") return (
    <div style={s.page}>
      <style>{globalStyles + typingAnimation}</style>
      <nav style={s.nav}>
        <span style={s.navLogo}>✉ Cold Email Help</span>
        <a href="/admin" style={s.navLink}>Admin</a>
      </nav>
      <div style={s.hero}>
        <div style={s.heroBadge}>Free · No signup required</div>
        <h1 style={{ ...s.heroTitle, fontSize: isMobile ? "2.1rem" : "3rem" }}>Cold email professors.<br />Get into research.</h1>
        <p style={s.heroSub}>Most students never hear back. I'll help you write emails that actually get responses — based on what worked for me.</p>
        <button style={s.heroCTA} onClick={() => setStage("name")}>Get personalized help →</button>
        <div style={s.heroFeatures}>
          <span style={s.heroFeat}>✓ Personal advice</span>
          <span style={s.heroFeat}>✓ Real responses</span>
          <span style={s.heroFeat}>✓ HS to HS</span>
        </div>
      </div>
      <div style={{ ...s.heroCards, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
        {[
          { icon: "📬", title: "Getting started", text: "Don't know where to begin? I'll walk you through the whole process from scratch." },
          { icon: "✍️", title: "Writing your email", text: "What to say, how long it should be, and what professors actually want to see." },
          { icon: "🔁", title: "Following up", text: "When to follow up, what to write, and how not to come across as pushy." },
        ].map((c, i) => (
          <div key={i} style={s.card}><div style={s.cardIcon}>{c.icon}</div><div style={s.cardTitle}>{c.title}</div><div style={s.cardText}>{c.text}</div></div>
        ))}
      </div>
      <footer style={s.footer}>Built by a high schooler, for high schoolers.</footer>
    </div>
  );

  if (stage === "home") return (
    <div style={s.page}>
      <style>{globalStyles + typingAnimation}</style>
      <nav style={s.nav}><span style={s.navLogo}>✉ Cold Email Help</span></nav>
      <div style={{ ...s.hero, padding: isMobile ? "60px 24px 40px" : "80px 24px 40px" }}>
        <h1 style={{ ...s.heroTitle, fontSize: isMobile ? "1.8rem" : "2rem" }}>Welcome back, {name}.</h1>
        <p style={s.heroSub}>What would you like to do?</p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" as const, justifyContent: "center" }}>
          <button style={s.heroCTA} onClick={() => setStage("tickets")}>View my tickets →</button>
          <button style={s.heroSecondary} onClick={openNewTicket}>Open a new ticket</button>
        </div>
      </div>
    </div>
  );

  if (stage === "name") return (
    <div style={s.centerPage}>
      <style>{globalStyles + typingAnimation}</style>
      <div style={{ ...s.nameCard, width: isMobile ? "calc(100% - 40px)" : "360px", padding: isMobile ? "32px 24px" : "44px 40px" }}>
        <div style={s.nameLogo}>✉ Cold Email Help</div>
        <h2 style={s.nameTitle}>What's your first name?</h2>
        <p style={s.nameSub}>Just so I know who I'm talking to.</p>
        <input style={s.nameInput} type="text" placeholder="Your first name" value={inputName}
          onChange={(e) => setInputName(e.target.value)} onKeyDown={(e) => handleKeyDown(e, handleStart)} autoFocus />
        <button style={s.nameBtn} onClick={handleStart}>Continue →</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#000", color: "#fff", overflow: "hidden", fontFamily: "'Inter', -apple-system, sans-serif", WebkitFontSmoothing: "antialiased" } as React.CSSProperties}>
      <style>{globalStyles + typingAnimation}</style>

      {/* Notification permission popup */}
      {notifPermission === "default" && (
        <div style={s.overlay}>
          <div style={{ ...s.modalBox, width: isMobile ? "calc(100% - 32px)" : "360px", textAlign: "center" as const, alignItems: "center" }}>
            <div style={{ fontSize: "2.2rem" }}>🔔</div>
            <h3 style={{ ...s.modalTitle, fontSize: "1.1rem" }}>Turn on notifications</h3>
            <p style={{ ...s.modalBody, textAlign: "center" as const }}>
              Get notified the moment I reply — even if you've closed the site or your phone is locked.
            </p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px", width: "100%", marginTop: "6px" }}>
              <button style={{ ...s.heroCTA, width: "100%" }} onClick={requestNotificationPermission}>Enable notifications</button>
              <button style={{ background: "none", border: "none", color: "#444", fontSize: "0.85rem", cursor: "pointer", padding: "8px" }} onClick={() => setNotifPermission("denied")}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {confirmClose && (
        <div style={s.overlay}>
          <div style={{ ...s.modalBox, width: isMobile ? "calc(100% - 32px)" : "380px" }}>
            <h3 style={s.modalTitle}>Close this ticket?</h3>
            <p style={s.modalBody}>You won't be able to send more messages. You can always open a new one.</p>
            <div style={s.modalActions}>
              <button style={s.modalCancel} onClick={() => setConfirmClose(false)}>Never mind</button>
              <button style={s.modalDanger} onClick={closeTicket}>Yes, close it</button>
            </div>
          </div>
        </div>
      )}

      {pendingQ && !isClosed && (
        <div style={s.overlay}>
          <div style={{ ...s.modalBox, maxWidth: "480px", width: isMobile ? "calc(100% - 24px)" : "480px", maxHeight: "90vh", overflowY: "auto" as const, gap: "20px" }}>
            <div>
              <div style={s.qBadge}>📋 Questionnaire</div>
              <h3 style={{ ...s.modalTitle, marginTop: "10px" }}>A few quick questions</h3>
              <p style={s.modalBody}>Fill this out to help me give you better, more specific advice.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
              {pendingQ.questions.map((q: any, i: number) => (
                <div key={i} style={s.qBlock}>
                  <div style={s.qQuestion}><span style={s.qIndex}>{i + 1}</span>{q.question}</div>
                  {q.type === "multiple" ? (
                    <div style={s.qOpts}>
                      {q.options.filter((o: string) => o.trim()).map((opt: string, oi: number) => (
                        <button key={oi} onClick={() => { const a = [...answersRef.current]; a[i] = opt; setAnswersSafe(a); }}
                          style={{ ...s.qOptBtn, ...(answers[i] === opt ? s.qOptBtnSelected : {}) }}>{opt}</button>
                      ))}
                    </div>
                  ) : (
                    <textarea style={s.qTextInput} placeholder="Your answer..." value={answers[i] || ""}
                      onChange={(e) => { const a = [...answersRef.current]; a[i] = e.target.value; setAnswersSafe(a); }} rows={2} />
                  )}
                </div>
              ))}
            </div>
            <button style={s.qSubmit} onClick={submitQuestionnaire}>Submit answers →</button>
          </div>
        </div>
      )}

      {isMobile && showSidebar && (
        <div style={{ position: "fixed" as const, inset: 0, zIndex: 50 }}>
          <div style={{ position: "absolute" as const, inset: 0, background: "rgba(0,0,0,0.7)" }} onClick={() => setShowSidebar(false)} />
          <div style={{ position: "absolute" as const, bottom: 0, left: 0, right: 0, background: "#080808", borderTop: "1px solid #1a1a1a", borderRadius: "20px 20px 0 0", maxHeight: "70vh", display: "flex", flexDirection: "column" as const }}>
            <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #111" }}>
              <span style={{ fontWeight: "700", fontSize: "0.9rem" }}>My Tickets</span>
              <button style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "1.2rem" }} onClick={() => setShowSidebar(false)}>✕</button>
            </div>
            <div style={{ overflowY: "auto" as const, flex: 1 }}>
              {chats.map((chat, i) => (
                <div key={chat.id} onClick={() => { setSelectedChatId(chat.id); setShowSidebar(false); }}
                  style={{ padding: "14px 20px", borderBottom: "1px solid #0f0f0f", display: "flex", flexDirection: "column" as const, gap: "5px", background: selectedChatId === chat.id ? "#111" : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "600", fontSize: "0.88rem", color: "#ddd" }}>Ticket #{chats.length - i}</span>
                      {hasNewMessage(chat) && <span style={s.newDot} />}
                    </div>
                    <span style={{ ...s.statusPill, background: chat.status === "closed" ? "#1a0808" : "#081a08", color: chat.status === "closed" ? "#ef4444" : "#22c55e", border: `1px solid ${chat.status === "closed" ? "#3a1010" : "#103a10"}` }}>
                      {chat.status === "closed" ? "Closed" : "Open"}
                    </span>
                  </div>
                  <div style={{ color: "#444", fontSize: "0.8rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{chat.last_message?.slice(0, 40) || "No messages yet"}</div>
                </div>
              ))}
              <div style={{ padding: "14px 20px" }}>
                <button onClick={openNewTicket} style={{ width: "100%", background: "#111", border: "1px solid #1e1e1e", color: "#888", padding: "12px", borderRadius: "10px", fontSize: "0.88rem", cursor: "pointer" }}>+ Open new ticket</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isMobile && (
        <div style={s.sidebar}>
          <div style={s.sidebarTop}>
            <button style={s.sidebarLogo} onClick={() => setStage("home")}>✉ Cold Email Help</button>
          </div>
          <div style={s.sidebarSection}>
            <div style={s.sidebarSectionLabel}>Your Tickets</div>
            <button style={s.newTicketBtn} onClick={openNewTicket}>+ New</button>
          </div>
          {chats.length === 0 && <div style={s.sidebarEmpty}>No tickets yet</div>}
          {chats.map((chat, i) => (
            <div key={chat.id} onClick={() => setSelectedChatId(chat.id)}
              style={{ ...s.ticketRow, ...(selectedChatId === chat.id ? s.ticketRowActive : {}) }}>
              <div style={s.ticketRowTop}>
                <span style={s.ticketNum}>#{chats.length - i}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {hasNewMessage(chat) && <span style={s.newDot} />}
                  <span style={{ ...s.statusPill, background: chat.status === "closed" ? "#1a0808" : "#081a08", color: chat.status === "closed" ? "#ef4444" : "#22c55e", border: `1px solid ${chat.status === "closed" ? "#3a1010" : "#103a10"}` }}>
                    {chat.status === "closed" ? "Closed" : "Open"}
                  </span>
                </div>
              </div>
              <div style={s.ticketPreview}>{chat.last_message?.slice(0, 38) || "No messages yet"}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" }}>
        {!selectedChatId ? (
          <div style={s.chatEmpty}>
            <div style={s.chatEmptyIcon}>✉</div>
            <div style={s.chatEmptyTitle}>Select a ticket</div>
            <div style={s.chatEmptyBody}>Choose a ticket to view the conversation.</div>
          </div>
        ) : (<>
          <div style={{ ...s.chatHeader, padding: isMobile ? "12px 16px" : "14px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {isMobile && (
                <button onClick={() => setShowSidebar(true)}
                  style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "1.1rem", padding: "2px 6px 2px 0", position: "relative" as const }}>
                  ☰
                  {totalNew > 0 && <span style={{ position: "absolute" as const, top: "-2px", right: "-2px", background: "#22c55e", width: "7px", height: "7px", borderRadius: "50%", display: "block" }} />}
                </button>
              )}
              <div style={s.avatarCircle}>CE</div>
              <div>
                <div style={s.chatHeaderTitle}>Cold Email Help</div>
                <div style={s.chatHeaderSub}>
                  {isClosed
                    ? <span style={{ color: "#ef4444" }}>Ticket closed</span>
                    : adminTyping
                    ? <span style={{ color: "#22c55e" }}>Typing...</span>
                    : <><span style={s.onlineDot} />Typically replies within a few hours</>}
                </div>
              </div>
            </div>
            {!isClosed && (
              <button style={{ ...s.closeTicketBtn, fontSize: isMobile ? "0.72rem" : "0.78rem" }} onClick={() => setConfirmClose(true)}>Close</button>
            )}
          </div>

          <div style={{ ...s.messages, padding: isMobile ? "20px 16px 12px" : "28px 28px 16px" }}>
            <div style={{ ...s.introCard, marginBottom: isMobile ? "16px" : "24px" }}>
              <div style={s.introAvatar}>CE</div>
              <div style={s.introText}>
                <div style={s.introName}>Cold Email Help</div>
                <div style={{ ...s.introMsg, fontSize: isMobile ? "0.85rem" : "0.88rem" }}>
                  Hi {name}! 👋 Ask me anything about cold emailing professors — how to start, what to write, how to follow up. I'll give you real advice based on what actually worked.
                </div>
              </div>
            </div>
            {messages.map((m, i, arr) => renderMessage(m, i, arr))}
            {adminTyping && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "6px" }}>
                <div style={s.typingBubble}>
                  <span className="typing-dot" style={s.typingDot} />
                  <span className="typing-dot" style={{ ...s.typingDot, animationDelay: "0.2s" }} />
                  <span className="typing-dot" style={{ ...s.typingDot, animationDelay: "0.4s" }} />
                </div>
              </div>
            )}
            {isClosed && (
              <div style={s.closedNotice}>
                <span>This ticket is closed.</span>
                <button style={s.reopenBtn} onClick={openNewTicket}>Open a new ticket →</button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {!isClosed && (
            <div style={{ padding: isMobile ? "10px 12px 16px" : "14px 24px 20px", borderTop: "1px solid #0f0f0f", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", background: "#080808", border: "1px solid #1a1a1a", borderRadius: "14px", padding: isMobile ? "8px 8px 8px 14px" : "10px 10px 10px 16px" }}>
                <textarea
                  ref={textareaRef}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: isMobile ? "1rem" : "0.92rem", outline: "none", resize: "none" as const, lineHeight: "1.55", maxHeight: "120px", overflowY: "auto" as const }}
                  placeholder="Message Cold Email Help..."
                  value={newMessage}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={(e) => { if (!isMobile) handleKeyDown(e, sendMessage); }}
                  rows={1}
                />
                <button
                  style={{ background: newMessage.trim() ? "#fff" : "#111", color: newMessage.trim() ? "#000" : "#333", border: "none", width: isMobile ? "36px" : "32px", height: isMobile ? "36px" : "32px", borderRadius: "9px", fontWeight: "700", cursor: newMessage.trim() ? "pointer" : "default", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}
                  onClick={sendMessage} disabled={!newMessage.trim()}>↑</button>
              </div>
              {!isMobile && <div style={{ fontSize: "0.66rem", color: "#181818", marginTop: "7px", textAlign: "center" as const }}>Press Enter to send · Shift+Enter for new line</div>}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #000; color: #fff; font-family: 'Inter', -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  ::placeholder { color: #333; }
  textarea, input, button { font-family: inherit; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 4px; }
`;

const typingAnimation = `
  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }
  .typing-dot { animation: typingBounce 1.2s infinite; }
`;

const s: { [key: string]: React.CSSProperties } = {
  page: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#000" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", borderBottom: "1px solid #0f0f0f" },
  navLogo: { fontWeight: "600", fontSize: "0.9rem", color: "#fff" },
  navLink: { color: "#444", fontSize: "0.85rem", textDecoration: "none" },
  hero: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 40px", textAlign: "center" as const, gap: "20px" },
  heroBadge: { background: "#0f0f0f", border: "1px solid #1e1e1e", color: "#555", fontSize: "0.75rem", fontWeight: "500", padding: "5px 12px", borderRadius: "20px" },
  heroTitle: { fontSize: "3rem", fontWeight: "700", letterSpacing: "-1.2px", lineHeight: "1.1", color: "#fff", maxWidth: "560px" },
  heroSub: { color: "#555", fontSize: "1rem", maxWidth: "420px", lineHeight: "1.7" },
  heroCTA: { background: "#fff", color: "#000", border: "none", padding: "14px 28px", borderRadius: "10px", fontSize: "0.95rem", fontWeight: "700", cursor: "pointer" },
  heroSecondary: { background: "transparent", color: "#666", border: "1px solid #1e1e1e", padding: "14px 28px", borderRadius: "10px", fontSize: "0.95rem", fontWeight: "500", cursor: "pointer" },
  heroFeatures: { display: "flex", gap: "20px", flexWrap: "wrap" as const, justifyContent: "center" },
  heroFeat: { color: "#333", fontSize: "0.82rem", fontWeight: "500" },
  heroCards: { display: "grid", gap: "1px", background: "#0f0f0f", borderTop: "1px solid #0f0f0f", borderBottom: "1px solid #0f0f0f" },
  card: { background: "#000", padding: "28px 24px", display: "flex", flexDirection: "column" as const, gap: "10px" },
  cardIcon: { fontSize: "1.3rem" },
  cardTitle: { fontWeight: "600", fontSize: "0.9rem", color: "#fff" },
  cardText: { color: "#444", fontSize: "0.83rem", lineHeight: "1.65" },
  footer: { padding: "20px 40px", color: "#222", fontSize: "0.78rem", textAlign: "center" as const },
  centerPage: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#000", padding: "20px" },
  nameCard: { background: "#080808", border: "1px solid #1a1a1a", borderRadius: "18px", display: "flex", flexDirection: "column" as const, gap: "16px" },
  nameLogo: { fontWeight: "600", fontSize: "0.85rem", color: "#333", marginBottom: "4px" },
  nameTitle: { fontSize: "1.4rem", fontWeight: "700", letterSpacing: "-0.4px" },
  nameSub: { color: "#444", fontSize: "0.85rem", lineHeight: "1.5" },
  nameInput: { background: "#000", border: "1px solid #1e1e1e", color: "#fff", padding: "13px 15px", borderRadius: "10px", fontSize: "1rem", outline: "none" },
  nameBtn: { background: "#fff", color: "#000", border: "none", padding: "13px", borderRadius: "10px", fontSize: "0.95rem", fontWeight: "700", cursor: "pointer" },
  sidebar: { width: "240px", borderRight: "1px solid #0f0f0f", display: "flex", flexDirection: "column" as const, flexShrink: 0, overflowY: "auto" as const },
  sidebarTop: { padding: "18px 16px 14px" },
  sidebarLogo: { background: "none", border: "none", color: "#555", fontWeight: "600", fontSize: "0.82rem", cursor: "pointer", padding: 0 },
  sidebarSection: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px 10px" },
  sidebarSectionLabel: { fontSize: "0.7rem", fontWeight: "600", color: "#333", letterSpacing: "0.06em", textTransform: "uppercase" as const },
  newTicketBtn: { background: "none", border: "none", color: "#444", fontSize: "0.76rem", cursor: "pointer", fontWeight: "500", padding: 0 },
  sidebarEmpty: { padding: "20px 16px", color: "#2a2a2a", fontSize: "0.82rem" },
  ticketRow: { padding: "11px 16px", cursor: "pointer", borderBottom: "1px solid #080808", display: "flex", flexDirection: "column" as const, gap: "5px" },
  ticketRowActive: { background: "#0d0d0d" },
  ticketRowTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  ticketNum: { fontSize: "0.75rem", color: "#333", fontWeight: "600" },
  newDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" },
  statusPill: { fontSize: "0.63rem", fontWeight: "600", padding: "2px 7px", borderRadius: "20px" },
  ticketPreview: { color: "#333", fontSize: "0.75rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  chatEmpty: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: "12px" },
  chatEmptyIcon: { fontSize: "2rem", color: "#1a1a1a" },
  chatEmptyTitle: { fontWeight: "600", fontSize: "1rem", color: "#2a2a2a" },
  chatEmptyBody: { color: "#222", fontSize: "0.85rem" },
  chatHeader: { borderBottom: "1px solid #0f0f0f", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
  avatarCircle: { width: "32px", height: "32px", borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: "700", color: "#444", flexShrink: 0 },
  chatHeaderTitle: { fontWeight: "600", fontSize: "0.9rem" },
  chatHeaderSub: { fontSize: "0.7rem", color: "#333", marginTop: "2px", display: "flex", alignItems: "center", gap: "5px" },
  onlineDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" },
  closeTicketBtn: { background: "transparent", border: "1px solid #1e1e1e", color: "#444", padding: "6px 14px", borderRadius: "8px", cursor: "pointer" },
  messages: { flex: 1, overflowY: "auto" as const },
  introCard: { display: "flex", gap: "10px", alignItems: "flex-start" },
  introAvatar: { width: "28px", height: "28px", borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.58rem", fontWeight: "700", color: "#444", flexShrink: 0, marginTop: "2px" },
  introText: { display: "flex", flexDirection: "column" as const, gap: "5px" },
  introName: { fontSize: "0.72rem", fontWeight: "600", color: "#444" },
  introMsg: { background: "#0a0a0a", border: "1px solid #141414", borderRadius: "4px 14px 14px 14px", padding: "12px 14px", color: "#666", lineHeight: "1.65", maxWidth: "440px" },
  timeDivider: { textAlign: "center" as const, color: "#222", fontSize: "0.68rem", fontWeight: "500", margin: "14px 0 8px" },
  userMsg: { background: "#fff", color: "#000", borderRadius: "14px 14px 3px 14px", padding: "11px 15px", maxWidth: "78%", fontSize: "0.9rem", lineHeight: "1.6", display: "inline-block" },
  adminMsg: { background: "#0d0d0d", color: "#ccc", border: "1px solid #161616", borderRadius: "4px 14px 14px 14px", padding: "11px 15px", maxWidth: "78%", fontSize: "0.9rem", lineHeight: "1.6", display: "inline-block" },
  questionnaireMsg: { background: "#060f06", border: "1px solid #0f200f", borderRadius: "14px", padding: "14px 16px", display: "inline-block", maxWidth: "85%" },
  typingBubble: { background: "#0d0d0d", border: "1px solid #161616", borderRadius: "4px 14px 14px 14px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "5px" },
  typingDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#555", display: "inline-block" },
  closedNotice: { display: "flex", alignItems: "center", gap: "12px", color: "#333", fontSize: "0.82rem", margin: "16px 0 8px", padding: "14px 16px", background: "#080808", borderRadius: "10px", border: "1px solid #111", flexWrap: "wrap" as const },
  reopenBtn: { background: "none", border: "none", color: "#555", fontSize: "0.82rem", cursor: "pointer", fontWeight: "500", padding: 0, textDecoration: "underline" },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" },
  modalBox: { background: "#080808", border: "1px solid #1a1a1a", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column" as const, gap: "16px" },
  modalTitle: { fontSize: "1.05rem", fontWeight: "700" },
  modalBody: { color: "#555", fontSize: "0.85rem", lineHeight: "1.6" },
  modalActions: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" },
  modalCancel: { background: "#0f0f0f", color: "#666", border: "1px solid #1e1e1e", padding: "10px 18px", borderRadius: "9px", cursor: "pointer", fontWeight: "500", fontSize: "0.85rem" },
  modalDanger: { background: "#ef4444", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "9px", cursor: "pointer", fontWeight: "700", fontSize: "0.85rem" },
  qBadge: { background: "#0a120a", border: "1px solid #142014", color: "#4ade80", fontSize: "0.72rem", fontWeight: "600", padding: "4px 10px", borderRadius: "20px", display: "inline-block" },
  qBlock: { display: "flex", flexDirection: "column" as const, gap: "10px" },
  qQuestion: { color: "#ccc", fontSize: "0.9rem", lineHeight: "1.5", fontWeight: "500", display: "flex", gap: "10px" },
  qIndex: { background: "#111", color: "#444", minWidth: "20px", height: "20px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: "700", flexShrink: 0, marginTop: "2px" },
  qOpts: { display: "flex", flexWrap: "wrap" as const, gap: "7px" },
  qOptBtn: { background: "#0f0f0f", color: "#888", border: "1px solid #1e1e1e", padding: "9px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "0.88rem", fontWeight: "500" },
  qOptBtnSelected: { background: "#fff", color: "#000", borderColor: "#fff" },
  qTextInput: { background: "#040404", border: "1px solid #1a1a1a", color: "#fff", padding: "11px 13px", borderRadius: "9px", fontSize: "0.88rem", outline: "none", resize: "none" as const, lineHeight: "1.55" },
  qSubmit: { background: "#fff", color: "#000", border: "none", padding: "13px", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "0.9rem" },
};