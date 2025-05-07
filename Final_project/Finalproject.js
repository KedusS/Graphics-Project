// Last edited by Dietrich Geisler 2025

const VSHADER_SOURCE = `
    attribute vec3 a_Position;
    uniform mat4 u_Model;
    uniform mat4 u_World;
    uniform mat4 u_Camera;
    uniform mat4 u_Projection;
    attribute vec3 a_Color;
    attribute vec2 a_TexCoord;

    varying vec3 v_Color;
    varying vec2 v_TexCoord;

    void main() {
        gl_Position = u_Projection * u_Camera * u_World * u_Model * vec4(a_Position, 1.0);
        v_Color = a_Color;
        v_TexCoord = a_TexCoord;

    }
`

const FSHADER_SOURCE = `
    precision mediump float;

    varying vec3 v_Color;
    varying vec2 v_TexCoord;

    uniform sampler2D u_Texture;
    uniform bool u_UseTexture; // NEW: Controls whether to use the texture

    void main() {
        vec4 texColor = texture2D(u_Texture, v_TexCoord);
        if (u_UseTexture && texColor.a > 0.1) {
            gl_FragColor = texColor;
        } else {
            gl_FragColor = vec4(v_Color, 1.0);
        }
    }

`

// references to general information
var g_canvas
var gl
var g_lastFrameMS

const SQUARE_MESH = [
    1, 1, 1,
    -1, 1, 1,
    -1, -1, 1,
    1, 1, 1,
    -1, -1, 1,
    1, -1, 1,
]

// GLSL uniform references
var g_u_model_ref;
var g_u_world_ref;
var g_u_camera_ref;
var g_u_projection_ref;
var g_u_texture_ref;
var g_u_skybox_ref
var g_u_drawSkybox_ref
var g_u_cameraProjectionInverse_ref

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

// references to the GLSL programs we need to load
var g_skyboxVShader, g_skyboxFShader;

// global hooks to our loaded skybox images
var g_skyPosX, g_skyPosY, g_skyPosZ;
var g_skyNegX, g_skyNegY, g_skyNegZ;
var g_skyboxTexture;


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

async function initializeTextures() {
    sunTexture = loadTexture(gl, './resources/sun_texture.jpeg');
    moonTexture = loadTexture(gl, './resources/moontexture.jpeg');
    stickmanTexture2 = loadTexture(gl, './resources/watertexture.jpeg');

    loadGLSLFiles();
}

async function loadGLSLFiles() {
    try {
        const [vShader, fShader] = await Promise.all([
            fetch('./skybox.vert').then(res => res.text()),
            fetch('.s/skybox.frag').then(res => res.text())
        ]);

        if (!vShader || !fShader) {
            console.error("Shader files could not be loaded!");
            return;
        }

        g_skyboxVShader = vShader;
        g_skyboxFShader = fShader;

        console.log("Loaded Skybox Vertex Shader:\n", g_skyboxVShader);
        console.log("Loaded Skybox Fragment Shader:\n", g_skyboxFShader);

        startRendering();
    } catch (err) {
    }
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
    startRendering()
}

function initializeSkyboxTextures() {
    g_skyboxTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);

    const faces = [
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: "resources/yokohama/posx.jpg" },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: "resources/yokohama/negx.jpg" },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: "resources/yokohama/posy.jpg" },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: "resources/yokohama/negy.jpg" },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: "resources/yokohama/posz.jpg" },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: "resources/yokohama/negz.jpg" },
    ];

    let imagesLoaded = 0;
    faces.forEach(({ target, url }) => {
        const image = new Image();
        image.src = url;
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);
            gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            imagesLoaded++;
            if (imagesLoaded === 6) {
                gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }
        };
    });
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

let g_skyboxProgram;

