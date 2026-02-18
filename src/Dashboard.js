import { useMemo, useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  ResponsiveContainer, AreaChart, Area, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, ComposedChart,
  ScatterChart, Scatter
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
   PARSER
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

/* ═══════════════════════════════════════
   ML ANALYTICS ENGINE
═══════════════════════════════════════ */
class MLAnalytics {
  constructor(data) {
    this.data = data;
    this.models = {};
  }

  // Prepare time series data
  prepareTimeSeries(field) {
    const sorted = [...this.data].sort((a, b) => {
      if (a.year !== b.year) return a.year.localeCompare(b.year);
      return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
    });
    return sorted.map(d => d[field] || 0);
  }

  // Linear Regression using Least Squares Method
  async linearRegression(field, futureMonths = 3) {
    const values = this.prepareTimeSeries(field);
    if (values.length < 3) return null;

    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const predictions = [];
    for (let i = 0; i < futureMonths; i++) {
      const x = n + i;
      const pred = slope * x + intercept;
      predictions.push(Math.max(0, Math.round(pred)));
    }

    return predictions;
  }

  // Moving Average
  movingAverage(field, window = 3) {
    const values = this.prepareTimeSeries(field);
    if (values.length < window) return null;

    const ma = [];
    for (let i = window - 1; i < values.length; i++) {
      const sum = values.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(sum / window);
    }
    return ma;
  }

  // Exponential Smoothing
  exponentialSmoothing(field, alpha = 0.3, futureMonths = 3) {
    const values = this.prepareTimeSeries(field);
    if (values.length < 2) return null;

    let forecast = values[0];
    const smoothed = [forecast];

    for (let i = 1; i < values.length; i++) {
      forecast = alpha * values[i] + (1 - alpha) * forecast;
      smoothed.push(forecast);
    }

    const predictions = [];
    for (let i = 0; i < futureMonths; i++) {
      predictions.push(Math.max(0, Math.round(forecast)));
    }

    return { smoothed, predictions };
  }

  // Polynomial Regression (degree 2)
  polynomialRegression(field, futureMonths = 3) {
    const values = this.prepareTimeSeries(field);
    if (values.length < 4) return null;

    const n = values.length;
    let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
    let sumY = 0, sumXY = 0, sumX2Y = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = values[i];
      sumX += x;
      sumX2 += x * x;
      sumX3 += x * x * x;
      sumX4 += x * x * x * x;
      sumY += y;
      sumXY += x * y;
      sumX2Y += x * x * y;
    }

    const denom = n * sumX2 * sumX4 + 2 * sumX * sumX2 * sumX3 - 
                  sumX2 * sumX2 * sumX2 - n * sumX3 * sumX3 - sumX * sumX * sumX4;
    
    if (Math.abs(denom) < 1e-10) return null;

    const a = (sumY * sumX2 * sumX4 + sumX * sumX2Y * sumX3 + sumXY * sumX2 * sumX3 -
               sumX2 * sumX2Y * sumX2 - sumY * sumX3 * sumX3 - sumXY * sumX * sumX4) / denom;
    const b = (n * sumXY * sumX4 + sumX * sumX2Y * sumX2 + sumY * sumX2 * sumX3 -
               sumX2 * sumXY * sumX2 - n * sumX2Y * sumX3 - sumY * sumX * sumX4) / denom;
    const c = (n * sumX2 * sumX2Y + sumX * sumXY * sumX3 + sumY * sumX * sumX2 -
               sumX2 * sumXY * sumX - n * sumX3 * sumY - sumX * sumX * sumX2Y) / denom;

    const predictions = [];
    for (let i = 0; i < futureMonths; i++) {
      const x = n + i;
      const pred = a + b * x + c * x * x;
      predictions.push(Math.max(0, Math.round(pred)));
    }

    return predictions;
  }

  // Seasonal Decomposition
  seasonalPattern(field) {
    const values = this.prepareTimeSeries(field);
    if (values.length < 12) return null;

    const monthlyAvg = new Array(12).fill(0);
    const monthlyCount = new Array(12).fill(0);

    this.data.forEach(d => {
      const monthIdx = MONTHS.indexOf(d.month);
      if (monthIdx !== -1) {
        monthlyAvg[monthIdx] += d[field] || 0;
        monthlyCount[monthIdx]++;
      }
    });

    const seasonality = monthlyAvg.map((sum, i) => 
      monthlyCount[i] > 0 ? sum / monthlyCount[i] : 0
    );

    return seasonality;
  }

  // Growth Rate Analysis
  growthAnalysis(field) {
    const values = this.prepareTimeSeries(field);
    if (values.length < 2) return null;

    const growthRates = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0) {
        growthRates.push(((values[i] - values[i - 1]) / values[i - 1]) * 100);
      }
    }

    const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    const maxGrowth = Math.max(...growthRates);
    const minGrowth = Math.min(...growthRates);

    return {
      avgGrowth: avgGrowth.toFixed(2),
      maxGrowth: maxGrowth.toFixed(2),
      minGrowth: minGrowth.toFixed(2),
      trend: avgGrowth > 5 ? "Strong Growth" : avgGrowth > 0 ? "Moderate Growth" : 
             avgGrowth > -5 ? "Declining" : "Sharp Decline"
    };
  }

  // Correlation Analysis
  correlation(field1, field2) {
    const values1 = this.prepareTimeSeries(field1);
    const values2 = this.prepareTimeSeries(field2);
    
    if (values1.length !== values2.length || values1.length < 2) return null;

    const n = values1.length;
    const mean1 = values1.reduce((a, b) => a + b, 0) / n;
    const mean2 = values2.reduce((a, b) => a + b, 0) / n;

    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < n; i++) {
      const diff1 = values1[i] - mean1;
      const diff2 = values2[i] - mean2;
      num += diff1 * diff2;
      den1 += diff1 * diff1;
      den2 += diff2 * diff2;
    }

    const corr = num / Math.sqrt(den1 * den2);
    return isNaN(corr) ? 0 : corr;
  }

  // Anomaly Detection
  detectAnomalies(field, threshold = 2) {
    const values = this.prepareTimeSeries(field);
    if (values.length < 3) return [];

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const anomalies = [];
    this.data.forEach((d, i) => {
      const value = d[field] || 0;
      const zScore = Math.abs((value - mean) / stdDev);
      if (zScore > threshold) {
        anomalies.push({
          yearMonth: d.yearMonth,
          value,
          zScore: zScore.toFixed(2),
          deviation: ((value - mean) / mean * 100).toFixed(1)
        });
      }
    });

    return anomalies;
  }

  // Ensemble Prediction (combines multiple models)
  ensemblePrediction(field, futureMonths = 3) {
    const linear = this.linearRegression(field, futureMonths);
    const poly = this.polynomialRegression(field, futureMonths);
    const expSmooth = this.exponentialSmoothing(field, 0.3, futureMonths);

    const predictions = [];
    for (let i = 0; i < futureMonths; i++) {
      const vals = [
        linear?.[i],
        poly?.[i],
        expSmooth?.predictions?.[i]
      ].filter(v => v != null);

      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        predictions.push(Math.max(0, Math.round(avg)));
      } else {
        predictions.push(0);
      }
    }

    return predictions;
  }
}

