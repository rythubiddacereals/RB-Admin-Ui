import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  File as FileIcon,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { api, getStoredToken } from '@/lib/api';

/**
 * Bulk product import — Excel only, kept deliberately simple:
 * download the generated template → fill one row per product →
 * upload here → attach photos on the Attach Images screen.
 *
 * The old ZIP-of-images flow (filename matching) was removed —
 * it was the main source of confusion and failed imports.
 *
 * The mutation uses a longer axios timeout — big sheets can take
 * a minute or more to parse server-side, and the default 15 s
 * would false-fail those.
 */


interface ImportResult {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExcelFile(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith('.xlsx') || n.endsWith('.xls');
}

export function BulkImportPage() {
  const qc = useQueryClient();
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const clientError = useMemo(() => {
    if (excelFile && !isExcelFile(excelFile.name)) {
      return 'Excel file must be .xlsx or .xls format.';
    }
    return null;
  }, [excelFile]);

  const canUpload = !!excelFile && !clientError;

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!excelFile) throw new Error('Excel file required');
      const form = new FormData();
      form.append('excelFile', excelFile);
      setProgress(0);
      setResult(null);
      setError(null);
      // Big sheets can take a while to parse server-side — override
      // the shared 15s axios timeout.
      const r = await api.post<ImportResult>(
        '/api/admin/products/bulk-import',
        form,
        {
          timeout: 5 * 60 * 1000,
          onUploadProgress: e => {
            if (e.total) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        },
      );
      return r.data;
    },
    onSuccess: data => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard', 'stats'] });
    },
    onError: (err: any) => {
      // The backend returns 4xx/5xx with an ImportResult body when
      // it fails on our side — surface that as a normal result. If
      // it's a network / axios error, fall through to a plain string.
      const body = err?.response?.data as ImportResult | undefined;
      if (body && Array.isArray(body.errors)) {
        setResult(body);
      } else {
        setError(
          err?.response?.data?.message ??
            err?.message ??
            'Upload failed — try again.',
        );
      }
    },
  });

  const reset = () => {
    setExcelFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
          <Upload size={22} /> Bulk Import Product
        </h1>
        <p className="mt-1 text-sm font-semibold text-secondary-800">
          Two simple steps: upload the filled Excel sheet here, then add
          product photos on the{' '}
          <Link to="/bulk-import/images" className="text-primary-600 underline">
            Attach Images
          </Link>{' '}
          screen by drag and drop.
        </p>
      </div>

      <TemplateCard />

      <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm">
        <div className="mx-auto max-w-xl">
          <FilePicker
            inputRef={excelInputRef}
            label="Product spreadsheet"
            hint="Excel file (.xlsx or .xls) with one row per product."
            accept=".xlsx,.xls"
            icon={<FileSpreadsheet size={24} className="text-success" />}
            file={excelFile}
            disabled={uploadMut.isPending}
            onChange={setExcelFile}
          />
        </div>

        {clientError ? (
          <div className="mt-4 rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {clientError}
          </div>
        ) : null}

        {uploadMut.isPending ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-bold text-secondary-800">
              <span>
                {progress < 100
                  ? `Uploading… ${progress}%`
                  : 'Processing on the server…'}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary-100">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={reset}
            disabled={uploadMut.isPending}
            className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50 disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={() => uploadMut.mutate()}
            disabled={!canUpload || uploadMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2 font-bold text-white shadow-sm hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
          >
            {uploadMut.isPending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Upload size={16} />
            )}
            Run import
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-5 py-4 text-sm font-semibold text-danger">
          {error}
        </div>
      ) : null}

      {result ? <ResultCard result={result} /> : null}

      {/* The natural next step after a successful Excel-only import:
          give the new products their photos. */}
      {result && result.successfulRecords > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-5 py-4">
          <p className="text-sm font-bold text-primary-800">
            {result.successfulRecords} product{result.successfulRecords === 1 ? '' : 's'} imported.
            Add their photos now — click a product, pick an image, done.
          </p>
          <Link
            to="/bulk-import/images"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            Attach Images →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

// ─── Widgets ──────────────────────────────────────────────────────

function TemplateCard() {
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const download = async () => {
    setDownloading(true);
    setErr(null);
    try {
      // Native fetch here (not axios) — axios' `responseType: 'blob'`
      // is a bit fiddly with the interceptor, and we only need to
      // stream a binary file with the same JWT on the header.
      const token = getStoredToken();
      const res = await fetch('/api/admin/products/bulk-import/template', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        setErr(`Download failed (${res.status}). Try again in a moment.`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary-500 bg-primary-50 p-4">
      <Info size={20} className="mt-0.5 flex-shrink-0 text-primary-700" />
      <div className="flex-1">
        <p className="font-bold text-primary-700">
          First time doing a bulk import?
        </p>
        <p className="mt-1 text-sm text-gray-800">
          Download the Excel template so you have the exact column headers the
          importer expects. Filling in extra columns is fine; missing required
          ones will fail validation.
        </p>
        {err ? (
          <p className="mt-2 text-xs font-semibold text-danger">{err}</p>
        ) : null}
      </div>
      <button
        onClick={download}
        disabled={downloading}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600 disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="animate-spin" size={14} />
        ) : (
          <Download size={14} />
        )}
        Download template
      </button>
    </div>
  );
}

function FilePicker({
  inputRef,
  label,
  hint,
  accept,
  icon,
  file,
  disabled,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  label: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  disabled: boolean;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-gray-800">
        {label}
      </label>
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
          file
            ? 'border-primary-500 bg-primary-50'
            : 'border-secondary-300 hover:border-primary-500'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        {file ? (
          <FileIcon size={24} className="text-primary-700" />
        ) : (
          icon
        )}
        <div className="flex-1 overflow-hidden">
          {file ? (
            <>
              <div className="truncate font-bold text-gray-900">
                {file.name}
              </div>
              <div className="text-xs font-semibold text-secondary-700">
                {humanSize(file.size)}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-primary-700">
                Click to choose a file
              </div>
              <div className="text-xs font-semibold text-secondary-700">
                {hint}
              </div>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={e => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}

function ResultCard({ result }: { result: ImportResult }) {
  const successCount = result.successfulRecords ?? 0;
  const failedCount = result.failedRecords ?? 0;
  const totalCount = result.totalRecords ?? 0;
  const status = (result.status ?? 'FAILED').toUpperCase();
  const isSuccess = status === 'SUCCESS';
  const isPartial = status === 'PARTIAL_SUCCESS';

  const banner = isSuccess
    ? { cls: 'bg-success-soft border-success', color: 'text-success', Icon: CheckCircle2, label: 'Import successful' }
    : isPartial
    ? { cls: 'bg-warning-soft border-warning', color: 'text-warning', Icon: AlertTriangle, label: 'Partial success — some rows failed' }
    : { cls: 'bg-danger-soft border-danger', color: 'text-danger', Icon: XCircle, label: 'Import failed' };

  const rate =
    totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

  return (
    <div className={`rounded-xl border-2 ${banner.cls} p-5`}>
      <div className="flex items-start gap-3">
        <banner.Icon size={24} className={`mt-0.5 flex-shrink-0 ${banner.color}`} />
        <div className="flex-1">
          <h2 className={`text-lg font-extrabold ${banner.color}`}>
            {banner.label}
          </h2>
          {totalCount > 0 ? (
            <p className="mt-1 text-sm text-gray-800">
              <b>{successCount}</b> of <b>{totalCount}</b> rows imported
              successfully ({rate}%).
              {result.processingTimeMs > 0
                ? ` Took ${(result.processingTimeMs / 1000).toFixed(1)}s.`
                : ''}
            </p>
          ) : null}
        </div>
      </div>

      {totalCount > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <StatBox label="Total" value={String(totalCount)} tone="secondary" />
          <StatBox label="Imported" value={String(successCount)} tone="success" />
          <StatBox label="Failed" value={String(failedCount)} tone={failedCount > 0 ? 'danger' : 'secondary'} />
        </div>
      ) : null}

      {result.errors && result.errors.length > 0 ? (
        <MessageList
          title={`Errors (${result.errors.length})`}
          messages={result.errors}
          tone="danger"
        />
      ) : null}
      {result.warnings && result.warnings.length > 0 ? (
        <MessageList
          title={`Warnings (${result.warnings.length})`}
          messages={result.warnings}
          tone="warning"
        />
      ) : null}

      {isSuccess ? (
        <p className="mt-4 text-xs font-semibold text-secondary-700">
          Products list has been refreshed — jump to{' '}
          <a href="/products" className="font-bold text-primary-700 hover:underline">
            /products
          </a>{' '}
          to spot-check the new rows.
        </p>
      ) : null}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger' | 'secondary';
}) {
  const cls =
    tone === 'success'
      ? 'bg-success-soft text-success'
      : tone === 'danger'
      ? 'bg-danger-soft text-danger'
      : 'bg-secondary-100 text-secondary-800';
  return (
    <div className={`rounded-lg px-4 py-3 ${cls}`}>
      <div className="text-xs font-bold uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function MessageList({
  title,
  messages,
  tone,
}: {
  title: string;
  messages: string[];
  tone: 'danger' | 'warning';
}) {
  const cls =
    tone === 'danger'
      ? 'border-danger bg-white text-danger'
      : 'border-warning bg-white text-warning';
  return (
    <div className={`mt-4 max-h-64 overflow-y-auto rounded-lg border ${cls} p-3`}>
      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide">
        {title}
      </div>
      <ul className="space-y-1 text-xs font-semibold">
        {messages.map((m, i) => (
          <li key={i} className="font-mono text-gray-800">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
