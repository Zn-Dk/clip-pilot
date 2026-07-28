import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import './App.css'

type ClipKind = 'clip' | 'prompt'
type Filter = 'all' | 'favorite' | 'prompt'
type Transform = 'trim' | 'uppercase' | 'lowercase' | 'json'

type ClipItem = {
  id: string
  title: string
  text: string
  kind: ClipKind
  favorite: boolean
  createdAt: number
}

const STORAGE_KEY = 'clip-pilot.clips'

const seedClips: ClipItem[] = [
  {
    id: 'seed-api-review',
    title: 'API 评审提示词',
    text: '请从正确性、可维护性和边界条件三个方面评审下面的 API 设计，并给出最小修改建议。',
    kind: 'prompt',
    favorite: true,
    createdAt: Date.now() - 1000 * 60 * 18,
  },
  {
    id: 'seed-json',
    title: '接口响应示例',
    text: '{"status":"success","data":{"items":[1,2,3]},"requestId":"demo-001"}',
    kind: 'clip',
    favorite: false,
    createdAt: Date.now() - 1000 * 60 * 42,
  },
  {
    id: 'seed-meeting',
    title: '会议纪要模板',
    text: '背景：\n结论：\n待办：\n负责人：\n截止时间：',
    kind: 'prompt',
    favorite: false,
    createdAt: Date.now() - 1000 * 60 * 75,
  },
]

// #region 本地数据与剪贴板工具
function loadClips(): ClipItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as ClipItem[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    return seedClips
  }
  return seedClips
}

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

async function copyToClipboard(text: string) {
  try {
    await writeText(text)
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
}

async function readFromClipboard() {
  try {
    return await readText()
  } catch {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return ''
    }
  }
}
// #endregion

