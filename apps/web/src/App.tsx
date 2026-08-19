import { useEffect, useState } from 'react'
import { useNoteStore } from './store'
import { listNotes, createNote, updateNote, deleteNote } from './api'

export default function App() {
  const {
    notes,
    selectedId,
    loading,
    error,
    setNotes,
    addNote,
    updateNote: updateLocalNote,
    removeNote,
    selectNote,
    setLoading,
    setError,
  } = useNoteStore()

  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')

  useEffect(() => {
    setLoading(true)
    listNotes()
      .then(setNotes)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [setNotes, setLoading, setError])

  const selectedNote = notes.find((n) => n.id === selectedId)

  useEffect(() => {
    if (selectedNote) {
      setContent(selectedNote.content)
      setSourceUrl(selectedNote.sourceUrl ?? '')
    } else {
      setContent('')
      setSourceUrl('')
    }
  }, [selectedNote])

  async function handleCreate() {
    if (!content.trim()) return
    setLoading(true)
    setError(null)
    try {
      const note = await createNote(content, sourceUrl || undefined)
      addNote(note)
      setContent('')
      setSourceUrl('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate() {
    if (!selectedId || !content.trim()) return
    setLoading(true)
    setError(null)
    try {
      const note = await updateNote(selectedId, content)
      updateLocalNote(note)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    setLoading(true)
    setError(null)
    try {
      await deleteNote(id)
      removeNote(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>MarkFlow Notes</h1>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        <div>
          <button
            onClick={() => selectNote(null)}
            style={{ marginBottom: 12, width: '100%' }}
            disabled={loading}
          >
            + New Note
          </button>
          {loading && notes.length === 0 ? (
            <div>Loading...</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {notes.map((note) => (
                <li
                  key={note.id}
                  onClick={() => selectNote(note.id)}
                  style={{
                    padding: 8,
                    cursor: 'pointer',
                    background: note.id === selectedId ? '#e5e7eb' : 'transparent',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  <div>{note.content.slice(0, 40) || '(empty)'}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {new Date(note.updatedAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <input
            type="text"
            placeholder="Source URL (optional)"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8 }}
            disabled={loading}
          />
          <textarea
            placeholder="Note content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            style={{ width: '100%', marginBottom: 12, padding: 8 }}
            disabled={loading}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            {selectedId ? (
              <>
                <button onClick={handleUpdate} disabled={loading}>
                  Update
                </button>
                <button
                  onClick={() => handleDelete(selectedId)}
                  disabled={loading}
                  style={{ color: 'red' }}
                >
                  Delete
                </button>
              </>
            ) : (
              <button onClick={handleCreate} disabled={loading}>
                Create
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
