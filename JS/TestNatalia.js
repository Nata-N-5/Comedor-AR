import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const container = document.querySelector('#ar-container');
const startButton = document.querySelector('#start-ar');
const stopButton = document.querySelector('#stop-ar');
const changeButton = document.querySelector('#btn-change');
const statusText = document.querySelector('#status-text');

const uiLoading = document.querySelector("#ui-loading");
const uiCamera = document.querySelector("#ui-camera");
const uiScanning = document.querySelector("#ui-scanning");
const uiDetected = document.querySelector("#ui-detected");

const eatSound = new Audio('../Assets/eat.mp3');
const skeletonModelPath = '../Assets/carrotw.glb';
let loadTimeout = null;

uiLoading.style.display = "block";
uiCamera.style.display = "none";
uiScanning.style.display = "none";
uiDetected.style.display = "none";
changeButton.style.display = "none";

let started = false;
let mindarThree;
let renderer;
let scene;
let camera;
let sceneReady = false;
let currentModel = null;
let gltfLoader = new GLTFLoader();
let anchor; // 👈 IMPORTANTE
let isLoadingModel = false;
let infoPanel = null;

const scanEffect = document.querySelector("#scan-effect");


const updateStatus = (message) => {
  statusText.textContent = message;
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

  anchor = mindarThree.addAnchor(0);


  anchor.onTargetFound = () => {

    if (!infoPanel) {
      infoPanel = createInfoPanel();

      infoPanel.position.set(0, 1.2, 0); // 👈 arriba del modelo
      anchor.group.add(infoPanel);
    }

    scanEffect.style.display = "block";
    uiScanning.style.display = "none";
    uiDetected.style.display = "block";

    changeButton.style.display = "block"; // 👈 aparece
    changeButton.disabled = true; // 🔒 bloquear botón
    // evitar duplicados si ya había uno corriendo
    if (loadTimeout) return;
    // 1️⃣ mostrar modelo placeholder
    loadSkeleton();

    // guardar referencia del timer
    loadTimeout = setTimeout(() => {
      fadeOutSkeleton(600); // 👈 fade de 0.6s

      // cargar modelo un poquito después para que coincida visualmente
      setTimeout(() => {
        loadModel(models[0]);
        scanEffect.style.display = "none";
      }, 600);

      loadTimeout = null;
    }, 3000);
  };

  anchor.onTargetLost = () => {

    if (infoPanel) {
      anchor.group.remove(infoPanel);
      infoPanel = null;
    }

    uiDetected.style.display = "none";
    uiScanning.style.display = "block";
    changeButton.style.display = "none";

    // ❌ cancelar timer
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      loadTimeout = null;
    }

    // ❌ eliminar skeleton
    if (skeletonModel) {
      anchor.group.remove(skeletonModel);
      skeletonModel = null;
    }

    // ❌ eliminar modelo actual
    if (currentModel) {
      anchor.group.remove(currentModel);
      currentModel = null;
    }

    // 🔥 RESET IMPORTANTE
    modelIndex = 0; // 👈 vuelve al inicio
  };

  sceneReady = true;
};


let skeletonModel = null;

