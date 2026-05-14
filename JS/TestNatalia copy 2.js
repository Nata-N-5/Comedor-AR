import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.querySelector('#ar-container');
const startButton = document.querySelector('#start-ar');
const stopButton = document.querySelector('#stop-ar');
const changeButton = document.querySelector('#btn-change');
const statusText = document.querySelector('#status-text');
const scanEffect = document.querySelector('#scan-effect');

const uiLoading = document.querySelector('#ui-loading');
const uiCamera = document.querySelector('#ui-camera');
const uiScanning = document.querySelector('#ui-scanning');
const uiDetected = document.querySelector('#ui-detected');

const eatSound = new Audio('../Assets/eat.mp3');
const gltfLoader = new GLTFLoader();

const targetConfigs = [
  {
    targetIndex: 0,
    title: 'ZANAHORIA',
    statusLabel: 'zanahoria',
    skeletonPath: '../Assets/carrotw.glb',
    models: [
      '../Assets/carrot2.glb',
      '../Assets/carrot3.glb',
      '../Assets/carrot4.glb',
      '../Assets/carrot5.glb'
    ],
    stats: [
      { label: 'Vitamina A', value: 80 },
      { label: 'Fibra', value: 60 },
      { label: 'Agua', value: 88 }
    ]
  },
  {
    targetIndex: 1,
    title: 'PAPA',
    statusLabel: 'papa',
    skeletonPath: '../Assets/papa2.glb',
    models: [
      '../Assets/papa2.glb'
    ],
    stats: [
      { label: 'Potasio', value: 76 },
      { label: 'Energia', value: 72 },
      { label: 'Agua', value: 79 }
    ]
  }
];

let started = false;
let mindarThree;
let renderer;
let scene;
let camera;
let sceneReady = false;
let activeTargetState = null;
let targetStates = [];

uiLoading.style.display = 'block';
uiCamera.style.display = 'none';
uiScanning.style.display = 'none';
uiDetected.style.display = 'none';
changeButton.style.display = 'none';

const updateStatus = (message) => {
  statusText.textContent = message;
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
  loadTimeout: null,
  modelIndex: 0,
  isLoadingModel: false,
  isVisible: false
});

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
  ctx.font = 'bold 32px Arial';
  ctx.fillText(config.title, 20, 40);

  ctx.strokeStyle = 'rgba(0,229,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 60);
  ctx.lineTo(490, 60);
  ctx.stroke();

  const drawBar = (label, value, max, y) => {
    const percent = Math.round((value / max) * 100);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.fillText(label, 20, y);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(200, y - 15, 250, 10);

    const gradient = ctx.createLinearGradient(200, 0, 450, 0);
    gradient.addColorStop(0, '#00e5ff');
    gradient.addColorStop(1, '#7b61ff');

    ctx.fillStyle = gradient;
    ctx.fillRect(200, y - 15, (value / max) * 250, 10);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(percent + '%', 460, y);
  };

  config.stats.forEach((stat, index) => {
    drawBar(stat.label, stat.value, 100, 100 + index * 40);
  });

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true
  });
  const geometry = new THREE.PlaneGeometry(1.6, 0.8);
  const panel = new THREE.Mesh(geometry, material);

  panel.position.set(0, 1.2, 0);
  return panel;
};

const createParticles = (state, position) => {
  const particles = [];

  for (let i = 0; i < 10; i++) {
    const geometry = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const material = new THREE.MeshStandardMaterial({ color: 0xffa500 });
    const cube = new THREE.Mesh(geometry, material);

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
      particle.userData.velocity.y -= 0.002;
      particle.scale.multiplyScalar(0.95);

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

const pulseSkeleton = (state) => {
  const start = performance.now();

  const animate = (time) => {
    if (!state.skeletonModel) return;

    const t = (time - start) * 0.005;
    const scale = 1 + Math.sin(t) * 0.05;
    state.skeletonModel.scale.set(scale, scale, scale);
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

  if (!state.isVisible) {
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
        opacity: 0.9
      });
    }
  });

  state.skeletonModel.scale.set(1, 1, 1);
  state.skeletonModel.position.set(0, 0, 0);
  state.anchor.group.add(state.skeletonModel);
  pulseSkeleton(state);
};

