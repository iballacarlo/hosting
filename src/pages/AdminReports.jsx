import React, { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import Button from '../components/Button'
import '../styles/dashboard.css'
import api from '../api/axios'
import { getComplaintReference, getDocumentReference } from '../utils/idFormat'
import { downloadTimestamp } from '../utils/downloadNames'
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
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend)

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

  const countBy = (items, getKey) => {
    return items.reduce((acc, item) => {
      const key = String(getKey(item) || 'Unspecified').trim() || 'Unspecified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }

  const topEntries = (map, limit = 8) => Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)

  const complaintStatusEntries = topEntries(countBy(complaints, item => item.status || 'Submitted'), 6)
  const complaintCategoryEntries = topEntries(countBy(complaints, item => item.category || item.category_name || 'Unspecified'), 8)
  const documentStatusEntries = topEntries(countBy(docs, item => item.status || 'Submitted'), 6)

  const fmt = (v) => (v == null ? '—' : String(Math.round((v + Number.EPSILON) * 100) / 100))

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12 } },
      title: { display: false }
    },
    scales: {
      x: { ticks: { maxRotation: 0, minRotation: 0, autoSkip: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { ticks: { maxRotation: 0, minRotation: 0, autoSkip: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
  }

  const horizontalBarOptions = {
    ...barOptions,
    indexAxis: 'y',
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 } },
      y: { ticks: { autoSkip: false } }
    }
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 12 } },
      title: { display: false }
    }
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
                <h2 className="panel-title">Visual Reports</h2>
                <p className="panel-sub">
                  Counts are grouped from the current complaints and document request records.
                </p>
              </div>
            </div>

            <div className="reports-chart-grid">
              <div className="reports-chart-card reports-chart-card-wide">
                <h3 className="reports-chart-title">Monthly Workload</h3>
                <p className="reports-chart-note">Complaints and document requests submitted each month.</p>
                <div className="chart-container">
                  <Bar
                    data={{ labels: monthlySummary.map(r => r.month.slice(0, 3)), datasets: [ { label: 'Complaints', data: monthlySummary.map(r => r.totalComplaints), backgroundColor: '#2563eb' }, { label: 'Document Requests', data: monthlySummary.map(r => r.totalRequests), backgroundColor: '#059669' } ] }}
                    options={barOptions}
                  />
                </div>
              </div>

              <div className="reports-chart-card">
                <h3 className="reports-chart-title">Complaint Status</h3>
                <p className="reports-chart-note">Share of complaints by current status.</p>
                <div className="chart-container">
                  <Doughnut
                    data={{ labels: complaintStatusEntries.map(([label]) => label), datasets: [{ data: complaintStatusEntries.map(([, value]) => value), backgroundColor: ['#2563eb', '#f59e0b', '#059669', '#dc2626', '#7c3aed', '#64748b'] }] }}
                    options={doughnutOptions}
                  />
                </div>
              </div>

              <div className="reports-chart-card">
                <h3 className="reports-chart-title">Top Complaint Categories</h3>
                <p className="reports-chart-note">Most common categories in submitted complaints.</p>
                <div className="chart-container">
                  <Bar
                    data={{ labels: complaintCategoryEntries.map(([label]) => label), datasets: [{ label: 'Complaints', data: complaintCategoryEntries.map(([, value]) => value), backgroundColor: '#0891b2' }] }}
                    options={horizontalBarOptions}
                  />
                </div>
              </div>

              <div className="reports-chart-card">
                <h3 className="reports-chart-title">Document Request Status</h3>
                <p className="reports-chart-note">Current status of document requests.</p>
                <div className="chart-container">
                  <Doughnut
                    data={{ labels: documentStatusEntries.map(([label]) => label), datasets: [{ data: documentStatusEntries.map(([, value]) => value), backgroundColor: ['#059669', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#64748b'] }] }}
                    options={doughnutOptions}
                  />
                </div>
              </div>

              <div className="reports-chart-card reports-chart-card-wide">
                <h3 className="reports-chart-title">Resolved and Released Trend</h3>
                <p className="reports-chart-note">Completed complaints and released documents by month.</p>
                <div className="chart-container">
                  <Line
                    data={{ labels: monthlySummary.map(r => r.month.slice(0, 3)), datasets: [ { label: 'Resolved Complaints', data: monthlySummary.map(r => r.resolved), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.25, fill: false }, { label: 'Released Documents', data: monthlySummary.map(r => r.released), borderColor: '#059669', backgroundColor: '#059669', tension: 0.25, fill: false } ] }}
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
    const escapeRow = (row) => row.map(cell => `"${String(cell ?? '').replace(/"/g,'""')}"`).join(',')
    const lines = []
    lines.push(escapeRow(['Reports and Analytics Export', now.toLocaleString('en-US')]))
    lines.push('')
    lines.push(escapeRow(['Summary']))
    lines.push(escapeRow(['Metric', 'Value']))
    lines.push(escapeRow(['Total Complaints This Month', totalComplaintsThisMonth]))
    lines.push(escapeRow(['Resolved Complaints This Month', resolvedComplaintsThisMonth]))
    lines.push(escapeRow(['Document Requests This Month', totalDocsThisMonth]))
    lines.push(escapeRow(['Released Documents This Month', releasedDocsThisMonth]))
    lines.push(escapeRow(['Average Complaint Resolution Days', avgResolutionDays == null ? '' : fmt(avgResolutionDays)]))
    lines.push('')
    lines.push(escapeRow(['Monthly Summary']))
    lines.push(escapeRow(['Month','Total Complaints','Resolved Complaints','Total Document Requests','Released Documents']))
    monthlySummary.forEach(r => lines.push(escapeRow([r.month, r.totalComplaints, r.resolved, r.totalRequests, r.released])))
    if(complaints.length > 0){
      lines.push('')
      lines.push(escapeRow(['Complaint Records']))
      lines.push(escapeRow(['Complaint ID','Date Submitted','Category','Title','Status','Anonymous','Incident Location','Incident Date']))
      complaints.forEach(item => lines.push(escapeRow([
        getComplaintReference(item),
        item.date_submitted,
        item.category || item.category_name,
        item.title,
        item.status,
        item.anonymous ? 'Yes' : 'No',
        item.incident_location || item.location,
        item.incident_date
      ])))
    }
    if(docs.length > 0){
      lines.push('')
      lines.push(escapeRow(['Document Request Records']))
      lines.push(escapeRow(['Request ID','Reference Number','Date Requested','Document Type','Resident','Status','Purpose']))
      docs.forEach(item => lines.push(escapeRow([
        getDocumentReference(item),
        item.reference_number || getDocumentReference(item),
        item.date_requested,
        item.document_type,
        item.name || item.full_name,
        item.status,
        item.purpose
      ])))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reports-${now.getFullYear()}-${downloadTimestamp(now)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
}
