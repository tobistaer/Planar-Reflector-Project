const canvas = document.getElementById('c');
const btnBounce = document.getElementById('btnBounce');
const btnLight  = document.getElementById('btnLight');
const btnShadowView = document.getElementById('btnShadowView');

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('WebGPU not available');
const device  = await adapter.requestDevice();
const ctx     = canvas.getContext('webgpu');
const format  = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });
// Adds transparency on the ground to blend the reflected teapot with the surface.
const shadowMapSize = 1024;
const shadowBias = 0.003;
const reflectionPlaneY = -1.0;

const I4 = () => { const m = new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; };
function mat4Mul(a,b){
  const o = new Float32Array(16);
  for (let r=0;r<4;r++) for (let c=0;c<4;c++)
    o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] +
               a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
  return o;
}
function T(x,y,z){ const m=I4(); m[12]=x; m[13]=y; m[14]=z; return m; }
function S(x,y,z){ const m=I4(); m[0]=x; m[5]=y; m[10]=z; return m; }
function reflectionY(yPlane){
  const m = I4();
  m[5] = -1;
  m[13] = 2*yPlane;
  return m;
}
function perspectiveFovY(fovy, aspect, near, far){
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  const m=new Float32Array(16);
  m[0]=f/aspect; m[5]=f;
  m[10]=(far+near)*nf;
  m[11]=-1;
  m[14]=2*far*near*nf;
  return m;
}
function lookAt(e,c,u){
  const[ex,ey,ez]=e,[cx,cy,cz]=c,[ux,uy,uz]=u;
  let zx=ex-cx, zy=ey-cy, zz=ez-cz;
  { const l=1/Math.hypot(zx,zy,zz); zx*=l; zy*=l; zz*=l; }
  let xx=uy*zz-uz*zy, xy=uz*zx-ux*zz, xz=ux*zy-uy*zx;
  { const l=1/Math.hypot(xx,xy,xz); xx*=l; xy*=l; xz*=l; }
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  const m=I4();
  m[0]=xx; m[4]=xy; m[8]=xz;
  m[1]=yx; m[5]=yy; m[9]=yz;
  m[2]=zx; m[6]=zy; m[10]=zz;
  m[12]=-(xx*ex+xy*ey+xz*ez);
  m[13]=-(yx*ex+yy*ey+yz*ez);
  m[14]=-(zx*ex+zy*ey+zz*ez);
  return m;
}
function mat4Transpose(m){
  const t=new Float32Array(16);
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) t[c*4+r]=m[r*4+c];
  return t;
}
function mat4Inverse(a){
  const b=new Float32Array(16); b.set(a);
  const inv=new Float32Array(16);
  inv[0] =   b[5]*b[10]*b[15] - b[5]*b[11]*b[14] - b[9]*b[6]*b[15] + b[9]*b[7]*b[14] + b[13]*b[6]*b[11] - b[13]*b[7]*b[10];
  inv[4] =  -b[4]*b[10]*b[15] + b[4]*b[11]*b[14] + b[8]*b[6]*b[15] - b[8]*b[7]*b[14] - b[12]*b[6]*b[11] + b[12]*b[7]*b[10];
  inv[8] =   b[4]*b[9]*b[15]  - b[4]*b[11]*b[13] - b[8]*b[5]*b[15] + b[8]*b[7]*b[13] + b[12]*b[5]*b[11] - b[12]*b[7]*b[9];
  inv[12] = -b[4]*b[9]*b[14]  + b[4]*b[10]*b[13] + b[8]*b[5]*b[14] - b[8]*b[6]*b[13] - b[12]*b[5]*b[10] + b[12]*b[6]*b[9];
  inv[1] =  -b[1]*b[10]*b[15] + b[1]*b[11]*b[14] + b[9]*b[2]*b[15] - b[9]*b[3]*b[14] - b[13]*b[2]*b[11] + b[13]*b[3]*b[10];
  inv[5] =   b[0]*b[10]*b[15] - b[0]*b[11]*b[14] - b[8]*b[2]*b[15] + b[8]*b[3]*b[14] + b[12]*b[2]*b[11] - b[12]*b[3]*b[10];
  inv[9] =  -b[0]*b[9]*b[15]  + b[0]*b[11]*b[13] + b[8]*b[1]*b[15] - b[8]*b[3]*b[13] - b[12]*b[1]*b[11] + b[12]*b[3]*b[9];
  inv[13] =  b[0]*b[9]*b[14]  - b[0]*b[10]*b[13] - b[8]*b[1]*b[14] + b[8]*b[2]*b[13] + b[12]*b[1]*b[10] - b[12]*b[2]*b[9];
  inv[2] =   b[1]*b[6]*b[15]  - b[1]*b[7]*b[14] - b[5]*b[2]*b[15] + b[5]*b[3]*b[14] + b[13]*b[2]*b[7] - b[13]*b[3]*b[6];
  inv[6] =  -b[0]*b[6]*b[15]  + b[0]*b[7]*b[14] + b[4]*b[2]*b[15] - b[4]*b[3]*b[14] - b[12]*b[2]*b[7] + b[12]*b[3]*b[6];
  inv[10] =  b[0]*b[5]*b[15]  - b[0]*b[7]*b[13] - b[4]*b[1]*b[15] + b[4]*b[3]*b[13] + b[12]*b[1]*b[7] - b[12]*b[3]*b[5];
  inv[14] = -b[0]*b[5]*b[14]  + b[0]*b[6]*b[13] + b[4]*b[1]*b[14] - b[4]*b[2]*b[13] - b[12]*b[1]*b[6] + b[12]*b[2]*b[5];
  inv[3] =  -b[1]*b[6]*b[11] + b[1]*b[7]*b[10] + b[5]*b[2]*b[11] - b[5]*b[3]*b[10] - b[9]*b[2]*b[7] + b[9]*b[3]*b[6];
  inv[7] =   b[0]*b[6]*b[11] - b[0]*b[7]*b[10] - b[4]*b[2]*b[11] + b[4]*b[3]*b[10] + b[8]*b[2]*b[7] - b[8]*b[3]*b[6];
  inv[11] = -b[0]*b[5]*b[11] + b[0]*b[7]*b[9]  + b[4]*b[1]*b[11] - b[4]*b[3]*b[9]  - b[8]*b[1]*b[7] + b[8]*b[3]*b[5];
  inv[15] =  b[0]*b[5]*b[10] - b[0]*b[6]*b[9]  - b[4]*b[1]*b[10] + b[4]*b[2]*b[9]  + b[8]*b[1]*b[6] - b[8]*b[2]*b[5];
  let det = b[0]*inv[0] + b[1]*inv[4] + b[2]*inv[8] + b[3]*inv[12];
  det = 1/det;
  for(let i=0;i<16;i++) inv[i]*=det;
  return inv;
}
function transformPoint(m,[x,y,z]){
  const nx = m[0]*x + m[4]*y + m[8]*z  + m[12];
  const ny = m[1]*x + m[5]*y + m[9]*z  + m[13];
  const nz = m[2]*x + m[6]*y + m[10]*z + m[14];
  const nw = m[3]*x + m[7]*y + m[11]*z + m[15];
  const invW = nw ? 1/nw : 1;
  return [nx*invW, ny*invW, nz*invW];
}