const fadeOutSkeleton = (state, duration = 500) => {
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
  changeButton.disabled = true;

  if (state.currentModel) {
    createParticles(state, state.currentModel.position.clone());
    state.anchor.group.remove(state.currentModel);
    state.currentModel = null;
  }

  try {
    const model = await loadGltf(path);

    if (!state.isVisible) {
      return;
    }

    state.currentModel = model;
    state.currentModel.scale.set(1, 1, 1);
    state.currentModel.position.set(0, 0, 0);
    state.currentModel.rotation.set(0, 0, 0);
    state.anchor.group.add(state.currentModel);
  } catch (error) {
    console.error('Error al cargar el modelo:', error);
    updateStatus('No se pudo cargar el modelo de ' + state.config.statusLabel + '.');
  } finally {
    state.isLoadingModel = false;
    if (activeTargetState === state && state.currentModel) {
      changeButton.disabled = false;
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
    state.anchor.group.remove(state.currentModel);
    state.currentModel = null;
  }

  if (state.infoPanel) {
    state.anchor.group.remove(state.infoPanel);
    state.infoPanel = null;
  }

  state.modelIndex = 0;
  state.isLoadingModel = false;
};

const showTargetUi = (state) => {
  activeTargetState = state;
  uiScanning.style.display = 'none';
  uiDetected.style.display = 'block';
  uiDetected.textContent = 'Target detectado: ' + state.config.title;
  changeButton.style.display = 'block';
  changeButton.disabled = true;
};

const hideTargetUi = (state) => {
  if (activeTargetState !== state) return;

  const visibleState = targetStates.find((targetState) => targetState.isVisible && targetState !== state);
  activeTargetState = visibleState || null;

  if (activeTargetState) {
    showTargetUi(activeTargetState);
    return;
  }

  uiDetected.style.display = 'none';
  uiScanning.style.display = started ? 'block' : 'none';
  changeButton.style.display = 'none';
  scanEffect.style.display = 'none';
};

const setupTarget = (state) => {
  state.anchor.onTargetFound = () => {
    state.isVisible = true;
    showTargetUi(state);
    updateStatus('Target de ' + state.config.statusLabel + ' detectado.');

    if (!state.infoPanel) {
      state.infoPanel = createInfoPanel(state.config);
      state.anchor.group.add(state.infoPanel);
    }

    scanEffect.style.display = 'block';

    if (state.loadTimeout || state.currentModel || state.skeletonModel) return;

    loadSkeleton(state).catch((error) => {
      console.error('Error al cargar skeleton:', error);
      updateStatus('No se pudo cargar el placeholder de ' + state.config.statusLabel + '.');
    });

    state.loadTimeout = setTimeout(() => {
      fadeOutSkeleton(state, 600);

      setTimeout(() => {
        loadModel(state, state.config.models[0]);
        if (activeTargetState === state) {
          scanEffect.style.display = 'none';
        }
      }, 600);

      state.loadTimeout = null;
    }, 3000);
  };

  state.anchor.onTargetLost = () => {
    state.isVisible = false;
    clearTargetModels(state);
    hideTargetUi(state);
    updateStatus('Buscando imagen objetivo...');
  };
};

const setupScene = () => {
  if (sceneReady) {
    return;
  }

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
  if (!started || !mindarThree) {
    return;
  }

  renderer.setAnimationLoop(null);
  mindarThree.stop();
  started = false;
  startButton.disabled = false;
  stopButton.disabled = true;

  targetStates.forEach((state) => {
    state.isVisible = false;
    clearTargetModels(state);
  });
  activeTargetState = null;

  scanEffect.style.display = 'none';
  uiScanning.style.display = 'none';
  uiDetected.style.display = 'none';
  uiCamera.style.display = 'none';
  uiLoading.style.display = 'block';
  changeButton.style.display = 'none';

  updateStatus('Camara detenida.');
};

const startAR = async () => {
  if (started) {
    return;
  }

  startButton.disabled = true;
  stopButton.disabled = true;
  updateStatus('Solicitando acceso a la camara...');
  uiLoading.style.display = 'none';
  uiCamera.style.display = 'block';

  try {
    if (!mindarThree) {
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: '../Assets/Targets/targetsZ2.mind',
        uiScanning: false,
        uiLoading: false,
        maxTrack: targetConfigs.length,
        filterMinCF: 0.0001,
        filterBeta: 0.01
      });

      ({ renderer, scene, camera } = mindarThree);
      setupScene();
    }

    await mindarThree.start();
    uiCamera.style.display = 'none';
    uiScanning.style.display = 'block';
    updateStatus('Buscando imagen objetivo...');
    started = true;
    stopButton.disabled = false;

    renderer.setAnimationLoop(() => {
      if (!started) return;

      targetStates.forEach((state) => {
        if (state.infoPanel) {
          state.infoPanel.lookAt(camera.position);
        }
      });

      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error(error);
    updateStatus('No se pudo iniciar. Usa localhost y acepta permisos de camara.');
    startButton.disabled = false;
    stopButton.disabled = true;
  }
};

startButton.addEventListener('click', () => {
  startAR();
});

stopButton.addEventListener('click', () => {
  stopAR();
});

changeButton.addEventListener('click', () => {
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
    loadModel(state, state.config.models[state.modelIndex]);
    return;
  }

  if (state.currentModel) {
    state.anchor.group.remove(state.currentModel);
    state.currentModel = null;
  }
});

stopButton.disabled = true;
