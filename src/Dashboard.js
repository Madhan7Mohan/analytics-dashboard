import { useMemo, useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  ResponsiveContainer, AreaChart, Area, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, ComposedChart
} from "recharts";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const VALID_MONTHS = new Set(MONTHS);

const C = {
  indigo:  "#6366f1",
  emerald: "#10b981",
  rose:    "#f43f5e",
  amber:   "#f59e0b",
  cyan:    "#06b6d4",
  violet:  "#8b5cf6",
  orange:  "#f97316",
  teal:    "#14b8a6",
  pink:    "#ec4899",
  sky:     "#0ea5e9",
};
const PALETTE = Object.values(C);
const YEAR_COLOR = { "2022": C.indigo, "2023": C.emerald, "2024": C.violet, "2025": C.orange };

const fmt = n => Number(n||0).toLocaleString("en-IN");
const fmtMoney = n => {
  const v = Number(n||0);
  if (v >= 1e7) return `₹${(v/1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v/1e5).toFixed(1)}L`;
  return `₹${fmt(v)}`;
};

/* ═══════════════════════════════════════
   PARSER — stops at TOTAL row to avoid
   reading the annual breakdown block
═══════════════════════════════════════ */
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read error"));
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        let parsed = [];

        for (const sheetName of wb.SheetNames) {
          const ws  = wb.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

          // Find header row containing "Total Students"
          let hdrIdx = -1;
          for (let i = 0; i < Math.min(raw.length, 12); i++) {
            if (raw[i].map(c => String(c).trim()).includes("Total Students")) {
              hdrIdx = i; break;
            }
          }
          if (hdrIdx === -1) continue;

          const headers = raw[hdrIdx].map(c => String(c).trim());
          const col = name => headers.findIndex(h => h === name);

          const idxYM  = col("Year-Month");
          const idxYr  = col("Year");
          const idxMo  = col("Month");
          const idxTS  = col("Total Students");
          const idxM   = col("Male");
          const idxF   = col("Female");
          const idxInt = col("Interested");
          const idxOff = col("Offered");
          const idxDrp = col("Dropped");
          const idxJv  = col("Java Full Stack");
          const idxPy  = col("Python Full Stack");
          const idxTP  = col("Total Paid (₹)");
          const idxTPN = col("Total Pending (₹)");

          if (idxTS === -1) continue;

          const FULL = {
            january:"Jan",february:"Feb",march:"Mar",april:"Apr",
            may:"May",june:"Jun",july:"Jul",august:"Aug",
            september:"Sep",october:"Oct",november:"Nov",december:"Dec"
          };
          const NUM  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

          for (let i = hdrIdx + 1; i < raw.length; i++) {
            const row   = raw[i];
            if (!row) continue;
            const cell0 = String(row[0]||"").trim().toUpperCase();

            // Hard stop — everything after TOTAL row is summary data, not monthly rows
            if (cell0 === "TOTAL" || cell0.startsWith("ANNUAL") || cell0 === "" || cell0 === "NAN") break;
            if (cell0 === "YEAR") continue;

            let year = "", month = "";
            if (idxYM !== -1 && String(row[idxYM]||"").includes("-")) {
              const [y, m] = String(row[idxYM]).split("-");
              year  = y.trim();
              const mn = parseInt(m);
              month = (mn >= 1 && mn <= 12) ? NUM[mn-1] : "";
            } else if (idxYr !== -1 && idxMo !== -1) {
              year = String(row[idxYr]||"").trim();
              const lc = String(row[idxMo]||"").trim().toLowerCase();
              month = FULL[lc] || (lc.length >= 3 ? lc[0].toUpperCase()+lc.slice(1,3) : "");
            }

            if (!/^\d{4}$/.test(year)) continue;
            if (!VALID_MONTHS.has(month)) continue;
            const ts = Number(row[idxTS]||0);
            if (!ts || isNaN(ts) || ts <= 0) continue;

            parsed.push({
              yearMonth: `${year}-${month}`, year, month,
              totalStudents: ts,
              male:       +row[idxM]   || 0,
              female:     +row[idxF]   || 0,
              interested: +row[idxInt] || 0,
              offered:    +row[idxOff] || 0,
              dropped:    +row[idxDrp] || 0,
              javaFS:     +row[idxJv]  || 0,
              pythonFS:   +row[idxPy]  || 0,
              totalPaid:  +row[idxTP]  || 0,
              totalPending: +row[idxTPN] || 0,
            });
          }

          if (parsed.length > 0) break;
        }

        if (!parsed.length) {
          reject(new Error("No data found. Upload the Year-Month Summary Excel file.")); return;
        }
        parsed.sort((a, b) => a.year !== b.year
          ? a.year.localeCompare(b.year)
          : MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month));
        resolve(parsed);
      } catch (err) { reject(new Error("Parse error: " + err.message)); }
    };
    reader.readAsBinaryString(file);
  });
}

