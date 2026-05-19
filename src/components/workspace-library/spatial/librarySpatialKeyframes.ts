/** GPU-friendly ambient motion for the library spatial OS layer. */
export const SPATIAL_LIBRARY_KEYFRAMES = `
  @keyframes libFadeUp {
    from { opacity: 0; transform: translateY(14px); filter: blur(3px); }
    to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
  }
  @keyframes libFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes libDrift {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    50%      { transform: translate3d(14px,-10px,0) scale(1.02); }
  }
  @keyframes libDriftSlow {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    50%      { transform: translate3d(-12px,8px,0) scale(1.02); }
  }
  @keyframes libDriftCW {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    25%      { transform: translate3d(14px,8px,0) scale(1.02); }
    75%      { transform: translate3d(-10px,-6px,0) scale(0.98); }
  }
  @keyframes libScan {
    from    { transform: translateX(-100%); opacity: 0; }
    20%,80% { opacity: 0.38; }
    to      { transform: translateX(200%);  opacity: 0; }
  }
  @keyframes libBreath {
    0%,100% { opacity: 0.28; transform: scale(1); }
    50%      { opacity: 0.48; transform: scale(1.03); }
  }
  @keyframes libBreath2 {
    0%,100% { opacity: 0.18; transform: scale(1); }
    50%      { opacity: 0.36; transform: scale(1.02); }
  }
  @keyframes libMonumentBreath {
    0%,100% { opacity: 0.88; transform: scale(1) translate3d(0, 0, 0); }
    50%      { opacity: 1; transform: scale(1.03) translate3d(0, -8px, 0); }
  }
  @keyframes libOrbit {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes libOrbitRev {
    from { transform: rotate(360deg); }
    to   { transform: rotate(0deg); }
  }
  @keyframes libFloat1 {
    0%,100% { transform: translateY(0px) translateX(0px); }
    40%      { transform: translateY(-7px) translateX(2px); }
    70%      { transform: translateY(-4px) translateX(-1px); }
  }
  @keyframes libFloat2 {
    0%,100% { transform: translateY(0px) translateX(0px); }
    35%      { transform: translateY(-9px) translateX(-3px); }
    65%      { transform: translateY(-5px) translateX(2px); }
  }
  @keyframes libFloat3 {
    0%,100% { transform: translateY(0px) translateX(0px); }
    45%      { transform: translateY(-6px) translateX(4px); }
    75%      { transform: translateY(-3px) translateX(-2px); }
  }
  @keyframes libAvatarFloat {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-5px); }
  }
  @keyframes libPulse {
    0%,100% { opacity: 1; box-shadow: 0 0 8px var(--sa, #6366f1); }
    50%      { opacity: 0.5; box-shadow: 0 0 4px var(--sa, #6366f1); }
  }
  @keyframes libGlassShimmer {
    0%,100% { opacity: 0.55; transform: translateX(-32px) skewX(-18deg); }
    50%      { opacity: 0.80; }
    100%     { opacity: 0.55; transform: translateX(calc(100% + 32px)) skewX(-18deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
`;
