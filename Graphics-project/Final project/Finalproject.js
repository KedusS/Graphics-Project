// Last edited by Dietrich Geisler 2025

//syntax help from chatgpt
const VSHADER_SOURCE = `
    attribute vec3 a_Position;
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_Camera;
    uniform mat4 u_Projection;

    attribute vec3 a_Color;
    attribute vec3 a_Normal;
    attribute vec2 a_TexCoord;

    varying vec3 v_Color;
    varying vec2 v_TexCoord;
    varying vec3 v_Normal; // Pass normal to fragment shader
    varying vec3 v_Position; // Pass vertex position to fragment shader

    void main() {
        gl_Position = u_Projection * u_Camera * u_World * u_Model * vec4(a_Position, 1.0);
        v_Color = a_Color;
        v_TexCoord = a_TexCoord;
        mat3 normalMatrix = mat3(u_Model);
        v_Normal = normalize(normalMatrix * a_Normal);
        v_Position = vec3(u_World * u_Model * vec4(a_Position, 1.0)); // Transform to world space
    }
`;

//syntax help from chatgpt, lighting, texture
const FSHADER_SOURCE = `
    precision mediump float;

    varying vec3 v_Color;
    varying vec2 v_TexCoord;
    varying vec3 v_Position; // World-space position of the fragment

    varying vec3 v_Normal;
    uniform vec3 u_LightColor; // Light color (optional, default to red)
    uniform vec3 u_LightPos;  // The sun's world-space position
    uniform float u_EnemyBrightness;
    uniform bool u_IsEnemy;


    uniform bool u_IsSun;
    uniform sampler2D u_Texture;
    uniform bool u_UseTexture; 

void main() {

    vec3 lighting = vec3(0.5); // Default lighting factor

        // Normalize the surface normal
        vec3 normal = normalize(v_Normal);

        // Normalize the light direction
        vec3 lightDir = normalize((u_LightPos - v_Position)); 

        // Calculate diffuse lighting intensity
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);

        // Add a custom factor for front and back faces
        float frontFactor = smoothstep(-1.0, 1.0, dot(normal, lightDir)); // Brighten front faces
        float backFactor = 1.0 - frontFactor; // Darken back faces

        // Combine light color with diffuse intensity
        vec3 lightColor = vec3(0.9, 0.9, 0.9); 
        vec3 diffuseColor = diffuseIntensity * lightColor * (u_IsEnemy ? 1.0 : 0.5); // Reduce diffuse effect on terrain

        // Add ambient lighting
        vec3 ambientColor = vec3(0.75, 0.75, 0.75); 
  
        // Combine ambient and diffuse lighting with custom factors
        lighting = ambientColor + diffuseColor * frontFactor + diffuseColor * backFactor * 0.5; // Adjust backFactor as needed

        if (u_IsEnemy) {
            lighting *= u_EnemyBrightness;
    }
        vec4 texColor = texture2D(u_Texture, v_TexCoord);
        vec4 finalColor = u_UseTexture && texColor.a > 0.1 ? texColor : vec4(v_Color, 1.0);
        gl_FragColor = vec4(finalColor.rgb * lighting, finalColor.a);
}

`


// references to general information
var g_canvas
var gl
var g_lastFrameMS

// GLSL uniform references
var g_u_model_ref;
var g_u_world_ref;
var g_u_camera_ref;
var g_u_projection_ref;
var g_u_texture_ref


// Light X positions
var g_light1X


// usual model/world matrices
var g_modelMatrix
var g_worldMatrix
var g_cameraMatrix
var g_projectionMatrix
var g_terrainModelMatrix
var g_terrainWorldMatrix

// Mesh definitions
var g_stickmanMesh
var g_sunMesh
var g_rightArmMesh
var g_enemyFigureMesh
var g_terrainMesh

var g_sunRotationAngle = 0

var g_upperArmAngle = 0;
var g_lowerArmAngle = 0;
var g_armMovingUp = true;

