// Shared shader for teapot + ground, including a simple shadow-map lookup.
struct ObjectUniforms {
  viewProj      : mat4x4<f32>,
  model         : mat4x4<f32>,
  normalMatrix  : mat4x4<f32>,
  lightViewProj : mat4x4<f32>,
  lightPosition : vec4<f32>,
  eyePosition   : vec4<f32>,
  // shadowParams.x = depth bias (fight acne)
  // shadowParams.y = 1 / shadowMapSize (texel size)
  // shadowParams.z = debug flag (show depth map)
  shadowParams  : vec4<f32>,
};

@group(0) @binding(0) var<uniform> uBO : ObjectUniforms;
@group(0) @binding(1) var baseSampler : sampler;
@group(0) @binding(2) var baseTex     : texture_2d<f32>;
@group(0) @binding(3) var shadowSampler : sampler;
@group(0) @binding(4) var shadowTex     : texture_2d<f32>;

struct GroundVSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv        : vec2<f32>,
  @location(1) worldPos  : vec3<f32>,
  @location(2) normal    : vec3<f32>,
};

@vertex
fn vsGround(@location(0) pos : vec3<f32>,
            @location(1) uv  : vec2<f32>,
            @location(2) nrm : vec3<f32>) -> GroundVSOut {
  var out : GroundVSOut;
  let world = uBO.model * vec4<f32>(pos, 1.0);
  out.clip = uBO.viewProj * world;
  out.uv = uv;
  out.worldPos = world.xyz;
  out.normal = normalize((uBO.normalMatrix * vec4<f32>(nrm, 0.0)).xyz);
  return out;
}

fn sampleShadow(worldPos : vec3<f32>) -> f32 {
  let clip = uBO.lightViewProj * vec4<f32>(worldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  // WebGPU NDC: z in [0..1]. Convert x/y from [-1..1] to [0..1] and flip y for texture coords.
  let depth = ndc.z;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if(depth < 0.0 || depth > 1.0) {
    // Outside the light frustum => consider it lit.
    return 1.0;
  }
  if(any(uv < vec2<f32>(0.0, 0.0)) || any(uv > vec2<f32>(1.0, 1.0))) {
    // Outside the shadow map => consider it lit.
    return 1.0;
  }

  // Small PCF kernel:
  // We average multiple depth compares to soften aliasing and reduce tiny "light leak" gaps
  // caused by undersampling at shadow edges.
  let bias = uBO.shadowParams.x;
  let texel = vec2<f32>(uBO.shadowParams.y, uBO.shadowParams.y);

  var sum = 0.0;
  for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
    for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
      let uvO = uv + vec2<f32>(f32(ox), f32(oy)) * texel;
      let stored = textureSampleLevel(shadowTex, shadowSampler, uvO, 0.0).r;
      sum = sum + select(0.0, 1.0, depth - bias <= stored);
    }
  }
  return sum * (1.0 / 9.0);
}

@fragment
fn fsGround(in : GroundVSOut) -> @location(0) vec4<f32> {
  if(uBO.shadowParams.z > 0.5) {
    // Debug view: show stored shadow-map depth as grayscale.
    let depthView = textureSampleLevel(shadowTex, shadowSampler, in.uv, 0.0).r;
    return vec4<f32>(vec3<f32>(depthView), 1.0);
  }

  let baseColor = textureSample(baseTex, baseSampler, in.uv).rgb;
  let lightDir = normalize(uBO.lightPosition.xyz - in.worldPos);
  let viewDir = normalize(uBO.eyePosition.xyz - in.worldPos);
  let N = normalize(in.normal);
  let diff = max(dot(N, lightDir), 0.0);
  let halfVec = normalize(lightDir + viewDir);
  let spec = pow(max(dot(N, halfVec), 0.0), 16.0);
  let shadow = sampleShadow(in.worldPos);
  let ambient = 0.3;
  let color = baseColor * (ambient + shadow * 0.7 * diff) +
              vec3<f32>(shadow * 0.15 * spec);

  // Alpha < 1 lets the reflection "show through" once the ground is blended in JS.
  let alpha = 0.6;
  return vec4<f32>(color, alpha);
}

struct TeapotVSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) normal   : vec3<f32>,
};

@vertex
fn vsTeapot(@location(0) pos    : vec4<f32>,
            @location(1) normal : vec4<f32>) -> TeapotVSOut {
  var out : TeapotVSOut;
  let world = uBO.model * pos;
  out.clip = uBO.viewProj * world;
  out.worldPos = world.xyz;
  out.normal = normalize((uBO.normalMatrix * vec4<f32>(normal.xyz, 0.0)).xyz);
  return out;
}

@fragment
fn fsTeapot(in : TeapotVSOut) -> @location(0) vec4<f32> {
  let baseColor = vec3<f32>(0.82, 0.82, 0.82);
  let lightDir = normalize(uBO.lightPosition.xyz - in.worldPos);
  let viewDir = normalize(uBO.eyePosition.xyz - in.worldPos);
  let N = normalize(in.normal);
  let diff = max(dot(N, lightDir), 0.0);
  let halfVec = normalize(lightDir + viewDir);
  let spec = pow(max(dot(N, halfVec), 0.0), 32.0);
  let shadow = sampleShadow(in.worldPos);
  let ambient = 0.35;
  let color = baseColor * (ambient + shadow * 0.65 * diff) +
              vec3<f32>(shadow * 0.4 * spec);
  return vec4<f32>(color, 1.0);
}

struct ShadowUniforms {
  lightViewProj : mat4x4<f32>,
  model         : mat4x4<f32>,
};

@group(1) @binding(0) var<uniform> sUBO : ShadowUniforms;

struct ShadowVSOut {
  @builtin(position) clip : vec4<f32>,
};

@vertex
fn vsShadow(@location(0) pos : vec4<f32>) -> ShadowVSOut {
  var out : ShadowVSOut;
  let world = sUBO.model * pos;
  let clip = sUBO.lightViewProj * world;
  out.clip = clip;
  return out;
}

@fragment
fn fsShadow(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
  // Store rasterizer depth (pos.z) so the value we compare against matches what the GPU actually
  // wrote for the triangle, avoiding edge artifacts / "rings" from interpolation mismatches.
  let depth01 = clamp(pos.z, 0.0, 1.0);
  return vec4<f32>(vec3<f32>(depth01), 1.0);
}

// ----------------------------
// Shadow map debug (fullscreen)
// ----------------------------

@group(2) @binding(0) var dbgShadowSampler : sampler;
@group(2) @binding(1) var dbgShadowTex     : texture_2d<f32>;

struct DebugVSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv         : vec2<f32>,
};

@vertex
fn vsDebugShadow(@builtin(vertex_index) vi : u32) -> DebugVSOut {
  // Two triangles covering the screen.
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
  );
  // Texture coordinates: (0,0) is top-left in WebGPU, so flip Y relative to clip-space Y.
  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var out : DebugVSOut;
  out.clip = vec4<f32>(pos[vi], 0.0, 1.0);
  out.uv = uv[vi];
  return out;
}

@fragment
fn fsDebugShadow(in : DebugVSOut) -> @location(0) vec4<f32> {
  let d = textureSampleLevel(dbgShadowTex, dbgShadowSampler, in.uv, 0.0).r;
  return vec4<f32>(vec3<f32>(d), 1.0);
}
