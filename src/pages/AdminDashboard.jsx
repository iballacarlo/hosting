import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import api from '../api/axios'
import { getComplaintReference, getDocumentReference } from '../utils/idFormat'
import StatusBadge from '../components/StatusBadge'
import '../styles/dashboard.css'

import {
  Users,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  FileText,
  Clock,
  BadgeCheck,
  PackageCheck
} from 'lucide-react'

export default function AdminDashboard(){
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  const [docs, setDocs] = useState([])
  const [residents, setResidents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboardData(){
      try {
        const [complaintsRes, docsRes, residentsRes] = await Promise.all([
          api.get('/complaints'),
          api.get('/docs'),
          api.get('/residents')
        ])

        if(cancelled) return
        setComplaints(Array.isArray(complaintsRes.data?.data) ? complaintsRes.data.data : [])
        setDocs(Array.isArray(docsRes.data?.data) ? docsRes.data.data : [])
        setResidents(Array.isArray(residentsRes.data?.data) ? residentsRes.data.data : [])
      } catch(err){
        if(!cancelled){
          console.error('Failed to load admin dashboard data:', err)
        }
      } finally {
        if(!cancelled) setLoading(false)
      }
    }

    loadDashboardData()
    const interval = window.setInterval(loadDashboardData, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const totalResidents = residents.length
  const totalComplaints = complaints.length

  const pendingComplaints = complaints.filter(c =>
    ['in action', 'submitted', 'open', 'pending'].some(term => (c.status||'').toLowerCase().includes(term))
  ).length

  const resolvedComplaints = complaints.filter(c =>
    (c.status||'').toLowerCase().includes('resolv')
  ).length

  const totalDocs = docs.length

  const pendingDocs = docs.filter(d =>
    ['pending', 'submitted'].some(term => (d.status||'').toLowerCase().includes(term))
  ).length

  const approvedDocs = docs.filter(d =>
    (d.status||'').toLowerCase().includes('approved')
  ).length

  const releasedDocs = docs.filter(d =>
    (d.status||'').toLowerCase().includes('released')
  ).length


  const stats = useMemo(()=>[
    {label:'Residents',value:totalResidents,icon:<Users size={18}/>},
    {label:'Complaints',value:totalComplaints,icon:<ClipboardList size={18}/>},
    {label:'Pending Complaints',value:pendingComplaints,icon:<AlertCircle size={18}/>},
    {label:'Resolved Complaints',value:resolvedComplaints,icon:<CheckCircle2 size={18}/>},
    {label:'Document Requests',value:totalDocs,icon:<FileText size={18}/>},
    {label:'Pending Requests',value:pendingDocs,icon:<Clock size={18}/>},
    {label:'Approved Requests',value:approvedDocs,icon:<BadgeCheck size={18}/>},
    {label:'Released Documents',value:releasedDocs,icon:<PackageCheck size={18}/>},
  ],[
    totalResidents,
    totalComplaints,
    pendingComplaints,
    resolvedComplaints,
    totalDocs,
    pendingDocs,
    approvedDocs,
    releasedDocs
  ])

  const getStatusEmoji = (status) => {
    const normalized = (status || '').toLowerCase()
    if(normalized.includes('processed') || normalized.includes('resolved') || normalized.includes('approved')) return '🟢'
    if(normalized.includes('processing') || normalized.includes('in progress')) return '🟡'
    if(normalized.includes('pending') || normalized.includes('submitted')) return '⚪'
    return '⚪'
  }

  const recentActivity = [...complaints,...docs]
    .map(item => ({
      ...item,
      type: item.request_id ? 'Document' : 'Complaint',
      ref: item.request_id ? getDocumentReference(item) : getComplaintReference(item),
      category: item.document_type || item.category || item.title || item.type || 'Request',
      date: item.date_requested || item.date_submitted || item.date || item.created_at
    }))
    .sort((a,b)=> new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0,5)

  const handleViewActivity = (item) => {
    if(item.type === 'Document'){
      navigate('/manage-documents')
    } else {
      navigate('/manage-complaints')
    }
  }


  return (
    <div className="app-shell">

      <Sidebar/>

      <div className="main-area admin-area">

        <Header/>

        <main className="dash-main">

          <div className="dash-head">

            <h1 className="page-title">
              Admin Dashboard
            </h1>

          </div>


          {/* STAT CARDS */}

          <section className="stat-grid">

            {stats.map(s=>(
              <div key={s.label} className="stat-tile">

                <div className="stat-top">

                  <div className="stat-icon">
                    {s.icon}
                  </div>

                  <div className="stat-label">
                    {s.label}
                  </div>

                </div>

                <div className="stat-value">
                  {s.value}
                </div>

              </div>
            ))}

          </section>
          
          {/* RECENT ACTIVITY */}

          <section className="dashboard-panel">

            <div className="panel-head">

              <h2 className="panel-title">
                Recent Activity
              </h2>

              <p className="panel-sub">
                Latest complaints and document requests.
              </p>

            </div>


            <div className="dashboard-table-wrap">

              <table className="dashboard-table">

                <thead>

                  <tr>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>

                </thead>


                <tbody>

                  {recentActivity.map((r,i)=>(
                    <tr key={i}>

                      <td>{r.ref || r.id}</td>

                      <td>
                        {r.category || r.type || 'Request'}
                      </td>

                      <td>
                        {r.date ? new Date(r.date).toLocaleDateString('en-US') : '—'}
                      </td>

                      <td>
                        <StatusBadge status={r.status}/>
                      </td>

                      <td>
                        <button className="view-btn" type="button" onClick={() => handleViewActivity(r)}>
                          View
                        </button>
                      </td>

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
} 