const scaleQuarter = S(0.25,0.25,0.25);
const groundModel = I4();
const groundNormalMatrix = I4();
const reflectionMatrix = reflectionY(reflectionPlaneY);

function makeBuffer(data, usage){
  const buffer = device.createBuffer({
    size: ((data.byteLength+3)&~3),
    usage
  });
  device.queue.writeBuffer(buffer,0,data);
  return buffer;
}

async function loadTexture(url){
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion:'none' });
  const texture = device.createTexture({
    size:{width:bitmap.width, height:bitmap.height},
    format:'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_DST |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source:bitmap },
    { texture },
    { width:bitmap.width, height:bitmap.height }
  );
  return texture;
}

const groundPos = new Float32Array([
  -2,-1,-2,1,
   2,-1,-2,1,
  -2,-1,-6,1,
  -2,-1,-6,1,
   2,-1,-2,1,
   2,-1,-6,1,
]);
const groundUV = new Float32Array([
  0,0,
  1,0,
  0,1,
  0,1,
  1,0,
  1,1,
]);
const groundNormals = new Float32Array(new Array(6).fill(0).flatMap(()=>[0,1,0]));
const groundVertexCount = groundPos.length / 4;

const groundPosBuf    = makeBuffer(groundPos, GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);
const groundUVBuf     = makeBuffer(groundUV, GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);
const groundNormalBuf = makeBuffer(groundNormals, GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);

