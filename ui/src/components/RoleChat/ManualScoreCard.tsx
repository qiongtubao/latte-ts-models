import React, { useState } from 'react';

const TAGS = ['幻觉', '逻辑错误', '代码可运行', '格式完美', '缺少注释', '边界遗漏'];

interface Props {
  messageId: string;
  onSubmit: (msgId: string, rating: number, tags: string[], comment: string) => void;
}

export default function ManualScoreCard({ messageId, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = () => {
    if (rating === 0) return;
    onSubmit(messageId, rating, selectedTags, comment);
    setOpen(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {!open ? (
        <button className="btn btn-sm" onClick={() => setOpen(true)}>人工评分</button>
      ) : (
        <div style={{ padding: 8, background: '#f9f9f9', borderRadius: 8 }}>
          <div style={{ marginBottom: 4 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <span key={i} onClick={() => setRating(i)} style={{ cursor: 'pointer', fontSize: 18, color: i <= rating ? '#f0a500' : '#ccc' }}>
                {i <= rating ? '★' : '☆'}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {TAGS.map(tag => (
              <button key={tag} className={`btn btn-sm ${selectedTags.includes(tag) ? 'btn-primary' : ''}`} onClick={() => toggleTag(tag)}>
                #{tag}
              </button>
            ))}
          </div>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="评语..." style={{ width: '100%', padding: 4, marginBottom: 4 }} />
          <button className="btn btn-sm btn-primary" onClick={handleSubmit}>提交评分</button>
        </div>
      )}
    </div>
  );
}
