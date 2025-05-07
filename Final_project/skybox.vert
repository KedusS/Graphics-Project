// Based on https://webglfundamentals.org/webgl/lessons/webgl-skybox.html
attribute vec3 a_Position;
varying vec3 v_Position;
void main() {
    // the position is exactly our "default" square, with a z fixed to .999
    // in other words, draw the square as far away as possible
    gl_Position = vec4(a_Position.xy, .999, 1.0);
    v_Position = a_Position;
}