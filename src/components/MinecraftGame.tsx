import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  WOOD = 4,
}

const BLOCK_COLORS = {
  [BlockType.GRASS]: 0x4caf50,
  [BlockType.DIRT]: 0x8d6e63,
  [BlockType.STONE]: 0x607d8b,
  [BlockType.WOOD]: 0xa0522d,
};

interface Block {
  type: BlockType;
  position: THREE.Vector3;
}

const MinecraftGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const worldRef = useRef<Map<string, Block>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster>();
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const blocksGroupRef = useRef<THREE.Group>();

  const [currentBlockType, setCurrentBlockType] = useState<BlockType>(
    BlockType.GRASS
  );
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 10, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 25);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);

    raycasterRef.current = new THREE.Raycaster();

    const blocksGroup = new THREE.Group();
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    generateTerrain();
  }, []);

  const createBlockMesh = useCallback((blockType: BlockType): THREE.Mesh => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: BLOCK_COLORS[blockType] });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }, []);

  const generateTerrain = useCallback(() => {
    if (!blocksGroupRef.current) return;

    worldRef.current.clear();
    blocksGroupRef.current.clear();

    for (let x = -20; x <= 20; x++) {
      for (let z = -20; z <= 20; z++) {
        const height =
          Math.floor(Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3) + 2;

        for (let y = 0; y <= height; y++) {
          let blockType: BlockType;
          if (y === height && height > 1) {
            blockType = BlockType.GRASS;
          } else if (y >= height - 2 && height > 1) {
            blockType = BlockType.DIRT;
          } else {
            blockType = BlockType.STONE;
          }

          const position = new THREE.Vector3(x, y, z);
          const block: Block = { type: blockType, position };
          const key = `${x},${y},${z}`;
          worldRef.current.set(key, block);

          const mesh = createBlockMesh(blockType);
          mesh.position.copy(position);
          blocksGroupRef.current.add(mesh);
        }
      }
    }
  }, [createBlockMesh]);

  const removeBlockMesh = useCallback((position: THREE.Vector3) => {
    const key = `${position.x},${position.y},${position.z}`;
    const block = worldRef.current.get(key);
    if (block && blocksGroupRef.current) {
      const meshToRemove = blocksGroupRef.current.children.find(
        (child) => child.position.equals(position)
      );
      if (meshToRemove) {
        blocksGroupRef.current.remove(meshToRemove);
        if (meshToRemove instanceof THREE.Mesh) {
          meshToRemove.geometry.dispose();
          if (meshToRemove.material instanceof THREE.Material) {
            meshToRemove.material.dispose();
          }
        }
      }
      worldRef.current.delete(key);
    }
  }, []);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isPointerLocked || !cameraRef.current) return;

      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      mouseRef.current.x -= movementX * 0.002;
      mouseRef.current.y -= movementY * 0.002;
      mouseRef.current.y = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, mouseRef.current.y)
      );

      cameraRef.current.rotation.order = 'YXZ';
      cameraRef.current.rotation.y = mouseRef.current.x;
      cameraRef.current.rotation.x = mouseRef.current.y;
    },
    [isPointerLocked]
  );

  const handleClick = useCallback((event: MouseEvent) => {
      if (!isPointerLocked || !raycasterRef.current || !cameraRef.current || !blocksGroupRef.current) return;

    const mouse = new THREE.Vector2(0, 0);

    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(blocksGroupRef.current.children);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const point = intersect.point;
      const normal = intersect.face?.normal;

      if (normal) {
        if (event.button === 0) {
          const blockPosition = intersect.object.position.clone();
          removeBlockMesh(blockPosition);
        } else if (event.button === 2) {
          const newPosition = new THREE.Vector3()
            .copy(point)
            .add(normal)
            .floor()
            .addScalar(0.5);

          const key = `${newPosition.x},${newPosition.y},${newPosition.z}`;
          if (!worldRef.current.has(key)) {
            const block: Block = { type: currentBlockType, position: newPosition };
            worldRef.current.set(key, block);

            const mesh = createBlockMesh(currentBlockType);
            mesh.position.copy(newPosition);
            blocksGroupRef.current.add(mesh);
          }
        }
      }
    }
  }, [isPointerLocked, currentBlockType, removeBlockMesh, createBlockMesh]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    keysRef.current[event.code] = true;

    if (keysRef.current['Digit1']) setCurrentBlockType(BlockType.GRASS);
    if (keysRef.current['Digit2']) setCurrentBlockType(BlockType.DIRT);
    if (keysRef.current['Digit3']) setCurrentBlockType(BlockType.STONE);
    if (keysRef.current['Digit4']) setCurrentBlockType(BlockType.WOOD);
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keysRef.current[event.code] = false;
  }, []);

  const updatePlayerMovement = useCallback(() => {
    if (!cameraRef.current) return;

    const camera = cameraRef.current;
    const speed = 0.1;
    const direction = new THREE.Vector3();

    if (keysRef.current['KeyW']) {
      camera.getWorldDirection(direction);
      camera.position.add(direction.multiplyScalar(speed));
    }
    if (keysRef.current['KeyS']) {
      camera.getWorldDirection(direction);
      camera.position.add(direction.multiplyScalar(-speed));
    }
    if (keysRef.current['KeyA']) {
      camera.getWorldDirection(direction);
      direction.cross(camera.up);
      camera.position.add(direction.multiplyScalar(-speed));
    }
    if (keysRef.current['KeyD']) {
      camera.getWorldDirection(direction);
      direction.cross(camera.up);
      camera.position.add(direction.multiplyScalar(speed));
    }
    if (keysRef.current['Space']) {
      camera.position.y += speed;
    }
    if (keysRef.current['ShiftLeft']) {
      camera.position.y -= speed;
    }
  }, []);

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    updatePlayerMovement();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    requestAnimationFrame(animate);
  }, [updatePlayerMovement]);

  const requestPointerLock = useCallback(() => {
    if (mountRef.current) {
      mountRef.current.requestPointerLock();
      setIsPointerLocked(true);
    }
  }, []);

  const handlePointerLockChange = useCallback(() => {
    setIsPointerLocked(document.pointerLockElement === mountRef.current);
  }, []);

  const handleWindowResize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current) return;

    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
  }, []);

  useEffect(() => {
    initScene();
    animate();

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleWindowResize);

    return () => {
      document.removeEventListener(
        'pointerlockchange',
        handlePointerLockChange
      );
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleWindowResize);

      if (
        rendererRef.current &&
        mountRef.current?.contains(rendererRef.current.domElement)
      ) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, [
    initScene,
    animate,
    handlePointerLockChange,
    handleMouseMove,
    handleClick,
    handleKeyDown,
    handleKeyUp,
    handleWindowResize,
  ]);

  const getBlockTypeDisplay = (type: BlockType): string => {
    switch (type) {
      case BlockType.GRASS:
        return '🌱';
      case BlockType.DIRT:
        return '🟫';
      case BlockType.STONE:
        return '🗿';
      case BlockType.WOOD:
        return '🪵';
      default:
        return '';
    }
  };

  return (
    <div className='w-full h-screen relative'>
      <div ref={mountRef} className='w-full h-full' />

      <div className='crosshair' />

      {!isPointerLocked && (
        <div
          className='absolute inset-0 bg-ui-bg flex items-center justify-center z-50 cursor-pointer'
          onClick={requestPointerLock}
        >
          <div className='text-center pixel-font text-white'>
            <h1 className='text-4xl mb-4'>Simple Minecraft</h1>
            <p className='text-lg mb-2'>Click anywhere to start playing</p>
            <p className='text-sm'>WASD to move, Space/Shift for up/down</p>
            <p className='text-sm'>Left click to break, Right click to place</p>
            <p className='text-sm'>Keys 1-4 to select blocks</p>
          </div>
        </div>
      )}

      {isPointerLocked && (
        <div className='absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2 z-40'>
          {[
            BlockType.GRASS,
            BlockType.DIRT,
            BlockType.STONE,
            BlockType.WOOD,
          ].map((type, index) => (
            <div
              key={type}
              className={`inventory-slot ${
                type === currentBlockType ? 'selected' : ''
              }`}
            >
              <span className='text-2xl'>{getBlockTypeDisplay(type)}</span>
              <span className='absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-white pixel-font'>
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MinecraftGame;
