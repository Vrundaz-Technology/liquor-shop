"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, useTexture } from "@react-three/drei";
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { getAllProducts } from "@/data/products";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/store/cart";
import { addToCart } from "@/lib/add-to-cart";
import { useBranchStore } from "@/store/branch";
import { useInventoryStore } from "@/store/inventory";
import { useCatalogStore } from "@/store/catalog";
import { getPriceForLocation, getAllLocations } from "@/data/locations";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import { OtherBranchStock } from "@/components/inventory/OtherBranchStock";
import { LocationStockStrip } from "@/components/inventory/LocationStockStrip";
import { X, View, ShoppingBag, MousePointer2 } from "lucide-react";
import Image from "next/image";
import { StoreEnvironment } from "./StoreEnvironment";

const EYE = 1.65;
const WARM = "#ffe4b8";
const LEFT = -5.2;
const RIGHT = 5.2;
const BACK = -4.6;

/** Shared look angles — drag mouse turns this way; WASD walks that way */
type LookState = { yaw: number; pitch: number };

/** Full boutique floor (inside the walls) — every bay & corner is reachable */
const FLOOR = { xMin: -6.6, xMax: 6.6, zMin: -4.7, zMax: 8.2 };

/** Shelf / desk blockers so you walk up to bays without clipping through them */
const OBSTACLES: { x: number; z: number; hx: number; hz: number }[] = [
  { x: -5.35, z: 3.8, hx: 0.55, hz: 1.95 },
  { x: -5.35, z: 0, hx: 0.55, hz: 1.95 },
  { x: -5.35, z: -3.5, hx: 0.55, hz: 1.95 },
  { x: -2.15, z: -4.75, hx: 1.95, hz: 0.55 },
  { x: 2.15, z: -4.75, hx: 1.95, hz: 0.55 },
  { x: 5.35, z: -3.5, hx: 0.55, hz: 1.95 },
  { x: 5.35, z: 1.2, hx: 0.55, hz: 1.95 },
  { x: 0, z: 4.8, hx: 1.4, hz: 0.7 },
];

function applyLook(camera: THREE.Camera, look: LookState) {
  camera.rotation.order = "YXZ";
  camera.rotation.y = look.yaw;
  camera.rotation.x = look.pitch;
  camera.rotation.z = 0;
}

function lookFromPoints(from: THREE.Vector3, to: THREE.Vector3): LookState {
  const dir = to.clone().sub(from).normalize();
  return {
    yaw: Math.atan2(-dir.x, -dir.z),
    pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)),
  };
}

function blocked(x: number, z: number, radius = 0.38) {
  for (const o of OBSTACLES) {
    if (Math.abs(x - o.x) < o.hx + radius && Math.abs(z - o.z) < o.hz + radius) return true;
  }
  return false;
}

function resolveWalk(from: THREE.Vector3, wish: THREE.Vector3) {
  const next = wish.clone();
  next.y = EYE;
  next.x = THREE.MathUtils.clamp(next.x, FLOOR.xMin, FLOOR.xMax);
  next.z = THREE.MathUtils.clamp(next.z, FLOOR.zMin, FLOOR.zMax);
  if (!blocked(next.x, next.z)) return next;
  // Slide along walls / shelves
  if (!blocked(next.x, from.z)) {
    next.z = from.z;
    return next;
  }
  if (!blocked(from.x, next.z)) {
    next.x = from.x;
    return next;
  }
  next.x = from.x;
  next.z = from.z;
  return next;
}

type Section = {
  name: string;
  x: number;
  z: number;
  /** Yaw — shelf faces local +Z after this rotation */
  rotY: number;
  hasShelves: boolean;
  /** Category / flag matcher used when assigning live catalog bottles. */
  filter: (p: Product) => boolean;
};

const MIXED_CATEGORIES = new Set([
  "liqueur",
  "gin",
  "rum",
  "tequila",
  "mezcal",
  "wine",
  "beer",
  "cider",
  "champagne",
  "brandy",
  "cognac",
  "aperitif",
  "vermouth",
  "rtd",
]);

/**
 * U-shaped boutique. Side and back bays sit against the walls;
 * walk + mouse-look lets you reach every corner.
 * Shelf filters are category/flag based so owner-added bottles land on racks.
 */
