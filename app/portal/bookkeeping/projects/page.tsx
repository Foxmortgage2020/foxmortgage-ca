'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'

interface Project {
  ID: string
  Project_Name: string
  Customer_Name: string
  Contract_Value: string
  Payment_Received_Date: string
  Payment_Received_Amount: string
  Project_Start_Date: string
  Project_End_Date: string
  Recognition_Method: string
  Current_Completion_Percent: string
  Revenue_Recognized_To_Date: string
  QBO_Deferred_Revenue_Ref: string
  Status: string
  Notes: string
}

interface Milestone {
  ID: string
  Project_ID: string
  Milestone_Date: string
  Milestone_Description: string
  Completion_Percent_At_Milestone: string
  Revenue_Recognized_This_Milestone: string
  Notes: string
}

const RECOGNITION_METHODS = ['percentage-of-completion', 'straight-line', 'per-session']
const PROJECT_STATUSES = ['Active', 'Complete', 'Cancelled']

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showAddMilestone, setShowAddMilestone] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const [newProject, setNewProject] = useState({
    Project_Name: '',
    Customer_Name: '',
    Contract_Value: '',
    Payment_Received_Date: '',
    Payment_Received_Amount: '',
    Project_Start_Date: '',
    Project_End_Date: '',
    Recognition_Method: 'percentage-of-completion',
    Notes: '',
  })

  const [newMilestone, setNewMilestone] = useState({
    Milestone_Date: '',
    Milestone_Description: '',
    Completion_Percent_At_Milestone: '',
    Revenue_Recognized_This_Milestone: '',
    Notes: '',
  })

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bookkeeping/projects')
      const data = await res.json()
      setProjects(data.records || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  async function loadMilestones(projectId: string) {
    if (milestones[projectId]) return
    try {
      const res = await fetch(`/api/bookkeeping/milestones?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setMilestones(prev => ({ ...prev, [projectId]: data.records || [] }))
    } catch {
      setMilestones(prev => ({ ...prev, [projectId]: [] }))
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function submitProject() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookkeeping/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newProject,
          Status: 'Active',
          Current_Completion_Percent: 0,
          Revenue_Recognized_To_Date: 0,
        }),
      })
      if (res.ok) {
        showToast('Project created.', true)
        setShowAddProject(false)
        setNewProject({
          Project_Name: '', Customer_Name: '', Contract_Value: '',
          Payment_Received_Date: '', Payment_Received_Amount: '',
          Project_Start_Date: '', Project_End_Date: '',
          Recognition_Method: 'percentage-of-completion', Notes: '',
        })
        await loadProjects()
      } else {
        showToast('Failed to create project.', false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function submitMilestone(projectId: string) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookkeeping/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newMilestone, Project_ID: projectId }),
      })
      if (res.ok) {
        showToast('Milestone logged.', true)
        setShowAddMilestone(null)
        setNewMilestone({
          Milestone_Date: '', Milestone_Description: '',
          Completion_Percent_At_Milestone: '', Revenue_Recognized_This_Milestone: '', Notes: '',
        })
        setMilestones(prev => ({ ...prev, [projectId]: [] }))
        await loadMilestones(projectId)
      } else {
        showToast('Failed to log milestone.', false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleExpand(project: Project) {
    if (expanded === project.ID) {
      setExpanded(null)
    } else {
      setExpanded(project.ID)
      await loadMilestones(project.ID)
    }
  }

  function pct(val: string) {
    return `${Math.round(Number(val || 0))}%`
  }

  function currency(val: string) {
    return `$${Number(val || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="max-w-4xl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-body font-semibold flex items-center gap-2 ${
            toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-navy text-2xl font-bold">Production Contracts</h1>
          <p className="text-gray-500 text-sm font-body mt-1">
            Printhub contracts &amp; milestone-based revenue recognition
          </p>
        </div>
        <button
          onClick={() => setShowAddProject(true)}
          className="flex items-center gap-2 bg-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Contract
        </button>
      </div>

      {/* Add Project form */}
      {showAddProject && (
        <div className="bg-white rounded-xl border-2 border-lime p-6 mb-6">
          <h2 className="font-heading text-navy font-bold mb-4">New Production Contract</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Project Name *</label>
              <input
                type="text"
                value={newProject.Project_Name}
                onChange={e => setNewProject(p => ({ ...p, Project_Name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
                placeholder="e.g. Guelph Storm Rinkboard"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Customer Name *</label>
              <input
                type="text"
                value={newProject.Customer_Name}
                onChange={e => setNewProject(p => ({ ...p, Customer_Name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Contract Value ($)</label>
              <input
                type="number"
                value={newProject.Contract_Value}
                onChange={e => setNewProject(p => ({ ...p, Contract_Value: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Payment Received Amount ($)</label>
              <input
                type="number"
                value={newProject.Payment_Received_Amount}
                onChange={e => setNewProject(p => ({ ...p, Payment_Received_Amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Payment Received Date</label>
              <input
                type="date"
                value={newProject.Payment_Received_Date}
                onChange={e => setNewProject(p => ({ ...p, Payment_Received_Date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Recognition Method</label>
              <select
                value={newProject.Recognition_Method}
                onChange={e => setNewProject(p => ({ ...p, Recognition_Method: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              >
                {RECOGNITION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Project Start Date</label>
              <input
                type="date"
                value={newProject.Project_Start_Date}
                onChange={e => setNewProject(p => ({ ...p, Project_Start_Date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Project End Date</label>
              <input
                type="date"
                value={newProject.Project_End_Date}
                onChange={e => setNewProject(p => ({ ...p, Project_End_Date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
              <input
                type="text"
                value={newProject.Notes}
                onChange={e => setNewProject(p => ({ ...p, Notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={submitProject}
              disabled={submitting || !newProject.Project_Name || !newProject.Customer_Name}
              className="bg-navy text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-navy/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving...' : 'Create Contract'}
            </button>
            <button
              onClick={() => setShowAddProject(false)}
              className="text-gray-500 text-sm font-semibold px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-body mb-2">No production contracts yet.</p>
          <p className="text-gray-400 text-sm">Add a Printhub contract to start tracking milestone revenue recognition.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const isOpen = expanded === project.ID
            const projectMilestones = milestones[project.ID] || []

            return (
              <div key={project.ID} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleExpand(project)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="font-body text-navy font-semibold text-sm">{project.Project_Name}</p>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          project.Status === 'Active'
                            ? 'bg-green-100 text-green-700'
                            : project.Status === 'Complete'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {project.Status}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {project.Customer_Name} &middot; {currency(project.Contract_Value)} &middot; {pct(project.Current_Completion_Percent)} complete
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-heading text-navy font-bold">{currency(project.Revenue_Recognized_To_Date)}</p>
                      <p className="text-xs text-gray-400">recognized</p>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-5 bg-gray-50">
                    {/* Project summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Contract Value</p>
                        <p className="text-sm font-heading text-navy font-bold mt-1">{currency(project.Contract_Value)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Revenue Recognized</p>
                        <p className="text-sm font-heading text-navy font-bold mt-1">{currency(project.Revenue_Recognized_To_Date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Completion</p>
                        <p className="text-sm font-heading text-navy font-bold mt-1">{pct(project.Current_Completion_Percent)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Method</p>
                        <p className="text-sm text-navy mt-1">{project.Recognition_Method}</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-5">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-lime rounded-full h-2 transition-all"
                          style={{ width: `${Math.min(100, Number(project.Current_Completion_Percent || 0))}%` }}
                        />
                      </div>
                    </div>

                    {/* Milestones */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-heading text-navy font-bold text-sm">Milestones</h3>
                        <button
                          onClick={() => setShowAddMilestone(showAddMilestone === project.ID ? null : project.ID)}
                          className="flex items-center gap-1 text-lime text-xs font-semibold hover:underline"
                        >
                          <Plus className="w-3 h-3" />
                          Log Milestone
                        </button>
                      </div>

                      {showAddMilestone === project.ID && (
                        <div className="bg-white rounded-lg border border-lime p-4 mb-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Date *</label>
                              <input
                                type="date"
                                value={newMilestone.Milestone_Date}
                                onChange={e => setNewMilestone(m => ({ ...m, Milestone_Date: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Completion % *</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={newMilestone.Completion_Percent_At_Milestone}
                                onChange={e => setNewMilestone(m => ({ ...m, Completion_Percent_At_Milestone: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Revenue Recognized ($)</label>
                              <input
                                type="number"
                                value={newMilestone.Revenue_Recognized_This_Milestone}
                                onChange={e => setNewMilestone(m => ({ ...m, Revenue_Recognized_This_Milestone: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Description</label>
                              <input
                                type="text"
                                value={newMilestone.Milestone_Description}
                                onChange={e => setNewMilestone(m => ({ ...m, Milestone_Description: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime"
                                placeholder="e.g. Board design approved"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => submitMilestone(project.ID)}
                              disabled={submitting || !newMilestone.Milestone_Date || !newMilestone.Completion_Percent_At_Milestone}
                              className="bg-navy text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-navy/90 disabled:opacity-50 transition-colors"
                            >
                              {submitting ? 'Saving...' : 'Log Milestone'}
                            </button>
                            <button
                              onClick={() => setShowAddMilestone(null)}
                              className="text-gray-500 text-xs font-semibold px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {projectMilestones.length === 0 ? (
                        <p className="text-gray-400 text-sm py-3">No milestones logged yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {projectMilestones.map((ms) => (
                            <div key={ms.ID} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-body text-navy font-semibold">
                                  {ms.Milestone_Description || 'Milestone'} &middot;{' '}
                                  <span className="text-gray-500 font-normal">{pct(ms.Completion_Percent_At_Milestone)} complete</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">{ms.Milestone_Date}</p>
                              </div>
                              <p className="text-sm font-heading text-navy font-bold">
                                {currency(ms.Revenue_Recognized_This_Milestone)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {project.Notes && (
                      <p className="text-xs text-gray-500 border-t border-gray-200 pt-3 mt-3">{project.Notes}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