var g_sunX = -30;
var g_sunY = 25;
var g_sunZ = -100;

var g_sunTargetX = -30;
var g_sunTargetY = 25;
var g_sunTargetZ = -100; 
var g_sunSpeed = 0.5;

var g_cameraPos = new Vector3([0, 0.5, 1]);
var g_cameraOrientation = new Quaternion(0, 0, 0, 1);
var g_cameraAngle = 0;
var g_cameraPitch = 0;

var g_movingForward = false;
var g_movingBackward = false;
var g_rmovingLeft = false;
var g_rmovingRight = false;
var g_rmovingUp = false;
var g_rmovingDown = false;
var highestTerrainY = 0;

const CAMERA_SPEED = 0.01;
const CAMERA_ROT_SPEED = 0.1;

const TRIANGLE_SIZE = 3

const FLOAT_SIZE = 4

var sunTexture;
var stickmanTexture1;
var stickmanTexture2;

//skybox logic from environment/skybox demos, help from chatgpt

// global hooks to our loaded images
var g_skyPosX
var g_skyPosY
var g_skyPosZ
var g_skyNegX
var g_skyNegY
var g_skyNegZ

// Unit cube mesh, centered around 0
// Importantly, this cube faces "inwards"
const CUBE_MESH = [
    // front face
    1, 1, 1,
    -1, -1, 1,
    -1, 1, 1,

    1, 1, 1,
    1, -1, 1,
    -1, -1, 1,

    // back face
    1, 1, -1,
    -1, 1, -1,
    -1, -1, -1,

    1, 1, -1,
    -1, -1, -1,
    1, -1, -1,

    // right face
    1, 1, 1,
    1, 1, -1,
    1, -1, -1,

    1, 1, 1,
    1, -1, -1,
    1, -1, 1,

    // left face
    -1, 1, 1,
    -1, -1, -1,
    -1, 1, -1,

    -1, 1, 1,
    -1, -1, 1,
    -1, -1, -1,

    // top face
    1, 1, 1,
    -1, 1, -1,
    1, 1, -1,

    1, 1, 1,
    -1, 1, 1,
    -1, 1, -1,

    // bottom face
    1, -1, 1,
    1, -1, -1,
    -1, -1, -1,

    1, -1, 1,
    -1, -1, -1,
    -1, -1, 1,
]

// updated by hand from our previous tex mapping to get an "inward" cube
const CUBE_TEX_MAPPING = [
    // front face
    1, 0,
    0, 1,
    0, 0,
    1, 0,
    1, 1,
    0, 1,

    // back face
    0, 0,
    1, 0,
    1, 1,
    0, 0,
    1, 1,
    0, 1,

    // right face
    0, 0,
    1, 0,
    1, 1,
    0, 0,
    1, 1,
    0, 1,

    // left face
    1, 0,
    0, 1,
    0, 0,
    1, 0,
    1, 1,
    0, 1,

    // top face
    1, 1,
    0, 0,
    1, 0,
    1, 1,
    0, 1,
    0, 0,

    // bottom face
    1, 0,
    1, 1,
    0, 1,
    1, 0,
    0, 1,
    0, 0,
]

//help from chatgpt
function loadTexture(gl, imageURL) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    var image = new Image();
    image.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
    };
    image.src = imageURL;
    return texture;
}

function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

function initializeTextures() {
    //https://commons.wikimedia.org/wiki/File:Solarsystemscope_texture_8k_sun.jpg
    //https://www.dreamstime.com/moon-surface-seamless-texture-background-closeup-moon-surface-texture-image188679621
    //https://reformjudaism.org/beliefs-practices/lifecycle-rituals/conversion/mikveh-our-own
    sunTexture = loadTexture(gl, './resources/sun_texture.jpeg');
    moonTexture = loadTexture(gl, './resources/moontexture.jpeg');
    stickmanTexture2 = loadTexture(gl, './resources/watertexture.jpeg');
}