const SECTIONS: Section[] = [
  { name: "Entrance", x: 0, z: 7.2, rotY: 0, hasShelves: false, filter: () => false },
  {
    name: "Whiskey",
    x: LEFT,
    z: 3.8,
    rotY: Math.PI / 2,
    hasShelves: true,
    filter: (p) => p.category === "whiskey" || p.category === "bourbon",
  },
  {
    name: "Vodka",
    x: LEFT,
    z: 0,
    rotY: Math.PI / 2,
    hasShelves: true,
    filter: (p) => p.category === "vodka",
  },
  {
    name: "Flavors",
    x: LEFT,
    z: -3.5,
    rotY: Math.PI / 2,
    hasShelves: true,
    filter: (p) => MIXED_CATEGORIES.has(p.category),
  },
  {
    name: "Scotch",
    x: -2.15,
    z: BACK,
    rotY: 0,
    hasShelves: true,
    filter: (p) => p.category === "scotch" && !p.isPremium,
  },
  {
    name: "Reserve",
    x: 2.15,
    z: BACK,
    rotY: 0,
    hasShelves: true,
    filter: (p) => p.category === "scotch" && p.isPremium,
  },
  {
    name: "Premium",
    x: RIGHT,
    z: -3.5,
    rotY: -Math.PI / 2,
    hasShelves: true,
    filter: (p) => p.isPremium,
  },
  {
    name: "Imported",
    x: RIGHT,
    z: 1.2,
    rotY: -Math.PI / 2,
    hasShelves: true,
    filter: (p) => p.isImported,
  },
  { name: "Checkout", x: 0, z: 4.8, rotY: 0, hasShelves: false, filter: () => false },
];

/** Unique products only — never repeat the same bottle on one bay. */
function uniqueShelf(list: Product[], max = 12) {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const p of list) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

