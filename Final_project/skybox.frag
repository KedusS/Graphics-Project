// Based on https://webglfundamentals.org/webgl/lessons/webgl-skybox.html

precision highp float;
uniform mat4 u_CameraProjectionInverse;
uniform samplerCube u_Skybox;
varying vec3 v_Position;

void main() {
    // the key is to sample the texture at the correct spot
    // we can do this with just an inverted camera/projection sample
    // note that we don't care about camera movement, only rotation/scaling
    // this means we can skip the translation entirely by just using a mat3
    vec3 inversePosition = mat3(u_CameraProjectionInverse) * v_Position;
    gl_FragColor = textureCube(u_Skybox, inversePosition);
}