"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem("adminAuth", "true");
      router.push("/admin/dashboard");
    } else {
      setError("Wrong password.");
    }
  };

  return (
    <div style={styles.center}>
      <h2 style={styles.title}>Admin Login</h2>
      <input
        style={styles.input}
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        autoFocus
      />
      {error && <p style={{ color: "#ef4444" }}>{error}</p>}
      <button style={styles.btn} onClick={handleLogin}>Login</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  center: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:"20px" },
  title: { fontSize:"1.5rem", fontWeight:"700" },
  input: { background:"#111", border:"1px solid #333", color:"#fff", padding:"12px 16px", borderRadius:"8px", fontSize:"1rem", width:"280px", outline:"none" },
  btn: { background:"#fff", color:"#000", border:"none", padding:"12px 32px", borderRadius:"8px", fontWeight:"600", cursor:"pointer" },
};