function sortForShelf(list: Product[]) {
  return [...list].sort((a, b) => {
    if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;
    if (a.isImported !== b.isImported) return a.isImported ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Place live catalog bottles on physical bays.
 * Category bays fill first (exclusive). Premium / Imported are showcase bays
 * that always show matching bottles so those filters have a home on the floor.
 */
function assignBottlesToBays(candidates: Product[]) {
  const byName = new Map(SECTIONS.filter((s) => s.hasShelves).map((s) => [s.name, s]));
  const used = new Set<string>();
  const assigned = new Map<string, Product[]>();

  const categoryOrder = ["Scotch", "Reserve", "Whiskey", "Vodka", "Flavors"] as const;

  for (const name of categoryOrder) {
    const section = byName.get(name);
    if (!section) continue;
    const matches = sortForShelf(
      candidates.filter((p) => !used.has(p.id) && section.filter(p)),
    );
    const bottles = uniqueShelf(matches, 12);
    for (const p of bottles) used.add(p.id);
    assigned.set(name, bottles);
  }

  // Showcase bays — always surface premium / imported bottles on these racks
  for (const name of ["Premium", "Imported"] as const) {
    const section = byName.get(name);
    if (!section) continue;
    assigned.set(
      name,
      uniqueShelf(sortForShelf(candidates.filter((p) => section.filter(p))), 12),
    );
  }

  const remaining = sortForShelf(candidates.filter((p) => !used.has(p.id)));
  const overflowTargets = ["Flavors", "Whiskey", "Vodka", "Scotch", "Reserve"];
  for (const product of remaining) {
    const target = overflowTargets.find((name) => (assigned.get(name)?.length ?? 0) < 12);
    if (!target) break;
    const list = assigned.get(target) ?? [];
    list.push(product);
    assigned.set(target, list);
    used.add(product.id);
  }

  return SECTIONS.filter((s) => s.hasShelves).map((section) => ({
    section,
    bottles: assigned.get(section.name) ?? [],
  }));
}

function cameraFor(section: Section) {
  if (section.hasShelves) {
    const look = new THREE.Vector3(section.x, 1.35, section.z);
    // Stand in front of the bay (not locked to center aisle)
    const dist = 2.55;
    const pos = new THREE.Vector3(
      section.x + Math.sin(section.rotY) * dist,
      EYE,
      section.z + Math.cos(section.rotY) * dist,
    );
    pos.x = THREE.MathUtils.clamp(pos.x, FLOOR.xMin, FLOOR.xMax);
    pos.z = THREE.MathUtils.clamp(pos.z, FLOOR.zMin, FLOOR.zMax);
    return { pos, look };
  }
  if (section.name === "Checkout") {
    return {
      pos: new THREE.Vector3(0, EYE, 6.5),
      look: new THREE.Vector3(0, 1.05, 4.8),
    };
  }
  return {
    pos: new THREE.Vector3(0, EYE, 7.4),
    look: new THREE.Vector3(0, 1.35, 0.5),
  };
}

class StoreErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Virtual store:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#120e0a] px-6 text-center">
          <p className="font-display text-2xl text-[var(--cream)]">Showroom failed to load</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Max bottle height that fits under the shelf above (with a small air gap). */
const SHELF_CLEARANCE = 0.62;
const SHELF_THICK = 0.05;
/** Shelf board centers — top → bottom so bottles fill upper racks first. */
const SHELF_YS = [1.98, 1.2, 0.42] as const;

/** Real product PNG (transparent) on a plane — replaces dummy cylinder bottles. */
function PhotoBottle({
  product,
  position,
  selected,
  soldOut,
  onSelect,
}: {
  product: Product;
  position: [number, number, number];
  selected?: boolean;
  soldOut?: boolean;
  onSelect: () => void;
}) {
  const url = product.images[0];
  const texture = useTexture(url);
  const h = Math.min(0.5 * product.bottleHeight, SHELF_CLEARANCE - 0.04);

  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  const img = texture.image as { width?: number; height?: number } | undefined;
  const aspect =
    img?.width && img?.height ? img.width / img.height : 0.38;
  // Keep bottles slim enough for 4-across shelves
  const w = Math.min(h * aspect, h * 0.48);

  return (
    <group
      position={position}
      scale={selected ? 1.08 : soldOut ? 0.96 : 1}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* Facing aisle (+Z local). Double-sided so side bays still read. */}
      <mesh position={[0, h / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={soldOut ? 0.38 : 1}
          alphaTest={soldOut ? 0 : 0.12}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[w * 0.45, w * 0.62, 24]} />
          <meshBasicMaterial color={product.accentColor} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

/** Tiny placeholder while textures load */
function BottleFallback({
  product,
  position,
}: {
  product: Product;
  position: [number, number, number];
}) {
  const h = Math.min(0.45 * product.bottleHeight, SHELF_CLEARANCE - 0.06);
  return (
    <mesh position={[position[0], position[1] + h / 2, position[2]]}>
      <cylinderGeometry args={[0.04, 0.05, h, 8]} />
      <meshStandardMaterial color={product.color} transparent opacity={0.35} />
    </mesh>
  );
}

/**
 * Isolates one bottle's texture failure.
 *
 * `Suspense` only covers the *pending* state — when a texture request rejects
 * (a 404 product image, say) `useTexture` throws during render, which would
 * otherwise escape to `StoreErrorBoundary` and take the entire showroom down.
 * Catching it per bottle degrades that single bottle to its placeholder.
 */
class BottleErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("Virtual store: bottle image unavailable, showing placeholder.", error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ShelfBottle(props: {
  product: Product;
  position: [number, number, number];
  selected?: boolean;
  soldOut?: boolean;
  onSelect: () => void;
}) {
  const fallback = <BottleFallback product={props.product} position={props.position} />;
  // No image at all — skip the loader entirely rather than suspending forever.
  if (!props.product.images[0]) return fallback;
  return (
    <BottleErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <PhotoBottle {...props} />
      </Suspense>
    </BottleErrorBoundary>
  );
}

function ShelfUnit({
  position,
  rotationY = 0,
  label,
  bottles,
  selectedId,
  stockByProduct,
  onSelect,
}: {
  position: [number, number, number];
  rotationY?: number;
  label: string;
  bottles: Product[];
  selectedId?: string;
  stockByProduct: Record<string, number>;
  onSelect: (p: Product) => void;
}) {
  const cols = 4;
  const sign = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "#c9a962";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = "#e4c878";
    ctx.font = "600 20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), 128, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [label]);

  // Warm up textures for this bay
  useEffect(() => {
    for (const p of bottles) {
      if (p.images[0]) useTexture.preload(p.images[0]);
    }
  }, [bottles]);

  const cabinetH = 2.85;
  const cabinetCy = cabinetH / 2;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, cabinetCy, -0.28]}>
        <boxGeometry args={[3.7, cabinetH, 0.42]} />
        <meshStandardMaterial color="#1c1410" roughness={0.55} />
      </mesh>
      <mesh position={[0, cabinetCy, -0.05]}>
        <boxGeometry args={[3.45, cabinetH - 0.2, 0.03]} />
        <meshStandardMaterial color="#2a1a12" roughness={0.4} metalness={0.18} />
      </mesh>

      {SHELF_YS.map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.08]}>
            <boxGeometry args={[3.45, SHELF_THICK, 0.42]} />
            <meshStandardMaterial color="#4a3224" roughness={0.4} />
          </mesh>
          <mesh position={[0, y - SHELF_THICK / 2 - 0.008, 0.26]}>
            <boxGeometry args={[3.25, 0.012, 0.028]} />
            <meshStandardMaterial color="#fff8e8" emissive={WARM} emissiveIntensity={2.1} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, cabinetH + 0.02, 0.04]}>
        <boxGeometry args={[3.8, 0.08, 0.48]} />
        <meshStandardMaterial color="#c9a962" metalness={0.88} roughness={0.22} />
      </mesh>
      {sign && (
        <mesh position={[0, cabinetH + 0.18, 0.2]}>
          <planeGeometry args={[1.2, 0.26]} />
          <meshBasicMaterial map={sign} />
        </mesh>
      )}

      {bottles.map((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        if (row >= SHELF_YS.length) return null;
        const shelfTop = SHELF_YS[row] + SHELF_THICK / 2;
        return (
          <ShelfBottle
            key={`${label}-${p.id}-${i}`}
            product={p}
            position={[-1.15 + col * 0.76, shelfTop, 0.14]}
            selected={selectedId === p.id}
            soldOut={(stockByProduct[p.id] ?? 0) <= 0}
            onSelect={() => onSelect(p)}
          />
        );
      })}
    </group>
  );
}

