import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  ICONS,
  STATUS_MESSAGES,
  TIMING,
  TARGET_DIAMETER_M,
  DEFAULT_MODEL_ROTATION,
  DEFAULT_SKELETON_ROTATION,
  DEFAULT_MODEL_SCALE,
  IDENTITY_ROTATION,
} from './config/config.js';

import { targetConfigs } from './config/targetInfo.js';

const dom = {
  container: document.querySelector('#ar-container'),
  startButton: document.querySelector('#start-ar'),
  changeButton: document.querySelector('#btn-change'),
  statusText: document.querySelector('#status-text'),
  scanEffect: document.querySelector('#scan-effect'),
  scannerBadgeIcon: document.querySelector('.scanner-badge img'),
  uiLoading: document.querySelector('#ui-loading'),
  uiCamera: document.querySelector('#ui-camera'),
  uiScanning: document.querySelector('#ui-scanning'),
  uiDetected: document.querySelector('#ui-detected'),
};

dom.cameraLabel = dom.startButton.querySelector('.camera-label');
dom.cameraIcon = dom.startButton.querySelector('.camera-icon');
dom.loadingTitle = dom.uiLoading.querySelector('h1');
dom.changeButtonLabel = dom.changeButton.querySelector('span');

const eatSound = new Audio('../Assets/eat.mp3');
const gltfLoader = new GLTFLoader();

const smokeTexture = new THREE.TextureLoader().load('../Assets/img/Smoke.png');
smokeTexture.colorSpace = THREE.SRGBColorSpace;

const burstParticleGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const burstParticleMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500 });


let started = false;
let mindarThree;
let renderer;
let scene;
let camera;
let sceneReady = false;
let activeTargetState = null;
let targetStates = [];
let isTransitioning = false;

dom.uiLoading.style.display = 'block';
dom.uiCamera.style.display = 'none';
dom.uiScanning.style.display = 'none';
dom.uiDetected.style.display = 'none';
dom.changeButton.style.display = 'none';


const updateStatus = (message) => {
  dom.statusText.textContent = message;
};

const updateChangeButtonLabel = (state) => {
  dom.changeButtonLabel.textContent = state && state.modelIndex === -1 ? 'REINICIAR' : 'COMER';
};

const setControlState = (state) => {
  dom.startButton.dataset.state = state;

  if (state === 'starting') {
    dom.startButton.disabled = true;
    dom.cameraLabel.textContent = 'Iniciando cámara AR';
    dom.cameraIcon.src = ICONS.cameraOn;
    dom.scannerBadgeIcon.src = ICONS.badgeFood;
    dom.scannerBadgeIcon.classList.remove('is-qr');
    dom.scannerBadgeIcon.classList.add('is-food');
    dom.loadingTitle.textContent = 'Cargando';
    document.body.classList.add('ar-starting');
    document.body.classList.remove('ar-active', 'ar-paused');
    return;
  }

  dom.startButton.disabled = false;

  if (state === 'active') {
    dom.cameraLabel.textContent = 'Pausar cámara AR';
    dom.cameraIcon.src = ICONS.cameraOff;
    document.body.classList.add('ar-active');
    document.body.classList.remove('ar-paused', 'ar-starting');
    return;
  }

  if (state === 'paused') {
    dom.cameraLabel.textContent = 'Reanudar cámara AR';
    dom.cameraIcon.src = ICONS.cameraOn;
    dom.scannerBadgeIcon.src = ICONS.badgeQr;
    dom.scannerBadgeIcon.classList.remove('is-food');
    dom.scannerBadgeIcon.classList.add('is-qr');
    document.body.classList.remove('ar-active');
    document.body.classList.add('ar-paused');
    document.body.classList.remove('ar-starting');
    dom.loadingTitle.textContent = 'Listo para comenzar';
    return;
  }

  dom.cameraLabel.textContent = 'Iniciar cámara AR';
  dom.cameraIcon.src = ICONS.cameraOn;
  dom.scannerBadgeIcon.src = ICONS.badgeQr;
  dom.scannerBadgeIcon.classList.remove('is-food');
  dom.scannerBadgeIcon.classList.add('is-qr');
  document.body.classList.remove('ar-active', 'ar-paused', 'ar-starting');
  dom.loadingTitle.textContent = 'Listo para comenzar';
};

