import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

// Block types
export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  WOOD = 4,
}

// Block colors mapping
const BLOCK_COLORS = {
  [BlockType.GRASS]: 0x4CAF50,
  [BlockType.DIRT]: 0x8D6E63,
  [BlockType.STONE]: 0x607D8B, 
  [BlockType.WOOD]: 0xA0522D,
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
  
  const [currentBlockType, setCurrentBlockType] = useState<BlockType>(BlockType.GRASS);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
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

    // Raycaster for block interaction
    raycasterRef.current = new THREE.Raycaster();

    // Group for blocks
    const blocksGroup = new THREE.Group();
    scene.add(blocksGroup);
    blocksGroupRef.current = blocksGroup;

    // Generate initial terrain
    generateTerrain();
  }, []);

  // Generate simple terrain
  const generateTerrain = useCallback(() => {
    if (!worldRef.current || !blocksGroupRef.current) return;

    // Clear existing blocks
    worldRef.current.clear();
    blocksGroupRef.current.clear();

    // Generate a simple flat terrain with some hills
    for (let x = -20; x <= 20; x++) {
      for (let z = -20; z <= 20; z++) {
        const height = Math.floor(Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3) + 5;
        
        for (let y = 0; y <= height; y++) {
          let blockType: BlockType;
          if (y === height) {
            blockType = BlockType.GRASS;
          } else if (y >= height - 2) {
            blockType = BlockType.DIRT;
          } else {
            blockType = BlockType.STONE;
          }

          const position = new THREE.Vector3(x, y, z);
          const block: Block = { type: blockType, position };
          const key = `${x},${y},${z}`;
          worldRef.current.set(key, block);
          
          createBlockMesh(block);
        }
      }
    }
  }, []);

  // Create a block mesh
  const createBlockMesh = useCallback((block: Block) => {
    if (!blocksGroupRef.current) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ 
      color: BLOCK_COLORS[block.type] 
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.copy(block.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { block };
    
    blocksGroupRef.current.add(mesh);
  }, []);

  // Remove block mesh
  const removeBlockMesh = useCallback((position: THREE.Vector3) => {
    if (!blocksGroupRef.current) return;

    const mesh = blocksGroupRef.current.children.find(child => 
      child.position.equals(position)
    );
    
    if (mesh) {
      blocksGroupRef.current.remove(mesh);
      (mesh as THREE.Mesh).geometry.dispose();
      ((mesh as THREE.Mesh).material as THREE.Material).dispose();
    }
  }, []);

  // Handle mouse movement for camera look
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isPointerLocked || !cameraRef.current) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    mouseRef.current.x -= movementX * 0.002;
    mouseRef.current.y -= movementY * 0.002;
    mouseRef.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseRef.current.y));

    cameraRef.current.rotation.order = 'YXZ';
    cameraRef.current.rotation.y = mouseRef.current.x;
    cameraRef.current.rotation.x = mouseRef.current.y;
  }, [isPointerLocked]);

  // Handle click for block placement/removal
  const handleClick = useCallback((event: MouseEvent) => {
    if (!isPointerLocked || !raycasterRef.current || !cameraRef.current || !sceneRef.current) return;

    raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(blocksGroupRef.current?.children || []);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const clickedBlock = intersect.object.userData.block as Block;

      if (event.button === 0) { // Left click - remove block
        const key = `${clickedBlock.position.x},${clickedBlock.position.y},${clickedBlock.position.z}`;
        worldRef.current?.delete(key);
        removeBlockMesh(clickedBlock.position);
      } else if (event.button === 2) { // Right click - place block
        const face = intersect.face;
        if (face) {
          const newPosition = clickedBlock.position.clone().add(face.normal);
          const key = `${newPosition.x},${newPosition.y},${newPosition.z}`;
          
          if (!worldRef.current?.has(key)) {
            const newBlock: Block = { type: currentBlockType, position: newPosition };
            worldRef.current?.set(key, newBlock);
            createBlockMesh(newBlock);
          }
        }
      }
    }
  }, [isPointerLocked, currentBlockType, removeBlockMesh, createBlockMesh]);

  // Handle keyboard input
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    keysRef.current[event.code] = true;
    
    // Number keys for block selection
    const blockTypeMap: { [key: string]: BlockType } = {
      'Digit1': BlockType.GRASS,
      'Digit2': BlockType.DIRT, 
      'Digit3': BlockType.STONE,
      'Digit4': BlockType.WOOD,
    };
    
    if (blockTypeMap[event.code]) {
      setCurrentBlockType(blockTypeMap[event.code]);
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keysRef.current[event.code] = false;
  }, []);

  // Player movement
  const updateMovement = useCallback(() => {
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

  // Animation loop
  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    updateMovement();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    requestAnimationFrame(animate);
  }, [updateMovement]);

  // Handle pointer lock
  const requestPointerLock = useCallback(() => {
    if (mountRef.current) {
      mountRef.current.requestPointerLock().catch((err) => {
        console.log('Pointer lock failed:', err);
        // Fallback: just set the state to allow playing without full pointer lock
        setIsPointerLocked(true);
      });
    }
  }, []);

  // Handle pointer lock change
  const handlePointerLockChange = useCallback(() => {
    const isLocked = document.pointerLockElement === mountRef.current;
    setIsPointerLocked(isLocked);
    console.log('Pointer lock changed:', isLocked);
  }, []);

  // Handle window resize
  const handleResize = useCallback(() => {
    if (!cameraRef.current || !rendererRef.current) return;

    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
  }, []);

  // Initialize everything
  useEffect(() => {
    initScene();
    animate();

    // Event listeners
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      
      // Cleanup Three.js
      if (rendererRef.current && mountRef.current?.contains(rendererRef.current.domElement)) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, [initScene, animate, handlePointerLockChange, handleMouseMove, handleClick, handleKeyDown, handleKeyUp, handleResize]);

  const getBlockTypeDisplay = (type: BlockType): string => {
    switch (type) {
      case BlockType.GRASS: return '🌱';
      case BlockType.DIRT: return '🟫';
      case BlockType.STONE: return '🗿';
      case BlockType.WOOD: return '🪵';
      default: return '';
    }
  };

  return (
    <div className="w-full h-screen relative">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Crosshair */}
      <div className="crosshair" />
      
      {/* UI */}
      {!isPointerLocked && (
        <div 
          className="absolute inset-0 bg-ui-bg flex items-center justify-center z-50 cursor-pointer"
          onClick={requestPointerLock}
        >
          <div className="text-center pixel-font text-white">
            <h1 className="text-4xl mb-4">Simple Minecraft</h1>
            <p className="text-lg mb-2">Click anywhere to start playing</p>
            <p className="text-sm">WASD to move, Space/Shift for up/down</p>
            <p className="text-sm">Left click to break, Right click to place</p>
            <p className="text-sm">Keys 1-4 to select blocks</p>
          </div>
        </div>
      )}
      
      {/* Inventory */}
      {isPointerLocked && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2 z-40">
          {[BlockType.GRASS, BlockType.DIRT, BlockType.STONE, BlockType.WOOD].map((type, index) => (
            <div
              key={type}
              className={`inventory-slot ${type === currentBlockType ? 'selected' : ''}`}
            >
              <span className="text-2xl">{getBlockTypeDisplay(type)}</span>
              <span className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-white pixel-font">
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