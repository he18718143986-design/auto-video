import { useEffect, useMemo, useState } from 'react';
import type { RunDetails } from '../types/index.js';
import styles from './RunAssetsPanel.module.css';

type AssetSection = 'text' | 'media' | 'screenshots';
type AssetKind = 'text' | 'image' | 'video' | 'audio' | 'file';

interface AssetItem {
  id: string;
  section: AssetSection;
  kind: AssetKind;
  label: string;
  path: string;
  content?: string;
}

const TEXT_LABELS: Record<string, string> = {
  'outputs/session_preparation.json': 'Session Preparation',
  'outputs/capability_assessment.txt': 'Capability Assessment (Raw)',
  'outputs/capability_assessment.json': 'Capability Assessment',
  'outputs/style_dna.raw.txt': 'Style DNA (Raw)',
  'outputs/style_dna.json': 'Style DNA',
  'outputs/research.raw.txt': 'Research (Raw)',
  'outputs/research.json': 'Research',
  'outputs/narrative_map.raw.txt': 'Narrative Map (Raw)',
  'outputs/narrative_map.json': 'Narrative Map',
  'outputs/script.raw.txt': 'Script (Raw)',
  'outputs/script.json': 'Script',
  'outputs/qa.raw.txt': 'QA (Raw)',
  'outputs/qa.json': 'QA',
  'outputs/storyboard.raw.txt': 'Storyboard (Raw)',
  'outputs/storyboard.json': 'Storyboard',
  'outputs/asset_generation.json': 'Asset Generation',
  'outputs/video_generation_log.json': 'Scene Video Generation Log',
  'outputs/tts_manifest.json': 'TTS Manifest',
  'final/render_manifest.json': 'Render Manifest',
  'final/subtitles.srt': 'Subtitles',
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);

function fileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot >= 0 ? filePath.slice(lastDot).toLowerCase() : '';
}

function classifyFile(filePath: string): AssetKind {
  const ext = fileExtension(filePath);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'file';
}

function labelForPath(filePath: string): string {
  return TEXT_LABELS[filePath] ?? filePath.split('/').at(-1) ?? filePath;
}

