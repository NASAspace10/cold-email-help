"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Question = { question: string; type: "text" | "multiple"; options: string[] };
type Chat = any;
type Message = any;

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function Dashboard() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});
  const [adminPanel, setAdminPanel] = useState(false);
  const [panelView, setPanelView] = useState<"menu" | "questionnaire" | "custom">("menu");
  const [deleteMode, setDeleteMode] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState<number | null>(null);
  const [customQuestions, setCustomQuestions] = useState<Question[]>([{ question: "", type: "text", options: ["", ""] }]);
  const [userTyping, setUserTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  const STANDARD_QUESTIONS: Question[] = [
    { question: "What grade are you in?", type: "text", options: [] },
    { question: "What is your intended major?", type: "text", options: [] },
    { question: "Have you attempted cold emailing before?", type: "multiple", options: ["Yes", "No"] },
    { question: "Briefly describe what you plan to achieve through cold emailing.", type: "text", options: [] },
  ];

  const registerAdminPush = async () => {
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
        body: JSON.stringify({ subscription: sub, chatId: "admin", role: "admin" }),
      });
    } catch (e) {}
  };

  useEffect(() => {
    if (localStorage.getItem("adminAuth") !== "true") router.push("/admin");
    const saved = localStorage.getItem("adminSeenCounts");
    if (saved) setSeenCounts(JSON.parse(saved));
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      registerAdminPush();
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then(p => { if (p === "granted") registerAdminPush(); });
    }
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

    // Check for new user messages for browser notification
    const prevCount = prevMessageCountRef.current;
    const newUserMsgs = data.filter((m: any) => m.sender === "user").length;
    const prevUserMsgs = messages.filter((m: any) => m.sender === "user").length;
    if (newUserMsgs > prevUserMsgs && prevCount > 0 && document.hidden) {
      const chat = chats.find(c => c.id === id);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`Message from ${chat?.name ?? "User"}`, { body: data[data.length - 1]?.text?.slice(0, 80), icon: "/favicon.ico" });
      }
    }
    prevMessageCountRef.current = data.length;

    setMessages(data);
    const updated = { ...seenCounts, [id]: data.length };
    setSeenCounts(updated);
    localStorage.setItem("adminSeenCounts", JSON.stringify(updated));
  };

  useEffect(() => {
    if (!selectedId) return;
    fetchMessages(selectedId);
    const interval = setInterval(() => fetchMessages(selectedId), 2000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Poll for user typing
  useEffect(() => {
    if (!selectedId) return;
    const check = async () => {
      const res = await fetch("/api/chats");
      const data = await res.json();
      const chat = data.find((c: any) => c.id === selectedId);
      if (chat?.typing_user && chat?.typing_user_at) {
        const age = Date.now() - new Date(chat.typing_user_at).getTime();
        setUserTyping(age < 4000);
      } else {
        setUserTyping(false);
      }
    };
    const interval = setInterval(check, 1500);
    return () => clearInterval(interval);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, userTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [reply]);

  const selectChat = async (chat: Chat) => {
    setSelectedId(chat.id);
    setAdminPanel(false);
    setDeleteMode(false);
    await fetch("/api/chats/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id }),
    });
  };

  const sendTyping = async (isTyping: boolean) => {
    if (!selectedId) return;
    await fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, sender: "admin", isTyping }),
    });
  };

  const handleReplyChange = (val: string) => {
    setReply(val);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(false);
    }, 2500);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selectedId) return;
    const text = reply.trim();
    setReply("");
    isTypingRef.current = false;
    clearTimeout(typingTimeoutRef.current);
    await sendTyping(false);
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, text, sender: "admin" }),
    });
    // Notify user
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, role: "user", title: "Cold Email Help", body: text.slice(0, 80) }),
    });
    fetchMessages(selectedId);
  };

  const toggleStatus = async (chat: Chat) => {
    const newStatus = chat.status === "closed" ? "open" : "closed";
    await fetch("/api/chats/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat.id, status: newStatus }),
    });
    fetchChats();
  };

  const deleteMessage = async (messageId: number) => {
    await fetch("/api/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (selectedId) fetchMessages(selectedId);
  };

  const sendStandardQuestionnaire = async () => {
    if (!selectedId) return;
    await fetch("/api/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, questions: STANDARD_QUESTIONS, type: "standard" }),
    });
    fetchMessages(selectedId);
    setAdminPanel(false);
    setPanelView("menu");
  };

  const sendCustomQuestionnaire = async () => {
    if (!selectedId) return;
    const valid = customQuestions.filter(q => q.question.trim());
    if (!valid.length) return;
    await fetch("/api/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, questions: valid, type: "custom" }),
    });
    fetchMessages(selectedId);
    setAdminPanel(false);
    setPanelView("menu");
    setCustomQuestions([{ question: "", type: "text", options: ["", ""] }]);
  };

  const addQuestion = () => setCustomQuestions([...customQuestions, { question: "", type: "text", options: ["", ""] }]);
  const removeQuestion = (i: number) => setCustomQuestions(customQuestions.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, field: keyof Question, value: any) => {
    const u = [...customQuestions]; (u[i] as any)[field] = value; setCustomQuestions(u);
  };
  const updateOption = (qi: number, oi: number, v: string) => {
    const u = [...customQuestions]; u[qi].options[oi] = v; setCustomQuestions(u);
  };
  const addOption = (qi: number) => {
    const u = [...customQuestions]; if (u[qi].options.length < 4) u[qi].options.push(""); setCustomQuestions(u);
  };
  const removeOption = (qi: number, oi: number) => {
    const u = [...customQuestions]; u[qi].options = u[qi].options.filter((_, i) => i !== oi); setCustomQuestions(u);
  };

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

  const hasNewMessage = (chat: Chat) => {
    const seen = seenCounts[chat.id] ?? 0;
    return chat.last_sender === "user" && (chat.message_count ?? 0) > seen;
  };

  const selectedChat = chats.find(c => c.id === selectedId);
  const filtered = chats.filter(c => filter === "all" ? true : c.status === filter);
  const openCount = chats.filter(c => c.status !== "closed").length;
  const isClosed = selectedChat?.status === "closed";

  // Find last admin message to show seen receipt
  const lastAdminMsgIdx = [...messages].reverse().findIndex(m => m.sender === "admin");
  const lastAdminMsg = lastAdminMsgIdx >= 0 ? messages[messages.length - 1 - lastAdminMsgIdx] : null;

  const renderMessage = (m: Message, index: number, arr: Message[]) => {
    const isQ = m.text?.startsWith("📋");
    const isAdmin = m.sender === "admin";
    const isHov = hoveredMsg === m.id;
    const prev = arr[index - 1];
    const isLast = index === arr.length - 1;
    const showTime = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
    const isLastAdminMsg = lastAdminMsg && m.id === lastAdminMsg.id;

    return (
      <div key={m.id}>
        {showTime && <div style={a.timeDivider}>{formatTime(m.created_at)}</div>}
        <div
          style={{ display: "flex", justifyContent: isAdmin ? "flex-end" : "flex-start", marginBottom: isLast ? "2px" : "4px" }}
          onMouseEnter={() => deleteMode && setHoveredMsg(m.id)}
          onMouseLeave={() => setHoveredMsg(null)}
          onClick={() => deleteMode && deleteMessage(m.id)}
        >
          <div style={{
            ...(isQ ? a.questionnaireMsg : isAdmin ? a.adminMsg : a.userMsg),
            ...(deleteMode && isHov ? { background: "#1a0808", borderColor: "#3a1010", opacity: 0.65, cursor: "pointer" } : {}),
            transition: "all 0.12s",
          }}>
            {isQ
              ? m.text.split("\n").map((line: string, i: number) => (
                <div key={i} style={{ lineHeight: "1.75", fontWeight: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "600" : "400", color: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "#fff" : line.startsWith("   →") ? "#4ade80" : "#777", fontSize: "0.82rem" }}>{line || "\u00A0"}</div>
              ))
              : m.text}
            {deleteMode && isHov && <div style={{ fontSize: "0.68rem", color: "#ef4444", marginTop: "5px" }}>click to delete</div>}
          </div>
        </div>
        {/* Seen receipt under last admin message */}
        {isAdmin && isLastAdminMsg && m.seen_at && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <span style={a.seenReceipt}>✓✓ Seen {formatTime(m.seen_at)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={a.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
        ::placeholder { color: #2a2a2a; }
        textarea, input, button, select { font-family: inherit; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 4px; }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .typing-dot { animation: typingBounce 1.2s infinite; }
      `}</style>

      {adminPanel && (
        <div style={a.overlay} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>
          <div style={a.modal} onClick={e => e.stopPropagation()}>
            {panelView === "menu" && (<>
              <div style={a.modalHeader}>
                <div><div style={a.modalTitle}>Admin Panel</div><div style={a.modalSub}>Actions for <span style={{ color: "#fff" }}>{selectedChat?.name}</span></div></div>
                <button style={a.modalCloseBtn} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>✕</button>
              </div>
              <div style={a.panelGrid}>
                {[
                  { icon: "📋", label: "Standard Questionnaire", sub: "Send preset intake form", action: () => setPanelView("questionnaire") },
                  { icon: "✏️", label: "Custom Questionnaire", sub: "Build your own questions", action: () => setPanelView("custom") },
                  { icon: "🗑️", label: deleteMode ? "Turn off Delete Mode" : "Delete Messages", sub: deleteMode ? "Currently active" : "Hover messages to remove them", action: () => { setDeleteMode(!deleteMode); setAdminPanel(false); } },
                ].map((item, i) => (
                  <button key={i} style={{ ...a.panelOption, ...(deleteMode && i === 2 ? a.panelOptionActive : {}) }} onClick={item.action}>
                    <span style={{ fontSize: "1.2rem" }}>{item.icon}</span>
                    <div style={{ textAlign: "left" as const }}><div style={a.panelOptionLabel}>{item.label}</div><div style={a.panelOptionSub}>{item.sub}</div></div>
                  </button>
                ))}
              </div>
            </>)}
            {panelView === "questionnaire" && (<>
              <div style={a.modalHeader}>
                <button style={a.backBtn} onClick={() => setPanelView("menu")}>← Back</button>
                <button style={a.modalCloseBtn} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>✕</button>
              </div>
              <div style={a.modalTitle}>Standard Questionnaire</div>
              <div style={a.modalSub}>Sends to <span style={{ color: "#fff" }}>{selectedChat?.name}</span></div>
              <div style={a.previewList}>
                {STANDARD_QUESTIONS.map((q, i) => (
                  <div key={i} style={a.previewRow}>
                    <span style={a.previewIdx}>{i + 1}</span>
                    <div><div style={a.previewQ}>{q.question}</div>{q.type === "multiple" && <div style={a.previewOpts}>{q.options.join(" / ")}</div>}</div>
                  </div>
                ))}
              </div>
              <button style={a.sendBtn2} onClick={sendStandardQuestionnaire}>Send questionnaire →</button>
            </>)}
            {panelView === "custom" && (<>
              <div style={a.modalHeader}>
                <button style={a.backBtn} onClick={() => setPanelView("menu")}>← Back</button>
                <button style={a.modalCloseBtn} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>✕</button>
              </div>
              <div style={a.modalTitle}>Custom Questionnaire</div>
              <div style={a.customScroll}>
                {customQuestions.map((q, qi) => (
                  <div key={qi} style={a.customQ}>
                    <div style={a.customQTop}>
                      <span style={a.customQLabel}>Q{qi + 1}</span>
                      <select value={q.type} onChange={e => updateQuestion(qi, "type", e.target.value)} style={a.typeSelect}>
                        <option value="text">Text answer</option>
                        <option value="multiple">Multiple choice</option>
                      </select>
                      {customQuestions.length > 1 && <button style={a.removeBtn} onClick={() => removeQuestion(qi)}>✕</button>}
                    </div>
                    <input style={a.customInput} placeholder="Type your question..." value={q.question} onChange={e => updateQuestion(qi, "question", e.target.value)} />
                    {q.type === "multiple" && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: "6px" }}>
                        {q.options.map((opt, oi) => (
                          <div key={oi} style={{ display: "flex", gap: "6px" }}>
                            <input style={a.optInput} placeholder={`Option ${oi + 1}`} value={opt} onChange={e => updateOption(qi, oi, e.target.value)} />
                            {q.options.length > 2 && <button style={a.removeBtn} onClick={() => removeOption(qi, oi)}>✕</button>}
                          </div>
                        ))}
                        {q.options.length < 4 && <button style={a.addOptBtn} onClick={() => addOption(qi)}>+ option</button>}
                      </div>
                    )}
                  </div>
                ))}
                <button style={a.addQBtn} onClick={addQuestion}>+ Add question</button>
              </div>
              <button style={a.sendBtn2} onClick={sendCustomQuestionnaire}>Send questionnaire →</button>
            </>)}
          </div>
        </div>
      )}

      <div style={a.sidebar}>
        <div style={a.sidebarHead}>
          <div style={a.sidebarTitle}>Tickets</div>
          {openCount > 0 && <span style={a.openPill}>{openCount} open</span>}
        </div>
        <div style={a.filterRow}>
          {(["all", "open", "closed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...a.filterBtn, ...(filter === f ? a.filterBtnActive : {}) }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" as const }}>
          {filtered.length === 0 && <div style={a.emptyList}>No {filter} tickets</div>}
          {filtered.map(chat => (
            <div key={chat.id} onClick={() => selectChat(chat)} style={{ ...a.chatRow, ...(selectedId === chat.id ? a.chatRowActive : {}) }}>
              <div style={a.chatRowTop}>
                <span style={a.chatRowName}>{chat.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {hasNewMessage(chat) && <span style={a.newDot} />}
                  <span style={{ ...a.statusPill, background: chat.status === "closed" ? "#1a0808" : "#081a08", color: chat.status === "closed" ? "#ef4444" : "#22c55e", border: `1px solid ${chat.status === "closed" ? "#3a1010" : "#103a10"}` }}>
                    {chat.status === "closed" ? "Closed" : "Open"}
                  </span>
                </div>
              </div>
              <div style={a.chatRowPreview}>{chat.last_message?.slice(0, 42) || "No messages yet"}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={a.main}>
        {!selectedId ? (
          <div style={a.mainEmpty}>
            <div style={{ fontSize: "1.8rem", marginBottom: "10px", color: "#1a1a1a" }}>✉</div>
            <div style={a.mainEmptyTitle}>No ticket selected</div>
            <div style={a.mainEmptySub}>{openCount > 0 ? `${openCount} ticket${openCount > 1 ? "s" : ""} waiting` : "All caught up"}</div>
          </div>
        ) : (<>
          <div style={a.chatHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={a.avatar}>{selectedChat?.name?.[0]?.toUpperCase()}</div>
              <div>
                <div style={a.chatHeaderName}>{selectedChat?.name}</div>
                <div style={{ marginTop: "3px", display: "flex", alignItems: "center", gap: "6px" }}>
                  {userTyping
                    ? <span style={{ fontSize: "0.72rem", color: "#22c55e" }}>Typing...</span>
                    : <span style={{ ...a.statusPill, background: isClosed ? "#1a0808" : "#081a08", color: isClosed ? "#ef4444" : "#22c55e", border: `1px solid ${isClosed ? "#3a1010" : "#103a10"}` }}>{isClosed ? "Closed" : "Open"}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {deleteMode && <button style={a.deleteModeBtn} onClick={() => setDeleteMode(false)}>🗑 Delete mode · click to exit</button>}
              <button style={a.panelBtn} onClick={() => { setAdminPanel(true); setPanelView("menu"); }}>Admin Panel</button>
              <button onClick={() => toggleStatus(selectedChat)} style={{ ...a.statusToggle, borderColor: isClosed ? "#22c55e" : "#ef4444", color: isClosed ? "#22c55e" : "#ef4444" }}>
                {isClosed ? "Reopen" : "Close"}
              </button>
            </div>
          </div>

          <div style={a.messages}>
            {messages.length === 0 && <div style={a.noMsgs}>No messages yet — waiting for {selectedChat?.name} to write in.</div>}
            {messages.map((m, i, arr) => renderMessage(m, i, arr))}

            {/* User typing indicator */}
            {userTyping && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "6px" }}>
                <div style={a.typingBubble}>
                  <span className="typing-dot" style={a.typingDot} />
                  <span className="typing-dot" style={{ ...a.typingDot, animationDelay: "0.2s" }} />
                  <span className="typing-dot" style={{ ...a.typingDot, animationDelay: "0.4s" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={a.inputArea}>
            <div style={{ ...a.inputBox, opacity: isClosed ? 0.4 : 1 }}>
              <textarea ref={textareaRef} style={a.textarea}
                placeholder={isClosed ? "Ticket is closed" : `Reply to ${selectedChat?.name}...`}
                value={reply} disabled={isClosed}
                onChange={e => handleReplyChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                rows={1} />
              <button style={{ ...a.sendBtn, ...(!reply.trim() || isClosed ? a.sendBtnDisabled : {}) }}
                onClick={sendReply} disabled={!reply.trim() || isClosed}>↑</button>
            </div>
            <div style={a.inputHint}>Enter to send · Shift+Enter for new line</div>
          </div>
        </>)}
      </div>
    </div>
  );
}

const a: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", height: "100vh", background: "#000", color: "#fff" },
  sidebar: { width: "260px", borderRight: "1px solid #0f0f0f", display: "flex", flexDirection: "column", flexShrink: 0 },
  sidebarHead: { padding: "20px 18px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #0a0a0a" },
  sidebarTitle: { fontWeight: "700", fontSize: "0.9rem" },
  openPill: { background: "#081a08", color: "#22c55e", border: "1px solid #103a10", fontSize: "0.68rem", fontWeight: "600", padding: "2px 8px", borderRadius: "20px" },
  filterRow: { display: "flex", gap: "4px", padding: "10px 14px", borderBottom: "1px solid #0a0a0a" },
  filterBtn: { border: "1px solid #141414", background: "transparent", color: "#333", padding: "4px 11px", borderRadius: "6px", fontSize: "0.74rem", cursor: "pointer", fontWeight: "500" },
  filterBtnActive: { background: "#fff", color: "#000", borderColor: "#fff" },
  emptyList: { padding: "20px 18px", color: "#222", fontSize: "0.82rem" },
  chatRow: { padding: "12px 18px", cursor: "pointer", borderBottom: "1px solid #080808", display: "flex", flexDirection: "column" as const, gap: "5px" },
  chatRowActive: { background: "#0a0a0a" },
  chatRowTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  chatRowName: { fontWeight: "600", fontSize: "0.87rem", color: "#ddd" },
  newDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" },
  statusPill: { fontSize: "0.63rem", fontWeight: "600", padding: "2px 7px", borderRadius: "20px" },
  chatRowPreview: { color: "#333", fontSize: "0.76rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  mainEmpty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  mainEmptyTitle: { fontWeight: "600", fontSize: "0.95rem", color: "#222" },
  mainEmptySub: { color: "#1a1a1a", fontSize: "0.82rem", marginTop: "5px" },
  chatHeader: { padding: "14px 22px", borderBottom: "1px solid #0f0f0f", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
  avatar: { width: "32px", height: "32px", borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: "700", color: "#555", flexShrink: 0 },
  chatHeaderName: { fontWeight: "600", fontSize: "0.9rem" },
  deleteModeBtn: { fontSize: "0.72rem", color: "#ef4444", border: "1px solid #2a0f0f", background: "#110808", padding: "5px 10px", borderRadius: "7px", cursor: "pointer", fontWeight: "500" },
  panelBtn: { background: "#0d0d0d", color: "#888", border: "1px solid #1a1a1a", padding: "6px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: "500", cursor: "pointer" },
  statusToggle: { background: "transparent", border: "1px solid", padding: "6px 14px", borderRadius: "8px", fontSize: "0.8rem", cursor: "pointer", fontWeight: "600" },
  messages: { flex: 1, overflowY: "auto" as const, padding: "28px 28px 12px" },
  noMsgs: { color: "#1e1e1e", fontSize: "0.85rem", textAlign: "center" as const, marginTop: "60px" },
  timeDivider: { textAlign: "center" as const, color: "#1e1e1e", fontSize: "0.68rem", fontWeight: "500", margin: "16px 0 10px" },
  userMsg: { background: "#0d0d0d", color: "#ccc", border: "1px solid #141414", borderRadius: "4px 14px 14px 14px", padding: "11px 15px", maxWidth: "66%", fontSize: "0.88rem", lineHeight: "1.6", display: "inline-block" },
  adminMsg: { background: "#f5f5f5", color: "#000", borderRadius: "14px 14px 3px 14px", padding: "11px 15px", maxWidth: "66%", fontSize: "0.88rem", lineHeight: "1.6", display: "inline-block" },
  questionnaireMsg: { background: "#060e06", border: "1px solid #0d1e0d", borderRadius: "14px", padding: "16px 18px", display: "inline-block", maxWidth: "76%" },
  seenReceipt: { fontSize: "0.68rem", color: "#22c55e", opacity: 0.7 },
  typingBubble: { background: "#0d0d0d", border: "1px solid #141414", borderRadius: "4px 14px 14px 14px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "5px" },
  typingDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#444", display: "inline-block" },
  inputArea: { padding: "12px 22px 18px", borderTop: "1px solid #0a0a0a", flexShrink: 0 },
  inputBox: { display: "flex", gap: "10px", alignItems: "flex-end", background: "#080808", border: "1px solid #161616", borderRadius: "14px", padding: "10px 10px 10px 16px" },
  textarea: { flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: "0.9rem", outline: "none", resize: "none" as const, lineHeight: "1.55", maxHeight: "120px", overflowY: "auto" as const },
  sendBtn: { background: "#fff", color: "#000", border: "none", width: "30px", height: "30px", borderRadius: "7px", fontWeight: "700", cursor: "pointer", fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtnDisabled: { opacity: 0.15, cursor: "default" },
  inputHint: { fontSize: "0.66rem", color: "#181818", marginTop: "7px", textAlign: "center" as const },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" },
  modal: { background: "#080808", border: "1px solid #1a1a1a", borderRadius: "18px", padding: "28px", width: "480px", maxWidth: "96vw", maxHeight: "88vh", display: "flex", flexDirection: "column" as const, gap: "18px", overflowY: "auto" as const },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  modalTitle: { fontSize: "1.05rem", fontWeight: "700" },
  modalSub: { color: "#444", fontSize: "0.82rem", marginTop: "4px" },
  modalCloseBtn: { background: "none", border: "none", color: "#333", fontSize: "1rem", cursor: "pointer" },
  backBtn: { background: "none", border: "none", color: "#444", fontSize: "0.8rem", cursor: "pointer", padding: 0 },
  panelGrid: { display: "flex", flexDirection: "column" as const, gap: "7px" },
  panelOption: { background: "#0a0a0a", border: "1px solid #141414", borderRadius: "12px", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "14px", textAlign: "left" as const },
  panelOptionActive: { border: "1px solid #2a0f0f", background: "#0f0808" },
  panelOptionLabel: { color: "#ccc", fontWeight: "600", fontSize: "0.87rem", marginBottom: "2px" },
  panelOptionSub: { color: "#333", fontSize: "0.76rem" },
  previewList: { display: "flex", flexDirection: "column" as const, gap: "11px" },
  previewRow: { display: "flex", gap: "11px", alignItems: "flex-start" },
  previewIdx: { background: "#111", color: "#444", width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: "700", flexShrink: 0 },
  previewQ: { color: "#bbb", fontSize: "0.85rem", lineHeight: "1.5" },
  previewOpts: { color: "#333", fontSize: "0.75rem", marginTop: "3px" },
  sendBtn2: { background: "#fff", color: "#000", border: "none", padding: "12px", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "0.88rem" },
  customScroll: { display: "flex", flexDirection: "column" as const, gap: "12px", maxHeight: "360px", overflowY: "auto" as const },
  customQ: { background: "#0a0a0a", border: "1px solid #141414", borderRadius: "11px", padding: "13px", display: "flex", flexDirection: "column" as const, gap: "9px" },
  customQTop: { display: "flex", alignItems: "center", gap: "9px" },
  customQLabel: { color: "#333", fontWeight: "700", fontSize: "0.78rem", flexShrink: 0 },
  typeSelect: { flex: 1, background: "#141414", border: "1px solid #1e1e1e", color: "#888", padding: "4px 8px", borderRadius: "6px", fontSize: "0.76rem", cursor: "pointer", outline: "none" },
  removeBtn: { background: "none", border: "none", color: "#2a2a2a", cursor: "pointer", fontSize: "0.8rem" },
  customInput: { background: "#040404", border: "1px solid #1a1a1a", color: "#ccc", padding: "9px 12px", borderRadius: "8px", fontSize: "0.85rem", outline: "none" },
  optInput: { flex: 1, background: "#040404", border: "1px solid #1a1a1a", color: "#ccc", padding: "7px 10px", borderRadius: "7px", fontSize: "0.8rem", outline: "none" },
  addOptBtn: { background: "none", border: "1px dashed #1a1a1a", color: "#2a2a2a", padding: "6px", borderRadius: "6px", fontSize: "0.74rem", cursor: "pointer" },
  addQBtn: { background: "none", border: "1px dashed #1a1a1a", color: "#2a2a2a", padding: "10px", borderRadius: "9px", fontSize: "0.8rem", cursor: "pointer" },
};