const loadSkeleton = () => {

  return new Promise((resolve, reject) => {
    gltfLoader.load(skeletonModelPath, (gltf) => {
      skeletonModel = gltf.scene;

      skeletonModel.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x006FFF,
            emissive: 0x006FFF,
            emissiveIntensity: 3.5,
            transparent: true,
            opacity: 0.9
          });
          child.material.opacity = 1;        // 👈 empieza visible
        }
      });
      pulseSkeleton();
      // posición y escala inicial
      skeletonModel.scale.set(1, 1, 1);
      skeletonModel.position.set(0, 0, 0);


      // agregamos al anchor
      anchor.group.add(skeletonModel);

      resolve(); // ya cargó
    }, undefined, (error) => {
      console.error('Error al cargar skeleton:', error);
      reject(error);
    });
  });
};
///PULSACIONES//
const pulseSkeleton = () => {
  if (!skeletonModel) return;

  let start = performance.now();

  const animate = (time) => {
    if (!skeletonModel) return; // 💀 evita bugs si se elimina

    const t = (time - start) * 0.005;

    // 🔹 pulso de escala
    const scale = 1 + Math.sin(t) * 0.05;
    skeletonModel.scale.set(scale, scale, scale);

    // 🔹 pulso de opacidad (opcional)
    skeletonModel.traverse((child) => {
      if (child.isMesh) {
        child.material.opacity = 0.7 + Math.sin(t) * 0.3;
      }
    });
    // 🔄 ROTACIÓN SUAVE
    skeletonModel.rotation.y += 0.01; // horizontal
    //skeletonModel.rotation.x -= 0.002; // opcional leve inclinación
    requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
};
///FADE OUT SKELETON//
const fadeOutSkeleton = (duration = 500) => {
  if (!skeletonModel) return;

  let startTime = performance.now();

  const fade = (time) => {
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);

    skeletonModel.traverse((child) => {
      if (child.isMesh) {
        child.material.opacity = 1 - t;
      }
    });

    if (t < 1) {
      requestAnimationFrame(fade);
    } else {
      // cuando termina, lo quitamos de la escena
      anchor.group.remove(skeletonModel);
      skeletonModel = null;
    }
  };

  requestAnimationFrame(fade);
};

///BORONAS//
const createParticles = (position) => {
  const particles = [];

  for (let i = 0; i < 10; i++) {
    const geometry = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const material = new THREE.MeshStandardMaterial({ color: 0xffa500 });

    const cube = new THREE.Mesh(geometry, material);

    // posición inicial (centro del modelo)
    cube.position.copy(position);

    // dirección aleatoria
    cube.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.05,
      Math.random() * 0.05,
      (Math.random() - 0.5) * 0.05
    );

    anchor.group.add(cube);
    particles.push(cube);
  }

  // animación
  const animateParticles = () => {
    particles.forEach((p, index) => {
      p.position.add(p.userData.velocity);

      // gravedad
      p.userData.velocity.y -= 0.002;

      // desaparecer poco a poco
      p.scale.multiplyScalar(0.95);

      if (p.scale.x < 0.01) {
        anchor.group.remove(p);
        particles.splice(index, 1);
      }
    });

    if (particles.length > 0) {
      requestAnimationFrame(animateParticles);
    }
  };

  animateParticles();
};

const createInfoPanel = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");

  // 🔲 fondo glassmorphism
  ctx.fillStyle = "rgba(10, 20, 40, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ✨ borde glow
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#00e5ff";
  ctx.shadowBlur = 15;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.shadowBlur = 0;

  // 🟦 título
  ctx.fillStyle = "#00e5ff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("ZANAHORIA", 20, 40);

  // 🔹 líneas separadoras
  ctx.strokeStyle = "rgba(0,229,255,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 60);
  ctx.lineTo(490, 60);
  ctx.stroke();

  const drawBar = (label, value, max, y) => {
    const percent = Math.round((value / max) * 100);

    // 🔤 texto label
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.fillText(label, 20, y);

    // 🔲 fondo barra
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(200, y - 15, 250, 10);

    // 🟦 barra progreso
    const width = (value / max) * 250;

    const gradient = ctx.createLinearGradient(200, 0, 450, 0);
    gradient.addColorStop(0, "#00e5ff");
    gradient.addColorStop(1, "#7b61ff");

    ctx.fillStyle = gradient;
    ctx.fillRect(200, y - 15, width, 10);

    // 🔢 porcentaje (esto es lo nuevo 🔥)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.fillText(percent + "%", 460, y); // 👉 a la derecha
  };

  // 📊 datos
  drawBar("Vitamina A", 80, 100, 100);
  drawBar("Fibra", 60, 100, 140);
  drawBar("Agua", 88, 100, 180);

  const texture = new THREE.CanvasTexture(canvas);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true
  });

  const geometry = new THREE.PlaneGeometry(1.6, 0.8);
  const panel = new THREE.Mesh(geometry, material);

  return panel;
};


