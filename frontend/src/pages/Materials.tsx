import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Upload, Trash2, FileText, Loader2, CheckCircle, Clock,
  AlertCircle, ChevronDown, ChevronUp, RefreshCw, FolderOpen,
  Hash, File, FileSearch, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi } from '../services/api';
import { StudyMaterial } from '../types';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

const FILE_COLORS: Record<string, string> = {
  '.pdf':  'bg-red-50 text-red-500',
  '.docx': 'bg-blue-50 text-blue-500',
  '.doc':  'bg-blue-50 text-blue-500',
  '.pptx': 'bg-orange-50 text-orange-500',
  '.txt':  'bg-gray-100 text-gray-500',
};

function FileChip({ ext }: { ext: string }) {
  return (
    <div className={cn(
      'w-11 h-11 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0',
      FILE_COLORS[ext] || 'bg-gray-100 text-gray-500'
    )}>
      {ext.replace('.', '').toUpperCase()}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const variants: Record<string, { cls: string; label: string; icon: any }> = {
    completed:  { cls: 'bg-green-100 text-green-700', label: 'Ready',      icon: CheckCircle },
    processing: { cls: 'bg-amber-100 text-amber-700', label: 'Processing', icon: Loader2     },
    pending:    { cls: 'bg-gray-100 text-gray-500',   label: 'Pending',    icon: Clock       },
    failed:     { cls: 'bg-red-100 text-red-600',     label: 'Failed',     icon: AlertCircle },
  };
  const { cls, label, icon: Icon } = variants[status] || variants.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-0.5 rounded-full', cls)}>
      <Icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}

function DeleteModal({
  material, onConfirm, onCancel, loading,
}: {
  material: StudyMaterial;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-7 animate-in fade-in-0 zoom-in-95 text-center">
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X size={15} />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4 mx-auto">
          <Trash2 size={22} className="text-red-500" />
        </div>

        <h3 className="text-[17px] font-bold text-gray-900 mb-2">Delete material?</h3>
        <p className="text-[13.5px] text-gray-500 leading-relaxed mb-1">
          <span className="font-semibold text-gray-700">{material.original_name}</span> will be permanently removed along with all its quiz data and embeddings.
        </p>
        <p className="text-[12.5px] text-gray-400 mt-1 mb-7">This action cannot be undone.</p>

        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-lg border border-gray-200 text-gray-700 text-[14px] font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-11 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[14px] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialsSkeleton() {
  return (
    <div className="space-y-5 p-7">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-36 rounded-xl" />
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)}
    </div>
  );
}

export default function Materials() {
  const [materials, setMaterials]         = useState<StudyMaterial[]>([]);
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [dragOver, setDragOver]           = useState(false);
  const [expandedId, setExpandedId]       = useState<number | null>(null);
  const [summaryMap, setSummaryMap]       = useState<Record<number, string>>({});
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [error, setError]                 = useState('');
  const [deleteTarget, setDeleteTarget]   = useState<StudyMaterial | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const fileRef  = useRef<HTMLInputElement>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    materialsApi.list()
      .then((res) => setMaterials(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => {
      setMaterials((prev) => {
        if (prev.some((m) => ['pending', 'processing'].includes(m.processing_status))) load();
        return prev;
      });
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        await materialsApi.upload(file);
        toast.success(`${file.name} uploaded — processing started`);
      } catch (err: any) {
        const msg = err.response?.data?.detail || `Failed to upload ${file.name}`;
        toast.error(msg);
        setError(msg);
      }
    }
    setUploading(false);
    load();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await materialsApi.delete(deleteTarget.id).catch(() => {});
    setMaterials((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    toast.success('Material deleted');
    setDeleteTarget(null);
    setDeleting(false);
  };

  const handleSummarize = async (m: StudyMaterial) => {
    if (summaryMap[m.id]) { setExpandedId(expandedId === m.id ? null : m.id); return; }
    setSummarizingId(m.id);
    try {
      const res = await materialsApi.summarize(m.id);
      setSummaryMap((prev) => ({ ...prev, [m.id]: res.data.summary }));
      setExpandedId(m.id);
      toast.success('Summary generated');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Summarization failed';
      toast.error(msg);
      setError(msg);
    } finally {
      setSummarizingId(null);
    }
  };

  if (loading) return <MaterialsSkeleton />;

  const completed  = materials.filter((m) => m.processing_status === 'completed').length;
  const inProgress = materials.filter((m) => ['pending', 'processing'].includes(m.processing_status)).length;

  return (
    <>
    {deleteTarget && (
      <DeleteModal
        material={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    )}
    <div className="fade-in w-full space-y-5 p-7">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-gray-900">Materials</h1>
          <p className="text-[15.5px] text-gray-500 mt-1.5">
            {materials.length === 0
              ? 'Upload lecture notes, textbooks, past papers, or slides'
              : `${materials.length} documents · ${completed} ready${inProgress > 0 ? ` · ${inProgress} processing` : ''}`}
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 h-9 px-4 bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 font-semibold text-[13px] rounded-lg transition-colors"
        >
          <Upload size={14} strokeWidth={2.5} />
          Upload
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 text-red-700 text-[13.5px] px-4 py-3 rounded-lg border border-red-200">
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Upload zone */}
      <div
        className={cn(
          'rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer bg-white',
          dragOver
            ? 'border-gray-400 bg-gray-50'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
        )}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.pptx,.txt"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="py-9 px-6 flex items-center gap-5">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            dragOver ? 'bg-gray-200' : 'bg-gray-100'
          )}>
            <Upload size={22} className="text-gray-400" />
          </div>
          {uploading ? (
            <div className="flex items-center gap-3">
              <Loader2 size={17} className="animate-spin text-gray-500" />
              <p className="text-[14px] font-medium text-gray-700">Uploading your files…</p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-[16px] text-gray-800">
                {dragOver ? 'Drop to upload' : 'Drop notes, papers, slides here'}
              </p>
              <p className="text-[14px] text-gray-400 mt-1">
                Lecture notes · textbooks · past papers · slides · handwritten scans
              </p>
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {['PDF', 'PPTX', 'DOCX', 'TXT'].map((t) => (
                  <span key={t} className="text-[12px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md">{t}</span>
                ))}
                <span className="text-[12px] text-gray-400">max 50 MB</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Polling notice */}
      {inProgress > 0 && (
        <div className="flex items-center gap-2 text-[12.5px] text-gray-500">
          <RefreshCw size={12} className="animate-spin" />
          Auto-refreshing while documents process…
        </div>
      )}

      {/* Empty state */}
      {materials.length === 0 ? (
        <div className="bg-white rounded-xl border border-border py-16 text-center">
          <FolderOpen size={38} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-700 text-[16px]">No materials uploaded yet</p>
          <p className="text-[14.5px] text-gray-400 mt-1">Upload your first document above to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {materials.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-border overflow-hidden hover:shadow-sm transition-shadow">
              <div className="px-5 py-4 flex items-center gap-4">
                <FileChip ext={m.file_type} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="font-semibold text-[15px] text-gray-900 truncate">{m.original_name}</p>
                    <StatusPill status={m.processing_status} />
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-0 mt-1.5 text-[13px] text-gray-400">
                    {m.page_count  > 0 && <span className="flex items-center gap-1"><File size={11} />{m.page_count}p</span>}
                    {m.chunk_count > 0 && <span className="flex items-center gap-1"><Hash size={11} />{m.chunk_count} chunks</span>}
                    {m.word_count  > 0 && <span>{m.word_count.toLocaleString()} words</span>}
                    <span>{formatSize(m.file_size)}</span>
                    <span>·</span>
                    <span>{timeAgo(m.upload_date)}</span>
                  </div>
                  {m.processing_status === 'processing' && (
                    <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden max-w-xs">
                      <div className="h-full bg-amber-400 rounded-full animate-pulse w-2/3" />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                  {m.processing_status === 'completed' && (
                    <>
                      <button
                        onClick={() => handleSummarize(m)}
                        disabled={summarizingId === m.id}
                        className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-60"
                      >
                        {summarizingId === m.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <FileSearch size={14} />}
                        {summarizingId === m.id
                          ? 'Working…'
                          : summaryMap[m.id]
                          ? (expandedId === m.id ? 'Hide' : 'Summary')
                          : 'AI Summary'}
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                        className="h-9 w-9 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        {expandedId === m.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="h-9 w-9 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Failed note */}
              {m.processing_status === 'failed' && (
                <div className="px-5 pb-3 flex items-center gap-1.5">
                  <AlertCircle size={12} className="text-red-400" />
                  <p className="text-[12.5px] text-red-600">Processing failed — try re-uploading</p>
                </div>
              )}

              {/* Expanded summary */}
              {expandedId === m.id && (
                <div className="border-t border-border bg-gray-50/60 px-5 py-5">
                  {summaryMap[m.id] ? (
                    <>
                      <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                        <FileText size={11} /> AI Summary
                      </p>
                      <p className="text-[14.5px] text-gray-700 leading-relaxed whitespace-pre-wrap">{summaryMap[m.id]}</p>
                    </>
                  ) : (
                    <p className="text-[14px] text-gray-500">Click "AI Summary" to generate a structured overview of this material.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
