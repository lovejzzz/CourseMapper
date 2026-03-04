// src/components/ProjectPicker.jsx — Cloud project list modal
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listProjects, deleteProject as cloudDeleteProject } from '../lib/cloudStorage';

export default function ProjectPicker({ isOpen, onClose, onOpenProject, onSaveCurrentAsNew, onDeleteProject }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);   // projectId or null
  const [openingId, setOpeningId] = useState(null);            // projectId being loaded

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listProjects(user.uid);
      setProjects(list);
    } catch (err) {
      console.error('[ProjectPicker] list failed', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && user) refresh();
    if (!isOpen) {
      setOpeningId(null);
      setDeleteConfirm(null);
    }
  }, [isOpen, user, refresh]);

  async function handleOpen(projectId) {
    setOpeningId(projectId);
    setError(null);
    try {
      await onOpenProject(projectId);
      onClose();
    } catch (err) {
      console.error('[ProjectPicker] open failed', err);
      setError('Failed to open project');
      setOpeningId(null);
    }
  }

  async function handleDelete(projectId) {
    if (!user) return;
    try {
      await cloudDeleteProject(user.uid, projectId);
      const nextProjects = projects.filter(p => p.id !== projectId);
      setProjects(nextProjects);
      if (onDeleteProject) onDeleteProject(projectId, nextProjects.length);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('[ProjectPicker] delete failed', err);
      setError('Failed to delete project');
    }
  }

  if (!isOpen) return null;

  function fmtDate(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-200/60 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h2 className="text-base font-bold text-slate-800">My Projects</h2>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading projects...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 text-center py-4">{error}</div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <svg className="w-10 h-10 mx-auto text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className="text-sm text-slate-400">No saved projects yet</p>
              <p className="text-[11px] text-slate-300">Generate a course map and it will be auto-saved here.</p>
            </div>
          )}

          {!loading && projects.map(proj => (
            <div
              key={proj.id}
              className={`group flex items-center gap-3 px-4 py-3 rounded-xl bg-white/50 border border-slate-100 hover:border-indigo-200/50 hover:bg-indigo-50/30 transition-all duration-200 ${openingId === proj.id ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                }`}
              onClick={() => !openingId && handleOpen(proj.id)}
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-100/60 flex items-center justify-center flex-shrink-0">
                {openingId === proj.id ? (
                  <svg className="animate-spin w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4.5 h-4.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{proj.courseName}</p>
                <p className="text-[10px] text-slate-400">
                  {proj.semester ? `${proj.semester} · ` : ''}{fmtDate(proj.updatedAt)}
                </p>
              </div>
              {/* Delete button */}
              {openingId === proj.id ? (
                <span className="text-[10px] text-indigo-500 font-medium">Opening...</span>
              ) : deleteConfirm === proj.id ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleDelete(proj.id)}
                    className="px-2 py-1 text-[10px] font-semibold text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(proj.id); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-1"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          {onSaveCurrentAsNew && (
            <button
              onClick={() => { onSaveCurrentAsNew(); onClose(); }}
              className="tactile flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-sm hover:brightness-[1.06] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Save Current as New Project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
