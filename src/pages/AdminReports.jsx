import React, { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import '../styles/dashboard.css'
import api from '../api/axios'
import {
  BarChart3,
  Download,
  Calendar,
  FileText
} from 'lucide-react'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend)

export default function AdminReports(){
  const [loading, setLoading] = useState(true)
  const [complaints, setComplaints] = useState([])
  const [docs, setDocs] = useState([])

  useEffect(() => {
    let isMounted = true
    async function loadData(){
      setLoading(true)
      try{
        const [complaintsRes, docsRes] = await Promise.all([
          api.get('/complaints'),
          api.get('/docs')
        ])
        if(!isMounted) return
        setComplaints(Array.isArray(complaintsRes.data?.data) ? complaintsRes.data.data : [])
        setDocs(Array.isArray(docsRes.data?.data) ? docsRes.data.data : [])
      }catch(e){
        setComplaints([])
        setDocs([])
      }
      setLoading(false)
    }
    loadData()
    return () => { isMounted = false }
  }, [])

  const monthName = (m) => new Date(2020, m, 1).toLocaleString('en-US', { month: 'long' })

  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)
  const sameMonth = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()

  // totals for current month
  const now = new Date()
  const complaintsThisMonth = complaints.filter(c => c.date_submitted && sameMonth(new Date(c.date_submitted), now))
  const totalComplaintsThisMonth = complaintsThisMonth.length
  const resolvedComplaintsThisMonth = complaintsThisMonth.filter(c => (String(c.status || '').toLowerCase()).includes('resolv') || (String(c.status || '').toLowerCase()).includes('closed')).length

  const docsThisMonth = docs.filter(d => d.date_requested && sameMonth(new Date(d.date_requested), now))
  const totalDocsThisMonth = docsThisMonth.length
  const releasedDocsThisMonth = docsThisMonth.filter(d => (String(d.status || '').toLowerCase()).includes('releas') || (String(d.status || '').toLowerCase()).includes('released')).length

  // average resolution time (in days) for complaints that have date_submitted and date_updated and are resolved
  const resolvedComplaints = complaints.filter(c => c.date_submitted && c.date_updated && ((String(c.status || '').toLowerCase()).includes('resolv') || (String(c.status || '').toLowerCase()).includes('closed')))
  const avgResolutionDays = resolvedComplaints.length === 0 ? null : (resolvedComplaints.reduce((acc, c) => {
    const s = new Date(c.date_submitted).getTime()
    const u = new Date(c.date_updated).getTime()
    const days = Math.max(0, (u - s) / (1000 * 60 * 60 * 24))
    return acc + days
  }, 0) / resolvedComplaints.length)

  // monthly summary for the current year (Jan..Dec)
  const year = now.getFullYear()
  const monthlySummary = Array.from({ length: 12 }).map((_, idx) => {
    const totalC = complaints.filter(c => c.date_submitted && new Date(c.date_submitted).getFullYear() === year && new Date(c.date_submitted).getMonth() === idx).length
    const resolvedC = complaints.filter(c => c.date_submitted && c.date_updated && new Date(c.date_submitted).getFullYear() === year && new Date(c.date_submitted).getMonth() === idx && ((String(c.status || '').toLowerCase()).includes('resolv') || (String(c.status || '').toLowerCase()).includes('closed'))).length
    const totalR = docs.filter(d => d.date_requested && new Date(d.date_requested).getFullYear() === year && new Date(d.date_requested).getMonth() === idx).length
    const releasedR = docs.filter(d => d.date_requested && new Date(d.date_requested).getFullYear() === year && new Date(d.date_requested).getMonth() === idx && ((String(d.status || '').toLowerCase()).includes('releas') || (String(d.status || '').toLowerCase()).includes('released'))).length
    return { monthIndex: idx, month: monthName(idx), totalComplaints: totalC, resolved: resolvedC, totalRequests: totalR, released: releasedR }
  })

  const fmt = (v) => (v == null ? '—' : String(Math.round((v + Number.EPSILON) * 100) / 100))

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12 } },
      title: { display: false }
    },
    scales: {
      x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true } },
      y: { beginAtZero: true }
    }
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true } }, y: { beginAtZero: true } }
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-area">
        <Header title="Reports & Analytics" />

        <main className="dash-main">
          <div className="dash-head">
            <h1 className="page-title">Reports & Analytics</h1>

            <div className="dash-actions">
                <Button variant="secondary" onClick={() => exportCsv()}>
                  <Download size={16} strokeWidth={2} />
                  Export Report
                </Button>
            </div>
          </div>

          <section className="stat-grid reports-stat-grid">
            <div className="stat-tile">
              <div className="stat-top">
                <div className="stat-icon">
                  <BarChart3 size={18} strokeWidth={2} />
                </div>
                <div className="stat-label">Total Complaints (This Month)</div>
              </div>
              <div className="stat-value">{loading ? '…' : totalComplaintsThisMonth}</div>
            </div>

            <div className="stat-tile">
              <div className="stat-top">
                <div className="stat-icon">
                  <FileText size={18} strokeWidth={2} />
                </div>
                <div className="stat-label">Document Requests (This Month)</div>
              </div>
                <div className="stat-value">{loading ? '…' : totalDocsThisMonth}</div>
            </div>

            <div className="stat-tile">
              <div className="stat-top">
                <div className="stat-icon">
                  <Calendar size={18} strokeWidth={2} />
                </div>
                <div className="stat-label">Avg. Resolution Time</div>
              </div>
                <div className="stat-value">{loading ? '…' : (avgResolutionDays == null ? '—' : `${fmt(avgResolutionDays)} Days`)}</div>
            </div>
          </section>

          <section className="dashboard-panel reports-panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Monthly Summary</h2>
                <p className="panel-sub">
                  Overview of complaints and document requests by month.
                </p>
              </div>
            </div>

            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total Complaints</th>
                    <th>Resolved</th>
                    <th>Total Requests</th>
                    <th>Released</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map(row => (
                    <tr key={row.monthIndex}>
                      <td>{row.month}</td>
                      <td>{row.totalComplaints}</td>
                      <td>{row.resolved}</td>
                      <td>{row.totalRequests}</td>
                      <td>{row.released}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-panel reports-panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Charts</h2>
                <p className="panel-sub">
                  Visual analytics will be displayed here.
                </p>
              </div>
            </div>

            <div style={{ padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Complaints vs Requests (Monthly)</h3>
              <div style={{ maxWidth: 900 }}>
                <div className="chart-container">
                  <Bar
                    data={{ labels: monthlySummary.map(r => r.month), datasets: [ { label: 'Complaints', data: monthlySummary.map(r => r.totalComplaints), backgroundColor: '#3b82f6' }, { label: 'Requests', data: monthlySummary.map(r => r.totalRequests), backgroundColor: '#10b981' } ] }}
                    options={barOptions}
                  />
                </div>

                <h3 style={{ marginTop: 18 }}>Resolved Complaints (Monthly)</h3>
                <div className="chart-container">
                  <Line
                    data={{ labels: monthlySummary.map(r => r.month), datasets: [ { label: 'Resolved', data: monthlySummary.map(r => r.resolved), borderColor: '#06b6d4', tension: 0.2, fill: false } ] }}
                    options={lineOptions}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-panel reports-panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Raw Monthly Data</h2>
                <p className="panel-sub">Download or review the monthly summary below.</p>
              </div>
            </div>

            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total Complaints</th>
                    <th>Resolved</th>
                    <th>Total Requests</th>
                    <th>Released</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map(row => (
                    <tr key={row.monthIndex}>
                      <td>{row.month}</td>
                      <td>{row.totalComplaints}</td>
                      <td>{row.resolved}</td>
                      <td>{row.totalRequests}</td>
                      <td>{row.released}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  )

  function exportCsv(){
    const headers = ['Month','Total Complaints','Resolved','Total Requests','Released']
    const rows = monthlySummary.map(r => [r.month, r.totalComplaints, r.resolved, r.totalRequests, r.released])
    const csv = [headers, ...rows].map(r => r.map(cell => typeof cell === 'string' ? `"${cell.replace(/"/g,'""')}"` : cell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports-${now.getFullYear()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
}