/**
 * First-person explore: drag mouse to look — WASD / arrows walk that way.
 * Full floor bounds so every shelf bay and corner is reachable.
 */
function WalkControls({
  enabled,
  navigating,
  look,
}: {
  enabled: boolean;
  navigating: MutableRefObject<boolean>;
  look: MutableRefObject<LookState>;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const wish = useRef(new THREE.Vector3());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      // keep arrows from scrolling the page while exploring
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) &&
        enabled
      ) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (!enabled || navigating.current) return;
      if (e.button !== 0 && e.button !== 2) return;
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !enabled || navigating.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      // Look where the cursor drags — that becomes walk direction
      look.current.yaw -= dx * 0.0024;
      look.current.pitch -= dy * 0.002;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch, -1.15, 1.15);
      applyLook(camera, look.current);
    };

    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!enabled || navigating.current) return;
      e.preventDefault();
      // Scroll = step forward/back in the direction you're facing
      applyLook(camera, look.current);
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      if (forward.current.lengthSq() < 1e-8) return;
      forward.current.normalize();
      const step = THREE.MathUtils.clamp(-e.deltaY, -120, 120) * 0.012;
      const wishPos = camera.position.clone().addScaledVector(forward.current, step);
      camera.position.copy(resolveWalk(camera.position, wishPos));
    };

    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
    };
  }, [camera, enabled, gl, look, navigating]);

  useFrame((_, dt) => {
    if (!enabled || navigating.current) return;
    applyLook(camera, look.current);

    const speed = (keys.current.ShiftLeft || keys.current.ShiftRight ? 5.2 : 2.9) * dt;
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 1e-8) return;
    forward.current.normalize();
    right.current.set(-forward.current.z, 0, forward.current.x);

    wish.current.set(0, 0, 0);
    if (keys.current.KeyW || keys.current.ArrowUp) wish.current.add(forward.current);
    if (keys.current.KeyS || keys.current.ArrowDown) wish.current.sub(forward.current);
    if (keys.current.KeyA || keys.current.ArrowLeft) wish.current.sub(right.current);
    if (keys.current.KeyD || keys.current.ArrowRight) wish.current.add(right.current);
    if (wish.current.lengthSq() === 0) return;

    wish.current.normalize().multiplyScalar(speed);
    const next = resolveWalk(camera.position, camera.position.clone().add(wish.current));
    camera.position.copy(next);
  });

  return null;
}