const sampler = device.createSampler({
  addressModeU:'repeat',
  addressModeV:'repeat',
  magFilter:'linear',
  minFilter:'linear'
});
const shadowSampler = device.createSampler({
  addressModeU:'clamp-to-edge',
  addressModeV:'clamp-to-edge',
  magFilter:'nearest',
  minFilter:'nearest'
});

const groundTexture = await loadTexture('../xamp23.png');

const teapotInfo = await readOBJFile('../models/teapot.obj', 1.0, false);
if (!teapotInfo) throw new Error('Failed to load teapot OBJ');

const teapotPosBuf = makeBuffer(teapotInfo.vertices, GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);
const teapotNrmBuf = makeBuffer(teapotInfo.normals,  GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);
const teapotIdxBuf = makeBuffer(teapotInfo.indices,  GPUBufferUsage.INDEX |GPUBufferUsage.COPY_DST);

const shadowMapTexture = device.createTexture({
  size:{ width:shadowMapSize, height:shadowMapSize },
  format:'rgba32float',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
});
const shadowMapRenderView = shadowMapTexture.createView();
const shadowMapSampleView = shadowMapTexture.createView();

const shadowDepthTexture = device.createTexture({
  size:{ width:shadowMapSize, height:shadowMapSize },
  format:'depth24plus',
  usage:GPUTextureUsage.RENDER_ATTACHMENT,
});
const shadowDepthView = shadowDepthTexture.createView();

const shaderCode = await (await fetch('./parp02.wgsl?v=ref2')).text();
const shaderModule = device.createShaderModule({ code: shaderCode });

const litLayout = device.createBindGroupLayout({
  entries:[
    { binding:0, visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT, buffer:{ type:'uniform' } },
    { binding:1, visibility:GPUShaderStage.FRAGMENT, sampler:{ type:'filtering' } },
    { binding:2, visibility:GPUShaderStage.FRAGMENT, texture:{ sampleType:'float' } },
    { binding:3, visibility:GPUShaderStage.FRAGMENT, sampler:{ type:'non-filtering' } },
    { binding:4, visibility:GPUShaderStage.FRAGMENT, texture:{ sampleType:'unfilterable-float' } },
  ]
});

const groundPipeline = await device.createRenderPipelineAsync({
  layout: device.createPipelineLayout({ bindGroupLayouts:[litLayout] }),
  vertex:{
    module:shaderModule,
    entryPoint:'vsGround',
    buffers:[
      { arrayStride:16, attributes:[{ shaderLocation:0, offset:0, format:'float32x3' }] },
      { arrayStride:8,  attributes:[{ shaderLocation:1, offset:0, format:'float32x2' }] },
      { arrayStride:12, attributes:[{ shaderLocation:2, offset:0, format:'float32x3' }] },
    ]
  },
  fragment:{
    module:shaderModule,
    entryPoint:'fsGround',
    targets:[{
      format,
      blend:{
        color:{ srcFactor:'src-alpha', dstFactor:'one-minus-src-alpha', operation:'add' },
        alpha:{ srcFactor:'one',       dstFactor:'one-minus-src-alpha', operation:'add' },
      },
    }],
  },
  primitive:{ topology:'triangle-list', cullMode:'back' },
  depthStencil:{
    format:'depth24plus',
    depthWriteEnabled:false,
    depthCompare:'less-equal',
  },
});

