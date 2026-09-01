import type { CSSProperties } from 'react';

type Props = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Official ZIKUK app icon for in-app branding (raster, not recreated). */
export function ZikukLogo({ size = 24, className, style }: Props) {
  const radius = Math.round(size * 0.22);
  return (
    <img
      src="/icon-192.png"
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden
      draggable={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        ...style,
      }}
    />
  );
}