function CameraRig({
  section,
  look,
  navigating,
  onArrived,
}: {
  section: Section;
  look: MutableRefObject<LookState>;
  navigating: MutableRefObject<boolean>;
  onArrived: () => void;
}) {
  const goalPos = useRef(new THREE.Vector3());
  const goalLook = useRef<LookState>({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const { pos, look: target } = cameraFor(section);
    goalPos.current.copy(pos);
    goalLook.current = lookFromPoints(pos, target);
    navigating.current = true;
  }, [section, navigating]);

  useFrame(({ camera }) => {
    if (!navigating.current) return;
    camera.position.lerp(goalPos.current, 0.14);
    // shortest-path yaw so tab jumps don't spin the long way
    let dy = goalLook.current.yaw - look.current.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    look.current.yaw += dy * 0.14;
    look.current.pitch = THREE.MathUtils.lerp(look.current.pitch, goalLook.current.pitch, 0.14);
    applyLook(camera, look.current);

    if (camera.position.distanceTo(goalPos.current) < 0.07) {
      camera.position.copy(goalPos.current);
      look.current.yaw = goalLook.current.yaw;
      look.current.pitch = goalLook.current.pitch;
      applyLook(camera, look.current);
      navigating.current = false;
      onArrived();
    }
  });
  return null;
}

function StoreScene({
  selected,
  setSelected,
  shelfCount,
  stockByProduct,
  shelfData,
}: {
  selected: Product | null;
  setSelected: (p: Product | null) => void;
  shelfCount: number;
  stockByProduct: Record<string, number>;
  shelfData: { section: Section; bottles: Product[] }[];
}) {
  return (
    <>
      <color attach="background" args={["#1a1510"]} />
      <fog attach="fog" args={["#1a1510", 16, 34]} />
      <ambientLight intensity={0.58} color="#f5ebe0" />
      <hemisphereLight intensity={0.32} color="#fff8ee" groundColor="#2a1a10" />
      <directionalLight position={[0, 9, 5]} intensity={1.05} color={WARM} />

      <StoreEnvironment />

      {shelfData.slice(0, shelfCount).map(({ section, bottles }) => (
        <ShelfUnit
          key={section.name}
          position={[section.x, 0, section.z]}
          rotationY={section.rotY}
          label={section.name}
          bottles={bottles}
          selectedId={selected?.id}
          stockByProduct={stockByProduct}
          onSelect={setSelected}
        />
      ))}
    </>
  );
}

const SHELF_BAYS = SECTIONS.filter((s) => s.hasShelves).length;

