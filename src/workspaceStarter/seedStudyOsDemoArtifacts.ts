import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { saveImageBlob } from '../lib/freeSpaceImageIdb';

/** Placeholder screenshot blob so the demo image card renders without user upload. */
export async function seedStudyOsDemoArtifacts(
  sectionId: string,
  objects: ProjectSpaceObject[],
): Promise<void> {
  const imageObj = objects.find(o => o.type === 'image');
  if (!imageObj || !sectionId) return;

  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, '#1a1510');
  g.addColorStop(0.5, '#2a2218');
  g.addColorStop(1, '#0f0d0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText('Sample screenshot', 40, 56);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Diagrams & slides live beside your notes', 40, 88);
  ctx.fillText('Drop or paste (⌘V) to add your own', 40, 112);

  ctx.beginPath();
  ctx.moveTo(60, 200);
  ctx.lineTo(180, 140);
  ctx.lineTo(300, 220);
  ctx.lineTo(420, 160);
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), 'image/png', 0.92);
  });
  if (!blob) return;
  await saveImageBlob(sectionId, imageObj.id, blob);
}