const teapotPipeline = await device.createRenderPipelineAsync({
  layout: device.createPipelineLayout({ bindGroupLayouts:[litLayout] }),
  vertex:{
    module:shaderModule,
    entryPoint:'vsTeapot',
    buffers:[
      { arrayStride:16, attributes:[{ shaderLocation:0, offset:0, format:'float32x4' }] },
      { arrayStride:16, attributes:[{ shaderLocation:1, offset:0, format:'float32x4' }] },
    ]
  },
  fragment:{
    module:shaderModule,
    entryPoint:'fsTeapot',
    targets:[{ format }],
  },
  primitive:{ topology:'triangle-list', cullMode:'back', frontFace:'ccw' },
  depthStencil:{ format:'depth24plus', depthWriteEnabled:true, depthCompare:'less' },
});

const reflectedTeapotPipeline = await device.createRenderPipelineAsync({
  layout: device.createPipelineLayout({ bindGroupLayouts:[litLayout] }),
  vertex:{
    module:shaderModule,
    entryPoint:'vsTeapot',
    buffers:[
      { arrayStride:16, attributes:[{ shaderLocation:0, offset:0, format:'float32x4' }] },
      { arrayStride:16, attributes:[{ shaderLocation:1, offset:0, format:'float32x4' }] },
    ]
  },
  fragment:{
    module:shaderModule,
    entryPoint:'fsTeapot',
    targets:[{ format }],
  },
  primitive:{ topology:'triangle-list', cullMode:'back', frontFace:'cw' },
  depthStencil:{ format:'depth24plus', depthWriteEnabled:true, depthCompare:'less' },
});

const emptyLayout = device.createBindGroupLayout({ entries:[] });
const shadowLayout = device.createBindGroupLayout({
  entries:[
    { binding:0, visibility:GPUShaderStage.VERTEX, buffer:{ type:'uniform' } },
  ]
});
const shadowPipeline = await device.createRenderPipelineAsync({
  layout: device.createPipelineLayout({ bindGroupLayouts:[emptyLayout, shadowLayout] }),
  vertex:{
    module:shaderModule,
    entryPoint:'vsShadow',
    buffers:[
      { arrayStride:16, attributes:[{ shaderLocation:0, offset:0, format:'float32x4' }] },
    ]
  },
  fragment:{
    module:shaderModule,
    entryPoint:'fsShadow',
    targets:[{ format:'rgba32float' }],
  },
  primitive:{ topology:'triangle-list', cullMode:'back' },
  depthStencil:{ format:'depth24plus', depthWriteEnabled:true, depthCompare:'less' },
});