export function VirtualStoreExperience() {
  const [selected, setSelected] = useState<Product | null>(null);
  const [section, setSection] = useState<Section>(() => SECTIONS[0]);
  const [ready, setReady] = useState(false);
  const [shelfCount, setShelfCount] = useState(0);
  const [walk, setWalk] = useState(false);

  const cartQty = useCartStore((s) =>
    selected
      ? (s.items.find((i) => i.productId === selected.id)?.quantity ?? 0)
      : 0,
  );
  const branchId = useBranchStore((s) => s.branchId);
  const branch = getAllLocations().find((l) => l.id === branchId) ?? getAllLocations()[0];
  const getOnHand = useInventoryStore((s) => s.getOnHand);
  const isHidden = useInventoryStore((s) => s.isHidden);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const catalogRevision = useCatalogStore((s) => s.revision);

  const candidates = useMemo(
    () => getAllProducts().filter((p) => !isHidden(branchId, p.id)),
    [branchId, catalogRevision, inventoryRevision, isHidden],
  );

  const shelfData = useMemo(() => assignBottlesToBays(candidates), [candidates]);

  const stockByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of candidates) map[p.id] = getOnHand(branchId, p.id);
    for (const bay of shelfData) {
      for (const p of bay.bottles) {
        if (map[p.id] == null) map[p.id] = getOnHand(branchId, p.id);
      }
    }
    return map;
  }, [branchId, candidates, getOnHand, shelfData, inventoryRevision]);

  const bayCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bay of shelfData) map[bay.section.name] = bay.bottles.length;
    return map;
  }, [shelfData]);

  const selectedStock = selected ? (stockByProduct[selected.id] ?? 0) : 0;
  const selectedRemaining = Math.max(0, selectedStock - cartQty);
  const selectedPrice = selected
    ? getPriceForLocation(branchId, selected.id)
    : 0;
  const start = useMemo(() => cameraFor(SECTIONS[0]), []);
  const look = useRef<LookState>(lookFromPoints(start.pos, start.look));
  const navigating = useRef(true);

  useEffect(() => {
    if (!selected) return;
    const stillVisible = shelfData.some((bay) =>
      bay.bottles.some((p) => p.id === selected.id),
    );
    if (!stillVisible) setSelected(null);
  }, [selected, shelfData]);

  // Room first, then shelves in waves — keeps first paint fast
  useEffect(() => {
    if (!ready || shelfCount >= SHELF_BAYS) return;
    const t = window.setTimeout(() => setShelfCount((n) => Math.min(n + 2, SHELF_BAYS)), 50);
    return () => window.clearTimeout(t);
  }, [ready, shelfCount]);

  return (
    <div className="relative h-[calc(100dvh-7.25rem)] min-h-[360px] w-full overflow-hidden bg-[#1a1510] sm:h-[calc(100dvh-6.75rem)] md:h-[calc(100dvh-7rem)]">
      {!ready && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#1a1510]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gold)]/30 border-t-[var(--gold)]" />
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--gold)]">Opening showroom</p>
        </div>
      )}

      <StoreErrorBoundary>
        <Canvas
          dpr={[1, 1.25]}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            alpha: false,
            stencil: false,
          }}
          onCreated={({ gl, camera }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.12;
            gl.setClearColor("#1a1510", 1);
            applyLook(camera, look.current);
            setReady(true);
          }}
        >
          <PerspectiveCamera
            makeDefault
            position={[start.pos.x, start.pos.y, start.pos.z]}
            fov={58}
          />
          <StoreScene
            selected={selected}
            setSelected={setSelected}
            shelfCount={shelfCount}
            stockByProduct={stockByProduct}
            shelfData={shelfData}
          />
          <CameraRig
            section={section}
            look={look}
            navigating={navigating}
            onArrived={() => setWalk(true)}
          />
          <WalkControls enabled={walk} navigating={navigating} look={look} />
        </Canvas>
      </StoreErrorBoundary>

      <div className="pointer-events-none absolute inset-x-0 top-2 z-10 px-2 sm:top-3 sm:px-3 md:px-6">
        <div className="pointer-events-auto mx-auto w-full max-w-6xl lg:hidden">
          <label className="sr-only" htmlFor="aisle-select">
            Aisle section
          </label>
          <select
            id="aisle-select"
            value={section.name}
            onChange={(e) => {
              const next = SECTIONS.find((s) => s.name === e.target.value);
              if (!next) return;
              setWalk(false);
              setSection(next);
            }}
            className="w-full rounded-sm border border-[var(--gold)]/30 bg-black/85 px-3 py-2.5 text-sm text-[var(--cream)] [color-scheme:dark] backdrop-blur-md [&_option]:bg-[#0a0908]"
          >
            {SECTIONS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.hasShelves ? `${s.name} (${bayCounts[s.name] ?? 0})` : s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="pointer-events-auto mx-auto hidden w-full max-w-6xl overflow-x-auto rounded-sm border border-[var(--gold)]/30 bg-black/80 px-1.5 py-1.5 backdrop-blur-md lg:flex lg:flex-nowrap lg:items-center lg:justify-between lg:gap-0.5">
          {SECTIONS.map((s) => {
            const count = s.hasShelves ? bayCounts[s.name] ?? 0 : null;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setWalk(false);
                  setSection(s);
                }}
                className={`min-w-0 shrink-0 whitespace-nowrap rounded-sm px-2 py-1.5 text-center text-[9px] uppercase tracking-[0.1em] md:flex-1 md:px-1 md:text-[10px] md:tracking-[0.12em] ${
                  section.name === s.name
                    ? "bg-[var(--gold)] text-black"
                    : "text-[var(--muted)] hover:text-[var(--cream)]"
                }`}
              >
                {s.name}
                {count != null ? <span className="ml-1 opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`pointer-events-none absolute bottom-5 left-3 z-10 max-w-[min(16rem,calc(100vw-1.5rem))] rounded-sm border border-white/10 bg-black/70 p-3 text-xs text-[var(--muted)] backdrop-blur md:left-6 ${
          selected ? "hidden md:block" : ""
        }`}
      >
        <p className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--gold)]">
          <MousePointer2 size={12} /> Free roam
        </p>
        <p>
          <span className="md:hidden">
            <span className="text-[var(--cream)]">Drag</span> look · aisle menu · tap bottle
          </span>
          <span className="hidden md:inline">
            <span className="text-[var(--cream)]">Drag</span> look ·{" "}
            <span className="text-[var(--cream)]">WASD</span> /{" "}
            <span className="text-[var(--cream)]">scroll</span> walk · Tabs jump · Click bottle
          </span>
        </p>
      </div>

      {selected && (
        <>
          <button
            type="button"
            aria-label="Close product panel"
            className="absolute inset-0 z-[15] bg-black/45 lg:hidden"
            onClick={() => setSelected(null)}
          />
          <aside className="absolute inset-x-0 bottom-0 z-20 flex max-h-[70vh] w-full flex-col overflow-y-auto rounded-t-md border border-white/10 border-b-0 bg-[#0a0908]/98 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl lg:inset-y-0 lg:bottom-auto lg:right-0 lg:left-auto lg:max-h-none lg:max-w-sm lg:rounded-none lg:border-b lg:border-l lg:border-t-0 lg:border-r-0 lg:pb-0">
          <div className="relative h-40 w-full shrink-0 bg-[#14110d] sm:h-48">
            {selected.images[0] ? (
              <Image
                src={selected.images[0]}
                alt={selected.name}
                fill
                className="object-cover"
                sizes="360px"
                priority
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0908] to-transparent" />
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-3 top-3 rounded-sm bg-black/50 p-2 text-[var(--cream)]"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--gold)]">
              {selected.brand}
            </p>
            <h2 className="mt-1 font-display text-2xl text-[var(--cream)]">{selected.name}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-sm border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                {selected.category}
              </span>
              {selected.isPremium ? (
                <span className="rounded-sm border border-[var(--gold)]/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--gold)]">
                  Premium
                </span>
              ) : null}
              {selected.isImported ? (
                <span className="rounded-sm border border-sky-400/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-sky-200">
                  Imported
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {selected.origin} · {selected.abv}% ABV
            </p>
            <p className="mt-3 text-xl text-[var(--gold)]">
              {formatPrice(selectedPrice)}
            </p>
            <p
              className={`mt-2 text-xs ${
                selectedStock <= 0
                  ? "text-red-300"
                  : selectedStock <= LOW_STOCK_THRESHOLD
                    ? "text-amber-200"
                    : "text-[var(--muted)]"
              }`}
            >
              {selectedStock <= 0
                ? `0 at ${branch.shortName}`
                : `${selectedStock} at ${branch.shortName}${
                    cartQty ? ` · ${cartQty} in cart` : ""
                  }`}
            </p>
            <LocationStockStrip
              className="mt-3"
              productId={selected.id}
              needed={cartQty + 1}
              compact
            />
            {selectedRemaining <= 0 && (
              <OtherBranchStock
                className="mt-3"
                productId={selected.id}
                branchId={branchId}
                quantity={cartQty + 1}
                localStock={selectedStock}
                compact
                addOnSwitch={1}
              />
            )}
            <div className="mt-5 flex flex-col gap-2">
              <Button
                disabled={selectedRemaining <= 0}
                onClick={() => addToCart(selected.id)}
              >
                <ShoppingBag size={16} />
                {selectedStock <= 0
                  ? "Out of stock here"
                  : selectedRemaining <= 0
                    ? "Max at this store"
                    : "Add to Cart"}
              </Button>
              <Link href={`/products/${selected.slug}`}>
                <Button variant="secondary" className="w-full">
                  Details
                </Button>
              </Link>
              <Link href={`/ar/${selected.slug}`}>
                <Button variant="outline" className="w-full">
                  <View size={16} /> View in AR
                </Button>
              </Link>
            </div>
          </div>
        </aside>
        </>
      )}
    </div>
  );
}
