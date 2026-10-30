import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Color, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, AdditiveBlending,
  SphereGeometry, Mesh, TorusGeometry, MeshBasicMaterial, FrontSide, BackSide, MathUtils, Vector3, IcosahedronGeometry, LineSegments, EdgesGeometry, LineBasicMaterial,
} from 'three';

const canvas = document.getElementById('hero3d');
if (canvas) {
  try { boot(canvas); } catch (e) { canvas.style.display = 'none'; console.warn('3D disabled:', e.message); }
}

function boot(canvas) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 760;
  const renderer = new WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 12.5);

  const root = new Group(); scene.add(root);
  const globe = new Group(); root.add(globe);

  // ---- dotted globe
  const N = small ? 1400 : 3200, R = 2.35;
  const pos = [], seed = [], col = [];
  const c1 = new Color('#34d399'), c2 = new Color('#f5b301'), c3 = new Color('#60a5fa');
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
    pos.push(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R);
    seed.push(Math.random());
    const t = (y + 1) / 2, c = t < 0.5 ? c1.clone().lerp(c3, t * 2) : c3.clone().lerp(c2, (t - 0.5) * 2);
    col.push(c.r, c.g, c.b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const dotMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: Math.min(devicePixelRatio, 2) }, uSize: { value: small ? 2.6 : 3.2 } },
    vertexShader: `attribute float aSeed; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uTime,uPx,uSize;
      void main(){ vC=color; vec3 p=position; float w=sin(uTime*1.3+aSeed*30.0)*.5+.5; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      float facing = smoothstep(-.35,.8,(modelMatrix*vec4(normalize(p),0.)).z);
      vA=.25+.75*facing; gl_PointSize=uSize*uPx*(.7+w*.9)*(13.0/-mv.z); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=smoothstep(.5,.0,d); gl_FragColor=vec4(vC,a*vA); }`,
  });
  globe.add(new Points(g, dotMat));

  // inner glow shell
  const glow = new Mesh(new SphereGeometry(R * 0.985, 48, 48), new ShaderMaterial({
    transparent: true, depthWrite: false, side: FrontSide,
    uniforms: { uC: { value: new Color('#0f3ea8') } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uC; void main(){ float f=1.-max(dot(vN,vV),0.); gl_FragColor=vec4(uC, pow(f,2.6)*.45+.03); }`,
  }));
  globe.add(glow);
  const halo = new Mesh(new SphereGeometry(R * 1.18, 48, 48), new ShaderMaterial({
    transparent: true, depthWrite: false, side: BackSide, blending: AdditiveBlending,
    uniforms: { uC: { value: new Color('#2f6bff') } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uC; void main(){ float f=pow(max(dot(-vN,vV),0.),3.5); gl_FragColor=vec4(uC,f*.5); }`,
  }));
  root.add(halo);

  // wire icosahedron for depth
  const wire = new LineSegments(new EdgesGeometry(new IcosahedronGeometry(R * 1.45, 1)), new LineBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.18 }));
  root.add(wire);

  // ---- tricolor orbit rings with satellites
  const rings = [];
  [['#ff9933', 3.35, 0.03, [1.15, 0.2, 0]], ['#ffffff', 3.75, 0.022, [-0.5, 0.3, 0.8]], ['#13a463', 4.15, 0.03, [0.35, -0.4, -0.5]]].forEach(([c, rad, tube, rot], i) => {
    const grp = new Group(); grp.rotation.set(...rot);
    grp.add(new Mesh(new TorusGeometry(rad, tube, 12, 160), new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })));
    const sat = new Mesh(new SphereGeometry(0.11 + i * 0.015, 20, 20), new MeshBasicMaterial({ color: c }));
    const sg = new Mesh(new SphereGeometry(0.26, 20, 20), new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }));
    sat.add(sg); grp.add(sat);
    root.add(grp); rings.push({ grp, sat, rad, speed: 0.35 + i * 0.17, ph: i * 2.1, spin: 0.05 + i * 0.03 });
  });

  // ---- star field
  const SN = small ? 500 : 1400, sp = [];
  for (let i = 0; i < SN; i++) {
    const v = new Vector3().randomDirection().multiplyScalar(7 + Math.random() * 16);
    sp.push(v.x * 1.5, v.y, v.z - 4);
  }
  const sg = new BufferGeometry(); sg.setAttribute('position', new Float32BufferAttribute(sp, 3));
  const stars = new Points(sg, new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uPx: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `uniform float uPx; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uPx*(1.4+fract(position.x*7.3)*1.8); }`,
    fragmentShader: `void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(.8,.88,1.,smoothstep(.5,0.,d)*.7); }`,
  }));
  scene.add(stars);

  // ---- layout
  let W = 0, H = 0;
  const resize = () => {
    const r = canvas.parentElement.getBoundingClientRect(); W = r.width; H = r.height;
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75)); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    root.position.set(0, 0, 0);
    root.scale.setScalar(Math.min(1, (W / H) * 1.05));
  };
  resize(); addEventListener('resize', resize);

  // ---- interaction
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  let scrollP = 0;
  addEventListener('scroll', () => { scrollP = MathUtils.clamp(scrollY / (H || 800), 0, 1.4); }, { passive: true });

  let visible = true, last = performance.now(), t = 0;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { last = performance.now(); loop(); } }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) { last = performance.now(); loop(); } });

  let running = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
    globe.rotation.y += dt * 0.16;
    globe.rotation.x = 0.28 + mouse.y * 0.14;
    root.rotation.y = mouse.x * 0.18;
    wire.rotation.y -= dt * 0.04; wire.rotation.x += dt * 0.02;
    dotMat.uniforms.uTime.value = t;
    rings.forEach((r) => {
      r.grp.rotation.z += dt * r.spin;
      const a = t * r.speed + r.ph; r.sat.position.set(Math.cos(a) * r.rad, Math.sin(a) * r.rad, 0);
    });
    stars.rotation.y = t * 0.012 + mouse.x * 0.03; stars.rotation.x = mouse.y * 0.02;
    camera.position.x = mouse.x * 0.35; camera.position.y = -mouse.y * 0.25; camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function loop() {
    if (running) return; running = true;
    const tick = (now) => { if (!visible || document.hidden) { running = false; return; } frame(now); if (reduce) { running = false; return; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  frame(performance.now()); loop();
  canvas.dataset.ready = '1';
}