function main() {
    setupKeyBinds();

    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space') {
            g_armTargetAngle = g_armTargetAngle === 0 ? 90 : 0;
    
            if (g_sunTargetX === -30 && g_sunTargetY === 25 && g_sunTargetZ === -100) {
                g_sunTargetX = 5;
                g_sunTargetY = -5;
                g_sunTargetZ = -15;
            } else {
                g_sunTargetX = -30;
                g_sunTargetY = 25;
                g_sunTargetZ = -100;
            }
        }
    })    
    g_canvas = document.getElementById('canvas')

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true)
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL')
        return
    }

      // We will call this at the end of most main functions from now on
    initializeTextures()
    loadOBJFiles()
}


/*
 * Helper function to load OBJ files in sequence
 * For much larger files, you may are welcome to make this more parallel
 * I made everything sequential for this class to make the logic easier to follow
 */
async function loadOBJFiles() {
    // open our OBJ file(s)
    data = await fetch('./resources/model.obj').then(response => response.text()).then((x) => x)
    g_stickmanMesh = []
    readObjFile(data, g_stickmanMesh)
    g_enemyFigureMesh = [...g_stickmanMesh];

    armData = await fetch('./resources/arm.obj').then(res => res.text());
    g_rightArmMesh = [];
    readObjFile(armData, g_rightArmMesh);

    sundata = await fetch('./resources/sun.obj').then(response => response.text()).then((x) => x)
    g_sunMesh = []
    readObjFile(sundata, g_sunMesh)

    // Wait to load our models before starting to render
    loadImageFiles()
}

//from environment/skybox demos
//https://danielilett.com/2019-12-11-tut4-1-spyro-skyboxes/
//https://github.com/daniel-ilett/shaders-portal
/*
 * Helper function to _synchronously_ load image files
 * This can make you quite sad the first time loading an image...
 * But for this class it's "good enough"
 * Feel free to make this asynchronous of course
 */
async function loadImageFiles() {
    g_skyPosX = new Image()
    g_skyPosY = new Image()
    g_skyPosZ = new Image()
    g_skyNegX = new Image()
    g_skyNegY = new Image()
    g_skyNegZ = new Image()
    g_skyPosX.src = "./resources/space/leftImage.png"
    g_skyPosY.src = "./resources/space/upImage.png"
    g_skyPosZ.src = "./resources/space/frontImage.png"
    g_skyNegX.src = "./resources/space/rightImage.png"
    g_skyNegY.src = "./resources/space/downImage.png"
    g_skyNegZ.src = "./resources/space/backImage.png"
    await g_skyPosX.decode()
    await g_skyPosY.decode()
    await g_skyPosZ.decode()
    await g_skyNegX.decode()
    await g_skyNegY.decode()
    await g_skyNegZ.decode()
    
    startRendering()
}

var terrainGenerator = new TerrainGenerator()
var seed = new Date().getMilliseconds()
var options = { 
    width: 100, 
    height: 1, 
    depth: 100, 
    seed: seed,
    noisefn: "wave",
    roughness: 20
}
var terrain = terrainGenerator.generateTerrainMesh(options)
var terrainColors = buildTerrainColors(terrain, options.height)

//skybox texture pointers
var g_texturePointerPosX, g_texturePointerPosY, g_texturePointerPosZ;
var g_texturePointerNegX, g_texturePointerNegY, g_texturePointerNegZ;