const loadGltf = (path) => {
  return new Promise((resolve, reject) => {
    gltfLoader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
  });
};

const createTargetState = (config) => ({
  config,
  anchor: mindarThree.addAnchor(config.targetIndex),
  currentModel: null,
  skeletonModel: null,
  infoPanel: null,
  steamGroup: null,
  steamParticles: [],
  loadTimeout: null,
  modelIndex: 0,
  isLoadingModel: false,
  isSkeletonExpired: false,
  isVisible: false,
});

const applyOrientation = (object3d, config, rotationPreset) => {
  const rotation = config.usesIdentityRotation ? IDENTITY_ROTATION : rotationPreset;
  object3d.rotation.set(rotation.x, rotation.y, rotation.z);
};

const applyScale = (object3d, config) => {
  const scale = config.scale ?? DEFAULT_MODEL_SCALE;
  console.log(scale)
  object3d.scale.setScalar(scale);
};

const createInfoPanel = (config) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;

  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(10, 20, 40, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 15;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#00e5ff';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 15;

  ctx.font = '700 34px Rajdhani';
  ctx.fillText(config.title, 20, 40);

  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(0,229,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 60);
  ctx.lineTo(490, 60);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '500 22px Rajdhani';

  config.stats.forEach((stat, index) => {
    ctx.fillText(`${stat.label}: ${stat.value}`, 20, 100 + index * 45);
  });

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const geometry = new THREE.PlaneGeometry(1.6, 0.8);
  const panel = new THREE.Mesh(geometry, material);

  panel.position.set(0, 1.2, 0);
  return panel;
};

const sessionId = crypto.randomUUID();
const callApiEndpoint = (target) => {
  fetch("https://register-interaction-api-psi.vercel.app/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      experiencia: "comedor-ar",
      target: target,
      session: sessionId,
      dispositivo: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop"
    })
  });
};

const createParticles = (state, position) => {
  const particles = [];

  for (let i = 0; i < 10; i++) {
    const cube = new THREE.Mesh(burstParticleGeometry, burstParticleMaterial);

    cube.position.copy(position);
    cube.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      Math.random() * 0.05,
      (Math.random() - 0.5) * 0.05
    );

    state.anchor.group.add(cube);
    particles.push(cube);
  }

  const animateParticles = () => {
    particles.forEach((particle, index) => {
      particle.position.add(particle.userData.velocity);
      particle.userData.velocity.y -= TIMING.particleGravity;
      particle.scale.multiplyScalar(TIMING.particleDecay);

      if (particle.scale.x < 0.01) {
        state.anchor.group.remove(particle);
        particles.splice(index, 1);
      }
    });

    if (particles.length > 0) {
      requestAnimationFrame(animateParticles);
    }
  };

  animateParticles();
};

const resetSteamParticle = (particle, firstRun = false) => {
  const radius = 0.4;
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;

  particle.position.set(
    Math.cos(angle) * distance,
    firstRun ? 0.25 + Math.random() * 0.8 : 0.25,
    Math.sin(angle) * distance
  );
  particle.scale.setScalar(0.16 + Math.random() * 0.08);
  particle.material.opacity = firstRun ? Math.random() * 0.35 : 0;
  particle.material.rotation = Math.random() * Math.PI;
  particle.userData.life = firstRun ? Math.random() : 0;
  particle.userData.speed = 0.004 + Math.random() * 0.004;
  particle.userData.drift = new THREE.Vector3(
    (Math.random() - 0.5) * 0.005,
    0,
    (Math.random() - 0.5) * 0.005
  );
};

