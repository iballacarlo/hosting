import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import ManageResidents from './pages/ManageResidents'
import AdminReports from './pages/AdminReports'
import ManageComplaints from './pages/ManageComplaints'
import ManageDocuments from './pages/ManageDocuments'
import AdminSettings from './pages/AdminSettings'
import ComplaintForm from './pages/ComplaintForm'
import DocumentRequest from './pages/DocumentRequest'
import ComplaintHistory from './pages/ComplaintHistory'
import DocumentHistory from './pages/DocumentHistory'
import AccessibilitySettings from './pages/AccessibilitySettings'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
import Archive from './pages/Archive'
import ProtectedRoute from './components/ProtectedRoute'

export default function App(){
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login/>} />
      <Route path="/register" element={<Register/>} />
      <Route path="/forgot-password" element={<ForgotPassword/>} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute role="staff"><AdminDashboard/></ProtectedRoute>} />
      <Route path="/manage-residents" element={<ProtectedRoute role="staff"><ManageResidents/></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute role="staff"><AdminReports/></ProtectedRoute>} />
      <Route path="/manage-complaints" element={<ProtectedRoute role="staff"><ManageComplaints/></ProtectedRoute>} />
      <Route path="/manage-documents" element={<ProtectedRoute role="staff"><ManageDocuments/></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute role="staff"><AdminSettings/></ProtectedRoute>} />
      <Route path="/archive" element={<ProtectedRoute><Archive/></ProtectedRoute>} />

      <Route path="/submit-complaint" element={<ProtectedRoute><ComplaintForm/></ProtectedRoute>} />
      <Route path="/document-request" element={<ProtectedRoute><DocumentRequest/></ProtectedRoute>} />
      <Route path="/complaint-history" element={<ProtectedRoute><ComplaintHistory/></ProtectedRoute>} />
      <Route path="/document-history" element={<ProtectedRoute><DocumentHistory/></ProtectedRoute>} />
      <Route path="/accessibility" element={<ProtectedRoute><AccessibilitySettings/></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>} />

      <Route path="*" element={<NotFound/>} />
    </Routes>
  )
}