const groundUBO          = device.createBuffer({ size:320, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
const teapotUBO          = device.createBuffer({ size:320, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
const reflectedTeapotUBO = device.createBuffer({ size:320, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
const shadowTeapotUBO    = device.createBuffer({ size:128, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });

const groundBindGroup = device.createBindGroup({
  layout:litLayout,
  entries:[
    { binding:0, resource:{ buffer:groundUBO } },
    { binding:1, resource:sampler },
    { binding:2, resource:groundTexture.createView() },
    { binding:3, resource:shadowSampler },
    { binding:4, resource:shadowMapSampleView },
  ]
});
const teapotBindGroup = device.createBindGroup({
  layout:litLayout,
  entries:[
    { binding:0, resource:{ buffer:teapotUBO } },
    { binding:1, resource:sampler },
    { binding:2, resource:groundTexture.createView() },
    { binding:3, resource:shadowSampler },
    { binding:4, resource:shadowMapSampleView },
  ]
});
const reflectedTeapotBindGroup = device.createBindGroup({
  layout:litLayout,
  entries:[
    { binding:0, resource:{ buffer:reflectedTeapotUBO } },
    { binding:1, resource:sampler },
    { binding:2, resource:groundTexture.createView() },
    { binding:3, resource:shadowSampler },
    { binding:4, resource:shadowMapSampleView },
  ]
});
const shadowTeapotBindGroup = device.createBindGroup({
  layout:shadowLayout,
  entries:[
    { binding:0, resource:{ buffer:shadowTeapotUBO } },
  ]
});

const eye    = [0.0, 0.0, 1.0];
const center = [0.0, 0.0, -3.0];
const up     = [0,1,0];

const lightTarget = [0, -0.6, -3.0];
const lightUp     = [0,1,0];
const lightProj   = perspectiveFovY(60 * Math.PI/180, 1.0, 0.2, 20.0);

const shadowParams = new Float32Array([shadowBias, 1/shadowMapSize, 0, 0]);

let viewProj = I4();
function updateViewProj(){
  const aspect = canvas.width / canvas.height;
  const proj   = perspectiveFovY(65 * Math.PI/180, aspect, 0.1, 100.0);
  const view   = lookAt(eye, center, up);
  viewProj = mat4Mul(proj, view);
}
updateViewProj();

let bounceEnabled    = true;
let lightOrbitEnabled = true;
let debugShadowView  = false;
let bouncePhase      = 0;
let lightAngle       = 0;
let lastTime         = 0;

btnBounce.addEventListener('click', () => {
  bounceEnabled = !bounceEnabled;
  btnBounce.textContent = bounceEnabled ? 'Disable bounce' : 'Enable bounce';
});
btnLight.addEventListener('click', () => {
  lightOrbitEnabled = !lightOrbitEnabled;
  btnLight.textContent = lightOrbitEnabled ? 'Disable light orbit' : 'Enable light orbit';
});
btnShadowView.addEventListener('click', () => {
  debugShadowView = !debugShadowView;
  btnShadowView.textContent = debugShadowView ? 'Show shaded scene' : 'Show depth map';
});

let depthTex = device.createTexture({
  size:{width:canvas.width,height:canvas.height},
  format:'depth24plus',
  usage:GPUTextureUsage.RENDER_ATTACHMENT
});

function resizeIfNeeded(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth  = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const displayHeight = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== displayWidth || canvas.height !== displayHeight){
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    depthTex.destroy();
    depthTex = device.createTexture({
      size:{width:displayWidth,height:displayHeight},
      format:'depth24plus',
      usage:GPUTextureUsage.RENDER_ATTACHMENT
    });
    updateViewProj();
  }
}

function computeBounce(dt){
  if (bounceEnabled) bouncePhase += dt * 2.0;
  const minY = -1.0, maxY = 0.0;
  const t = 0.5 * (Math.sin(bouncePhase) + 1);
  return minY + (maxY - minY) * t;
}

function updateButtons(){
  btnBounce.textContent     = bounceEnabled    ? 'Disable bounce' : 'Enable bounce';
  btnLight.textContent      = lightOrbitEnabled ? 'Disable light orbit' : 'Enable light orbit';
  btnShadowView.textContent = debugShadowView ? 'Show shaded scene' : 'Show depth map';
}
updateButtons();

function frame(ts){
  resizeIfNeeded();
  if (!lastTime) lastTime = ts;
  const dt = (ts - lastTime) * 0.001;
  lastTime = ts;

  if (lightOrbitEnabled) lightAngle += dt * 0.7;
  const lightCenter = [0, 2.5, -2];
  const lightRadius = 2.5;
  const lightPos = [
    lightCenter[0] + lightRadius * Math.cos(lightAngle),
    lightCenter[1],
    lightCenter[2] + lightRadius * Math.sin(lightAngle),
  ];
  const lightViewProj = mat4Mul(lightProj, lookAt(lightPos, lightTarget, lightUp));
  const lightPosVec   = new Float32Array([...lightPos, 1]);

  const bounceY = computeBounce(dt);
  const teapotModel = mat4Mul(T(0, bounceY, -3), scaleQuarter);
  const normalMatrix = mat4Transpose(mat4Inverse(teapotModel));
  const reflectedModel = mat4Mul(reflectionMatrix, teapotModel);
  const reflectedNormalMatrix = mat4Transpose(mat4Inverse(reflectedModel));

  const reflectedLight = transformPoint(reflectionMatrix, lightPos);
  const reflectedEye   = transformPoint(reflectionMatrix, eye);
  const reflectedLightVec = new Float32Array([...reflectedLight, 1]);
  const reflectedEyeVec   = new Float32Array([...reflectedEye, 1]);

  shadowParams[2] = debugShadowView ? 1 : 0;

  device.queue.writeBuffer(groundUBO, 0,   viewProj);
  device.queue.writeBuffer(groundUBO, 64,  groundModel);
  device.queue.writeBuffer(groundUBO, 128, groundNormalMatrix);
  device.queue.writeBuffer(groundUBO, 192, lightViewProj);
  device.queue.writeBuffer(groundUBO, 256, lightPosVec);
  device.queue.writeBuffer(groundUBO, 272, new Float32Array([...eye, 1]));
  device.queue.writeBuffer(groundUBO, 288, shadowParams);

  device.queue.writeBuffer(teapotUBO, 0,   viewProj);
  device.queue.writeBuffer(teapotUBO, 64,  teapotModel);
  device.queue.writeBuffer(teapotUBO, 128, normalMatrix);
  device.queue.writeBuffer(teapotUBO, 192, lightViewProj);
  device.queue.writeBuffer(teapotUBO, 256, lightPosVec);
  device.queue.writeBuffer(teapotUBO, 272, new Float32Array([...eye, 1]));
  device.queue.writeBuffer(teapotUBO, 288, shadowParams);

  device.queue.writeBuffer(reflectedTeapotUBO, 0,   viewProj);
  device.queue.writeBuffer(reflectedTeapotUBO, 64,  reflectedModel);
  device.queue.writeBuffer(reflectedTeapotUBO, 128, reflectedNormalMatrix);
  device.queue.writeBuffer(reflectedTeapotUBO, 192, lightViewProj);
  device.queue.writeBuffer(reflectedTeapotUBO, 256, reflectedLightVec);
  device.queue.writeBuffer(reflectedTeapotUBO, 272, reflectedEyeVec);
  device.queue.writeBuffer(reflectedTeapotUBO, 288, shadowParams);

  device.queue.writeBuffer(shadowTeapotUBO, 0,  lightViewProj);
  device.queue.writeBuffer(shadowTeapotUBO, 64, teapotModel);

  const encoder = device.createCommandEncoder();

  const shadowPass = encoder.beginRenderPass({
    colorAttachments:[{
      view: shadowMapRenderView,
      loadOp:'clear',
      storeOp:'store',
      clearValue:{ r:1, g:1, b:1, a:1 },
    }],
    depthStencilAttachment:{
      view: shadowDepthView,
      depthLoadOp:'clear',
      depthStoreOp:'store',
      depthClearValue:1,
    }
  });
  shadowPass.setPipeline(shadowPipeline);
  shadowPass.setBindGroup(1, shadowTeapotBindGroup);
  shadowPass.setVertexBuffer(0, teapotPosBuf);
  shadowPass.setIndexBuffer(teapotIdxBuf, 'uint32');
  shadowPass.drawIndexed(teapotInfo.indices.length);
  shadowPass.end();

  const colorView = ctx.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments:[{
      view: colorView,
      loadOp:'clear',
      storeOp:'store',
      clearValue:{ r:0.1, g:0.12, b:0.16, a:1 },
    }],
    depthStencilAttachment:{
      view: depthTex.createView(),
      depthLoadOp:'clear',
      depthStoreOp:'store',
      depthClearValue:1,
    }
  });

  pass.setPipeline(reflectedTeapotPipeline);
  pass.setBindGroup(0, reflectedTeapotBindGroup);
  pass.setVertexBuffer(0, teapotPosBuf);
  pass.setVertexBuffer(1, teapotNrmBuf);
  pass.setIndexBuffer(teapotIdxBuf, 'uint32');
  pass.drawIndexed(teapotInfo.indices.length);

  // Transparent ground blends the reflection with the surface color.
  pass.setPipeline(groundPipeline);
  pass.setBindGroup(0, groundBindGroup);
  pass.setVertexBuffer(0, groundPosBuf);
  pass.setVertexBuffer(1, groundUVBuf);
  pass.setVertexBuffer(2, groundNormalBuf);
  pass.draw(groundVertexCount);

  pass.setPipeline(teapotPipeline);
  pass.setBindGroup(0, teapotBindGroup);
  pass.setVertexBuffer(0, teapotPosBuf);
  pass.setVertexBuffer(1, teapotNrmBuf);
  pass.setIndexBuffer(teapotIdxBuf, 'uint32');
  pass.drawIndexed(teapotInfo.indices.length);

  pass.end();
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
