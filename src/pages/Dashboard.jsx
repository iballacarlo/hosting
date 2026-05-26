import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import StatusBadge from '../components/StatusBadge'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import '../styles/dashboard.css'

export default function Dashboard(){
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  const [docs, setDocs] = useState([])
  const { user: authUser, loading: authLoading } = useAuth()

  useEffect(() => {
    if(authLoading) return undefined

    let cancelled = false

    async function refreshData(){
      try {
        const [complaintsRes, docsRes] = await Promise.all([
          api.get('/complaints'),
          api.get('/docs')
        ])

        if(cancelled) return
        setComplaints(Array.isArray(complaintsRes.data?.data) ? complaintsRes.data.data : [])
        setDocs(Array.isArray(docsRes.data?.data) ? docsRes.data.data : [])
      } catch(err){
        if(!cancelled){
          console.error('Failed to load resident dashboard data:', err)
          setComplaints([])
          setDocs([])
        }
      }
    }

    refreshData()
    const interval = window.setInterval(refreshData, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [authLoading, authUser?.id])


  const totalComplaints = complaints.length

  const activeComplaints = complaints.filter(c => {
    const status = (c.status || '').toLowerCase()
    return !['resolved', 'closed', 'rejected', 'completed'].some(term => status.includes(term))
  }).length

  const totalDocs = docs.length

  const pendingDocs = docs.filter(d =>
    (d.status || '').toLowerCase().includes('pend') ||
    (d.status || '').toLowerCase().includes('submitted')
  ).length


  const stats = useMemo(()=>[
    {label:'Total Complaints', value:totalComplaints},
    {label:'Active Complaints', value:activeComplaints},
    {label:'Total Document Requests', value:totalDocs},
    {label:'Pending Requests', value:pendingDocs}
  ],[
    totalComplaints,
    activeComplaints,
    totalDocs,
    pendingDocs
  ])


  const recentActivity = useMemo(() => {
    const complaintActivity = complaints.map(item => ({
      id: item.complaint_id || item.id,
      ref: item.ref || item.id || `C-${item.complaint_id}`,
      category: item.category || item.category_id || item.title || 'Complaint',
      type: 'Complaint',
      date: item.date_submitted || item.date || item.created_at || item.date_requested,
      status: item.status || 'Submitted'
    }))

    const docActivity = docs.map(item => ({
      id: item.request_id || item.id,
      ref: item.reference_number || item.ref || item.id || `DOC-${item.request_id}`,
      category: item.document_type || item.type || 'Document Request',
      type: 'Document',
      date: item.date_requested || item.date || item.created_at || item.date_submitted,
      status: item.status || 'Submitted'
    }))

    return [...complaintActivity, ...docActivity]
      .sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0,5)
  }, [complaints, docs])

  const handleViewActivity = (item) => {
    if(item.type === 'Document'){
      navigate('/document-history')
    } else {
      navigate('/complaint-history')
    }
  }


  return (
    <div className="app-shell">

      <Sidebar />

      <div className="main-area">

        <Header />

        <main className="dash-main">

          <h1 className="page-title">
            Dashboard
          </h1>


          <section className="stat-grid resident-stat-grid">

            {stats.map(s=>(
              <div key={s.label} className="stat-tile resident-stat">

                <div className="stat-label">
                  {s.label}
                </div>

                <div className="stat-value">
                  {s.value}
                </div>

              </div>
            ))}

          </section>



          <section className="dashboard-panel">

            <div className="panel-head">

              <div>

                <h2 className="panel-title">
                  Recent Activity
                </h2>

                <p className="panel-sub">
                  Your latest complaints and document requests.
                </p>

              </div>

            </div>


            <div className="dashboard-table-wrap">

              <table className="dashboard-table">

                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Category/Document Type</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>


                <tbody>

                  {recentActivity.map((r,i)=>(
                    <tr key={i}>

                      <td>
                        {r.ref || r.id}
                      </td>

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
