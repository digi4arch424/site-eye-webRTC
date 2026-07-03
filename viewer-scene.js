/**
 * viewer-scene.js — Phase 1 Track 3
 *
 * Three.js scene that overlays the remote video stream in viewer.html.
 * The canvas sits on top of the video (alpha: true) so the live feed
 * shows through the transparent background.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *  viewer.html
 *  └── #ar-container  (position: relative)
 *      ├── #remoteVideo          ← WebRTC stream (Phase 0)
 *      └── #ar-canvas            ← Three.js renderer (this file)
 *
 * The Three.js camera represents the SENDER's device camera in world space.
 * VPS pose data arriving via the data channel drives camera.position and
 * camera.rotation — objects in the scene appear fixed in the real world.
 *
 * ── CRITICAL: single WebGL context ───────────────────────────────────────────
 *
 * There must be exactly ONE WebGLRenderer instance on this page.
 * Phase 2 adds a depth prepass for the occlusion shader inside this render
 * loop. If a second renderer is added later, Phase 2 becomes a full refactor.
 * Look for the "Phase 2 extension point" comment in _renderFrame().
 *
 * ── Phase timeline ────────────────────────────────────────────────────────────
 *
 * Phase 1 (this file):
 *   • Renderer + scene + camera setup
 *   • Camera FOV and aspect synced to container dimensions
 *   • Camera position/orientation driven by window._lastVPSPose
 *   • Placeholder: wireframe box + axes helper + anchor sphere
 *   • VPS status badge overlay
 *
 * Phase 2 (extend, do not replace):
 *   • Replace placeholder with loaded GLB BIM model
 *   • Add depth prepass in _renderFrame() before renderer.render()
 *   • Refine camera FOV from MediaTrackCapabilities broadcast by sender
 *   • Switch camera pose source from WebXR relative → Multiset absolute
 *
 * @module viewer-scene
 */

import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default vertical FOV in degrees. Matches a typical rear wide camera.
 *  Phase 2: override from sender's MediaTrackCapabilities broadcast. */
const DEFAULT_FOV = 60;

const NEAR_CLIP = 0.01;   // metres — close enough for handheld AR
const FAR_CLIP  = 500;    // metres — sufficient for construction site scale

/** Minimum VPS confidence [0–1] before the camera pose is applied.
 *  Below this threshold the overlay stays in its last valid position. */
const MIN_CONFIDENCE = 0.5;

/** Pixel ratio cap — prevents extreme overdraw on high-DPI devices. */
const MAX_PIXEL_RATIO = 2;

// ── ViewerScene ───────────────────────────────────────────────────────────────