/* ═══════════ SHARED UI ═══════════ */
const CustomTooltip = ({ active, payload, label }) => {
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

/* ═══════════════════════════════════════
   ENHANCED AI CHATBOT WITH ML
═══════════════════════════════════════ */
const BUBUChatbot = ({ data, isVisible, onClose }) => {
  const [messages, setMessages] = useState([
    { sender: "BUBU", text: "Hi! I'm BUBU, your AI analytics assistant. I can:\n\n• Predict future student enrollment\n• Analyze growth trends\n• Detect anomalies\n• Show correlations\n• Forecast revenue\n• Provide seasonal insights\n\nAsk me anything!", timestamp: Date.now() },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef(null);
  const mlEngine = useMemo(() => data.length > 0 ? new MLAnalytics(data) : null, [data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const replyFor = (text) => {
    if (!mlEngine) return "Please upload data first in the Analytics tab.";
    
    const t = text.toLowerCase();

    // Student enrollment predictions
    if (t.includes("predict") && (t.includes("student") || t.includes("enroll"))) {
      const months = t.match(/(\d+)\s*month/i)?.[1] || "3";
      const predictions = mlEngine.ensemblePrediction("totalStudents", parseInt(months));
      const growth = mlEngine.growthAnalysis("totalStudents");
      
      return `📊 STUDENT ENROLLMENT FORECAST (Next ${months} months):\n\n${predictions.map((p, i) => `Month ${i+1}: ${fmt(p)} students`).join('\n')}\n\n📈 Trend: ${growth.trend}\nAvg Growth: ${growth.avgGrowth}%\nModel: Ensemble (Linear + Polynomial + Exp Smoothing)`;
    }

    // Revenue predictions
    if (t.includes("predict") && (t.includes("revenue") || t.includes("income") || t.includes("money"))) {
      const months = t.match(/(\d+)\s*month/i)?.[1] || "3";
      const predictions = mlEngine.ensemblePrediction("totalPaid", parseInt(months));
      const growth = mlEngine.growthAnalysis("totalPaid");
      
      return `💰 REVENUE FORECAST (Next ${months} months):\n\n${predictions.map((p, i) => `Month ${i+1}: ${fmtMoney(p)}`).join('\n')}\n\n📈 Trend: ${growth.trend}\nAvg Growth: ${growth.avgGrowth}%`;
    }

    // Growth analysis
    if (t.includes("growth") || t.includes("trend")) {
      const field = t.includes("revenue") ? "totalPaid" : "totalStudents";
      const growth = mlEngine.growthAnalysis(field);
      const label = field === "totalPaid" ? "Revenue" : "Student";
      
      return `📈 ${label.toUpperCase()} GROWTH ANALYSIS:\n\nAvg Growth: ${growth.avgGrowth}%\nMax Growth: ${growth.maxGrowth}%\nMin Growth: ${growth.minGrowth}%\nTrend: ${growth.trend}`;
    }

    // Anomaly detection
    if (t.includes("anomal") || t.includes("unusual") || t.includes("outlier")) {
      const anomalies = mlEngine.detectAnomalies("totalStudents", 2);
      
      if (anomalies.length === 0) {
        return "✅ No significant anomalies detected in student enrollment data.";
      }
      
      return `⚠️ ANOMALIES DETECTED:\n\n${anomalies.slice(0, 5).map(a => 
        `${a.yearMonth}: ${fmt(a.value)} students\nDeviation: ${a.deviation}%\nZ-Score: ${a.zScore}`
      ).join('\n\n')}${anomalies.length > 5 ? `\n\n...and ${anomalies.length - 5} more` : ''}`;
    }

    // Seasonal patterns
    if (t.includes("season") || t.includes("month")) {
      const pattern = mlEngine.seasonalPattern("totalStudents");
      if (!pattern) return "Not enough data for seasonal analysis (need 12+ months).";
      
      const maxMonth = MONTHS[pattern.indexOf(Math.max(...pattern))];
      const minMonth = MONTHS[pattern.indexOf(Math.min(...pattern))];
      
      return `🗓️ SEASONAL PATTERNS:\n\nPeak Month: ${maxMonth} (${fmt(Math.round(Math.max(...pattern)))} avg)\nLowest Month: ${minMonth} (${fmt(Math.round(Math.min(...pattern)))} avg)\n\n${MONTHS.map((m, i) => `${m}: ${fmt(Math.round(pattern[i]))}`).join('\n')}`;
    }

    // Correlation analysis
    if (t.includes("correlat") || t.includes("relationship")) {
      const corr1 = mlEngine.correlation("totalStudents", "offered");
      const corr2 = mlEngine.correlation("totalPaid", "totalStudents");
      
      return `🔗 CORRELATION ANALYSIS:\n\nStudents ↔ Placements: ${(corr1 * 100).toFixed(1)}%\n${corr1 > 0.7 ? "Strong positive correlation" : corr1 > 0.3 ? "Moderate correlation" : "Weak correlation"}\n\nRevenue ↔ Students: ${(corr2 * 100).toFixed(1)}%\n${corr2 > 0.7 ? "Strong positive correlation" : corr2 > 0.3 ? "Moderate correlation" : "Weak correlation"}`;
    }

    // Placement predictions
    if (t.includes("placement") || t.includes("offer")) {
      const months = t.match(/(\d+)\s*month/i)?.[1] || "3";
      const predictions = mlEngine.ensemblePrediction("offered", parseInt(months));
      
      return `🤝 PLACEMENT FORECAST (Next ${months} months):\n\n${predictions.map((p, i) => `Month ${i+1}: ${fmt(p)} placements`).join('\n')}`;
    }

    // Course predictions
    if (t.includes("java") || t.includes("python") || t.includes("course")) {
      const javaPred = mlEngine.linearRegression("javaFS", 3);
      const pythonPred = mlEngine.linearRegression("pythonFS", 3);
      
      return `📚 COURSE ENROLLMENT FORECAST (3 months):\n\nJava Full Stack:\n${javaPred?.map((p, i) => `Month ${i+1}: ${fmt(p)}`).join('\n') || 'Insufficient data'}\n\nPython Full Stack:\n${pythonPred?.map((p, i) => `Month ${i+1}: ${fmt(p)}`).join('\n') || 'Insufficient data'}`;
    }

    // Summary statistics
    if (t.includes("summar") || t.includes("overview") || t.includes("stat")) {
      const totalStudents = data.reduce((s, r) => s + r.totalStudents, 0);
      const totalRevenue = data.reduce((s, r) => s + r.totalPaid, 0);
      const totalPlaced = data.reduce((s, r) => s + r.offered, 0);
      const growth = mlEngine.growthAnalysis("totalStudents");
      
      return `📊 QUICK SUMMARY:\n\nTotal Students: ${fmt(totalStudents)}\nTotal Placed: ${fmt(totalPlaced)}\nPlacement Rate: ${((totalPlaced/totalStudents)*100).toFixed(1)}%\nTotal Revenue: ${fmtMoney(totalRevenue)}\n\nGrowth Trend: ${growth.trend}\nAvg Growth: ${growth.avgGrowth}%`;
    }

    return "I can help with:\n• Predictions (students, revenue, placements)\n• Growth analysis\n• Anomaly detection\n• Seasonal patterns\n• Correlations\n• Course forecasts\n\nTry asking: 'Predict student enrollment for 6 months'";
  };

  const handleSend = () => {
    if (!inputValue.trim() || isTyping) return;
    const userText = inputValue;
    setInputValue("");
    setMessages((m) => [...m, { sender: "You", text: userText, timestamp: Date.now() }]);
    setIsTyping(true);
    
    // Use setTimeout to simulate processing time
    setTimeout(() => {
      const botText = replyFor(userText);
      setMessages((m) => [...m, { sender: "BUBU", text: botText, timestamp: Date.now() }]);
      setIsTyping(false);
    }, 500);
  };

  if (!isVisible) return null;

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, width: 420, height: 580, zIndex: 9999,
      background: "rgba(15,23,42,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
      boxShadow: "0 24px 60px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 14 }}>BUBU AI Analytics</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>Powered by ML Models</div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.06)", color: "#e2e8f0", cursor: "pointer", fontSize: 18 }}>×</button>
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
        {isTyping && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.06)", 
            borderRadius: 14, width: "fit-content" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", animation: "pulse 1s infinite" }}/>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", animation: "pulse 1s infinite 0.2s" }}/>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", animation: "pulse 1s infinite 0.4s" }}/>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10 }}>
        <input value={inputValue} onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, padding: "10px 12px", color: "#e2e8f0", outline: "none", fontSize: 12 }}
          placeholder="Ask me anything..." />
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
   MAIN COMPONENT
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

  const manualYears=[...new Set(manualRows.map(d=>d.year))];
  const manualChart=MONTHS.map(m=>{
    const row={month:m};
    manualYears.forEach(y=>{row[y]=manualRows.filter(d=>d.year===y&&d.month===m).reduce((s,d)=>s+d.count,0);});
    return row;
  });

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#f8fafc 0%, #eef2ff 45%, #ffffff 100%)",fontFamily:"'DM Sans',-apple-system,sans-serif",color:"#0f172a"}}>
      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:"linear-gradient(rgba(15,23,42,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,0.04) 1px,transparent 1px)",
        backgroundSize:"44px 44px"}}/>

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
          {allYears.length>0 && tab==="ANALYTICS" &&(
            <select value={selYear} onChange={e=>setSelYear(e.target.value)}
              style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.1)",
                borderRadius:8,padding:"6px 12px",color:"#0f172a",fontSize:12,cursor:"pointer"}}>
              <option value="ALL">All Years</option>
              {allYears.map(y=><option key={y}>{y}</option>)}
            </select>
          )}
          {allYears.length>0 && tab==="FINANCE" &&(
            <select value={finYear} onChange={e=>setFinYear(e.target.value)}
              style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.1)",
                borderRadius:8,padding:"6px 12px",color:"#0f172a",fontSize:12,cursor:"pointer"}}>
              <option value="ALL">All Years</option>
              {allYears.map(y=><option key={y}>{y}</option>)}
            </select>
          )}
        </div>
      </header>

      <main style={{position:"relative",zIndex:1,padding:"28px",maxWidth:1380,margin:"0 auto"}}>
        {tab==="ANALYTICS"&&(
          <>
            {!success&&(
              <div
                onDragOver={e=>{e.preventDefault();setDrag(true)}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
                onClick={()=>document.getElementById("xl").click()}
                style={{border:`2px dashed ${drag?"#6366f1":"rgba(15,23,42,0.1)"}`,
                  borderRadius:18,padding:"52px 32px",textAlign:"center",
                  background:drag?"rgba(99,102,241,0.06)":"rgba(255,255,255,0.7)",
                  marginBottom:28,transition:"all .3s",cursor:"pointer"}}>
                <input type="file" id="xl" accept=".xlsx,.xls" style={{display:"none"}}
                  onChange={e=>handleFile(e.target.files[0])}/>
                <div style={{fontSize:48,marginBottom:14}}>📂</div>
                <div style={{fontSize:17,fontWeight:700,color:"#0f172a",marginBottom:8}}>
                  Drop your <span style={{color:"#6366f1"}}>Year-Month Summary</span> Excel here
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
                  style={{background:"rgba(15,23,42,0.05)",border:"1px solid rgba(15,23,42,0.1)",
                    borderRadius:8,padding:"6px 16px",color:"#64748b",cursor:"pointer",fontSize:12}}>
                  ↩ Upload new file
                </button>
              </div>
            )}

            {data.length>0&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginBottom:28}}>
                  <Kpi title="Total Students"   value={fmt(K.students)}  sub={selYear==="ALL"?`${allYears.join(" · ")}`:selYear}  color={C.indigo}  icon="🎓"/>
                  <Kpi title="Placed"           value={fmt(K.offered)}   sub={`${placementRate}% placement rate`}                  color={C.emerald} icon="🤝"/>
                  <Kpi title="Interested"       value={fmt(K.interested)}sub="Actively engaged"                                    color={C.cyan}    icon="🎯"/>
                  <Kpi title="Dropped"          value={fmt(K.dropped)}   sub="Did not complete"                                    color={C.rose}    icon="📉"/>
                  <Kpi title="Java Full Stack"  value={fmt(K.javaFS)}    sub={`${K.students>0?((K.javaFS/K.students)*100).toFixed(0):0}% of students`}   color={C.orange} icon="☕"/>
                  <Kpi title="Python Full Stack"value={fmt(K.pythonFS)}  sub={`${K.students>0?((K.pythonFS/K.students)*100).toFixed(0):0}% of students`} color={C.teal}   icon="🐍"/>
                </div>

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
                      borderColor:vis[k]?"#6366f1":"rgba(15,23,42,0.08)",
                      background:vis[k]?"rgba(99,102,241,0.15)":"transparent",
                      color:vis[k]?"#6366f1":"#475569",
                      fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .2s"}}>
                      {label}
                    </button>
                  ))}
                </div>

                {vis.overview&&(
                  <Card title="Year-wise Student Enrollment & Placement" accent={C.indigo} badge="BAR CHART">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={yearData} barGap={4} barCategoryGap="28%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                        <XAxis dataKey="year" {...ax}/><YAxis {...ax}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                        <Bar dataKey="totalStudents" name="Total Students" fill={C.indigo}  radius={[5,5,0,0]}/>
                        <Bar dataKey="offered"       name="Placed"         fill={C.emerald} radius={[5,5,0,0]}/>
                        <Bar dataKey="interested"    name="Interested"     fill={C.cyan}    radius={[5,5,0,0]}/>
                        <Bar dataKey="dropped"       name="Dropped"        fill={C.rose}    radius={[5,5,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {vis.monthly&&(
                  <>
                    <Card title="Month-wise Student Enrollment by Year" accent={C.cyan} badge="MULTI-LINE">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
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
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                          {allYears.map((y,i)=>(
                            <Bar key={y} dataKey={`o_${y}`} name={y} fill={PALETTE[i%PALETTE.length]} radius={[4,4,0,0]}/>
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </>
                )}

                {(vis.status||vis.gender)&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
                    {vis.status&&(
                      <Card title="Student Status Distribution" accent={C.violet} badge="DONUT">
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                              paddingAngle={5} dataKey="value"
                              label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                              labelLine={{stroke:"rgba(15,23,42,0.15)"}}>
                              {statusData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>}/>
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
                              labelLine={{stroke:"rgba(15,23,42,0.15)"}}>
                              {genderData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>}/>
                          </PieChart>
                        </ResponsiveContainer>
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={yearData} barCategoryGap="40%">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                            <XAxis dataKey="year" {...ax}/><YAxis {...ax}/>
                            <Tooltip content={<CustomTooltip/>}/>
                            <Bar dataKey="male"   name="Male"   stackId="g" fill={C.sky}  radius={[0,0,3,3]}/>
                            <Bar dataKey="female" name="Female" stackId="g" fill={C.pink} radius={[3,3,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </Card>
                    )}
                  </div>
                )}

                {vis.course&&(
                  <Card title="Course-wise Enrollment by Year" accent={C.orange} badge="GROUPED BAR">
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18,alignItems:"center"}}>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={yearData} barCategoryGap="30%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                          <XAxis dataKey="year" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{color:"#64748b",fontSize:12}}/>
                          <Bar dataKey="javaFS"   name="Java Full Stack"   fill={C.orange} radius={[5,5,0,0]}/>
                          <Bar dataKey="pythonFS" name="Python Full Stack" fill={C.teal}   radius={[5,5,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {[{name:"Java Full Stack",val:K.javaFS,color:C.orange},{name:"Python Full Stack",val:K.pythonFS,color:C.teal}].map(c=>(
                          <div key={c.name} style={{padding:"14px 16px",borderRadius:12,
                            background:`${c.color}12`,border:`1px solid ${c.color}30`}}>
                            <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>{c.name}</div>
                            <div style={{fontSize:24,fontWeight:800,color:c.color}}>{fmt(c.val)}</div>
                            <div style={{marginTop:8,height:4,borderRadius:4,background:"rgba(15,23,42,0.05)"}}>
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

                {vis.radar&&allYears.length>1&&(
                  <Card title="Multi-Year Performance Radar" accent={C.violet} badge="RADAR">
                    <ResponsiveContainer width="100%" height={320}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(15,23,42,0.06)"/>
                        <PolarAngleAxis dataKey="metric" tick={{fill:"#64748b",fontSize:12}}/>
                        {allYears.map((y,i)=>(
                          <Radar key={y} name={y} dataKey={y}
                            stroke={PALETTE[i%PALETTE.length]} fill={PALETTE[i%PALETTE.length]}
                            fillOpacity={0.1} strokeWidth={2}/>
                        ))}
                        <Legend wrapperStyle={{color:"#64748b",fontSize:12}}/>
                        <Tooltip content={<CustomTooltip/>}/>
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

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
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{color:"#64748b",fontSize:11,paddingTop:8}}/>
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

        {tab==="FINANCE"&&(
          <>
            {!data.length&&(
              <div style={{textAlign:"center",padding:"60px 32px",
                border:"2px dashed rgba(15,23,42,0.1)",borderRadius:18,
                background:"rgba(255,255,255,0.7)"}}>
                <div style={{fontSize:40,marginBottom:12}}>🔒</div>
                <div style={{color:"#64748b",fontSize:15}}>
                  Upload data in the <strong style={{color:"#6366f1"}}>Analytics</strong> tab first
                </div>
              </div>
            )}

            {data.length>0&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:12,
                  background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",
                  borderRadius:12,padding:"12px 20px",marginBottom:24}}>
                  <span style={{fontSize:18}}>🔒</span>
                  <span style={{color:"#f59e0b",fontSize:13,fontWeight:600}}>
                    Finance view — revenue data is not shown in the Analytics tab
                  </span>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:28}}>
                  <Kpi title="Total Revenue"   value={fmtMoney(FK.revenue)} sub="Amount collected"    color={C.amber}   icon="💰"/>
                  <Kpi title="Total Pending"   value={fmtMoney(FK.pending)} sub="Outstanding amount"  color={C.rose}    icon="⏳"/>
                  <Kpi title="Collection Rate" value={`${(FK.revenue+FK.pending)>0?((FK.revenue/(FK.revenue+FK.pending))*100).toFixed(1):0}%`}
                    sub="Revenue / (Revenue + Pending)" color={C.emerald} icon="📈"/>
                  <Kpi title="Avg per Student" value={fmtMoney(FK.students>0?Math.round(FK.revenue/FK.students):0)}
                    sub="Revenue per student" color={C.violet} icon="🎓"/>
                </div>

                <Card title="Year-wise Revenue vs Pending" accent={C.amber} badge="BAR CHART">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={finYearData} barGap={6} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="year" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                      <Bar dataKey="revenue" name="Revenue Collected" fill={C.amber}   radius={[5,5,0,0]}/>
                      <Bar dataKey="pending" name="Pending"           fill={C.rose}    radius={[5,5,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="year" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.amber} fill="url(#gRev)" strokeWidth={3} dot={{fill:C.amber,r:5,strokeWidth:0}}/>
                      <Area type="monotone" dataKey="pending" name="Pending" stroke={C.rose}  fill="url(#gPen)" strokeWidth={2} dot={{fill:C.rose, r:4,strokeWidth:0}}/>
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>

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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                      {allYears.map((y,i)=>(
                        <Area key={y} type="monotone" dataKey={`r_${y}`} name={`${y} Revenue`}
                          stroke={PALETTE[i%PALETTE.length]} fill={`url(#fr${y})`}
                          strokeWidth={2} connectNulls/>
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                <Card title="Month-wise Pending by Year" accent={C.rose} badge="LINE">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={finMonthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/>
                      <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                      {allYears.map((y,i)=>(
                        <Line key={y} type="monotone" dataKey={`p_${y}`} name={`${y} Pending`}
                          stroke={PALETTE[i%PALETTE.length]} strokeWidth={2.5}
                          dot={{fill:PALETTE[i%PALETTE.length],r:3,strokeWidth:0}} connectNulls/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {finYearData.map(yd=>{
                  const color=YEAR_COLOR[yd.year]||C.amber;
                  const mRows=data.filter(r=>r.year===yd.year)
                    .sort((a,b)=>MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month));
                  const collRate=(yd.revenue+yd.pending)>0?((yd.revenue/(yd.revenue+yd.pending))*100).toFixed(1):0;
                  return (
                    <Card key={yd.year} title={`${yd.year} — Financial Breakdown`}
                      accent={color} badge={fmtMoney(yd.revenue)+" collected"}>
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
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                          <XAxis dataKey="month" {...ax}/>
                          <YAxis {...ax} tickFormatter={v=>`₹${(v/1e5).toFixed(0)}L`}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend wrapperStyle={{color:"#64748b",fontSize:11,paddingTop:8}}/>
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

        {tab==="MANUAL"&&(
          <>
            <Card title="Add Monthly Data Manually" accent={C.indigo}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:12,alignItems:"end"}}>
                <input type="text" placeholder="Year (e.g. 2024)" value={mEntry.year}
                  onChange={e=>setMEntry(v=>({...v,year:e.target.value}))}
                  style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.1)",
                    borderRadius:9,padding:"11px 14px",color:"#0f172a",fontSize:13,outline:"none"}}/>
                <select value={mEntry.month} onChange={e=>setMEntry(v=>({...v,month:e.target.value}))}
                  style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.1)",
                    borderRadius:9,padding:"11px 14px",color:"#0f172a",fontSize:13}}>
                  <option value="">Select Month</option>
                  {MONTHS.map(m=><option key={m}>{m}</option>)}
                </select>
                <input type="number" placeholder="Count" value={mEntry.count}
                  onChange={e=>setMEntry(v=>({...v,count:e.target.value}))}
                  style={{background:"rgba(255,255,255,0.9)",border:"1px solid rgba(15,23,42,0.1)",
                    borderRadius:9,padding:"11px 14px",color:"#0f172a",fontSize:13,outline:"none"}}/>
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
                      borderRadius:8,padding:"3px 10px",fontSize:11,color:"#6366f1"}}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
                      {manualYears.map((y,i)=>(
                        <Bar key={y} dataKey={y} name={y} fill={PALETTE[i%PALETTE.length]} radius={[5,5,0,0]}/>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card title="Year-wise Monthly Enrollment — Line" accent={C.emerald} badge="LINE">
                  <ResponsiveContainer width="100%" height={290}>
                    <LineChart data={manualChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.04)" vertical={false}/>
                      <XAxis dataKey="month" {...ax}/><YAxis {...ax}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend wrapperStyle={{color:"#64748b",fontSize:12,paddingTop:12}}/>
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
        borderTop:"1px solid rgba(15,23,42,0.05)",
        padding:"18px 28px",textAlign:"center",color:"#64748b",fontSize:11}}>
        2025 ThopsTech Career Solutions · Enhanced ML Analytics Dashboard v4.0
      </footer>

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

      <BUBUChatbot 
        data={data} 
        isVisible={showChatbot} 
        onClose={() => setShowChatbot(false)} 
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.1); }
          50% { box-shadow: 0 8px 40px rgba(99,102,241,0.6), 0 0 0 4px rgba(99,102,241,0.2); }
        }
      `}</style>
    </div>
  );
}