function startRendering() {
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }
    g_terrainMesh = []
    for (var i = 0; i < terrain.length; i++) {
        g_terrainMesh.push(...terrain[i])
    }
    var stickmanColors = buildColorAttributes(g_stickmanMesh.length / 3)
    var armColors = buildColorAttributes(g_rightArmMesh.length / 3)
    var sunColors = buildColorAttributes(g_sunMesh.length / 3);


    var data = CUBE_MESH.concat(g_stickmanMesh).concat(g_rightArmMesh).concat(g_sunMesh).concat(g_terrainMesh).concat(CUBE_TEX_MAPPING)
    .concat(stickmanColors).concat(armColors).concat(sunColors).concat(terrainColors);
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, ( CUBE_MESH.length + g_stickmanMesh.length + g_rightArmMesh.length + g_sunMesh.length + g_terrainMesh.length) * FLOAT_SIZE)) {
        return
    }
    if (!setupVec2("a_TexCoord", 0, (CUBE_MESH.length + g_stickmanMesh.length + g_rightArmMesh.length + g_sunMesh.length + g_terrainMesh.length) * FLOAT_SIZE)) {
        return;
    }
    if (!setupVec3('a_Normal', 0, (CUBE_MESH.length + g_stickmanMesh.length + g_rightArmMesh.length + g_sunMesh.length + g_terrainMesh.length) * FLOAT_SIZE)) {
        return
    }
    

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_world_ref = gl.getUniformLocation(gl.program, 'u_World')
    g_u_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera')
    g_u_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection')
    g_u_light1_ref = gl.getUniformLocation(gl.program, 'u_Light1')

    // Initialize skybox textures
    g_texturePointerPosX = gl.createTexture();
    g_texturePointerPosY = gl.createTexture();
    g_texturePointerPosZ = gl.createTexture();
    g_texturePointerNegX = gl.createTexture();
    g_texturePointerNegY = gl.createTexture();
    g_texturePointerNegZ = gl.createTexture();

    // Bind and configure skybox textures
    bindSkyboxTexture(g_texturePointerPosX, g_skyPosX);
    bindSkyboxTexture(g_texturePointerPosY, g_skyPosY);
    bindSkyboxTexture(g_texturePointerPosZ, g_skyPosZ);
    bindSkyboxTexture(g_texturePointerNegX, g_skyNegX);
    bindSkyboxTexture(g_texturePointerNegY, g_skyNegY);
    bindSkyboxTexture(g_texturePointerNegZ, g_skyNegZ);

    // Setup our model by scaling
    g_modelMatrix = new Matrix4().translate(-options.width / 2, -options.height, (-options.depth / 2))
    g_cameraMatrix = new Matrix4()
    // Reposition our mesh (in this case as an identity operation)
    g_worldMatrix = new Matrix4()

    // Enable culling and depth tests
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    tick()
}

