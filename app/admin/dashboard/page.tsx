"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Question = { question: string; type: "text" | "multiple"; options: string[] };
type Chat = any;
type Message = any;

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
  const bottomRef = useRef<HTMLDivElement>(null);

  const STANDARD_QUESTIONS: Question[] = [
    { question: "What grade are you in?", type: "text", options: [] },
    { question: "What is your intended major?", type: "text", options: [] },
    { question: "Have you attempted cold emailing before?", type: "multiple", options: ["Yes", "No"] },
    { question: "Briefly describe the purpose of what you plan to achieve through cold emailing.", type: "text", options: [] },
  ];

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
    if (selectedId) fetchMessages(selectedId);
    setAdminPanel(false);
    setPanelView("menu");
  };

  const sendCustomQuestionnaire = async () => {
    if (!selectedId) return;
    const valid = customQuestions.filter(q => q.question.trim());
    if (valid.length === 0) return;
    await fetch("/api/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedId, questions: valid, type: "custom" }),
    });
    if (selectedId) fetchMessages(selectedId);
    setAdminPanel(false);
    setPanelView("menu");
    setCustomQuestions([{ question: "", type: "text", options: ["", ""] }]);
  };

  const addQuestion = () => setCustomQuestions([...customQuestions, { question: "", type: "text", options: ["", ""] }]);
  const removeQuestion = (i: number) => setCustomQuestions(customQuestions.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, field: keyof Question, value: any) => {
    const updated = [...customQuestions];
    (updated[i] as any)[field] = value;
    setCustomQuestions(updated);
  };
  const updateOption = (qi: number, oi: number, value: string) => {
    const updated = [...customQuestions];
    updated[qi].options[oi] = value;
    setCustomQuestions(updated);
  };
  const addOption = (qi: number) => {
    const updated = [...customQuestions];
    if (updated[qi].options.length < 4) updated[qi].options.push("");
    setCustomQuestions(updated);
  };
  const removeOption = (qi: number, oi: number) => {
    const updated = [...customQuestions];
    updated[qi].options = updated[qi].options.filter((_, idx) => idx !== oi);
    setCustomQuestions(updated);
  };

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasNewMessage = (chat: Chat) => {
    const seen = seenCounts[chat.id] ?? 0;
    return chat.last_sender === "user" && (chat.message_count ?? 0) > seen;
  };

  const selectedChat = chats.find((c) => c.id === selectedId);
  const filtered = chats.filter(c => filter === "all" ? true : c.status === filter);
  const openCount = chats.filter(c => c.status !== "closed").length;
  const isClosed = selectedChat?.status === "closed";

  const isQ = (text: string) => text?.startsWith("📋");

  const renderMessage = (m: Message) => {
    const qMsg = isQ(m.text);
    const isAdmin = m.sender === "admin";
    const isHovered = hoveredMsg === m.id;

    return (
      <div
        key={m.id}
        style={{ display: "flex", flexDirection: "column", alignItems: isAdmin ? "flex-end" : "flex-start", gap: "5px" }}
        onMouseEnter={() => deleteMode && setHoveredMsg(m.id)}
        onMouseLeave={() => setHoveredMsg(null)}
        onClick={() => deleteMode && deleteMessage(m.id)}
      >
        <div style={{
          ...(qMsg ? styles.questionnaireMsg : isAdmin ? styles.adminMsg : styles.userMsg),
          ...(deleteMode && isHovered ? { background: "#2a0a0a", borderColor: "#5a1a1a", cursor: "pointer", opacity: 0.7 } : {}),
          alignSelf: isAdmin ? "flex-end" : "flex-start",
          transition: "all 0.15s",
        }}>
          {qMsg
            ? m.text.split("\n").map((line: string, i: number) => (
              <div key={i} style={{
                lineHeight: "1.7",
                fontWeight: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "700" : line.match(/^\d+\./) ? "600" : "400",
                color: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "#fff" : line.startsWith("   →") ? "#4ade80" : "#bbb",
                fontSize: line.includes("QUESTIONNAIRE") || line.includes("ANSWERS") ? "0.88rem" : "0.83rem",
              }}>{line || "\u00A0"}</div>
            ))
            : m.text}
        </div>
        <span style={styles.timestamp}>{formatTime(m.created_at)}{deleteMode && isHovered && <span style={{ color: "#ef4444", marginLeft: "6px" }}>click to delete</span>}</span>
      </div>
    );
  };

  return (
    <div style={styles.wrap}>
      {/* Admin Panel Modal */}
      {adminPanel && (
        <div style={styles.modalOverlay} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            {panelView === "menu" && (<>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Admin Panel</h3>
                <button style={styles.modalClose} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>✕</button>
              </div>
              <p style={styles.modalSub}>Actions for <strong style={{ color: "#fff" }}>{selectedChat?.name}</strong></p>
              <div style={styles.panelGrid}>
                <button style={styles.panelBtn} onClick={() => setPanelView("questionnaire")}>
                  <span style={styles.panelIcon}>📋</span>
                  <div>
                    <div style={styles.panelBtnLabel}>Questionnaire</div>
                    <div style={styles.panelBtnSub}>Send standard intake form</div>
                  </div>
                </button>
                <button style={styles.panelBtn} onClick={() => setPanelView("custom")}>
                  <span style={styles.panelIcon}>✏️</span>
                  <div>
                    <div style={styles.panelBtnLabel}>Custom Questionnaire</div>
                    <div style={styles.panelBtnSub}>Build your own questions</div>
                  </div>
                </button>
                <button style={{ ...styles.panelBtn, ...(deleteMode ? styles.panelBtnActive : {}) }}
                  onClick={() => { setDeleteMode(!deleteMode); setAdminPanel(false); setPanelView("menu"); }}>
                  <span style={styles.panelIcon}>🗑️</span>
                  <div>
                    <div style={styles.panelBtnLabel}>Delete Messages</div>
                    <div style={styles.panelBtnSub}>{deleteMode ? "Currently active — click to turn off" : "Hover over a message to delete it"}</div>
                  </div>
                </button>
              </div>
            </>)}

            {panelView === "questionnaire" && (<>
              <div style={styles.modalHeader}>
                <button style={styles.backBtn} onClick={() => setPanelView("menu")}>← Back</button>
                <h3 style={styles.modalTitle}>Standard Questionnaire</h3>
                <button style={styles.modalClose} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>✕</button>
              </div>
              <p style={styles.modalSub}>Sends the following to <strong style={{ color: "#fff" }}>{selectedChat?.name}</strong>:</p>
              <div style={styles.previewList}>
                {STANDARD_QUESTIONS.map((q, i) => (
                  <div key={i} style={styles.previewItem}>
                    <span style={styles.previewNum}>{i + 1}</span>
                    <div>
                      <div style={styles.previewQ}>{q.question}</div>
                      {q.type === "multiple" && <div style={styles.previewOpts}>{q.options.join(" / ")}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <button style={styles.sendQBtn} onClick={sendStandardQuestionnaire}>Send Questionnaire →</button>
            </>)}

            {panelView === "custom" && (<>
              <div style={styles.modalHeader}>
                <button style={styles.backBtn} onClick={() => setPanelView("menu")}>← Back</button>
                <h3 style={styles.modalTitle}>Custom Questionnaire</h3>
                <button style={styles.modalClose} onClick={() => { setAdminPanel(false); setPanelView("menu"); }}>✕</button>
              </div>
              <div style={styles.customScroll}>
                {customQuestions.map((q, qi) => (
                  <div key={qi} style={styles.customQuestion}>
                    <div style={styles.customQHeader}>
                      <span style={styles.customQNum}>Q{qi + 1}</span>
                      <select value={q.type} onChange={e => updateQuestion(qi, "type", e.target.value)} style={styles.typeSelect}>
                        <option value="text">Text answer</option>
                        <option value="multiple">Multiple choice</option>
                      </select>
                      {customQuestions.length > 1 && <button style={styles.removeQBtn} onClick={() => removeQuestion(qi)}>✕</button>}
                    </div>
                    <input style={styles.customQInput} placeholder="Type your question..." value={q.question}
                      onChange={e => updateQuestion(qi, "question", e.target.value)} />
                    {q.type === "multiple" && (
                      <div style={styles.optionsWrap}>
                        {q.options.map((opt, oi) => (
                          <div key={oi} style={styles.optionRow}>
                            <input style={styles.optionInput} placeholder={`Option ${oi + 1}`} value={opt}
                              onChange={e => updateOption(qi, oi, e.target.value)} />
                            {q.options.length > 2 && <button style={styles.removeOptBtn} onClick={() => removeOption(qi, oi)}>✕</button>}
                          </div>
                        ))}
                        {q.options.length < 4 && <button style={styles.addOptBtn} onClick={() => addOption(qi)}>+ Add option</button>}
                      </div>
                    )}
                  </div>
                ))}
                <button style={styles.addQBtn} onClick={addQuestion}>+ Add Question</button>
              </div>
              <button style={styles.sendQBtn} onClick={sendCustomQuestionnaire}>Send Questionnaire →</button>
            </>)}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <span style={styles.sidebarTitle}>Tickets</span>
          {openCount > 0 && <span style={styles.inboxCount}>{openCount} open</span>}
        </div>
        <div style={styles.filterRow}>
          {(["all", "open", "closed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...styles.filterBtn, background: filter === f ? "#fff" : "transparent", color: filter === f ? "#000" : "#555" }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {filtered.length === 0 && <div style={styles.emptyFilter}>No {filter} tickets</div>}
        {filtered.map((chat) => {
          const isNew = hasNewMessage(chat);
          return (
            <div key={chat.id} onClick={() => selectChat(chat)}
              style={{ ...styles.chatItem, background: selectedId === chat.id ? "#111" : "transparent" }}>
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

      {/* Main */}
      <div style={styles.main}>
        {!selectedId ? (
          <div style={styles.empty}>
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>💬</div>
            <div style={{ color: "#444", fontSize: "0.95rem" }}>Select a ticket to get started</div>
            {openCount > 0 && <div style={{ fontSize: "0.8rem", color: "#22c55e", marginTop: "6px" }}>{openCount} ticket{openCount > 1 ? "s" : ""} waiting</div>}
          </div>
        ) : (<>
          <div style={styles.chatHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ ...styles.statusDotSm, background: isClosed ? "#ef4444" : "#22c55e" }} />
              <div>
                <div style={styles.chatHeaderName}>{selectedChat?.name}</div>
                <div style={styles.chatHeaderSub}>{isClosed ? "Ticket closed" : "Ticket open"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {deleteMode && (
                <button style={styles.deleteModeTag} onClick={() => setDeleteMode(false)}>
                  🗑 Delete mode on — click to turn off
                </button>
              )}
              <button style={styles.adminPanelBtn} onClick={() => { setAdminPanel(true); setPanelView("menu"); }}>
                Admin Panel
              </button>
              <button onClick={() => toggleStatus(selectedChat)}
                style={{ ...styles.toggleBtn, borderColor: isClosed ? "#22c55e" : "#ef4444", color: isClosed ? "#22c55e" : "#ef4444" }}>
                {isClosed ? "Reopen" : "Close"}
              </button>
            </div>
          </div>

          <div style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.noMessages}>No messages yet — waiting for {selectedChat?.name} to reach out.</div>
            )}
            {messages.map(renderMessage)}
            <div ref={bottomRef} />
          </div>

          <div style={styles.inputRow}>
            <textarea
              style={{ ...styles.chatInput, opacity: isClosed ? 0.4 : 1 }}
              placeholder={isClosed ? "Ticket is closed" : `Reply to ${selectedChat?.name}...`}
              value={reply}
              disabled={isClosed}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              rows={1}
            />
            <button style={{ ...styles.sendBtn, opacity: isClosed ? 0.4 : 1 }} onClick={sendReply} disabled={isClosed}>
              Send
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", height: "100vh", background: "#000", color: "#fff" },
  sidebar: { width: "280px", borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" as const },
  sidebarTop: { padding: "20px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  sidebarTitle: { fontWeight: "700", fontSize: "1rem", letterSpacing: "-0.3px" },
  inboxCount: { background: "#22c55e", color: "#000", fontSize: "0.7rem", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" },
  filterRow: { display: "flex", gap: "4px", padding: "6px 12px 12px", borderBottom: "1px solid #1a1a1a" },
  filterBtn: { border: "1px solid #222", padding: "4px 11px", borderRadius: "6px", fontSize: "0.76rem", cursor: "pointer", fontWeight: "600", transition: "all 0.1s" },
  emptyFilter: { padding: "24px 16px", color: "#333", fontSize: "0.85rem", textAlign: "center" as const },
  chatItem: { padding: "13px 16px", cursor: "pointer", borderBottom: "1px solid #0f0f0f", display: "flex", flexDirection: "column", gap: "5px", transition: "background 0.1s" },
  chatItemTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  chatName: { fontWeight: "600", fontSize: "0.9rem" },
  newBadge: { background: "#22c55e", color: "#000", fontSize: "0.6rem", fontWeight: "700", padding: "2px 6px", borderRadius: "20px" },
  statusDot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  statusDotSm: { width: "9px", height: "9px", borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  lastMsg: { color: "#444", fontSize: "0.78rem", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  empty: { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  chatHeader: { padding: "14px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#000" },
  chatHeaderName: { fontWeight: "700", fontSize: "0.95rem" },
  chatHeaderSub: { fontSize: "0.72rem", color: "#444", marginTop: "2px" },
  deleteModeTag: { fontSize: "0.72rem", color: "#ef4444", border: "1px solid #3a1010", background: "#1a0808", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontWeight: "600" },
  adminPanelBtn: { background: "#111", color: "#ccc", border: "1px solid #2a2a2a", padding: "6px 14px", borderRadius: "7px", fontSize: "0.82rem", fontWeight: "600", cursor: "pointer" },
  toggleBtn: { background: "transparent", border: "1px solid", padding: "6px 14px", borderRadius: "7px", fontSize: "0.82rem", cursor: "pointer", fontWeight: "600" },
  messages: { flex: 1, overflowY: "auto" as const, padding: "28px 24px", display: "flex", flexDirection: "column", gap: "16px" },
  noMessages: { color: "#2a2a2a", fontSize: "0.85rem", textAlign: "center" as const, marginTop: "60px" },
  userMsg: { background: "#0f0f0f", color: "#ddd", border: "1px solid #1e1e1e", borderRadius: "14px 14px 14px 3px", padding: "11px 15px", maxWidth: "68%", fontSize: "0.9rem", lineHeight: "1.6" },
  adminMsg: { background: "#f5f5f5", color: "#000", borderRadius: "14px 14px 3px 14px", padding: "11px 15px", maxWidth: "68%", fontSize: "0.9rem", lineHeight: "1.6" },
  questionnaireMsg: { background: "#081208", border: "1px solid #162816", borderRadius: "14px", padding: "16px 18px", maxWidth: "78%", fontSize: "0.88rem" },
  timestamp: { fontSize: "0.7rem", color: "#3a3a3a", letterSpacing: "0.2px" },
  inputRow: { display: "flex", gap: "10px", padding: "16px 20px", borderTop: "1px solid #1a1a1a", alignItems: "flex-end", flexShrink: 0 },
  chatInput: { flex: 1, background: "#080808", border: "1px solid #1e1e1e", color: "#fff", padding: "12px 16px", borderRadius: "10px", fontSize: "0.92rem", outline: "none", resize: "none" as const, lineHeight: "1.5" },
  sendBtn: { background: "#fff", color: "#000", border: "none", padding: "12px 24px", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "0.9rem" },
  modalOverlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: "16px", padding: "28px", width: "500px", maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto" as const },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: "1.05rem", fontWeight: "700" },
  modalSub: { color: "#555", fontSize: "0.85rem", marginTop: "-12px" },
  modalClose: { background: "none", border: "none", color: "#444", fontSize: "1rem", cursor: "pointer", padding: "4px" },
  backBtn: { background: "none", border: "none", color: "#555", fontSize: "0.82rem", cursor: "pointer", padding: 0 },
  panelGrid: { display: "flex", flexDirection: "column" as const, gap: "8px" },
  panelBtn: { background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "14px", textAlign: "left" as const },
  panelBtnActive: { border: "1px solid #3a1010", background: "#120808" },
  panelIcon: { fontSize: "1.4rem", flexShrink: 0 },
  panelBtnLabel: { color: "#fff", fontWeight: "700", fontSize: "0.9rem", marginBottom: "2px" },
  panelBtnSub: { color: "#444", fontSize: "0.78rem" },
  previewList: { display: "flex", flexDirection: "column" as const, gap: "12px" },
  previewItem: { display: "flex", gap: "12px", alignItems: "flex-start" },
  previewNum: { background: "#111", color: "#555", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: "700", flexShrink: 0 },
  previewQ: { color: "#ccc", fontSize: "0.87rem", lineHeight: "1.5" },
  previewOpts: { color: "#444", fontSize: "0.76rem", marginTop: "3px" },
  sendQBtn: { background: "#fff", color: "#000", border: "none", padding: "13px", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "0.9rem" },
  customScroll: { display: "flex", flexDirection: "column" as const, gap: "14px", overflowY: "auto" as const, maxHeight: "380px" },
  customQuestion: { background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column" as const, gap: "10px" },
  customQHeader: { display: "flex", alignItems: "center", gap: "10px" },
  customQNum: { color: "#444", fontWeight: "700", fontSize: "0.82rem", flexShrink: 0 },
  typeSelect: { background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#ccc", padding: "5px 8px", borderRadius: "6px", fontSize: "0.78rem", cursor: "pointer", flex: 1, outline: "none" },
  removeQBtn: { background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "0.82rem" },
  customQInput: { background: "#080808", border: "1px solid #222", color: "#fff", padding: "10px 12px", borderRadius: "8px", fontSize: "0.87rem", outline: "none" },
  optionsWrap: { display: "flex", flexDirection: "column" as const, gap: "7px" },
  optionRow: { display: "flex", gap: "8px", alignItems: "center" },
  optionInput: { flex: 1, background: "#080808", border: "1px solid #222", color: "#fff", padding: "8px 10px", borderRadius: "7px", fontSize: "0.82rem", outline: "none" },
  removeOptBtn: { background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "0.8rem" },
  addOptBtn: { background: "none", border: "1px dashed #222", color: "#444", padding: "6px", borderRadius: "7px", fontSize: "0.76rem", cursor: "pointer" },
  addQBtn: { background: "none", border: "1px dashed #222", color: "#444", padding: "11px", borderRadius: "9px", fontSize: "0.83rem", cursor: "pointer" },
};