function App() {
  const [clips, setClips] = useState<ClipItem[]>(loadClips)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftText, setDraftText] = useState('')
  const [draftKind, setDraftKind] = useState<ClipKind>('clip')
  const [notice, setNotice] = useState('')
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clips))
  }, [clips])

  useEffect(() => {
    if (!selectedId || !clips.some((clip) => clip.id === selectedId)) {
      setSelectedId(clips[0]?.id ?? null)
    }
  }, [clips, selectedId])

  useEffect(() => {
    invoke<boolean>('is_dev_mode').then(setIsDev).catch(() => {})
  }, [])

  const selectedClip = clips.find((clip) => clip.id === selectedId) ?? null
  const filteredClips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return clips.filter((clip) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'favorite' && clip.favorite) ||
        (filter === 'prompt' && clip.kind === 'prompt')
      const matchesQuery =
        !normalizedQuery ||
        `${clip.title} ${clip.text}`.toLowerCase().includes(normalizedQuery)
      return matchesFilter && matchesQuery
    })
  }, [clips, filter, query])

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 1800)
  }

  const updateClip = (id: string, patch: Partial<ClipItem>) => {
    setClips((current) =>
      current.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)),
    )
  }

  const handleCopy = async (text: string) => {
    const copied = await copyToClipboard(text)
    showNotice(copied ? '已复制到系统剪贴板' : '当前环境无法访问系统剪贴板')
  }

  const handleReadClipboard = async () => {
    const text = await readFromClipboard()
    if (!text) {
      showNotice('系统剪贴板没有可读取的文本')
      return
    }
    setDraftText(text)
    setDraftTitle('来自系统剪贴板')
    setDraftKind('clip')
    setComposerOpen(true)
    showNotice('已读取系统剪贴板')
  }

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = draftText.trim()
    if (!text) return
    const item: ClipItem = {
      id: createId(),
      title: draftTitle.trim() || (draftKind === 'prompt' ? '未命名提示词' : '未命名片段'),
      text,
      kind: draftKind,
      favorite: false,
      createdAt: Date.now(),
    }
    setClips((current) => [item, ...current])
    setSelectedId(item.id)
    setDraftTitle('')
    setDraftText('')
    setComposerOpen(false)
    showNotice('已保存到 ClipPilot')
  }

  const handleDelete = () => {
    if (!selectedClip) return
    setClips((current) => current.filter((clip) => clip.id !== selectedClip.id))
    showNotice('片段已删除')
  }

  const handleTransform = (transform: Transform) => {
    if (!selectedClip) return
    let nextText = selectedClip.text
    if (transform === 'trim') nextText = nextText.trim()
    if (transform === 'uppercase') nextText = nextText.toUpperCase()
    if (transform === 'lowercase') nextText = nextText.toLowerCase()
    if (transform === 'json') {
      try {
        nextText = JSON.stringify(JSON.parse(nextText), null, 2)
      } catch {
        showNotice('当前片段不是有效 JSON')
        return
      }
    }
    updateClip(selectedClip.id, { text: nextText })
    showNotice('已应用本地处理')
  }

  const stats = {
    all: clips.length,
    favorite: clips.filter((clip) => clip.favorite).length,
    prompt: clips.filter((clip) => clip.kind === 'prompt').length,
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CP</span>
          <div>
            <strong>ClipPilot</strong>
            <span>Local-first workspace</span>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="section-label">工作区</p>
          <button className={`nav-item ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            <span>全部片段</span><b>{stats.all}</b>
          </button>
          <button className={`nav-item ${filter === 'favorite' ? 'active' : ''}`} onClick={() => setFilter('favorite')}>
            <span>我的收藏</span><b>{stats.favorite}</b>
          </button>
          <button className={`nav-item ${filter === 'prompt' ? 'active' : ''}`} onClick={() => setFilter('prompt')}>
            <span>提示词</span><b>{stats.prompt}</b>
          </button>
        </div>

        <div className="sidebar-note">
          <span className="status-dot" />
          <div>
            <strong>本地存储已启用</strong>
            <span>内容只保存在当前设备</span>
          </div>
        </div>

        <button className="primary-button sidebar-create" onClick={() => setComposerOpen(true)}>
          新建片段
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">PERSONAL KNOWLEDGE TOOL</p>
            <h1>把重要内容，放在顺手的位置。</h1>
          </div>
          <button className="secondary-button" onClick={handleReadClipboard}>
            读取系统剪贴板
          </button>
        </header>

        <div className="search-row">
          <label className="search-box">
            <span>搜索</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或内容" />
            <kbd>/</kbd>
          </label>
          <span className="result-count">{filteredClips.length} 个结果</span>
        </div>

        <div className="content-grid">
          <section className="clip-list-panel" aria-label="片段列表">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">COLLECTION</span>
                <h2>{filter === 'all' ? '最近保存' : filter === 'favorite' ? '我的收藏' : '提示词库'}</h2>
              </div>
              <span className="live-indicator">本地</span>
            </div>
            <div className="clip-list">
              {filteredClips.map((clip) => (
                <article className={`clip-card ${selectedId === clip.id ? 'selected' : ''}`} key={clip.id}>
                  <button className="clip-card-main" onClick={() => setSelectedId(clip.id)}>
                    <span className="clip-card-topline">
                      <span className={`type-pill ${clip.kind}`}>{clip.kind === 'prompt' ? '提示词' : '片段'}</span>
                      <time>{formatTime(clip.createdAt)}</time>
                    </span>
                    <strong>{clip.title}</strong>
                    <span>{clip.text.replace(/\s+/g, ' ').slice(0, 92)}</span>
                  </button>
                  <button
                    className={`favorite-button ${clip.favorite ? 'favorited' : ''}`}
                    aria-label={clip.favorite ? '取消收藏' : '收藏'}
                    onClick={() => updateClip(clip.id, { favorite: !clip.favorite })}
                  >
                    {clip.favorite ? '已收藏' : '收藏'}
                  </button>
                </article>
              ))}
              {filteredClips.length === 0 && (
                <div className="empty-state">
                  <strong>没有找到匹配片段</strong>
                  <span>换个关键词，或新建一个片段。</span>
                </div>
              )}
            </div>
          </section>

          <section className="detail-panel" aria-label="片段详情">
            {selectedClip ? (
              <>
                <div className="detail-header">
                  <div>
                    <span className={`type-pill ${selectedClip.kind}`}>{selectedClip.kind === 'prompt' ? '提示词' : '片段'}</span>
                    <input
                      className="detail-title"
                      value={selectedClip.title}
                      onChange={(event) => updateClip(selectedClip.id, { title: event.target.value })}
                      aria-label="片段标题"
                    />
                    <span className="detail-time">保存于 {formatTime(selectedClip.createdAt)}</span>
                  </div>
                  <button className="danger-button" onClick={handleDelete}>删除</button>
                </div>
                <textarea
                  className="detail-editor"
                  value={selectedClip.text}
                  onChange={(event) => updateClip(selectedClip.id, { text: event.target.value })}
                  aria-label="片段内容"
                />
                <div className="action-row">
                  <button className="primary-button" onClick={() => handleCopy(selectedClip.text)}>复制内容</button>
                  <button className="secondary-button" onClick={() => updateClip(selectedClip.id, { favorite: !selectedClip.favorite })}>
                    {selectedClip.favorite ? '取消收藏' : '加入收藏'}
                  </button>
                </div>
                <div className="transform-box">
                  <div>
                    <span className="panel-kicker">QUICK ACTIONS</span>
                    <h3>本地快捷处理</h3>
                  </div>
                  <div className="transform-actions">
                    <button onClick={() => handleTransform('trim')}>去除首尾空格</button>
                    <button onClick={() => handleTransform('json')}>格式化 JSON</button>
                    <button onClick={() => handleTransform('uppercase')}>转大写</button>
                    <button onClick={() => handleTransform('lowercase')}>转小写</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <span className="detail-empty-mark">+</span>
                <strong>选择一个片段开始</strong>
                <span>你的内容会在这里展开，并可直接编辑或复制。</span>
              </div>
            )}
          </section>
        </div>
      </main>

      {composerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setComposerOpen(false)}>
          <form className="composer-modal" onSubmit={handleCreate} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">NEW ITEM</span>
                <h2>保存一个新片段</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setComposerOpen(false)} aria-label="关闭">关闭</button>
            </div>
            <label>
              标题
              <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="例如：发布检查清单" autoFocus />
            </label>
            <label>
              类型
              <select value={draftKind} onChange={(event) => setDraftKind(event.target.value as ClipKind)}>
                <option value="clip">普通片段</option>
                <option value="prompt">提示词</option>
              </select>
            </label>
            <label>
              内容
              <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} placeholder="粘贴内容，或输入一段提示词" rows={7} required />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setComposerOpen(false)}>取消</button>
              <button type="submit" className="primary-button">保存片段</button>
            </div>
          </form>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
      {isDev && <div className="dev-badge" aria-label="开发模式">DEV_MODE</div>}
    </div>
  )
}

export default App