//logic from environment/skybox demos
// Helper function to bind skybox textures
function bindSkyboxTexture(texturePointer, image) {
    gl.bindTexture(gl.TEXTURE_2D, texturePointer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

//Help from Chatgpt
function getTerrainHeightAndNormal(x, z) {
    if (!g_terrainMesh || g_terrainMesh.length < 9) return { height: 0, normal: new Vector3([0, 1, 0]) };

    let closestTriangle = null;
    let closestDist = Infinity;
    let normal = new Vector3([0, 1, 0]);
    let height = 0;

    for (let i = 0; i < g_terrainMesh.length; i += 9) {
        if (i + 8 >= g_terrainMesh.length) continue; // Prevent out-of-bounds access
        
        let p1 = new Vector3([g_terrainMesh[i], g_terrainMesh[i + 1], g_terrainMesh[i + 2]]);
        let p2 = new Vector3([g_terrainMesh[i + 3], g_terrainMesh[i + 4], g_terrainMesh[i + 5]]);
        let p3 = new Vector3([g_terrainMesh[i + 6], g_terrainMesh[i + 7], g_terrainMesh[i + 8]]);

        let centroid = new Vector3([
            (p1.elements[0] + p2.elements[0] + p3.elements[0]) / 3,
            (p1.elements[1] + p2.elements[1] + p3.elements[1]) / 3,
            (p1.elements[2] + p2.elements[2] + p3.elements[2]) / 3
        ]);

        let dist = Math.hypot(x - centroid.elements[0], z - centroid.elements[2]);
        if (dist < closestDist) {
            closestDist = dist;
            closestTriangle = [p1, p2, p3];
        }
    }

    if (closestTriangle) {
        let p1 = closestTriangle[0];
        let p2 = closestTriangle[1];
        let p3 = closestTriangle[2];

        let edge1 = new Vector3([
            p2.elements[0] - p1.elements[0],
            p2.elements[1] - p1.elements[1],
            p2.elements[2] - p1.elements[2]
        ]);

        let edge2 = new Vector3([
            p3.elements[0] - p1.elements[0],
            p3.elements[1] - p1.elements[1],
            p3.elements[2] - p1.elements[2]
        ]);

        normal = edge1.cross(edge2).normalize();
        height = (p1.elements[1] + p2.elements[1] + p3.elements[1]) / 3;
    }

    return { height, normal };
}

var g_armAngle = 0;
var g_armTargetAngle = 0;
var g_armSpeed = 2;

function tick() {
    // time since the last frame
    var deltaTime

    // calculate deltaTime
    var current_time = Date.now()
    deltaTime = current_time - g_lastFrameMS
    g_lastFrameMS = current_time
    g_sunRotationAngle += 0.01 * deltaTime;
    if (g_sunRotationAngle > 360) {
        g_sunRotationAngle -= 360;
    }
    if (g_armAngle < g_armTargetAngle) {
        g_armAngle = Math.min(g_armAngle + g_armSpeed, g_armTargetAngle);
    } else if (g_armAngle > g_armTargetAngle) {
        g_armAngle = Math.max(g_armAngle - g_armSpeed, g_armTargetAngle);
    }
    if (g_sunX < g_sunTargetX) {
        g_sunX = Math.min(g_sunX + g_sunSpeed, g_sunTargetX);
    } else if (g_sunX > g_sunTargetX) {
        g_sunX = Math.max(g_sunX - g_sunSpeed, g_sunTargetX);
    }

    if (g_sunY < g_sunTargetY) {
        g_sunY = Math.min(g_sunY + g_sunSpeed, g_sunTargetY);
    } else if (g_sunY > g_sunTargetY) {
        g_sunY = Math.max(g_sunY - g_sunSpeed, g_sunTargetY);
    }

    if (g_sunZ < g_sunTargetZ) {
        g_sunZ = Math.min(g_sunZ + g_sunSpeed, g_sunTargetZ);
    } else if (g_sunZ > g_sunTargetZ) {
        g_sunZ = Math.max(g_sunZ - g_sunSpeed, g_sunTargetZ);
    }

    updateCameraPositionFree(deltaTime);
    updateCameraRotation(deltaTime);

    var cameraMatrix = calculateCameraPosition();
    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    draw()

    requestAnimationFrame(tick, g_canvas)
}

function updateCameraPositionFree(deltaTime) {
    let moveSpeed = CAMERA_SPEED * deltaTime;
    let forwardVec = getForwardVector();

    if (g_movingForward) {
        g_cameraPos.elements[0] += forwardVec.elements[0] * moveSpeed;
        g_cameraPos.elements[1] += forwardVec.elements[1] * moveSpeed;
        g_cameraPos.elements[2] += forwardVec.elements[2] * moveSpeed;
    }
    if (g_movingBackward) {
        g_cameraPos.elements[0] -= forwardVec.elements[0] * moveSpeed;
        g_cameraPos.elements[1] -= forwardVec.elements[1] * moveSpeed;
        g_cameraPos.elements[2] -= forwardVec.elements[2] * moveSpeed;
    }
}

function getForwardVector() {
    let forward = new Vector3([0, 0, -1]);
    return rotateVector(forward);
}

//help from chatgpt
function rotateVector(vec) {
    let q = g_cameraOrientation;
    let qConj = new Quaternion(-q.x, -q.y, -q.z, q.w);
    let vQuat = new Quaternion(vec.elements[0], vec.elements[1], vec.elements[2], 0);
    let rotatedQuat = new Quaternion();
    rotatedQuat.multiply(q, vQuat);
    rotatedQuat.multiplySelf(qConj);
    return new Vector3([rotatedQuat.x, rotatedQuat.y, rotatedQuat.z]);
}

function updateCameraRotation(deltaTime) {
    let rotationAmount = CAMERA_ROT_SPEED * deltaTime;

    if (g_rmovingLeft) g_cameraAngle += rotationAmount;
    if (g_rmovingRight) g_cameraAngle -= rotationAmount;
    if (g_rmovingUp) g_cameraPitch += rotationAmount;
    if (g_rmovingDown) g_cameraPitch -= rotationAmount;

    let yawQuat = new Quaternion();
    let pitchQuat = new Quaternion();
    yawQuat.setFromAxisAngle(0, 1, 0, g_cameraAngle);
    pitchQuat.setFromAxisAngle(1, 0, 0, g_cameraPitch);

    g_cameraOrientation = new Quaternion();
    g_cameraOrientation.multiply(yawQuat, pitchQuat);
}

function calculateCameraPosition() {
    let forwardVec = getForwardVector();

    return new Matrix4().setLookAt(
        g_cameraPos.elements[0], g_cameraPos.elements[1], g_cameraPos.elements[2],
        g_cameraPos.elements[0] + forwardVec.elements[0],
        g_cameraPos.elements[1] + forwardVec.elements[1],
        g_cameraPos.elements[2] + forwardVec.elements[2],
        0, 1, 0
    );
}

function setupKeyBinds() {
    document.addEventListener("keydown", function(event) {
        if (event.key === "q") g_rmovingUp = true;
        if (event.key === "e") g_rmovingDown = true;
        if (event.key === "a") g_rmovingLeft = true;
        if (event.key === "d") g_rmovingRight = true;
        if (event.key === "w") g_movingForward = true;
        if (event.key === "s") g_movingBackward = true;
    });

    document.addEventListener("keyup", function(event) {
        if (event.key === "q") g_rmovingUp = false;
        if (event.key === "e") g_rmovingDown = false;
        if (event.key === "a") g_rmovingLeft = false;
        if (event.key === "d") g_rmovingRight = false;
        if (event.key === "w") g_movingForward = false;
        if (event.key === "s") g_movingBackward = false;
    });
}

//skybox, lighting used appropriate demos and chatgpt
function draw() {
    let cameraMatrix = calculateCameraPosition();

    let projectionMatrix = new Matrix4();
    projectionMatrix.setPerspective(45, g_canvas.width / g_canvas.height, 0.1, 500); // increased far plane

    // Clear the canvas
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // === SKYBOX RENDERING ===
    gl.depthMask(false); // Disable depth writing so skybox doesn’t block scene

    // Remove camera translation from view matrix
    let skyboxViewMatrix = new Matrix4(cameraMatrix);
    skyboxViewMatrix.elements[12] = 0;
    skyboxViewMatrix.elements[13] = 0;
    skyboxViewMatrix.elements[14] = 0;

    // Keep skybox centered on camera
    let skyboxModelMatrix = new Matrix4()
        .translate(g_cameraPos.elements[0], g_cameraPos.elements[1], g_cameraPos.elements[2])
        .scale(100, 100, 100);
    gl.uniformMatrix4fv(g_u_model_ref, false, skyboxModelMatrix.elements);
    gl.uniformMatrix4fv(g_u_world_ref, false, g_worldMatrix.elements);
    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, projectionMatrix.elements);

    // Draw each face of the skybox with the appropriate texture
    drawSkyboxFace(g_texturePointerPosZ, 0, 6);   // Front face
    drawSkyboxFace(g_texturePointerNegZ, 6, 6);  // Back face
    drawSkyboxFace(g_texturePointerPosX, 12, 6); // Right face
    drawSkyboxFace(g_texturePointerNegX, 18, 6); // Left face
    drawSkyboxFace(g_texturePointerPosY, 24, 6); // Top face
    drawSkyboxFace(g_texturePointerNegY, 30, 6); // Bottom face

    gl.depthMask(true); // Re-enable depth writing for other objects

    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, projectionMatrix.elements);

    //light position
    let lightX = 20;   
    let lightY = -30;   
    let lightZ = 50;  

    gl.uniform3f(gl.getUniformLocation(gl.program, "u_LightPos"), lightX, lightY, lightZ);

    let playerMatrix = new Matrix4().setScale(.07, .07, .07).translate(-15, 0, -45);
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_UseTexture"), 1); // Enable texture
    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(gl.TEXTURE_2D, sunTexture);
    gl.uniformMatrix4fv(g_u_model_ref, false, playerMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, CUBE_MESH.length / 3, g_stickmanMesh.length / 3);

    let armMatrix = new Matrix4()
        .setScale(.07, .07, .07)
        .translate(-15, 0+5, -45)
        .rotate(g_armAngle, 0, 0, -1)
    gl.uniformMatrix4fv(g_u_model_ref, false, armMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, CUBE_MESH.length / 3 + g_stickmanMesh.length / 3, g_rightArmMesh.length / 3);

    let enemyMatrix = new Matrix4().setScale(.07, .07, .07).translate(15,0, -45);
    enemyMatrix.rotate(180, 0, 1, 0)
    gl.bindTexture(gl.TEXTURE_2D, stickmanTexture2);
    gl.uniformMatrix4fv(g_u_model_ref, false, enemyMatrix.elements);
    gl.uniform1f(gl.getUniformLocation(gl.program, "u_EnemyBrightness"), 1.6); // Adjust brightness
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_IsEnemy"), 1); // Mark as enemy
    gl.drawArrays(gl.TRIANGLES, CUBE_MESH.length / 3, g_stickmanMesh.length / 3)

    let enemyBrightness = 1.5;  
    gl.uniform1f(gl.getUniformLocation(gl.program, "u_EnemyBrightness"), enemyBrightness);

    let larmMatrix = new Matrix4().setScale(.07, .07, .07).translate(15, 0, -45)
    larmMatrix.rotate(180, 0, 1, 0)
    gl.uniformMatrix4fv(g_u_model_ref, false, larmMatrix.elements);
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_IsEnemy"), 1); // Ensure arm is also enemy
    gl.uniform1f(gl.getUniformLocation(gl.program, "u_EnemyBrightness"), 1.6); // Brightness boost
    gl.drawArrays(gl.TRIANGLES, CUBE_MESH.length / 3 + g_stickmanMesh.length / 3, g_rightArmMesh.length / 3);

    let sunMatrix = new Matrix4()
        .setScale(0.25, 0.25, 0.25)
        .translate(g_sunX, g_sunY, g_sunZ)
        .rotate(g_sunRotationAngle, 0, 1, 0);  

    gl.uniform1i(gl.getUniformLocation(gl.program, "u_IsSun"), 1); // Tell shader this is the sun
    gl.bindTexture(gl.TEXTURE_2D, sunTexture);
    gl.uniformMatrix4fv(g_u_model_ref, false, sunMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, CUBE_MESH.length / 3 + g_stickmanMesh.length / 3 + g_rightArmMesh.length / 3, g_sunMesh.length / 3);
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_IsSun"), 0);
    

    gl.bindTexture(gl.TEXTURE_2D, moonTexture);
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_Texture"), 0)


    // the grid has a constant identity matrix for model and world
    gl.uniformMatrix4fv(g_u_model_ref, false, g_modelMatrix.elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, g_worldMatrix.elements)
    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, projectionMatrix.elements);
    // draw the grid

    gl.drawArrays(gl.TRIANGLES, CUBE_TEX_MAPPING.length / 3 + g_stickmanMesh.length / 3 + g_rightArmMesh.length / 3 + g_sunMesh.length / 3, g_terrainMesh.length / 3, g_enemyFigureMesh.length / 3)
}


