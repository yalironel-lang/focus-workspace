/**
 * Safe read-only media views for TipTap shadow renderer.
 * Images: local IDB/cache only (nbImageGet + hydrateNotebookImages).
 * Handwriting: local cache paint only (hwGetCached + optional local hydrate).
 * No cloud reconcile, no writes, no HandwritingBlock edit surface.
 */

import { useEffect, useRef, useState } from 'react';
import { nbImageGet, hydrateNotebookImages, subscribeNotebookImages } from '../notebookImageStore';
import { hwGetCached, hydrateHandwritingBlocks } from '../notebookHandwritingStore';
import { drawStrokes } from '../handwritingGeometry';
import { emptyHandwritingData } from '../handwritingTypes';

export function NotebookImageReadonlyView({
  imageKey,
  alt,
  width,
}: {
  imageKey: string;
  alt: string;
  width?: number | null;
}) {
  const [, bump] = useState(0);
  useEffect(() => subscribeNotebookImages(() => bump(n => n + 1)), []);
  useEffect(() => {
    if (imageKey) void hydrateNotebookImages([imageKey]);
  }, [imageKey]);

  const src = imageKey ? nbImageGet(imageKey) : null;
  if (!src) {
    return (
      <div
        data-nb-parity="image-missing"
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px dashed rgba(148,163,184,0.35)',
          color: 'rgba(148,163,184,0.85)',
          fontSize: 13,
        }}
      >
        Image ref <code>{imageKey || '(empty)'}</code>
        {alt ? ` — ${alt}` : ''} (not in local cache)
      </div>
    );
  }
  return (
    <img
      data-nb-parity="image"
      className="nb-img-block"
      src={src}
      alt={alt}
      draggable={false}
      style={{
        width: width ? `${width}px` : '100%',
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 10,
        display: 'block',
      }}
    />
  );
}

export function NotebookHandwritingReadonlyView({
  objectId,
  blockKey,
}: {
  objectId?: string;
  blockKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (!objectId || !blockKey) return;
    let cancelled = false;
    void hydrateHandwritingBlocks(objectId, [blockKey]).then(() => {
      if (!cancelled) setReady(n => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [objectId, blockKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !objectId || !blockKey) return;
    const data = hwGetCached(objectId, blockKey) ?? emptyHandwritingData(400, 220);
    const w = data.canvas.width || 400;
    const h = data.canvas.height || 220;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(15,23,42,0.35)';
    ctx.fillRect(0, 0, w, h);
    if (data.strokes.length) drawStrokes(ctx, data.strokes, w, h, Math.min(w, h));
  }, [objectId, blockKey, ready]);

  if (!objectId) {
    return (
      <div
        data-nb-parity="handwriting-unbound"
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px dashed rgba(148,163,184,0.35)',
          color: 'rgba(148,163,184,0.85)',
          fontSize: 13,
        }}
      >
        Handwriting <code>::hw::{blockKey}::</code> (no objectId — paint skipped)
      </div>
    );
  }

  const cached = hwGetCached(objectId, blockKey);
  const empty = !cached || cached.strokes.length === 0;

  return (
    <div
      data-nb-parity={cached ? 'handwriting' : 'handwriting-missing'}
      data-nb-hw-key={blockKey}
      style={{ position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          maxWidth: 480,
          height: 'auto',
          borderRadius: 10,
          display: 'block',
          border: '1px solid rgba(148,163,184,0.2)',
        }}
      />
      {empty ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(148,163,184,0.75)',
            fontSize: 12,
            pointerEvents: 'none',
            textAlign: 'center',
            padding: 12,
          }}
        >
          {cached
            ? `Handwriting key ${blockKey} (local cache empty)`
            : `Handwriting unavailable — key ${blockKey} (reference kept)`}
        </div>
      ) : null}
    </div>
  );
}