const clearSteamEffect = (state) => {
  if (!state.steamGroup) return;

  state.steamParticles.forEach((particle) => {
    particle.material.dispose();
    state.steamGroup.remove(particle);
  });

  state.anchor.group.remove(state.steamGroup);
  state.steamGroup = null;
  state.steamParticles = [];
};

const createSteamEffect = (state) => {
  clearSteamEffect(state);

  const steamGroup = new THREE.Group();
  steamGroup.position.set(0, 0.2, 0);

  const particles = [];

  for (let i = 0; i < 16; i++) {
    const material = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const particle = new THREE.Sprite(material);

    resetSteamParticle(particle, true);
    steamGroup.add(particle);
    particles.push(particle);
  }

  state.steamGroup = steamGroup;
  state.steamParticles = particles;
  state.anchor.group.add(steamGroup);
};

const updateSteamEffect = (state) => {
  if (!state.steamGroup || !state.currentModel || !state.isVisible) return;

  state.steamParticles.forEach((particle) => {
    particle.userData.life += 0.012;
    particle.position.add(particle.userData.drift);
    particle.position.y += particle.userData.speed;
    particle.material.rotation += 0.004;

    const fadeIn = Math.min(particle.userData.life / 0.25, 1);
    const fadeOut = Math.max(1 - particle.userData.life, 0);
    particle.material.opacity = 0.38 * Math.min(fadeIn, fadeOut);
    particle.scale.multiplyScalar(1.006);

    if (particle.userData.life >= 1 || particle.position.y > 1.15) {
      resetSteamParticle(particle);
    }
  });
};

const pulseSkeleton = (state) => {
  const start = performance.now();
  const baseScale = state.skeletonModel.scale.x;

  const animate = (time) => {
    if (!state.skeletonModel) return;

    const t = (time - start) * 0.005;
    const pulseScale = baseScale * (1 + Math.sin(t) * 0.05);
    state.skeletonModel.scale.set(pulseScale, pulseScale, pulseScale);
    state.skeletonModel.rotation.y += 0.01;

    state.skeletonModel.traverse((child) => {
      if (child.isMesh) {
        child.material.opacity = 0.7 + Math.sin(t) * 0.3;
      }
    });

    requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
};

const loadSkeleton = async (state) => {
  const model = await loadGltf(state.config.skeletonPath);

  if (!state.isVisible || state.isSkeletonExpired || state.currentModel) {
    return;
  }

  state.skeletonModel = model;

  state.skeletonModel.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x006fff,
        emissive: 0x006fff,
        emissiveIntensity: 3.5,
        transparent: true,
        opacity: 0.9,
      });
    }
  });

  console.log(state.config.scale)
  applyScale(state.skeletonModel, state.config);
  state.skeletonModel.position.set(0, 0, 0);
  applyOrientation(state.skeletonModel, state.config, DEFAULT_SKELETON_ROTATION);

  state.anchor.group.add(state.skeletonModel);
  pulseSkeleton(state);
};

const fadeOutSkeleton = (state, duration = TIMING.pulseFadeMs) => {
  if (!state.skeletonModel) return;

  const skeleton = state.skeletonModel;
  const startTime = performance.now();

  const fade = (time) => {
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);

    skeleton.traverse((child) => {
      if (child.isMesh) {
        child.material.opacity = 1 - t;
      }
    });

    if (t < 1) {
      requestAnimationFrame(fade);
      return;
    }

    state.anchor.group.remove(skeleton);
    if (state.skeletonModel === skeleton) {
      state.skeletonModel = null;
    }
  };

  requestAnimationFrame(fade);
};