// Helper function to draw a skybox face
function drawSkyboxFace(texturePointer, offset, count) {
    gl.activeTexture(gl.TEXTURE0); // Activate texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texturePointer); // Bind the texture
    gl.uniform1i(g_u_texture_ref, 0); // Tell the shader to use texture unit 0
    gl.drawArrays(gl.TRIANGLES, offset, count); // Draw the face
}

const MIN_X = 0;
const MIN_Y = 0;
const MIN_Z = 0;
const MIN_W = 1;
const MAX_X = 1;
const MAX_Y = 1;
const MAX_Z = 1;
const MAX_W = 0;

// Helper to construct colors
// makes every triangle a slightly different shade of blue
function buildColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = (i * 3) / vertex_count
            colors.push(shade, shade, 1.0)
        }
    }

    return colors
}

// How far in the X and Z directions the grid should extend
// Recall that the camera "rests" on the X/Z plane, since Z is "out" from the camera
const GRID_X_RANGE = 1000
const GRID_Z_RANGE = 1000

// The default y-offset of the grid for rendering
const GRID_Y_OFFSET = -0.5

/*
 * Helper to build a grid mesh and colors
 * Returns these results as a pair of arrays
 * Each vertex in the mesh is constructed with an associated grid_color
 */
function buildGridAttributes(grid_row_spacing, grid_column_spacing, grid_color) {
    var mesh = []
    var colors = []

    // Construct the rows
    for (var x = -GRID_X_RANGE; x < GRID_X_RANGE; x += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(x, 0, -GRID_Z_RANGE)
        mesh.push(x, 0, GRID_Z_RANGE)
    }

    // Construct the columns extending "outward" from the camera
    for (var z = -GRID_Z_RANGE; z < GRID_Z_RANGE; z += grid_column_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(-GRID_X_RANGE, 0, z)
        mesh.push(GRID_X_RANGE, 0, z)
    }

    // We need one color per vertex
    // since we have 3 components for each vertex, this is length/3
    for (var i = 0; i < mesh.length / 3; i++) {
        colors.push(grid_color[0], grid_color[1], grid_color[2])
    }

    return [mesh, colors]
}