//CARGAR EL MODELAZOO///
const loadModel = (path) => {
  if (isLoadingModel) return; // 🚫 bloquear spam

  isLoadingModel = true;


  // 🧹 eliminar modelo anterior
  if (currentModel) {
    // generar migajas
    const pos = currentModel.position.clone();
    createParticles(pos);
    anchor.group.remove(currentModel);
    currentModel = null;
  }


  gltfLoader.load(path, (gltf) => {
    currentModel = gltf.scene;

    currentModel.scale.set(1, 1, 1);
    currentModel.position.set(0, 0, 0);
    currentModel.rotation.set(0, 0, 0);

    anchor.group.add(currentModel);
    isLoadingModel = false;
    changeButton.disabled = false; // 🔓 ya puede interactuar

  }, undefined, (error) => {
    console.error('Error al cargar el modelo:', error);
    isLoadingModel = false;
  });
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

  // resetear UI
  uiScanning.style.display = "none";
  uiDetected.style.display = "none";
  uiCamera.style.display = "none";
  uiLoading.style.display = "block";

  updateStatus('Camara detenida.');
};

const startAR = async () => {
  if (started) {
    return;
  }

  startButton.disabled = true;
  stopButton.disabled = true;
  updateStatus('Solicitando acceso a la camara...');
  uiLoading.style.display = "none";
  uiCamera.style.display = "block";

  try {
    if (!mindarThree) {
      mindarThree = new MindARThree({
        container,
        imageTargetSrc: '../Assets/Targets/targetsZ.mind',
        uiScanning: false,
        uiLoading: false,
        maxTrack: 1,
        filterMinCF: 0.0001,
        filterBeta: 0.01,
      });

      ({ renderer, scene, camera } = mindarThree);
      setupScene();
    }

    await mindarThree.start();
    uiCamera.style.display = "none";
    uiScanning.style.display = "block";
    updateStatus('Buscando imagen objetivo...');
    started = true;
    stopButton.disabled = false;
    //updateStatus('Camara activa. Apunta al target para ver el objeto.');

    renderer.setAnimationLoop(() => {
      if (!started) return;

      if (infoPanel) {
        infoPanel.lookAt(camera.position);
      }

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

stopButton.disabled = true;

////CAMBIAR LA ZANAHORIA//
let modelIndex = 0;

const models = [
  '../Assets/carrot2.glb',
  '../Assets/carrot3.glb',
  '../Assets/carrot4.glb',
  '../Assets/carrot5.glb'
];


changeButton.addEventListener('click', () => {
  if (!anchor || isLoadingModel) return; // 🚫 bloquear aquí también
  //changeButton.disabled = true;
  if (!anchor) return;

  // 💥 generar partículas antes de cambiar
  if (currentModel) {
    createParticles(currentModel.position.clone());
  }

  modelIndex++;

  // 👉 si aún hay modelos
  /*if (modelIndex < models.length) {
    loadModel(models[modelIndex]);
  } 
  // 👉 si ya no hay → desaparecer todo
  else {
    if (currentModel) {
      anchor.group.remove(currentModel);
      currentModel = null;
    }
  }*/

  // 🔁 reset si se pasa del límite
  if (modelIndex >= models.length) {
    modelIndex = -1;
  }
  const isEating = modelIndex !== 0;

  if (isEating) {
    eatSound.currentTime = 0;
    eatSound.play();
  }
  // 👉 si hay modelo válido
  if (modelIndex !== -1) {
    loadModel(models[modelIndex]);
  }
  // 👉 si es -1 → desaparecer
  else {
    if (currentModel) {
      anchor.group.remove(currentModel);
      currentModel = null;
    }
  }

});