const loadModel = async (state, path) => {
  if (state.isLoadingModel) return;

  state.isLoadingModel = true;
  dom.changeButton.disabled = true;

  if (state.currentModel) {
    createParticles(state, state.currentModel.position.clone());
    clearSteamEffect(state);
    state.anchor.group.remove(state.currentModel);
    state.currentModel = null;
  }

  try {
    const model = await loadGltf(path);

    if (!state.isVisible) {
      return;
    }

    state.currentModel = model;
    applyScale(state.currentModel, state.config);
    state.currentModel.position.set(0, 0, 0);
    applyOrientation(state.currentModel, state.config, DEFAULT_MODEL_ROTATION);

    state.anchor.group.add(state.currentModel);
    createSteamEffect(state);
  } catch (error) {
    console.error('Error al cargar el modelo:', error);
    updateStatus(STATUS_MESSAGES.modelLoadError(state.config.statusLabel));
  } finally {
    state.isLoadingModel = false;
    if (activeTargetState === state && state.currentModel) {
      dom.changeButton.disabled = false;
    }
  }
};

const clearTargetModels = (state) => {
  if (state.loadTimeout) {
    clearTimeout(state.loadTimeout);
    state.loadTimeout = null;
  }

  if (state.skeletonModel) {
    state.anchor.group.remove(state.skeletonModel);
    state.skeletonModel = null;
  }

  if (state.currentModel) {
    clearSteamEffect(state);
    state.anchor.group.remove(state.currentModel);
    state.currentModel = null;
  }

  if (state.infoPanel) {
    state.anchor.group.remove(state.infoPanel);
    state.infoPanel = null;
  }

  state.modelIndex = 0;
  state.isLoadingModel = false;
  state.isSkeletonExpired = false;
  updateChangeButtonLabel(state);
};

const showTargetUi = (state) => {
  activeTargetState = state;
  dom.uiScanning.style.display = 'none';
  dom.uiDetected.style.display = 'block';
  dom.uiDetected.textContent = 'Target detectado: ' + state.config.title;
  dom.changeButton.style.display = 'block';
  dom.changeButton.disabled = true;
  updateChangeButtonLabel(state);
};

const hideTargetUi = (state) => {
  if (activeTargetState !== state) return;

  const visibleState = targetStates.find((targetState) => targetState.isVisible && targetState !== state);
  activeTargetState = visibleState || null;

  if (activeTargetState) {
    showTargetUi(activeTargetState);
    return;
  }

  dom.uiDetected.style.display = 'none';
  dom.uiScanning.style.display = started ? 'block' : 'none';
  dom.changeButton.style.display = 'none';
  dom.scanEffect.style.display = 'none';
};

const handleTargetFound = (state) => {
  if (state.isVisible) return;

  state.isVisible = true;
  showTargetUi(state);
  updateStatus(STATUS_MESSAGES.targetDetected(state.config.statusLabel));

  if (!state.infoPanel) {
    state.infoPanel = createInfoPanel(state.config);
    state.anchor.group.add(state.infoPanel);
  }

  callApiEndpoint(state.config.title);
  dom.scanEffect.style.display = 'block';

  if (state.loadTimeout || state.currentModel || state.skeletonModel) return;

  state.isSkeletonExpired = false;

  loadSkeleton(state).catch((error) => {
    console.error('Error al cargar skeleton:', error);
    updateStatus(STATUS_MESSAGES.skeletonLoadError(state.config.statusLabel));
  });

  state.loadTimeout = setTimeout(() => {
    state.isSkeletonExpired = true;
    fadeOutSkeleton(state, TIMING.skeletonFadeMs);

    setTimeout(() => {
      loadModel(state, state.config.models[0]);
      if (activeTargetState === state) {
        dom.scanEffect.style.display = 'none';
      }
    }, TIMING.skeletonFadeMs);

    state.loadTimeout = null;
  }, TIMING.skeletonHoldMs);
};

const handleTargetLost = (state) => {
  if (!state.isVisible && !state.currentModel && !state.skeletonModel && !state.infoPanel) return;

  state.isVisible = false;
  clearTargetModels(state);
  hideTargetUi(state);
  updateStatus(STATUS_MESSAGES.scanning);
};

const forceTargetLost = (state) => {
  handleTargetLost(state);
  state.anchor.group.visible = false;
};

const setArLayerVisible = (isVisible) => {
  if (!renderer || !renderer.domElement) return;
  renderer.domElement.style.visibility = isVisible ? 'visible' : 'hidden';
};