function buildTerrainColors(terrain, height) {
    var colors = []
    for (var i = 0; i < terrain.length; i++) {

        var shade = (terrain[i][1] / height) + 1/2
        var color = [shade, shade, 1.0]

        colors.push(...color)
    }

    return colors
}



/*
 * Initialize the VBO with the provided data
 * Assumes we are going to have "static" (unchanging) data
 */

//help from chatgpt
var terrainBuffer = null;

function initVBO(data) {
    if (!terrainBuffer) {
        terrainBuffer = gl.createBuffer();
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, terrainBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    
    return true;
}

/*
 * Helper function to load the given vec3 data chunk onto the VBO
 * Requires that the VBO already be setup and assigned to the GPU
 */
function setupVec3(name, stride, offset) {
    // Get the attribute by name
    var attributeID = gl.getAttribLocation(gl.program, `${name}`)
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`)
        return false
    }

    // Set how the GPU fills the a_Position variable with data from the GPU 
    gl.vertexAttribPointer(attributeID, 3, gl.FLOAT, false, stride, offset)
    gl.enableVertexAttribArray(attributeID)

    return true
}

function setupVec2(name, stride, offset) {
    var attributeID = gl.getAttribLocation(gl.program, name);
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`);
        return false;
    }
    gl.vertexAttribPointer(attributeID, 2, gl.FLOAT, false, stride, offset);
    gl.enableVertexAttribArray(attributeID);
    return true;
}