/* ═══════════ SHARED UI ═══════════ */
const Tooltip_ = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"rgba(255,255,255,0.98)",border:"1px solid rgba(15,23,42,0.10)",
      borderRadius:10,padding:"12px 16px",backdropFilter:"blur(10px)",
      boxShadow:"0 20px 40px rgba(15,23,42,0.12)",minWidth:160}}>
      <div style={{color:"#94a3b8",fontSize:11,marginBottom:8,letterSpacing:1,textTransform:"uppercase"}}>{label}</div>
      {payload.map((p,i)=>{
        const isMoney = ["revenue","paid","pending","rev"].some(w=>(p.name||"").toLowerCase().includes(w));
        return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:p.fill||p.stroke,flexShrink:0}}/>
            <span style={{color:"#0f172a",fontSize:12}}>{p.name}:</span>
            <span style={{color:"#0f172a",fontWeight:800,fontSize:12,marginLeft:"auto",paddingLeft:8}}>
              {isMoney ? fmtMoney(p.value) : fmt(p.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const Kpi = ({ title, value, sub, color, icon }) => (
  <div
    style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.08)",
      borderRadius:14,padding:"18px 20px",position:"relative",overflow:"hidden",
      transition:"transform .2s,box-shadow .2s",cursor:"default"}}
    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 16px 40px rgba(0,0,0,0.3),0 0 0 1px ${color}50`}}
    onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=""}}
  >
    <div style={{position:"absolute",top:-16,right:-16,width:64,height:64,borderRadius:"50%",background:color,opacity:.12,filter:"blur(18px)"}}/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:11,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{title}</div>
        <div style={{fontSize:26,fontWeight:900,color:"#0f172a",lineHeight:1,marginBottom:4}}>{value}</div>
        <div style={{fontSize:11,color:"#475569"}}>{sub}</div>
      </div>
      <div style={{fontSize:26,opacity:.5}}>{icon}</div>
    </div>
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,
      background:`linear-gradient(90deg,transparent,${color},transparent)`,opacity:.5}}/>
  </div>
);

const Card = ({ title, accent="#6366f1", badge, children }) => (
  <div style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.08)",
    borderRadius:18,padding:"24px",marginBottom:24}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:3,height:20,background:accent,borderRadius:2}}/>
        <h3 style={{margin:0,fontSize:16,fontWeight:800,color:"#0f172a",letterSpacing:-.3}}>{title}</h3>
      </div>
      {badge&&<div style={{background:`${accent}20`,color:accent,borderRadius:20,
        padding:"3px 12px",fontSize:10,fontWeight:700,letterSpacing:1}}>{badge}</div>}
    </div>
    {children}
  </div>
);

const ax = { tick:{fill:"#475569",fontSize:11}, axisLine:{stroke:"#1e293b"}, tickLine:false };

const predictEnrollmentStrength = (historicalData, timeHorizon = 3) => {
  if (!historicalData || historicalData.length < 3) {
    return { prediction: 45, confidence: 0.65, trend: "insufficient_data" };
  }

  const recent = historicalData.slice(-12);
  const growthRates = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = Number(recent[i - 1]?.totalStudents || 0);
    const cur = Number(recent[i]?.totalStudents || 0);
    if (prev > 0) growthRates.push((cur - prev) / prev);
  }
  const avgGrowth = growthRates.length ? growthRates.reduce((s, r) => s + r, 0) / growthRates.length : 0;
  const last = recent[recent.length - 1];
  const base = Number(last?.totalStudents || 0) * (1 + avgGrowth * timeHorizon);

  return {
    prediction: Math.max(0, Math.round(base)),
    confidence: Math.min(0.893, 0.6 + (historicalData.length / 24) * 0.3),
    trend: avgGrowth > 0.05 ? "growing" : avgGrowth < -0.05 ? "declining" : "stable",
  };
};

const BUBUChatbot = ({ data, isVisible, onClose }) => {
  const [messages, setMessages] = useState([
    { sender: "BUBU", text: "Hi, I’m BUBU. Ask me: predict student strength.", timestamp: Date.now() },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const replyFor = async (text) => {
    const t = String(text || "").toLowerCase();
    if (t.includes("predict") || t.includes("strength") || t.includes("student") || t.includes("enroll")) {
      const p = predictEnrollmentStrength(data, 3);
      return `Prediction (next 3 months): ${p.prediction} students\nConfidence: ${(p.confidence * 100).toFixed(1)}%\nTrend: ${p.trend}`;
    }
    return "Ask me: predict student strength";
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return;
    const userText = inputValue;
    setInputValue("");
    setMessages((m) => [...m, { sender: "You", text: userText, timestamp: Date.now() }]);
    setIsTyping(true);
    const botText = await replyFor(userText);
    setMessages((m) => [...m, { sender: "BUBU", text: botText, timestamp: Date.now() }]);
    setIsTyping(false);
  };

  if (!isVisible) return null;

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, width: 380, height: 520, zIndex: 9999,
      background: "rgba(15,23,42,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
      boxShadow: "0 24px 60px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 13 }}>BUBU AI</div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)", color: "#e2e8f0", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: msg.sender === "You" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", whiteSpace: "pre-wrap", padding: "10px 12px", borderRadius: 14,
              background: msg.sender === "You" ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.06)",
              color: "#e2e8f0", fontSize: 12, lineHeight: 1.5 }}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && <div style={{ color: "#94a3b8", fontSize: 12 }}>BUBU is thinking…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10 }}>
        <input value={inputValue} onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, padding: "10px 12px", color: "#e2e8f0", outline: "none", fontSize: 12 }}
          placeholder="Ask BUBU…" />
        <button onClick={handleSend} disabled={!inputValue.trim() || isTyping}
          style={{ padding: "10px 12px", borderRadius: 12, border: "none", cursor: "pointer",
            background: !inputValue.trim() || isTyping ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff", fontWeight: 800, fontSize: 12 }}>
          Send
        </button>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════
   MAIN
═══════════════════════════════════════════ */
export default function Dashboard() {

  const [tab,        setTab]       = useState("ANALYTICS");
  const [data,       setData]      = useState([]);
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState("");
  const [success,    setSuccess]   = useState(false);
  const [drag,       setDrag]      = useState(false);
  const [selYear,    setSelYear]   = useState("ALL");
  const [finYear,    setFinYear]   = useState("ALL");
  const [manualRows, setManualRows]= useState([]);
  const [mEntry,     setMEntry]    = useState({year:"",month:"",count:""});
  const [vis,        setVis]       = useState({
    overview:true, gender:true, course:true, status:true, monthly:true, radar:true
  });
  const [showChatbot, setShowChatbot] = useState(false);

  const handleFile = async file => {
    if (!file) return;
    setLoading(true); setError(""); setSuccess(false);
    try { const rows = await parseExcelFile(file); setData(rows); setSuccess(true); }
    catch(err) { setError(err.message); }
    setLoading(false);
  };

  const allYears = useMemo(()=>[...new Set(data.map(r=>r.year))].sort(),[data]);

  // ── ANALYTICS tab data (no revenue) ──
  const aRows = useMemo(()=>selYear==="ALL"?data:data.filter(r=>r.year===selYear),[data,selYear]);
  const K = useMemo(()=>({
    students:  aRows.reduce((s,r)=>s+r.totalStudents,0),
    offered:   aRows.reduce((s,r)=>s+r.offered,0),
    dropped:   aRows.reduce((s,r)=>s+r.dropped,0),
    javaFS:    aRows.reduce((s,r)=>s+r.javaFS,0),
    pythonFS:  aRows.reduce((s,r)=>s+r.pythonFS,0),
    male:      aRows.reduce((s,r)=>s+r.male,0),
    female:    aRows.reduce((s,r)=>s+r.female,0),
    interested:aRows.reduce((s,r)=>s+r.interested,0),
  }),[aRows]);
  const placementRate = K.students>0?((K.offered/K.students)*100).toFixed(1):0;

  const yearData = useMemo(()=>{
    const m={};
    aRows.forEach(r=>{
      if(!m[r.year]) m[r.year]={year:r.year,totalStudents:0,offered:0,dropped:0,
        male:0,female:0,javaFS:0,pythonFS:0,interested:0};
      const y=m[r.year];
      y.totalStudents+=r.totalStudents; y.offered+=r.offered; y.dropped+=r.dropped;
      y.male+=r.male; y.female+=r.female; y.javaFS+=r.javaFS;
      y.pythonFS+=r.pythonFS; y.interested+=r.interested;
    });
    return Object.values(m).sort((a,b)=>a.year.localeCompare(b.year));
  },[aRows]);

  const monthlyData = useMemo(()=>{
    const m={};MONTHS.forEach(mo=>{m[mo]={month:mo};});
    aRows.forEach(r=>{
      if(!m[r.month])return;
      m[r.month][`s_${r.year}`]=(m[r.month][`s_${r.year}`]||0)+r.totalStudents;
      m[r.month][`o_${r.year}`]=(m[r.month][`o_${r.year}`]||0)+r.offered;
    });
    return Object.values(m);
  },[aRows]);

  const radarData = useMemo(()=>{
    const maxS=Math.max(...yearData.map(d=>d.totalStudents),1);
    const maxO=Math.max(...yearData.map(d=>d.offered),1);
    return [
      {metric:"Students",  ...Object.fromEntries(yearData.map(d=>[d.year,Math.round(d.totalStudents/maxS*100)]))},
      {metric:"Placed",    ...Object.fromEntries(yearData.map(d=>[d.year,Math.round(d.offered/maxO*100)]))},
      {metric:"Java FS",   ...Object.fromEntries(yearData.map(d=>[d.year,Math.round(d.javaFS/maxS*100)]))},
      {metric:"Python FS", ...Object.fromEntries(yearData.map(d=>[d.year,Math.round(d.pythonFS/maxS*100)]))},
      {metric:"Male",      ...Object.fromEntries(yearData.map(d=>[d.year,Math.round(d.male/maxS*100)]))},
      {metric:"Female",    ...Object.fromEntries(yearData.map(d=>[d.year,Math.round(d.female/maxS*100)]))},
    ];
  },[yearData]);

  const statusData=[
    {name:"Interested",value:K.interested,color:C.amber},
    {name:"Offered",   value:K.offered,   color:C.emerald},
    {name:"Dropped",   value:K.dropped,   color:C.rose},
  ].filter(d=>d.value>0);

  const genderData=[
    {name:"Male",  value:K.male,   color:C.sky},
    {name:"Female",value:K.female, color:C.pink},
  ];

  // ── FINANCE tab data ──
  const fRows = useMemo(()=>finYear==="ALL"?data:data.filter(r=>r.year===finYear),[data,finYear]);
  const FK = useMemo(()=>({
    revenue: fRows.reduce((s,r)=>s+r.totalPaid,0),
    pending: fRows.reduce((s,r)=>s+r.totalPending,0),
    students:fRows.reduce((s,r)=>s+r.totalStudents,0),
  }),[fRows]);
  const finYearData = useMemo(()=>{
    const m={};
    fRows.forEach(r=>{
      if(!m[r.year]) m[r.year]={year:r.year,revenue:0,pending:0,totalStudents:0};
      m[r.year].revenue+=r.totalPaid; m[r.year].pending+=r.totalPending; m[r.year].totalStudents+=r.totalStudents;
    });
    return Object.values(m).sort((a,b)=>a.year.localeCompare(b.year));
  },[fRows]);
  const finMonthly = useMemo(()=>{
    const m={};MONTHS.forEach(mo=>{m[mo]={month:mo};});
    fRows.forEach(r=>{
      if(!m[r.month])return;
      m[r.month][`r_${r.year}`]=(m[r.month][`r_${r.year}`]||0)+r.totalPaid;
      m[r.month][`p_${r.year}`]=(m[r.month][`p_${r.year}`]||0)+r.totalPending;
    });
    return Object.values(m);
  },[fRows]);

  // ── MANUAL tab data ──
  const manualYears=[...new Set(manualRows.map(d=>d.year))];
  const manualChart=MONTHS.map(m=>{
    const row={month:m};
    manualYears.forEach(y=>{row[y]=manualRows.filter(d=>d.year===y&&d.month===m).reduce((s,d)=>s+d.count,0);});
    return row;
  });

  /* ════ RENDER ════ */
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#f8fafc 0%, #eef2ff 45%, #ffffff 100%)",fontFamily:"'DM Sans',-apple-system,sans-serif",color:"#0f172a"}}>

      {/* bg grid */}
      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:"linear-gradient(rgba(15,23,42,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,0.04) 1px,transparent 1px)",
        backgroundSize:"44px 44px"}}/>

      {/* ── HEADER ── */}
      <header style={{position:"sticky",top:0,zIndex:100,
        background:"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",
        borderBottom:"1px solid rgba(15,23,42,0.08)",
        padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:62}}>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,
            boxShadow:"0 0 20px rgba(99,102,241,0.45)"}}>⚡</div>
          <div>
            <div style={{fontWeight:900,fontSize:15,color:"#0f172a"}}>ThopsTech</div>
            <div style={{fontSize:10,color:"#475569",letterSpacing:1,textTransform:"uppercase"}}>Career Solutions</div>
          </div>
        </div>

        {/* Tab nav — 3 tabs */}
        <div style={{display:"flex",gap:5,background:"rgba(255,255,255,0.04)",
          borderRadius:11,padding:"4px",border:"1px solid rgba(255,255,255,0.07)"}}>
          {[
            ["ANALYTICS","📊 Analytics",     "linear-gradient(135deg,#6366f1,#8b5cf6)","rgba(99,102,241,0.4)"],
            ["MANUAL",   "✏️ Manual Entry",  "linear-gradient(135deg,#6366f1,#8b5cf6)","rgba(99,102,241,0.4)"],
            ["FINANCE",  "🔒 Finance",        "linear-gradient(135deg,#f59e0b,#ef4444)","rgba(245,158,11,0.4)"],
          ].map(([t,label,grad,shadow])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              padding:"8px 18px",border:"none",borderRadius:8,fontWeight:700,
              cursor:"pointer",fontSize:12,transition:"all .2s",
              background:tab===t?grad:"transparent",
              color:tab===t?"#fff":"#64748b",
              boxShadow:tab===t?`0 4px 14px ${shadow}`:"none"
            }}>{label}</button>
          ))}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {data.length>0&&(
            <span style={{background:"rgba(16,185,129,0.12)",border:"1px solid rgba(16,185,129,0.25)",
              borderRadius:20,padding:"4px 14px",fontSize:11,color:"#10b981",fontWeight:600}}>
              ✓ {data.length} months · {allYears.join(", ")}
            </span>
          )}
          {/* Year filter shown only on Analytics tab */}
          {allYears.length>0 && tab==="ANALYTICS" &&(
            <select value={selYear} onChange={e=>setSelYear(e.target.value)}
              style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:8,padding:"6px 12px",color:"#e2e8f0",fontSize:12,cursor:"pointer"}}>
              <option value="ALL">All Years</option>
              {allYears.map(y=><option key={y}>{y}</option>)}
            </select>
          )}
          {/* Separate year filter for Finance tab */}
          {allYears.length>0 && tab==="FINANCE" &&(
            <select value={finYear} onChange={e=>setFinYear(e.target.value)}
              style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:8,padding:"6px 12px",color:"#e2e8f0",fontSize:12,cursor:"pointer"}}>
              <option value="ALL">All Years</option>
              {allYears.map(y=><option key={y}>{y}</option>)}
            </select>
          )}
        </div>
      </header>

      <main style={{position:"relative",zIndex:1,padding:"28px",maxWidth:1380,margin:"0 auto"}}>

        {/* ════════════════════════════════════
            ANALYTICS TAB — students & placement only, zero revenue
        ════════════════════════════════════ */}
        {tab==="ANALYTICS"&&(
          <>
            {/* Upload zone (shown when no data loaded) */}
            {!success&&(
              <div
                onDragOver={e=>{e.preventDefault();setDrag(true)}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
                onClick={()=>document.getElementById("xl").click()}
                style={{border:`2px dashed ${drag?"#6366f1":"rgba(255,255,255,0.1)"}`,
                  borderRadius:18,padding:"52px 32px",textAlign:"center",
                  background:drag?"rgba(99,102,241,0.06)":"rgba(255,255,255,0.02)",
                  marginBottom:28,transition:"all .3s",cursor:"pointer"}}>
                <input type="file" id="xl" accept=".xlsx,.xls" style={{display:"none"}}
                  onChange={e=>handleFile(e.target.files[0])}/>
                <div style={{fontSize:48,marginBottom:14}}>📂</div>
                <div style={{fontSize:17,fontWeight:700,color:"#cbd5e1",marginBottom:8}}>
                  Drop your <span style={{color:"#818cf8"}}>Year-Month Summary</span> Excel here
                </div>
                <div style={{color:"#475569",fontSize:13}}>or click to browse · .xlsx / .xls</div>
                {loading&&<div style={{marginTop:20,color:"#6366f1",fontWeight:600}}>⏳ Parsing…</div>}
                {error&&<div style={{marginTop:16,color:"#f43f5e",fontSize:13,
                  background:"rgba(244,63,94,0.08)",borderRadius:8,padding:"10px 16px"}}>❌ {error}</div>}
              </div>
            )}

            {success&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{color:"#10b981",fontSize:13,fontWeight:600}}>
                  ✅ {data.length} monthly records · Total {fmt(data.reduce((s,r)=>s+r.totalStudents,0))} students
                </div>
                <button onClick={()=>{setData([]);setSuccess(false);setError("")}}
                  style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                    borderRadius:8,padding:"6px 16px",color:"#94a3b8",cursor:"pointer",fontSize:12}}>
                  ↩ Upload new file
                </button>
              </div>
            )}

            {data.length>0&&(
              <>
                {/* ── KPIs: students & placement ONLY ── */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginBottom:28}}>
                  <Kpi title="Total Students"   value={fmt(K.students)}  sub={selYear==="ALL"?`${allYears.join(" · ")}`:selYear}  color={C.indigo}  icon="🎓"/>
                  <Kpi title="Placed"           value={fmt(K.offered)}   sub={`${placementRate}% placement rate`}                  color={C.emerald} icon="🤝"/>
                  <Kpi title="Interested"       value={fmt(K.interested)}sub="Actively engaged"                                    color={C.cyan}    icon="🎯"/>
                  <Kpi title="Dropped"          value={fmt(K.dropped)}   sub="Did not complete"                                    color={C.rose}    icon="📉"/>
                  <Kpi title="Java Full Stack"  value={fmt(K.javaFS)}    sub={`${K.students>0?((K.javaFS/K.students)*100).toFixed(0):0}% of students`}   color={C.orange} icon="☕"/>
                  <Kpi title="Python Full Stack"value={fmt(K.pythonFS)}  sub={`${K.students>0?((K.pythonFS/K.students)*100).toFixed(0):0}% of students`} color={C.teal}   icon="🐍"/>
                </div>

                {/* ── Section toggles ── */}
                <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:22}}>
                  {[
                    ["overview","📈 Enrollment Overview"],
                    ["monthly", "📅 Monthly Trends"],
                    ["status",  "📊 Status Breakdown"],
                    ["course",  "📚 Course Split"],
                    ["gender",  "⚧ Gender"],
                    ["radar",   "🕸 Radar"],
                  ].map(([k,label])=>(
                    <button key={k} onClick={()=>setVis(v=>({...v,[k]:!v[k]}))} style={{
                      padding:"5px 14px",borderRadius:20,border:"1px solid",
                      borderColor:vis[k]?"#6366f1":"rgba(255,255,255,0.08)",
                      background:vis[k]?"rgba(99,102,241,0.15)":"transparent",
                      color:vis[k]?"#818cf8":"#475569",
                      fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .2s"}}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── CHART 1: Year-wise enrollment & placement bar ── */}
                {vis.overview&&(
                  <Card title="Year-wise Student Enrollment & Placement" accent={C.indigo} badge="BAR CHART">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={yearData} barGap={4} barCategoryGap="28%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                        <XAxis dataKey="year" {...ax}/><YAxis {...ax}/>
                        <Tooltip content={<Tooltip_/>}/>
                        <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                        <Bar dataKey="totalStudents" name="Total Students" fill={C.indigo}  radius={[5,5,0,0]}/>
                        <Bar dataKey="offered"       name="Placed"         fill={C.emerald} radius={[5,5,0,0]}/>
                        <Bar dataKey="interested"    name="Interested"     fill={C.cyan}    radius={[5,5,0,0]}/>
                        <Bar dataKey="dropped"       name="Dropped"        fill={C.rose}    radius={[5,5,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* ── CHART 2+3: Monthly enrollment & offers lines ── */}
                {vis.monthly&&(
                  <>
                    <Card title="Month-wise Student Enrollment by Year" accent={C.cyan} badge="MULTI-LINE">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<Tooltip_/>}/>
                          <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                          {allYears.map((y,i)=>(
                            <Line key={y} type="monotone" dataKey={`s_${y}`} name={y}
                              stroke={PALETTE[i%PALETTE.length]} strokeWidth={3}
                              dot={{fill:PALETTE[i%PALETTE.length],r:4,strokeWidth:0}}
                              activeDot={{r:7,strokeWidth:0}} connectNulls/>
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>

                    <Card title="Month-wise Placements by Year" accent={C.emerald} badge="BAR">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={monthlyData} barGap={2} barCategoryGap="22%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<Tooltip_/>}/>
                          <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                          {allYears.map((y,i)=>(
                            <Bar key={y} dataKey={`o_${y}`} name={y} fill={PALETTE[i%PALETTE.length]} radius={[4,4,0,0]}/>
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </>
                )}

                {/* ── CHART 4+5: Status & Gender pies side-by-side ── */}
                {(vis.status||vis.gender)&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
                    {vis.status&&(
                      <Card title="Student Status Distribution" accent={C.violet} badge="DONUT">
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                              paddingAngle={5} dataKey="value"
                              label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                              labelLine={{stroke:"rgba(255,255,255,0.15)"}}>
                              {statusData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                            </Pie>
                            <Tooltip content={<Tooltip_/>}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </Card>
                    )}
                    {vis.gender&&(
                      <Card title="Gender Distribution" accent={C.pink} badge="PIE + STACKED">
                        <ResponsiveContainer width="100%" height={145}>
                          <PieChart>
                            <Pie data={genderData} cx="50%" cy="50%" innerRadius={38} outerRadius={65}
                              paddingAngle={4} dataKey="value"
                              label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                              labelLine={{stroke:"rgba(255,255,255,0.15)"}}>
                              {genderData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                            </Pie>
                            <Tooltip content={<Tooltip_/>}/>
                          </PieChart>
                        </ResponsiveContainer>
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={yearData} barCategoryGap="40%">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                            <XAxis dataKey="year" {...ax}/><YAxis {...ax}/>
                            <Tooltip content={<Tooltip_/>}/>
                            <Bar dataKey="male"   name="Male"   stackId="g" fill={C.sky}  radius={[0,0,3,3]}/>
                            <Bar dataKey="female" name="Female" stackId="g" fill={C.pink} radius={[3,3,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </Card>
                    )}
                  </div>
                )}

                {/* ── CHART 6: Course split ── */}
                {vis.course&&(
                  <Card title="Course-wise Enrollment by Year" accent={C.orange} badge="GROUPED BAR">
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18,alignItems:"center"}}>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={yearData} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="year" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<Tooltip_/>}/>
                          <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                          <Bar dataKey="javaFS"   name="Java Full Stack"   fill={C.orange} radius={[5,5,0,0]}/>
                          <Bar dataKey="pythonFS" name="Python Full Stack" fill={C.teal}   radius={[5,5,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {[{name:"Java Full Stack",val:K.javaFS,color:C.orange},{name:"Python Full Stack",val:K.pythonFS,color:C.teal}].map(c=>(
                          <div key={c.name} style={{padding:"14px 16px",borderRadius:12,
                            background:`${c.color}12`,border:`1px solid ${c.color}30`}}>
                            <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>{c.name}</div>
                            <div style={{fontSize:24,fontWeight:800,color:c.color}}>{fmt(c.val)}</div>
                            <div style={{marginTop:8,height:4,borderRadius:4,background:"rgba(255,255,255,0.05)"}}>
                              <div style={{height:"100%",borderRadius:4,background:c.color,transition:"width 1s",
                                width:`${K.students>0?(c.val/K.students*100):0}%`}}/>
                            </div>
                            <div style={{fontSize:10,color:"#64748b",marginTop:4}}>
                              {K.students>0?((c.val/K.students)*100).toFixed(1):0}% of total
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                )}

                {/* ── CHART 7: Radar ── */}
                {vis.radar&&allYears.length>1&&(
                  <Card title="Multi-Year Performance Radar" accent={C.violet} badge="RADAR">
                    <ResponsiveContainer width="100%" height={320}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.06)"/>
                        <PolarAngleAxis dataKey="metric" tick={{fill:"#64748b",fontSize:12}}/>
                        {allYears.map((y,i)=>(
                          <Radar key={y} name={y} dataKey={y}
                            stroke={PALETTE[i%PALETTE.length]} fill={PALETTE[i%PALETTE.length]}
                            fillOpacity={0.1} strokeWidth={2}/>
                        ))}
                        <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                        <Tooltip content={<Tooltip_/>}/>
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* ── Per-year monthly drilldown (students only) ── */}
                {yearData.map(yd=>{
                  const color=YEAR_COLOR[yd.year]||C.indigo;
                  const mRows=data.filter(r=>r.year===yd.year)
                    .sort((a,b)=>MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month));
                  return (
                    <Card key={yd.year} title={`${yd.year} — Monthly Breakdown`}
                      accent={color} badge={`${fmt(yd.totalStudents)} students`}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                        {[
                          {l:"Students",  v:fmt(yd.totalStudents), c:color},
                          {l:"Placed",    v:fmt(yd.offered),        c:C.emerald},
                          {l:"Interested",v:fmt(yd.interested),     c:C.cyan},
                          {l:"Placement %",v:`${yd.totalStudents>0?((yd.offered/yd.totalStudents)*100).toFixed(1):0}%`,c:C.violet},
                        ].map(item=>(
                          <div key={item.l} style={{textAlign:"center",padding:"10px 6px",borderRadius:10,
                            background:`${item.c}12`,border:`1px solid ${item.c}25`}}>
                            <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{item.l}</div>
                            <div style={{fontSize:18,fontWeight:800,color:item.c}}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={mRows} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<Tooltip_/>}/>
                          <Legend wrapperStyle={{color:"#94a3b8",fontSize:11,paddingTop:8}}/>
                          <Bar dataKey="totalStudents" name="Students"   fill={color}     radius={[4,4,0,0]}/>
                          <Bar dataKey="offered"       name="Placed"     fill={C.emerald} radius={[4,4,0,0]}/>
                          <Bar dataKey="interested"    name="Interested" fill={C.cyan}    radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════
            FINANCE TAB — revenue only, separate from team view
        ════════════════════════════════════ */}
        {tab==="FINANCE"&&(
          <>
            {!data.length&&(
              <div style={{textAlign:"center",padding:"60px 32px",
                border:"2px dashed rgba(255,255,255,0.1)",borderRadius:18,
                background:"rgba(255,255,255,0.02)"}}>
                <div style={{fontSize:40,marginBottom:12}}>🔒</div>
                <div style={{color:"#64748b",fontSize:15}}>
                  Upload data in the <strong style={{color:"#818cf8"}}>Analytics</strong> tab first
                </div>
              </div>
            )}

            {data.length>0&&(
              <>
                {/* Finance warning banner */}
                <div style={{display:"flex",alignItems:"center",gap:12,
                  background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",
                  borderRadius:12,padding:"12px 20px",marginBottom:24}}>
                  <span style={{fontSize:18}}>🔒</span>
                  <span style={{color:"#fbbf24",fontSize:13,fontWeight:600}}>
                    Finance view — revenue data is not shown in the Analytics tab
                  </span>
                </div>

                {/* Finance KPIs */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:28}}>
                  <Kpi title="Total Revenue"   value={fmtMoney(FK.revenue)} sub="Amount collected"    color={C.amber}   icon="💰"/>
                  <Kpi title="Total Pending"   value={fmtMoney(FK.pending)} sub="Outstanding amount"  color={C.rose}    icon="⏳"/>
                  <Kpi title="Collection Rate" value={`${(FK.revenue+FK.pending)>0?((FK.revenue/(FK.revenue+FK.pending))*100).toFixed(1):0}%`}
                    sub="Revenue / (Revenue + Pending)" color={C.emerald} icon="📈"/>
                  <Kpi title="Avg per Student" value={fmtMoney(FK.students>0?Math.round(FK.revenue/FK.students):0)}
                    sub="Revenue per student" color={C.violet} icon="🎓"/>
                </div>

                {/* Year-wise revenue bar */}
                <Card title="Year-wise Revenue vs Pending" accent={C.amber} badge="BAR CHART">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={finYearData} barGap={6} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="year" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      <Bar dataKey="revenue" name="Revenue Collected" fill={C.amber}   radius={[5,5,0,0]}/>
                      <Bar dataKey="pending" name="Pending"           fill={C.rose}    radius={[5,5,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Year-wise revenue area trend */}
                <Card title="Revenue Trend (Year-wise)" accent={C.amber} badge="AREA">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={finYearData}>
                      <defs>
                        <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.amber} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={C.amber} stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="gPen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.rose} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={C.rose} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="year" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.amber} fill="url(#gRev)" strokeWidth={3} dot={{fill:C.amber,r:5,strokeWidth:0}}/>
                      <Area type="monotone" dataKey="pending" name="Pending" stroke={C.rose}  fill="url(#gPen)" strokeWidth={2} dot={{fill:C.rose, r:4,strokeWidth:0}}/>
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>

                {/* Monthly revenue by year */}
                <Card title="Month-wise Revenue by Year" accent={C.emerald} badge="AREA">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={finMonthly}>
                      <defs>
                        {allYears.map((y,i)=>(
                          <linearGradient key={y} id={`fr${y}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={PALETTE[i%PALETTE.length]} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={PALETTE[i%PALETTE.length]} stopOpacity={0}/>
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      {allYears.map((y,i)=>(
                        <Area key={y} type="monotone" dataKey={`r_${y}`} name={`${y} Revenue`}
                          stroke={PALETTE[i%PALETTE.length]} fill={`url(#fr${y})`}
                          strokeWidth={2} connectNulls/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Monthly pending by year */}
                <Card title="Month-wise Pending by Year" accent={C.rose} badge="LINE">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={finMonthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      {allYears.map((y,i)=>(
                        <Line key={y} type="monotone" dataKey={`p_${y}`} name={`${y} Pending`}
                          stroke={PALETTE[i%PALETTE.length]} strokeWidth={2.5}
                          dot={{fill:PALETTE[i%PALETTE.length],r:3,strokeWidth:0}} connectNulls/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Per-year financial drilldown */}
                {finYearData.map(yd=>{
                  const color=YEAR_COLOR[yd.year]||C.amber;
                  const mRows=data.filter(r=>r.year===yd.year)
                    .sort((a,b)=>MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month));
                  const collRate=(yd.revenue+yd.pending)>0?((yd.revenue/(yd.revenue+yd.pending))*100).toFixed(1):0;
                  return (
                    <Card key={yd.year} title={`${yd.year} — Financial Breakdown`}
                      accent={C.amber} badge={fmtMoney(yd.revenue)+" collected"}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                        {[
                          {l:"Revenue",     v:fmtMoney(yd.revenue), c:C.amber},
                          {l:"Pending",     v:fmtMoney(yd.pending), c:C.rose},
                          {l:"Collection", v:`${collRate}%`,         c:C.emerald},
                          {l:"Avg/Student", v:fmtMoney(yd.totalStudents>0?Math.round(yd.revenue/yd.totalStudents):0), c:C.violet},
                        ].map(item=>(
                          <div key={item.l} style={{textAlign:"center",padding:"10px 6px",borderRadius:10,
                            background:`${item.c}12`,border:`1px solid ${item.c}25`}}>
                            <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{item.l}</div>
                            <div style={{fontSize:16,fontWeight:800,color:item.c}}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={mRows} barCategoryGap="35%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/>
                          <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                          <Tooltip content={<Tooltip_/>}/>
                          <Legend wrapperStyle={{color:"#94a3b8",fontSize:11,paddingTop:8}}/>
                          <Bar dataKey="totalPaid"    name="Collected" fill={C.amber} radius={[4,4,0,0]}/>
                          <Bar dataKey="totalPending" name="Pending"   fill={C.rose}  radius={[4,4,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════
            MANUAL TAB
        ════════════════════════════════════ */}
        {tab==="MANUAL"&&(
          <>
            <Card title="Add Monthly Data Manually" accent={C.indigo}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:12,alignItems:"end"}}>
                <input type="text" placeholder="Year (e.g. 2024)" value={mEntry.year}
                  onChange={e=>setMEntry(v=>({...v,year:e.target.value}))}
                  style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                    borderRadius:9,padding:"11px 14px",color:"#e2e8f0",fontSize:13,outline:"none"}}/>
                <select value={mEntry.month} onChange={e=>setMEntry(v=>({...v,month:e.target.value}))}
                  style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                    borderRadius:9,padding:"11px 14px",color:"#e2e8f0",fontSize:13}}>
                  <option value="">Select Month</option>
                  {MONTHS.map(m=><option key={m}>{m}</option>)}
                </select>
                <input type="number" placeholder="Count" value={mEntry.count}
                  onChange={e=>setMEntry(v=>({...v,count:e.target.value}))}
                  style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                    borderRadius:9,padding:"11px 14px",color:"#e2e8f0",fontSize:13,outline:"none"}}/>
                <button onClick={()=>{
                  if(!mEntry.year||!mEntry.month||!mEntry.count)return;
                  setManualRows(p=>[...p,{...mEntry,count:+mEntry.count}]);
                  setMEntry(v=>({...v,month:"",count:""}));
                }} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",
                  borderRadius:9,padding:"11px 22px",color:"#fff",fontWeight:700,
                  cursor:"pointer",fontSize:13,boxShadow:"0 4px 14px rgba(99,102,241,0.4)"}}>
                  + Add
                </button>
              </div>
              {manualRows.length>0&&(
                <div style={{marginTop:14,display:"flex",flexWrap:"wrap",gap:7}}>
                  {manualRows.slice(-12).map((d,i)=>(
                    <span key={i} style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.2)",
                      borderRadius:8,padding:"3px 10px",fontSize:11,color:"#818cf8"}}>
                      {d.year} {d.month}: <b>{d.count}</b>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {manualRows.length>0&&(
              <>
                <Card title="Year-wise Monthly Enrollment — Bar" accent={C.indigo} badge="BAR">
                  <ResponsiveContainer width="100%" height={310}>
                    <BarChart data={manualChart} barGap={3} barCategoryGap="22%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      {manualYears.map((y,i)=>(
                        <Bar key={y} dataKey={y} name={y} fill={PALETTE[i%PALETTE.length]} radius={[5,5,0,0]}/>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card title="Year-wise Monthly Enrollment — Line" accent={C.emerald} badge="LINE">
                  <ResponsiveContainer width="100%" height={290}>
                    <LineChart data={manualChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      {manualYears.map((y,i)=>(
                        <Line key={y} type="monotone" dataKey={y} name={y}
                          stroke={PALETTE[i%PALETTE.length]} strokeWidth={3}
                          dot={{fill:PALETTE[i%PALETTE.length],r:5,strokeWidth:0}}
                          activeDot={{r:8,strokeWidth:0}} connectNulls/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card title="Cumulative Area Trend" accent={C.amber} badge="AREA">
                  <ResponsiveContainer width="100%" height={255}>
                    <AreaChart data={manualChart}>
                      <defs>
                        {manualYears.map((y,i)=>(
                          <linearGradient key={y} id={`ag${y}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={PALETTE[i%PALETTE.length]} stopOpacity={0.35}/>
                            <stop offset="95%" stopColor={PALETTE[i%PALETTE.length]} stopOpacity={0}/>
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                      <Tooltip content={<Tooltip_/>}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12,paddingTop:12}}/>
                      {manualYears.map((y,i)=>(
                        <Area key={y} type="monotone" dataKey={y} name={y}
                          stroke={PALETTE[i%PALETTE.length]} fill={`url(#ag${y})`}
                          strokeWidth={2} connectNulls/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </>
            )}
          </>
        )}
      </main>

      <footer style={{position:"relative",zIndex:1,
        borderTop:"1px solid rgba(255,255,255,0.05)",
        padding:"18px 28px",textAlign:"center",color:"#334155",fontSize:11}}>
        2025 ThopsTech Career Solutions · Analytics Dashboard v3.4
      </footer>

      {/* Floating AI Chatbot Button */}
      <button
        onClick={() => setShowChatbot(!showChatbot)}
        style={{
          position: "fixed",
          bottom: 30,
          right: 30,
          width: 68,
          height: 68,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.1)",
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: "#fff",
          transition: "all 0.3s ease",
          transform: showChatbot ? "scale(0.9)" : "scale(1)",
          animation: !showChatbot ? "pulse 2s infinite" : "none"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow = "0 12px 40px rgba(99,102,241,0.6), 0 0 0 1px rgba(255,255,255,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = showChatbot ? "scale(0.9)" : "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.1)";
        }}
      >
        {showChatbot ? "✕" : "🤖"}
      </button>

      {/* BUBU AI Chatbot */}
      <BUBUChatbot 
        data={data} 
        isVisible={showChatbot} 
        onClose={() => setShowChatbot(false)} 
      />

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.1); }
          50% { box-shadow: 0 8px 40px rgba(99,102,241,0.6), 0 0 0 4px rgba(99,102,241,0.2); }
          100% { box-shadow: 0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.1); }
        }
      `}</style>
    </div>
  );
}