function runFileUrl(runId: string, relativePath: string): string {
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/runs/${encodeURIComponent(runId)}/${encodedPath}`;
}

function sortMediaFiles(paths: string[]): string[] {
  return [...paths].sort((left, right) => {
    const leftPriority = left.startsWith('final/') ? 0 : left.startsWith('media/') ? 1 : 2;
    const rightPriority = right.startsWith('final/') ? 0 : right.startsWith('media/') ? 1 : 2;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.localeCompare(right);
  });
}

function buildItems(details: RunDetails): AssetItem[] {
  const textItems = Object.entries(details.textArtifacts).map(([filePath, content]) => ({
    id: `text:${filePath}`,
    section: 'text' as const,
    kind: 'text' as const,
    label: labelForPath(filePath),
    path: filePath,
    content,
  }));

  const mediaItems = sortMediaFiles(details.mediaFiles).map((filePath) => ({
    id: `media:${filePath}`,
    section: 'media' as const,
    kind: classifyFile(filePath),
    label: labelForPath(filePath),
    path: filePath,
  }));

  const screenshotItems = details.screenshots.map((filePath) => ({
    id: `screenshot:${filePath}`,
    section: 'screenshots' as const,
    kind: classifyFile(filePath),
    label: labelForPath(filePath),
    path: filePath,
  }));

  return [...textItems, ...mediaItems, ...screenshotItems];
}

function normalizeRelativePath(value: string | undefined): string {
  return (value ?? '').replace(/^\/+/, '');
}

function renderPreview(runId: string, item: AssetItem) {
  if (item.kind === 'text') {
    return (
      <pre className={styles.textPreview}>
        <code>{item.content}</code>
      </pre>
    );
  }

  const assetUrl = runFileUrl(runId, item.path);
  if (item.kind === 'image') {
    return <img className={styles.imagePreview} src={assetUrl} alt={item.label} />;
  }

  if (item.kind === 'video') {
    return <video className={styles.videoPreview} src={assetUrl} controls preload="metadata" />;
  }

  if (item.kind === 'audio') {
    return <audio className={styles.audioPreview} src={assetUrl} controls preload="metadata" />;
  }

  return (
    <div className={styles.empty}>
      <div>
        <p>Preview is not available for this file type.</p>
        <p className={styles.helperText}>Open the file directly to inspect it.</p>
      </div>
    </div>
  );
}

export function RunAssetsPanel({
  runId,
  details,
  loading = false,
  emptyMessage = 'No run details available yet.',
}: {
  runId: string;
  details: RunDetails | null;
  loading?: boolean;
  emptyMessage?: string;
}) {
  const allItems = useMemo(() => (details ? buildItems(details) : []), [details]);
  const finalVideoPath = useMemo(
    () => normalizeRelativePath(details?.manifest.artifacts.finalVideo),
    [details]
  );
  const [onlyFinalVideo, setOnlyFinalVideo] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');

  const finalVideoItem = useMemo(
    () =>
      allItems.find(
        (item) =>
          item.section === 'media' &&
          normalizeRelativePath(item.path) === finalVideoPath
      ) ?? null,
    [allItems, finalVideoPath]
  );

  const items = useMemo(() => {
    if (!onlyFinalVideo) return allItems;
    if (!finalVideoPath) return [];
    return allItems.filter(
      (item) =>
        item.section === 'media' &&
        normalizeRelativePath(item.path) === finalVideoPath
    );
  }, [allItems, onlyFinalVideo, finalVideoPath]);

  const canFilterFinalVideo = Boolean(finalVideoPath);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!canFilterFinalVideo && onlyFinalVideo) {
      setOnlyFinalVideo(false);
    }
  }, [canFilterFinalVideo, onlyFinalVideo]);

  useEffect(() => {
    if (copyFeedback === 'idle') return;
    const timeout = window.setTimeout(() => setCopyFeedback('idle'), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) ?? null
    : null;

  const baseSections: Array<{ id: AssetSection; title: string; items: AssetItem[] }> = [
    { id: 'text', title: 'Text Artifacts', items: items.filter((item) => item.section === 'text') },
    { id: 'media', title: 'Media Files', items: items.filter((item) => item.section === 'media') },
    { id: 'screenshots', title: 'Screenshots', items: items.filter((item) => item.section === 'screenshots') },
  ];
  const sections = onlyFinalVideo ? baseSections.filter((section) => section.id === 'media') : baseSections;

  const totalSections: Array<{ id: AssetSection; items: AssetItem[] }> = [
    { id: 'text', items: allItems.filter((item) => item.section === 'text') },
    { id: 'media', items: allItems.filter((item) => item.section === 'media') },
    { id: 'screenshots', items: allItems.filter((item) => item.section === 'screenshots') },
  ];

  async function copySelectedPath() {
    if (!selectedItem) return;
    const copyValue = `runs/${runId}/${selectedItem.path}`;

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopyFeedback('copied');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = copyValue;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopyFeedback(ok ? 'copied' : 'failed');
    }
  }

  function downloadSelectedItem() {
    if (!selectedItem) return;
    const fileName = selectedItem.path.split('/').at(-1) ?? 'artifact';

    if (selectedItem.kind === 'text') {
      const blob = new Blob([selectedItem.content ?? ''], {
        type: 'text/plain;charset=utf-8',
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = runFileUrl(runId, selectedItem.path);
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  if (loading && !details) {
    return <div className={styles.empty}>Loading run assets…</div>;
  }

  if (!details || allItems.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryChip}>{totalSections[0].items.length} text artifacts</span>
        <span className={styles.summaryChip}>{totalSections[1].items.length} media files</span>
        <span className={styles.summaryChip}>{totalSections[2].items.length} screenshots</span>
        <button
          type="button"
          className={`btn btn-secondary btn-sm ${onlyFinalVideo ? styles.filterToggleActive : ''}`}
          onClick={() => {
            setOnlyFinalVideo((prev) => !prev);
            setSelectedItemId(finalVideoItem?.id ?? null);
          }}
          disabled={!canFilterFinalVideo}
          title={canFilterFinalVideo ? 'Show only final video output' : 'No final video available yet.'}
        >
          {onlyFinalVideo ? 'Only Final Video: On' : 'Only Final Video'}
        </button>
        {!canFilterFinalVideo && (
          <span className={styles.summaryNote}>Manifest has no final video artifact yet.</span>
        )}
      </div>

      <div className={styles.layout}>
        <div className={styles.listPane}>
          {sections.map((section) => (
            <div key={section.id} className={styles.sectionCard}>
              <div className={styles.sectionTitle}>{section.title}</div>
              {section.items.length === 0 ? (
                <div className={styles.helperText}>No items in this section.</div>
              ) : (
                <div className={styles.itemList}>
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.itemButton}${selectedItemId === item.id ? ` ${styles.itemButtonActive}` : ''}`}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <span className={styles.itemLabel}>{item.label}</span>
                      <span className={styles.itemMeta}>{item.path}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.viewer}>
          {selectedItem ? (
            <>
              <div className={styles.viewerHeader}>
                <div className={styles.viewerTitle}>
                  <strong>{selectedItem.label}</strong>
                  <span className={styles.viewerPath}>{selectedItem.path}</span>
                </div>
                <div className={styles.viewerActions}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={downloadSelectedItem}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      void copySelectedPath();
                    }}
                  >
                    Copy Path
                  </button>
                  {selectedItem.kind !== 'text' && (
                    <a
                      className="btn btn-secondary btn-sm"
                      href={runFileUrl(runId, selectedItem.path)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open File
                    </a>
                  )}
                </div>
              </div>
              {copyFeedback !== 'idle' && (
                <div className={styles.copyFeedback}>
                  {copyFeedback === 'copied' ? 'Path copied.' : 'Copy failed in this browser.'}
                </div>
              )}
              <div className={styles.viewerBody}>
                {renderPreview(runId, selectedItem)}
              </div>
            </>
          ) : (
            <div className={styles.empty}>Select an artifact to preview it.</div>
          )}
        </div>
      </div>
    </div>
  );
}