function startRendering() {
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }

    g_skyboxProgram = createProgram(gl, g_skyboxVShader, g_skyboxFShader);
    if (!g_skyboxProgram) {
        console.log('Failed to initialize skybox shaders.');
        return;
    }

    gl.useProgram(g_skyboxProgram);

    g_u_camera_ref = gl.getUniformLocation(g_skyboxProgram, 'u_ViewDirectionProjectionInverse');
    g_u_skybox_ref = gl.getUniformLocation(g_skyboxProgram, 'u_Skybox');

    gl.useProgram(gl.program); // Switch back to main shader

    g_terrainMesh = []
    for (var i = 0; i < terrain.length; i++) {
        g_terrainMesh.push(...terrain[i])
    }
    var stickmanColors = buildColorAttributes(g_stickmanMesh.length / 3)
    var armColors = buildColorAttributes(g_rightArmMesh.length / 3)
    var sunColors = buildColorAttributes(g_sunMesh.length / 3);

    var data = g_stickmanMesh.concat(g_rightArmMesh).concat(g_sunMesh).concat(g_terrainMesh).concat(stickmanColors).concat(armColors).concat(sunColors).concat(terrainColors)
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (g_stickmanMesh.length + g_rightArmMesh.length + g_sunMesh.length + g_terrainMesh.length) * FLOAT_SIZE)) {
        return
    }
    if (!setupVec2("a_TexCoord", 0, (g_stickmanMesh.length + g_rightArmMesh.length + g_sunMesh.length + g_terrainMesh.length) * FLOAT_SIZE)) {
        return;
    }
    

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_world_ref = gl.getUniformLocation(gl.program, 'u_World')
    g_u_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera')
    g_u_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection')
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

function draw() {
    var cameraMatrix = calculateCameraPosition();

    let projectionMatrix = new Matrix4();
    projectionMatrix.setPerspective(45, g_canvas.width / g_canvas.height, 0.1, 100);

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT| gl.DEPTH_BUFFER_BIT)

    // Draw skybox
    gl.useProgram(g_skyboxProgram);

    let viewDirectionProjectionMatrix = new Matrix4(projectionMatrix);
    gl.uniformMatrix4fv(g_u_camera_ref, false, viewDirectionProjectionMatrix.elements);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexture);
    gl.uniform1i(g_u_skybox_ref, 0);

    gl.drawArrays(gl.TRIANGLES, 0, SQUARE_MESH.length / 3); // Draw skybox

    gl.useProgram(gl.program);
    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, projectionMatrix.elements);

    let playerMatrix = new Matrix4().setScale(.07, .07, .07).translate(-15, 0, -45);
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_UseTexture"), 1); // Enable texture
    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(gl.TEXTURE_2D, sunTexture);
    gl.uniformMatrix4fv(g_u_model_ref, false, playerMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, 0, g_stickmanMesh.length / 3);

    let armMatrix = new Matrix4()
        .setScale(.07, .07, .07)
        .translate(-15, 0+5, -45)
        .rotate(g_armAngle, 0, 0, -1)
    gl.uniformMatrix4fv(g_u_model_ref, false, armMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, g_stickmanMesh.length / 3, g_rightArmMesh.length / 3);

    let enemyMatrix = new Matrix4().setScale(.07, .07, .07).translate(15,0, -45);
    enemyMatrix.rotate(180, 0, 1, 0)
    gl.bindTexture(gl.TEXTURE_2D, stickmanTexture2);
    gl.uniformMatrix4fv(g_u_model_ref, false, enemyMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, 0, g_stickmanMesh.length / 3)

    let larmMatrix = new Matrix4().setScale(.07, .07, .07).translate(15, 0, -45)
    larmMatrix.rotate(180, 0, 1, 0)
    gl.uniformMatrix4fv(g_u_model_ref, false, larmMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, g_stickmanMesh.length / 3, g_rightArmMesh.length / 3);

    let sunMatrix = new Matrix4()
        .setScale(0.25, 0.25, 0.25)
        .translate(g_sunX, g_sunY, g_sunZ)
        .rotate(g_sunRotationAngle, 0, 1, 0);  

    gl.bindTexture(gl.TEXTURE_2D, sunTexture);
    gl.uniformMatrix4fv(g_u_model_ref, false, sunMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, g_stickmanMesh.length / 3 + g_rightArmMesh.length / 3, g_sunMesh.length / 3);

    gl.bindTexture(gl.TEXTURE_2D, moonTexture);
    gl.uniform1i(gl.getUniformLocation(gl.program, "u_Texture"), 0)

    // the grid has a constant identity matrix for model and world
    gl.uniformMatrix4fv(g_u_model_ref, false, g_modelMatrix.elements)
    gl.uniformMatrix4fv(g_u_world_ref, false, g_worldMatrix.elements)
    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, projectionMatrix.elements);
    // draw the grid

    gl.drawArrays(gl.TRIANGLES, g_stickmanMesh.length / 3 + g_rightArmMesh.length / 3 + g_sunMesh.length / 3, g_terrainMesh.length / 3, g_enemyFigureMesh.length / 3)
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
