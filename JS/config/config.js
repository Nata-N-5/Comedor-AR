export const ICONS = {
  cameraOn: '../Assets/svg/camera-ON.svg',
  cameraOff: '../Assets/svg/camera-OFF.svg',
  badgeQr: '../Assets/svg/qr.svg',
  badgeFood: '../Assets/svg/food-hot.svg',
};

export const STATUS_MESSAGES = {
  requestingCamera: 'Solicitando acceso a la cámara... Por favor permite el acceso a la cámara',
  scanning: 'Buscando imagen objetivo...',
  paused: 'Cámara en pausa. Toca el botón para reanudar la experiencia AR.',
  startError: 'No se pudo iniciar. Usa localhost y acepta permisos de cámara.',
  targetDetected: (label) => `Target de ${label} detectado.`,
  skeletonLoadError: (label) => `No se pudo cargar el placeholder de ${label}.`,
  modelLoadError: (label) => `No se pudo cargar el modelo de ${label}.`,
};

export const TIMING = {
  skeletonHoldMs: 3000,
  skeletonFadeMs: 600,
  particleDecay: 0.95,
  particleGravity: 0.002,
};

export const TARGET_DIAMETER_M = 0.175;
export const DEFAULT_MODEL_SCALE = 1;
export const DEFAULT_MODEL_ROTATION = { x: Math.PI / 2, y: 0, z: 0 };
export const DEFAULT_SKELETON_ROTATION = { x: 90, y: 0, z: 0 };
export const IDENTITY_ROTATION = { x: 0, y: 0, z: 0 };