export class ViewerScene {
  /**
   * @param {object}           options
   * @param {HTMLElement}      options.container  — #ar-container element
   * @param {HTMLVideoElement} options.video      — #remoteVideo element
   */
  constructor({ container, video }) {
    this.container = container;
    this.video     = video;

    /** @type {THREE.WebGLRenderer} */
    this.renderer  = null;
    /** @type {THREE.Scene} */
    this.scene     = null;
    /** @type {THREE.PerspectiveCamera} */
    this.camera    = null;
    /** @type {THREE.Clock} */
    this._clock    = null;
    /** @type {THREE.Group} World-space pivot for all overlay geometry.
     *  Phase 2: populate this group with the loaded GLB BIM model. */
    this._pivot    = null;
    /** @type {HTMLElement} VPS status badge rendered over the video. */
    this._statusEl = null;

    this._rafId    = null;
    this._running  = false;
    this._resizeObs = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initialise the renderer, scene, camera, geometry, and render loop.
   * Call once after the remote video element has loaded metadata.
   */
  init() {
    this._clock = new THREE.Clock();

    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._setupPlaceholderGeometry();
    this._setupStatusBadge();
    this._attachResizeObserver();

    this._running = true;
    this._renderFrame();

    console.log('[ViewerScene] Phase 1 Three.js overlay initialised.');
  }

  /** Tear down renderer and release GPU resources. */
  destroy() {
    this._running = false;
    cancelAnimationFrame(this._rafId);
    this._resizeObs?.disconnect();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this._statusEl?.remove();
    console.log('[ViewerScene] Destroyed.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup — renderer
  // ─────────────────────────────────────────────────────────────────────────

  _setupRenderer() {
    // ── CRITICAL ────────────────────────────────────────────────────────────
    // This is the ONE renderer for the entire viewer page.
    // Phase 2 depth prepass runs via renderer.setRenderTarget() INSIDE
    // _renderFrame() — it must reuse this same renderer instance.
    // Do NOT create another WebGLRenderer anywhere on this page.
    // ───────────────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      alpha:           true,    // transparent background → video shows through
      antialias:       true,
      powerPreference: 'high-performance',
    });

    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(0x000000, 0);  // RGBA alpha = 0 → fully transparent

    // Position the canvas exactly over the video element
    const canvas = this.renderer.domElement;
    canvas.id = 'ar-canvas';
    Object.assign(canvas.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',  // touches pass through to controls underneath
      zIndex:        '10',
    });

    this.container.appendChild(canvas);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup — scene
  // ─────────────────────────────────────────────────────────────────────────

  _setupScene() {
    this.scene = new THREE.Scene();

    // Lighting for placeholder geometry.
    // Phase 2: supplement or replace with image-based lighting from site scan.
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup — camera
  // ─────────────────────────────────────────────────────────────────────────

  _setupCamera() {
    const { clientWidth: w, clientHeight: h } = this.container;

    // Vertical FOV — Phase 1 uses a fixed default.
    //
    // Phase 2 refinement:
    //   The sender broadcasts its camera's horizontal FOV from
    //   MediaTrackCapabilities via the data channel. Convert:
    //     vFOV = 2 * atan(tan(hFOV_rad / 2) / aspectRatio) * (180 / Math.PI)
    //   Then call: this.camera.fov = vFOV; this.camera.updateProjectionMatrix();
    this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, w / h, NEAR_CLIP, FAR_CLIP);

    // Camera starts at world origin facing −Z (Three.js default).
    // _syncToVPSPose() moves it to the sender device's position each frame.
    this.camera.position.set(0, 0, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup — placeholder geometry
  // ─────────────────────────────────────────────────────────────────────────

  _setupPlaceholderGeometry() {
    // _pivot is a Group anchored at a fixed world position.
    // The camera moves around it — the group appears stationary in the scene.
    //
    // Phase 2: clear this group's children and add the loaded GLB BIM model:
    //   this._pivot.clear();
    //   this._pivot.add(bimModel);
    //   this._pivot.position.copy(spatialAnchorWorldPos);
    this._pivot = new THREE.Group();
    this._pivot.name = 'bim-anchor-pivot';

    // Place 2 m in front of and 0.5 m below the initial camera origin.
    // This ensures the geometry is immediately visible before any pose data.
    this._pivot.position.set(0, -0.5, -2);
    this.scene.add(this._pivot);

    // ── Wireframe bounding box (2 × 2 × 2 m) ─────────────────────────────
    // Represents the footprint of a future BIM element.
    // DIGIARCH 424 electric green: #39e83e
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    const boxHelper = new THREE.BoxHelper(boxMesh, 0x39e83e);
    boxHelper.name = 'bim-box-helper';
    this._pivot.add(boxHelper);

    // ── Axes helper (1 m arms) ────────────────────────────────────────────
    // X = red, Y = green, Z = blue — confirms world-space orientation
    const axes = new THREE.AxesHelper(1);
    axes.name = 'axes-helper';
    this._pivot.add(axes);

    // ── Anchor sphere ─────────────────────────────────────────────────────
    // Small solid sphere at the group origin — visible from any angle.
    // Marks the spatial anchor point that Phase 2 will persist via MapSet.
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      new THREE.MeshStandardMaterial({
        color:     0x39e83e,
        roughness: 0.3,
        metalness: 0.1,
        emissive:  0x194d1e,
      })
    );
    sphere.name = 'anchor-sphere';
    this._pivot.add(sphere);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup — VPS status badge
  // ─────────────────────────────────────────────────────────────────────────

  _setupStatusBadge() {
    const el = document.createElement('div');
    el.id = 'vps-overlay-status';
    Object.assign(el.style, {
      position:      'absolute',
      bottom:        '16px',
      left:          '16px',
      background:    'rgba(4,13,26,0.80)',
      color:         '#fbbf24',
      fontFamily:    '"JetBrains Mono",monospace',
      fontSize:      '12px',
      lineHeight:    '1.5',
      padding:       '5px 10px',
      borderRadius:  '5px',
      border:        '0.5px solid #fbbf24',
      zIndex:        '20',
      pointerEvents: 'none',
      letterSpacing: '0.03em',
      userSelect:    'none',
    });
    el.textContent = 'VPS — waiting for pose';
    this.container.appendChild(el);
    this._statusEl = el;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render loop
  // ─────────────────────────────────────────────────────────────────────────

  _renderFrame() {
    if (!this._running) return;

    // Queue next frame first — ensures the loop continues even if an error
    // occurs in the body below.
    this._rafId = requestAnimationFrame(() => this._renderFrame());

    const _delta = this._clock.getDelta(); // seconds — available for Phase 2 animations

    // Update camera position + orientation from sender VPS data
    this._syncToVPSPose();

    // ── Phase 2 extension point — depth prepass ───────────────────────────
    //
    // When the BIM occlusion shader is added (Phase 2 Track 3), insert here:
    //
    //   // 1. Render depth-only pass into a RenderTarget
    //   this.renderer.setRenderTarget(this._depthRenderTarget);
    //   this.renderer.render(this._depthScene, this.camera);
    //   this.renderer.setRenderTarget(null);
    //
    //   // 2. Bind the depth texture as a uniform on the BIM material
    //   this._bimMaterial.uniforms.uDepth.value = this._depthRenderTarget.depthTexture;
    //
    // This approach relies on the SINGLE renderer instance created in
    // _setupRenderer(). Adding a second renderer here will break Phase 2.
    // ─────────────────────────────────────────────────────────────────────

    // Main scene render (transparent over video)
    this.renderer.render(this.scene, this.camera);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VPS pose → camera transform
  // ─────────────────────────────────────────────────────────────────────────

  _syncToVPSPose() {
    // window._lastVPSPose is written by the viewer's data-channel onmessage
    // handler (see viewer.html patch and location.js patch).
    // Shape: { position:{x,y,z}, orientation:{pitch,roll,yaw}, confidence, timestamp }
    const pose = window._lastVPSPose;

    if (!pose) {
      this._setStatus('VPS — waiting for pose', false);
      return;
    }

    if (pose.confidence < MIN_CONFIDENCE) {
      this._setStatus(`VPS — localising  ${Math.round(pose.confidence * 100)}%`, false);
      return;
    }

    // ── Position ──────────────────────────────────────────────────────────
    // WebXR (local-floor) and Three.js share the same coordinate convention:
    //   +X right, +Y up, +Z toward viewer (right-handed).
    // Direct mapping — no axis flip required.
    this.camera.position.set(
      pose.position.x,
      pose.position.y,
      pose.position.z
    );

    // ── Orientation ───────────────────────────────────────────────────────
    // Euler order 'YXZ': yaw (Y) applied first, then pitch (X), then roll (Z).
    // This is the standard HPR (heading-pitch-roll) order from IMU data and
    // matches the convention used by WebXRProvider._tick().
    this.camera.rotation.set(
      THREE.MathUtils.degToRad(pose.orientation.pitch),
      THREE.MathUtils.degToRad(pose.orientation.yaw),
      THREE.MathUtils.degToRad(pose.orientation.roll),
      'YXZ'
    );

    const conf    = Math.round(pose.confidence * 100);
    const quality = pose.confidence >= 0.85 ? '✓' : '~';
    const { x, y, z } = pose.position;

    this._setStatus(
      `VPS ${quality} ${conf}%  ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)} m`,
      true
    );
  }

  _setStatus(text, localised) {
    if (!this._statusEl) return;
    const colour = localised ? '#39e83e' : '#fbbf24';
    this._statusEl.textContent = text;
    this._statusEl.style.color       = colour;
    this._statusEl.style.borderColor = colour;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resize
  // ─────────────────────────────────────────────────────────────────────────

  _attachResizeObserver() {
    // ResizeObserver fires when the container itself resizes, not just the window.
    // More reliable than window 'resize' when the layout has collapsible panels.
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObs = new ResizeObserver(() => this._onResize());
      this._resizeObs.observe(this.container);
    } else {
      window.addEventListener('resize', () => this._onResize());
    }
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
