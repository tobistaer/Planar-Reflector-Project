
struct ObjectUniforms {
  viewProj      : mat4x4<f32>,
  model         : mat4x4<f32>,
  normalMatrix  : mat4x4<f32>,
  lightViewProj : mat4x4<f32>,
  lightPosition : vec4<f32>,
  eyePosition   : vec4<f32>,
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
  // Ground is only used as a lit reference surface; reflection is a separate draw call in JS.
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
  // WebGPU NDC: x,y in [-1..1], z in [0..1]. Texture UV has y down, so flip y.
  let depth = ndc.z;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if(depth < 0.0 || depth > 1.0) {
    return 1.0;
  }
  if(any(uv < vec2<f32>(0.0, 0.0)) || any(uv > vec2<f32>(1.0, 1.0))) {
    return 1.0;
  }
  let stored = textureSampleLevel(shadowTex, shadowSampler, uv, 0.0).r;
  return select(0.0, 1.0, depth - uBO.shadowParams.x <= stored);
}

@fragment
fn fsGround(in : GroundVSOut) -> @location(0) vec4<f32> {
  if(uBO.shadowParams.z > 0.5) {
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
  let color = baseColor * (ambient + shadow * 0.7 * diff) + vec3<f32>(shadow * 0.15 * spec);
  return vec4<f32>(color, 1.0);
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
  // Standard Blinn-Phong lit teapot; color reused for both original and reflected draws.
  let baseColor = vec3<f32>(0.82, 0.82, 0.82);
  let lightDir = normalize(uBO.lightPosition.xyz - in.worldPos);
  let viewDir = normalize(uBO.eyePosition.xyz - in.worldPos);
  let N = normalize(in.normal);
  let diff = max(dot(N, lightDir), 0.0);
  let halfVec = normalize(lightDir + viewDir);
  let spec = pow(max(dot(N, halfVec), 0.0), 32.0);
  let shadow = sampleShadow(in.worldPos);
  let ambient = 0.35;
  let color = baseColor * (ambient + shadow * 0.65 * diff) + vec3<f32>(shadow * 0.4 * spec);
  return vec4<f32>(color, 1.0);
}

struct ShadowUniforms {
  lightViewProj : mat4x4<f32>,
  model         : mat4x4<f32>,
};

@group(1) @binding(0) var<uniform> sUBO : ShadowUniforms;

struct ShadowVSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) depth01 : f32,
};

@vertex
fn vsShadow(@location(0) pos : vec4<f32>) -> ShadowVSOut {
  var out : ShadowVSOut;
  let world = sUBO.model * pos;
  let clip = sUBO.lightViewProj * world;
  out.clip = clip;
  let ndcZ = clip.z / clip.w;
  out.depth01 = ndcZ;
  return out;
}

@fragment
fn fsShadow(in : ShadowVSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(vec3<f32>(clamp(in.depth01, 0.0, 1.0)), 1.0);
}