const clearArFrame = () => {
  if (!renderer) return;
  renderer.clear(true, true, true);
};

const setupTarget = (state) => {
  state.anchor.onTargetFound = () => handleTargetFound(state);
  state.anchor.onTargetLost = () => handleTargetLost(state);
};

const setupScene = () => {
  if (sceneReady) return;

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x7a8ca5, 1.4);
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1, 2, 1.5);
  scene.add(directionalLight);

  targetStates = targetConfigs.map(createTargetState);
  targetStates.forEach(setupTarget);

  sceneReady = true;
};

const stopAR = () => {
  if (!started || !mindarThree || isTransitioning) return;

  isTransitioning = true;
  dom.startButton.disabled = true;

  targetStates.forEach(forceTargetLost);
  activeTargetState = null;
  clearArFrame();
  setArLayerVisible(false);

  renderer.setAnimationLoop(null);
  mindarThree.stop();
  started = false;

  dom.scanEffect.style.display = 'none';
  dom.uiScanning.style.display = 'none';
  dom.uiDetected.style.display = 'none';
  dom.uiCamera.style.display = 'none';
  dom.uiLoading.style.display = 'block';
  dom.changeButton.style.display = 'none';

  updateStatus(STATUS_MESSAGES.paused);
  setControlState('paused');
  isTransitioning = false;
};

const startAR = async () => {
  if (started || isTransitioning) return;

  isTransitioning = true;
  setControlState('starting');
  updateStatus(STATUS_MESSAGES.requestingCamera);
  dom.uiLoading.style.display = 'grid';
  dom.uiCamera.style.display = 'none';

  try {
    if (!mindarThree) {
      mindarThree = new MindARThree({
        container: dom.container,
        imageTargetSrc: '../Assets/Targets/targetsQR.mind',
        uiScanning: false,
        uiLoading: false,
        maxTrack: targetConfigs.length,
        filterMinCF: 0.0001,
        filterBeta: 0.01,
      });

      ({ renderer, scene, camera } = mindarThree);
      setupScene();
    }

    setArLayerVisible(true);
    await mindarThree.start();
    dom.uiLoading.style.display = 'none';
    dom.uiCamera.style.display = 'none';
    dom.uiScanning.style.display = 'block';
    updateStatus(STATUS_MESSAGES.scanning);
    started = true;
    setControlState('active');

    renderer.setAnimationLoop(() => {
      if (!started) return;

      targetStates.forEach((state) => {
        if (state.anchor.group.visible && !state.isVisible) {
          handleTargetFound(state);
        } else if (!state.anchor.group.visible && state.isVisible) {
          handleTargetLost(state);
        }

        if (state.infoPanel) {
          state.infoPanel.lookAt(camera.position);
        }

        updateSteamEffect(state);
      });

      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error(error);
    updateStatus(STATUS_MESSAGES.startError);
    setControlState('idle');
  } finally {
    isTransitioning = false;
  }
};


dom.startButton.addEventListener('click', () => {
  if (started) {
    stopAR();
    return;
  }
  startAR();
});

dom.changeButton.addEventListener('click', () => {
  const state = activeTargetState;

  if (!state || !state.anchor || state.isLoadingModel) return;

  if (state.currentModel) {
    createParticles(state, state.currentModel.position.clone());
  }

  state.modelIndex++;

  if (state.modelIndex >= state.config.models.length) {
    state.modelIndex = -1;
  }

  const isEating = state.modelIndex !== 0;

  if (isEating) {
    eatSound.currentTime = 0;
    eatSound.play();
  }

  if (state.modelIndex !== -1) {
    updateChangeButtonLabel(state);
    loadModel(state, state.config.models[state.modelIndex]);
    return;
  }

  if (state.currentModel) {
    clearSteamEffect(state);
    state.anchor.group.remove(state.currentModel);
    state.currentModel = null;
  }

  updateChangeButtonLabel(state);
});

setControlState('idle');