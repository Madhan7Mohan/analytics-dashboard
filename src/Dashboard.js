import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer
} from "recharts";

/* ================= CONSTANTS ================= */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#6366f1","#22c55e","#ef4444","#f59e0b","#06b6d4","#a855f7"];

/* ================= HELPERS ================= */
const normalize = v => v ? String(v).toUpperCase().trim() : "UNKNOWN";
const unique = (data, key) => [...new Set(data.map(d => d[key]).filter(Boolean))];

/* ================= DASHBOARD ================= */
const Dashboard = () => {

  const [activeTab, setActiveTab] = useState("EXCEL");
  const [excelData, setExcelData] = useState([]);
  const [manualData, setManualData] = useState([]);
  const [manualEntry, setManualEntry] = useState({ year: "", month: "", count: "" });

  const [filters, setFilters] = useState({
    course: "ALL",
    branch: "ALL",
    batch: "ALL",
    yop: "ALL",
    status: "ALL"
  });

  const manualChartRef = useRef(null);

  /* ================= EXCEL UPLOAD ================= */
  const handleUpload = (file) => {
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      const parsed = json.map(row => ({
        course: normalize(row["COURSE"]),
        branch: normalize(row["GROUP"]),
        batch: normalize(row["BATCH NAME"]),
        yop: String(row["YOP"] || "UNKNOWN"),
        status: normalize(row["STATUS"]),
        paidAmount: Number(row["PAID AMOUNT "] || 0)
      }));

      setExcelData(parsed);
    };
    reader.readAsBinaryString(file);
  };

  const filteredExcelData = useMemo(() => {
    return excelData.filter(r =>
      (filters.course === "ALL" || r.course === filters.course) &&
      (filters.branch === "ALL" || r.branch === filters.branch) &&
      (filters.batch === "ALL" || r.batch === filters.batch) &&
      (filters.yop === "ALL" || r.yop === filters.yop) &&
      (filters.status === "ALL" || r.status === filters.status)
    );
  }, [excelData, filters]);

  const totalStudents = filteredExcelData.length;
  const totalOffers = filteredExcelData.filter(r => r.status === "OFFERED").length;
  const totalRevenue = filteredExcelData.reduce((s, r) => s + r.paidAmount, 0);

  const batchCounts = useMemo(() => {
    const map = {};
    filteredExcelData.forEach(r => {
      map[r.batch] = (map[r.batch] || 0) + 1;
    });
    return Object.entries(map).map(([batch, count]) => ({ batch, count }));
  }, [filteredExcelData]);

  const addManualEntry = () => {
    if (!manualEntry.year || !manualEntry.month || !manualEntry.count) return;

    setManualData(prev => [
      ...prev,
      {
        year: manualEntry.year,
        month: manualEntry.month,
        count: Number(manualEntry.count)
      }
    ]);

    setManualEntry({ year: "", month: "", count: "" });
  };

  const years = [...new Set(manualData.map(d => d.year))];

  const yearChartData = MONTHS.map(m => {
    const row = { month: m };
    years.forEach(y => {
      row[y] = manualData
        .filter(d => d.year === y && d.month === m)
        .reduce((s, d) => s + d.count, 0);
    });
    return row;
  });

  const downloadManualCharts = async () => {
    const canvas = await html2canvas(manualChartRef.current, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.text("Year-wise Analysis (Bar & Line)", 10, 10);
    pdf.addImage(imgData, "PNG", 10, 20, width - 20, height);
    pdf.save("year-wise-analysis.pdf");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ================= HEADER ================= */}
      <header style={{
        background: "#0f172a",
        color: "#ffffff",
        padding: "14px 20px",
        fontSize: "20px",
        fontWeight: "bold"
      }}>
        ThopsTech Career Solutions
      </header>

      {/* ================= MAIN ================= */}
      <main style={{ flex: 1, padding: "20px" }}>
        <h2>ThopsTech Analytics Dashboard</h2>

        <div style={{ marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("EXCEL")}>Excel Analytics</button>
          <button onClick={() => setActiveTab("MANUAL")} style={{ marginLeft: "10px" }}>
            Manual Analytics
          </button>
        </div>

        {activeTab === "EXCEL" && (
          <>
            <h3>Upload Excel (Student Data)</h3>
            <input type="file" onChange={e => handleUpload(e.target.files[0])} />

            <div style={{ display: "flex", gap: "10px", margin: "15px 0" }}>
              <select onChange={e => setFilters({ ...filters, course: e.target.value })}>
                <option value="ALL">All Courses</option>
                {unique(excelData, "course").map(v => <option key={v}>{v}</option>)}
              </select>

              <select onChange={e => setFilters({ ...filters, branch: e.target.value })}>
                <option value="ALL">All Branches</option>
                {unique(excelData, "branch").map(v => <option key={v}>{v}</option>)}
              </select>

              <select onChange={e => setFilters({ ...filters, batch: e.target.value })}>
                <option value="ALL">All Batches</option>
                {unique(excelData, "batch").map(v => <option key={v}>{v}</option>)}
              </select>

              <select onChange={e => setFilters({ ...filters, yop: e.target.value })}>
                <option value="ALL">All YOP</option>
                {unique(excelData, "yop").map(v => <option key={v}>{v}</option>)}
              </select>

              <select onChange={e => setFilters({ ...filters, status: e.target.value })}>
                <option value="ALL">All Status</option>
                {unique(excelData, "status").map(v => <option key={v}>{v}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
              <Kpi title="Total Students" value={totalStudents} />
              <Kpi title="Total Offers" value={totalOffers} />
              <Kpi title="Total Revenue" value={`₹${totalRevenue}`} />
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={batchCounts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="batch" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {activeTab === "MANUAL" && (
          <>
            <h3>Manual Entry (Year – Month – Count)</h3>

            <div style={{ marginBottom: "20px" }}>
              <input
                placeholder="Year"
                value={manualEntry.year}
                onChange={e => setManualEntry({ ...manualEntry, year: e.target.value })}
              />
              <select
                value={manualEntry.month}
                onChange={e => setManualEntry({ ...manualEntry, month: e.target.value })}
              >
                <option value="">Month</option>
                {MONTHS.map(m => <option key={m}>{m}</option>)}
              </select>
              <input
                type="number"
                placeholder="Count"
                value={manualEntry.count}
                onChange={e => setManualEntry({ ...manualEntry, count: e.target.value })}
              />
              <button onClick={addManualEntry}>Add</button>
            </div>

            <button onClick={downloadManualCharts}>
              Download Bar + Line Graph
            </button>

            <div ref={manualChartRef}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={yearChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  {years.map((y, i) => (
                    <Bar key={y} dataKey={y} fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={yearChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  {years.map((y, i) => (
                    <Line
                      key={y}
                      dataKey={y}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </main>

      {/* ================= FOOTER ================= */}
      <footer style={{
        background: "#f1f5f9",
        textAlign: "center",
        padding: "10px",
        fontSize: "14px",
        color: "#475569"
      }}>
        © All rights reserved
      </footer>

    </div>
  );
};

/* ================= KPI CARD ================= */
const Kpi = ({ title, value }) => (
  <div style={{
    background: "#ffffff",
    padding: "16px",
    borderRadius: "8px",
    minWidth: "160px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)"
  }}>
    <div style={{ fontSize: "14px", color: "#475569" }}>{title}</div>
    <div style={{ fontSize: "22px", fontWeight: "bold" }}>{value}</div>
  </div>
);

export default Dashboard;
