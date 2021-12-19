import {Component, OnInit} from '@angular/core';
import {mat4, vec3} from "gl-matrix";

declare var Shader: any;
declare var vertShader: any;
declare var fragShader: any;
declare var fragShaderLighting: any;
declare var fragShaderMIP: any;
declare var fragShaderGradients: any;
declare var ArcballCamera: any;
declare var blurVertShader: any;
declare var blurFragShader: any;
declare var sobelFragShader: any;
declare var nifti: any;
declare var Controller: any;

@Component({
  selector: 'app-renderer',
  templateUrl: './renderer.component.html',
  styleUrls: ['./renderer.component.css']
})
export class RendererComponent implements OnInit {
  takeScreenShot = false;
  cubeStrip = [0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0];
  container = null;
  isBlackBackColor = true;
  gl = null;
  isDrawOnDemand = true;
  canvas = null;
  shader = null;
  blurShader = null;
  sobelShader = null;
  volumeTexture = null;
  gradientTexture = null;
  colormap = null;
  proj = null;
  vao = null;
  vbo = null;
  tex = null;
  camera = null;
  projView = null;
  newVolumeUpload = true;
  targetFrameTime = 32;
  samplingRate = 1.0;
  WIDTH = 320;
  HEIGHT = 320;
  hdr ;
  img ;
  colorName = "";
  colorOpacity = 2;
  center = vec3.set(vec3.create(), 0.5, 0.5, 0.5);

  openDialog = document.createElement('input');


  constructor() {
  }

  adjustQuality(scale) {
    this.samplingRate = this.samplingRate * scale;
    this.samplingRate = Math.min(this.samplingRate, 10.0);
    this.samplingRate = Math.max(this.samplingRate, 0.7);
    this.gl.uniform1f(this.shader.uniforms["dt_scale"], this.samplingRate);
    console.log('quality ', this.samplingRate);
    if (this.isDrawOnDemand) this.glDraw();
  }

  adjustOpacity(scale) {
    this.colorOpacity = this.colorOpacity * scale;
    this.colorOpacity = Math.min(this.colorOpacity, 10.0);
    this.colorOpacity = Math.max(this.colorOpacity, 0.1);
    this.selectColormap(this.colorName);
    console.log('opacity ', this.colorOpacity);
    if (this.isDrawOnDemand) this.glDraw();
  }

  loadVolume(url, isURL, onload) {
    if (!isURL) {
      var reader = new FileReader();
      reader.readAsArrayBuffer(url);
      reader.addEventListener('load', function (event) {
        console.log(event.target.result);
        //loadGeometryCore(object, isOverlay);
        var hdr = nifti.readHeader(event.target.result);
        console.log(hdr)
        var img;
        if (nifti.isCompressed(event.target.result)) {
          img = nifti.readImage(hdr, nifti.decompress(event.target.result));
        } else
          img = nifti.readImage(hdr, event.target.result);
        //img = new Uint8Array(img);
        onload(url, hdr, img);

      });
      return;
    }
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.responseType = "arraybuffer";
    req.onprogress = function (evt) {
      //loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
    };
    req.onerror = function (evt) {
      console.log("Error Loading Volume");
    };
    req.onload = function (evt) {
      var dataBuffer = req.response;
      if (dataBuffer) {
        var hdr = nifti.readHeader(dataBuffer);
        var img;
        if (nifti.isCompressed(dataBuffer)) {
          img = nifti.readImage(hdr, nifti.decompress(dataBuffer));
        } else
          img = nifti.readImage(hdr, dataBuffer);
        //img = new Uint8Array(img);
        onload(url, hdr, img);
      } else {
        alert("Unable to load buffer properly from volume?");
        console.log("no buffer?");
      }
    };
    req.send();
  }

  bindBlankGL() {
    let texR = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_3D, texR);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1)
    this.gl.texStorage3D(this.gl.TEXTURE_3D, 1, this.gl.RGBA8, this.hdr.dims[1], this.hdr.dims[2], this.hdr.dims[3]);
    return texR;
  }

  gradientGL() {
    var faceStrip = [0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0];
    var vao2 = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao2);
    var vbo2 = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vbo2);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(faceStrip), this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);
    var fb = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.viewport(0, 0, this.hdr.dims[1], this.hdr.dims[2]);
    this.gl.disable(this.gl.BLEND);
    var tempTex3D = this.bindBlankGL();
    console.log(this.blurShader)
    this.blurShader.use();
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_3D, this.tex);
    this.gl.uniform1i(this.blurShader.uniforms["intensityVol"], 1);
    this.gl.uniform1f(this.blurShader.uniforms["dX"], 0.7 / this.hdr.dims[1]);
    this.gl.uniform1f(this.blurShader.uniforms["dY"], 0.7 / this.hdr.dims[2]);
    this.gl.uniform1f(this.blurShader.uniforms["dZ"], 0.7 / this.hdr.dims[3]);

    this.gl.bindVertexArray(vao2);
    for (let i = 0; i < (this.hdr.dims[3] - 1); i++) {
      var coordZ = 1 / this.hdr.dims[3] * (i + 0.5);
      this.gl.uniform1f(this.blurShader.uniforms["coordZ"], coordZ);
      this.gl.framebufferTextureLayer(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, tempTex3D, 0, i);
      this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, faceStrip.length / 3);
    }

    this.sobelShader.use();
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_3D, tempTex3D);//input texture
    this.gl.uniform1i(this.sobelShader.uniforms["intensityVol"], 1);
    this.gl.uniform1f(this.sobelShader.uniforms["dX"], 0.7 / this.hdr.dims[1]);
    this.gl.uniform1f(this.sobelShader.uniforms["dY"], 0.7 / this.hdr.dims[2]);
    this.gl.uniform1f(this.sobelShader.uniforms["dZ"], 0.7 / this.hdr.dims[3]);
    this.gl.uniform1f(this.sobelShader.uniforms["coordZ"], 0.5);
    this.gl.bindVertexArray(vao2);
    this.gl.activeTexture(this.gl.TEXTURE0);
    if (this.gradientTexture !== null) this.gl.deleteTexture(this.gradientTexture);
    this.gradientTexture = this.bindBlankGL();
    for (let i = 0; i < (this.hdr.dims[3] - 1); i++) {
      var coordZ = 1 / this.hdr.dims[3] * (i + 0.5);
      this.gl.uniform1f(this.sobelShader.uniforms["coordZ"], coordZ);
      //console.log(coordZ);
      this.gl.framebufferTextureLayer(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gradientTexture, 0, i);
      this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, faceStrip.length / 3);
    }
    this.gl.deleteFramebuffer(fb);
    this.gl.deleteTexture(tempTex3D);
    //return to volume rendering shader
    this.shader.use();
    this.gl.bindVertexArray(this.vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_3D, this.volumeTexture);
    this.gl.activeTexture(this.gl.TEXTURE2);
    this.gl.bindTexture(this.gl.TEXTURE_3D, this.gradientTexture);
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
  }

  reportMat(m) {
    console.log("m = [%.2f %.2f %.2f %.2f; %.2f %.2f %.2f %.2f; %.2f %.2f %.2f %.2f; %.2f %.2f %.2f %.2f]",
      m[0], m[1], m[2], m[3],
      m[4], m[5], m[6], m[7],
      m[8], m[9], m[10], m[11],
      m[12], m[13], m[14], m[15],
    );
  }

  glDraw() {
    this.gl.uniform1f(this.shader.uniforms["dt_scale"], this.samplingRate);
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.projView = mat4.mul(this.projView, this.proj, this.camera.camera);
    this.gl.uniformMatrix4fv(this.shader.uniforms["proj_view"], false, this.projView);
    //var eye = [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];
    var eye = this.camera.eyePos();
    this.gl.uniform3fv(this.shader.uniforms["eye_pos"], eye);
    //Lighting
    //"Head-light" with light at camera location:
    //gl.uniform3fv(shader.uniforms["light_pos"], eye);
    //we will place a light directly above the camera, mixing headlight with top light
    var mx = Math.max(Math.abs(eye));
    var up = this.camera.upDir();
    var light = eye;
    light[0] = eye[0] + up[0] * mx;
    light[1] = eye[1] + up[1] * mx;
    light[2] = eye[2] + up[2] * mx;
    this.gl.uniform3fv(this.shader.uniforms["light_pos"], light);
    //draw cube
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, this.cubeStrip.length / 3);
    // Wait for rendering to actually finish
    this.gl.finish();
    if (this.takeScreenShot) {
      this.takeScreenShot = false;
      this.canvas.toBlob(function (b) {
        this.saveAs(b, "screen.png");
      }, "image/png");
    }
  }

  updateVolume() { //load volume or change contrast
    //convert data to 8-bit image
    var imgRaw;
    var vox = this.hdr.dims[1] * this.hdr.dims[2] * this.hdr.dims[3];
    var img8 = new Uint8Array(vox);
    if (this.hdr.datatypeCode === 2) //data already uint8
       imgRaw = new Uint8Array(this.img);
    else if (this.hdr.datatypeCode === 4)
       imgRaw = new Int16Array(this.img);
    else if (this.hdr.datatypeCode === 16)
       imgRaw = new Float32Array(this.img);
    else if (this.hdr.datatypeCode === 512)
       imgRaw = new Uint16Array(this.img);
    var mn = this.hdr.cal_min;
    var mx = this.hdr.cal_max;
    var scale = 1;
    if (mx > mn) scale = 255 / (mx - mn);
    for (let i = 0; i < (vox - 1); i++) {
      var v = imgRaw[i];
      v = (v * this.hdr.scl_slope) + this.hdr.scl_inter;
      if (v < mn)
        img8[i] = 0;
      else if (v > mx)
        img8[i] = 255;
      else
        img8[i] = (v - mn) * scale;
    }
    this.tex = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_3D, this.tex);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_3D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1)
    this.gl.texStorage3D(this.gl.TEXTURE_3D, 1, this.gl.R8, this.hdr.dims[1], this.hdr.dims[2], this.hdr.dims[3]);
    this.gl.texSubImage3D(this.gl.TEXTURE_3D, 0, 0, 0, 0, this.hdr.dims[1], this.hdr.dims[2], this.hdr.dims[3], this.gl.RED, this.gl.UNSIGNED_BYTE, img8);
    var longestAxis = Math.max(this.hdr.dims[1], Math.max(this.hdr.dims[2], this.hdr.dims[3]));
    var volScale = [this.hdr.dims[1] / longestAxis, this.hdr.dims[2] / longestAxis, this.hdr.dims[3] / longestAxis];
    this.gl.uniform3iv(this.shader.uniforms["volume_dims"], [this.hdr.dims[1], this.hdr.dims[2], this.hdr.dims[3]]);
    this.gl.uniform3fv(this.shader.uniforms["volume_scale"], volScale);
    var newVolumeUpload = true;

    //gradientGL();
    const that = this;
    if (!this.volumeTexture) {
      this.volumeTexture = this.tex;
      if (this.isDrawOnDemand) {}
        //glDraw();
      else {
        setInterval(function () {
          // Save them some battery if they're not viewing the tab
          if (document.hidden) {
            return;
          }
          var startTime:any = new Date();
          // Reset the sampling rate and camera for new volumes
          if (newVolumeUpload) {
            that.onWindowResize();
            that.samplingRate = 1.0;
            that.gl.uniform1f(that.shader.uniforms["dt_scale"], that.samplingRate);
          }
          that.glDraw();
          var endTime:any = new Date();
          var renderTime = endTime - startTime;
          var targetSamplingRate = renderTime / that.targetFrameTime;
          if (that.takeScreenShot) {
            that.takeScreenShot = false;
            that.canvas.toBlob(function (b) {
              // saveAs(b, "screen.png");
            }, "image/png");
          }
          // If we're dropping frames, decrease the sampling rate
          if (!newVolumeUpload && targetSamplingRate > that.samplingRate) {
            that.samplingRate = 0.8 * that.samplingRate + 0.2 * targetSamplingRate;
            that.gl.uniform1f(that.shader.uniforms["dt_scale"], that.samplingRate);
          }
          newVolumeUpload = false;
          startTime = endTime;
        }, this.targetFrameTime);
      }
    } else {
      this.gl.deleteTexture(this.volumeTexture);
      this.volumeTexture = this.tex;
      if (this.isDrawOnDemand) this.glDraw();
    }
    this.gradientGL();
    this.glDraw();
  }

  selectVolume(url, isURL = true) {
    const that = this;
    this.loadVolume(url, isURL, function (file, xhdr, ximg) {
      console.log(xhdr)
      that.hdr = xhdr;
      that.img = ximg;
      //determine range
      var imgRaw;
      if (that.hdr.datatypeCode === 2) //data already uint8
        imgRaw = new Uint8Array(that.img);
      else if (that.hdr.datatypeCode === 4)  //Int16
        imgRaw = new Int16Array(that.img);
      else if (that.hdr.datatypeCode === 16)  //Float32
        imgRaw = new Float32Array(that.img);
      else if (that.hdr.datatypeCode === 512) //UInt16
        imgRaw = new Uint16Array(that.img);
      else {
        alert('Unsupported data type');
        console.log("Unsupported data type %d", that.hdr.datatypeCode);
        var e = new Error('Unsupported data type');
        throw e;
      }
      var vox = imgRaw.length;
      var mn = Infinity;
      var mx = -Infinity;
      for (let i = 0; i < (vox - 1); i++) {
        if (!isFinite(imgRaw[i])) continue;
        if (imgRaw[i] < mn) mn = imgRaw[i];
        if (imgRaw[i] > mx) mx = imgRaw[i];
      }
      //calibrate intensity
      if ((isFinite(that.hdr.scl_slope)) && (isFinite(that.hdr.scl_inter)) && (that.hdr.scl_slope !== 0.0)) {
        //console.log(">> mn %f mx %f %f %f", mn, mx, hdr.scl_slope, hdr.scl_inter);
        mn = (mn * that.hdr.scl_slope) + that.hdr.scl_inter;
        mx = (mx * that.hdr.scl_slope) + that.hdr.scl_inter;
      } else {
        that.hdr.scl_slope = 1.0;
        that.hdr.scl_inter = 0.0;
      }
      //console.log("vx %d type %d mn %f mx %f", vox, hdr.datatypeCode, mn, mx);
      //console.log("cal mn..mx %f..%f", hdr.cal_min, hdr.cal_max);
      that.hdr.global_min = mn;
      that.hdr.global_max = mx;
      if ((!isFinite(that.hdr.cal_min)) || (!isFinite(that.hdr.cal_max)) || (that.hdr.cal_min >= that.hdr.cal_max)) {
        that.hdr.cal_min = mn;
        that.hdr.cal_max = mx;
      }
      that.updateVolume();
    });
  }

  textureFromPixelArray(gl, dataArray, type, width, height) {
    var dataTypedArray = new Uint8Array(dataArray); // Don't need to do this if the data is already in a typed array
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, type, width, height, 0, type, gl.UNSIGNED_BYTE, dataTypedArray);
    // Other texture setup here, like filter modes and mipmap generation
    return texture;
  }

  makeLut(Rs, Gs, Bs, As, Is) {
//create color lookup table provided arrays of reds, greens, blues, alphas and intensity indices
//intensity indices should be in increasing order with the first value 0 and the last 255.
// makeLut([0, 255], [0, 0], [0,0], [0,128],[0,255]); //red gradient
    var lut = new Uint8Array(256 * 4);
    for (let i = 0; i < (Is.length - 1); i++) {
      //return a + f * (b - a);
      var idxLo = Is[i];
      var idxHi = Is[i + 1];
      var idxRng = idxHi - idxLo;
      var k = idxLo * 4;
      for (let j = idxLo; j <= idxHi; j++) {
        var f = (j - idxLo) / idxRng;
        lut[k] = Rs[i] + f * (Rs[i + 1] - Rs[i]); //Red
        k++;
        lut[k] = Gs[i] + f * (Gs[i + 1] - Gs[i]); //Green
        k++;
        lut[k] = Bs[i] + f * (Bs[i + 1] - Bs[i]); //Blue
        k++;
        lut[k] = (As[i] + f * (As[i + 1] - As[i])) * this.colorOpacity; //Alpha
        k++;
      }
    }
    return lut;
  }

  selectColormap(lutName) {
    var lut = this.makeLut([0, 255], [0, 255], [0, 255], [0, 128], [0, 255]); //gray
    if (lutName === "Plasma")
      lut = this.makeLut([13, 156, 237, 240], [8, 23, 121, 249], [135, 158, 83, 33], [0, 56, 80, 88], [0, 64, 192, 255]); //plasma
    if (lutName === "Viridis")
      lut = this.makeLut([68, 49, 53, 253], [1, 104, 183, 231], [84, 142, 121, 37], [0, 56, 80, 88], [0, 65, 192, 255]);//viridis
    if (lutName === "Inferno")
      lut = this.makeLut([0, 120, 237, 240], [0, 28, 105, 249], [4, 109, 37, 33], [0, 56, 80, 88], [0, 64, 192, 255]);//inferno
    this.colorName = lutName;
    if (this.colormap !== null)
      this.gl.deleteTexture(this.colormap); //release colormap');
    this.colormap = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.colormap);
    this.gl.texStorage2D(this.gl.TEXTURE_2D, 1, this.gl.RGBA8, 256, 1);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, 256, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, lut);
  }

  setShader(shaderInt) { //0=default, 1=lighting, 2=Maximum Intensity
    if (shaderInt === 3)
      this.shader = new Shader(vertShader, fragShaderGradients, this.gl);
    else if (shaderInt === 2)
      this.shader = new Shader(vertShader, fragShaderMIP, this.gl);
    else if (shaderInt === 1)
      this.shader = new Shader(vertShader, fragShaderLighting, this.gl);
    else
      this.shader = new Shader(vertShader, fragShader, this.gl);
    this.shader.use(this.gl);
    this.gl.uniform1i(this.shader.uniforms["volume"], 0);
    this.gl.uniform1i(this.shader.uniforms["colormap"], 1);
    this.gl.uniform1i(this.shader.uniforms["gradients"], 2);
    this.gl.uniform1f(this.shader.uniforms["dt_scale"], 1.0);
  }

  onWindowResize(isInit = false) {
    const that = this;

    return function () {
      that.WIDTH = that.canvas.clientWidth;
      that.HEIGHT = that.canvas.clientHeight;//menuHeight;
      // Check if the canvas is not the same size.
      if (that.canvas.width != that.WIDTH || that.canvas.height != that.HEIGHT) {
        // Make the canvas the same size
        that.canvas.width = that.WIDTH;
        that.canvas.height = that.HEIGHT;
        //console.log("<< %s  %s", WIDTH, HEIGHT);
      }
      //https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
      that.gl.viewport(0, 0, that.gl.canvas.width, that.gl.canvas.height);
      that.proj = mat4.perspective(mat4.create(), 15 * Math.PI / 180.0, that.WIDTH / that.HEIGHT, 0.1, 100);
      that.camera = new ArcballCamera(that.center, 2, [that.WIDTH, that.HEIGHT]);
      console.log(that.camera)
      that.projView = mat4.create();
      const kRot = Math.sqrt(0.5);
      that.camera.rotateY([0.0, kRot]);
      that.camera.rotateY([kRot, 0.0]);
      //if (isInit) return;
      //samplingRate = 1.0;
      //gl.uniform1f(shader.uniforms["dt_scale"], samplingRate);
      if ((that.shader !== null) && (that.isDrawOnDemand)) that.glDraw();
    }
  }

  onButtonClick(event) {
    var el = event.target.parentNode;
    el.style.display = "none";
    setTimeout(function () { //close menu
      el.style.removeProperty("display");
    }, 500);
    if (event.target.id === "ChangeContrast") {
      var str = prompt("Set display intensity minimum and maximum", this.hdr.cal_min.toString() + " " + this.hdr.cal_max.toString());
      //if (isNaN(n))
      //	return;
      var strs = str.split(" ");
      if (strs.length < 2) return;
      this.hdr.cal_min = +strs[0];
      this.hdr.cal_max = +strs[1];
      this.updateVolume();
      return;
    }
    if (event.target.id === "SaveBitmap") {
      this.takeScreenShot = true;
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id.charAt(0) === '^') { //shader
      var s = event.target.id.substr(1);
      console.log("Setting shader to " + s);
      if (s === "Lighting")
        this.setShader(1);
      else if (s === "MIP")
        this.setShader(2);
      else if (s === "Gradients")
        this.setShader(3);
      else
        this.setShader(0);
      this.updateVolume();
      //this.toggleClass('dropdown-item-checked');
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id.charAt(0) === '!') { //load color scheme
      s = event.target.id.substr(1);
      this.colorOpacity = 2.0;
      this.selectColormap(s);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id.charAt(0) === '_') { //load NIfTI volume
      s = event.target.id.substr(1);
      this.selectVolume(s);
      return;
    }
    if (event.target.id === "Open") {
      this.openDialog.click();
      return;
    }
    if (event.target.id === "About") {
      alert("MRIcroGL for Web by Chris Rorden. Using Will Usher's Volume Raycaster");
      return;
    }
    if (event.target.id === "OpacityInc") {
      this.adjustOpacity(1.2);
      return;
    }
    if (event.target.id === "OpacityDec") {
      this.adjustOpacity(0.8);
      return;
    }
    if (event.target.id === "BackColor") {
      if (this.isBlackBackColor)
        document.body.style.background = "#FFFFFF";
      else
        document.body.style.background = "#000000";
      this.isBlackBackColor = !this.isBlackBackColor;
      return;
    }
    const kRot = Math.sqrt(0.5);
    if (event.target.id === "R") {
      this.camera = new ArcballCamera(this.center, 2, [this.WIDTH, this.HEIGHT]);
      this.camera.rotateY([0.0, kRot]);
      this.camera.rotateY([-kRot, 0.0]);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id === "L") {
      this.camera = new ArcballCamera(this.center, 2, [this.WIDTH, this.HEIGHT]);
      this.camera.rotateY([0.0, kRot]);
      this.camera.rotateY([kRot, 0.0]);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id === "A") {
      this.camera = new ArcballCamera(this.center, 2, [this.WIDTH, this.HEIGHT]);
      this.camera.rotateY([0.0, kRot]);
      this.camera.rotateY([kRot * 2, 0.0]);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id === "P") {
      this.camera = new ArcballCamera(this.center, 2, [this.WIDTH, this.HEIGHT]);
      this.camera.rotateY([0.0, kRot]);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id === "I") {
      this.camera = new ArcballCamera(this.center, 2, [this.WIDTH, this.HEIGHT]);
      this.camera.rotateY([-2 * kRot, 0]);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    if (event.target.id === "S") {
      this.camera = new ArcballCamera(this.center, 2, [this.WIDTH, this.HEIGHT]);
      if (this.isDrawOnDemand) this.glDraw();
      return;
    }
    console.log('Unknown menu item ', event.target.id);
  }


  ngOnInit(): void {
    this.openDialog.type = 'file';
    this.openDialog.onchange = e => {
      this.selectVolume((<HTMLInputElement> e.target).files[0], false);
    }

    document.addEventListener("keydown", function(evt) {
      if (evt.key == "z")  that.adjustOpacity(0.9);
      if (evt.key == "a") that.adjustOpacity(1.1);
      if (evt.key == "w") that.adjustQuality(1.1);
      if (evt.key == "q")  that.adjustQuality(0.9);
    });
    if (this.isDrawOnDemand)
      document.addEventListener('cameraRedraw', e => this.glDraw() );


    this.canvas = document.getElementById("glcanvas");
    if (this.isDrawOnDemand)
      document.addEventListener('cameraRedraw', e => this.glDraw());

    const that = this;


    var selectColormap = function (lutName) {
      var lut = that.makeLut([0, 255], [0, 255], [0, 255], [0, 128], [0, 255]); //gray
      if (lutName === "Plasma")
        lut = that.makeLut([13, 156, 237, 240], [8, 23, 121, 249], [135, 158, 83, 33], [0, 56, 80, 88], [0, 64, 192, 255]); //plasma
      if (lutName === "Viridis")
        lut = that.makeLut([68, 49, 53, 253], [1, 104, 183, 231], [84, 142, 121, 37], [0, 56, 80, 88], [0, 65, 192, 255]);//viridis
      if (lutName === "Inferno")
        lut = that.makeLut([0, 120, 237, 240], [0, 28, 105, 249], [4, 109, 37, 33], [0, 56, 80, 88], [0, 64, 192, 255]);//inferno
      var colorName = lutName;
      if (that.colormap !== null)
        that.gl.deleteTexture(that.colormap); //release colormap');
      that.colormap = that.gl.createTexture();
      that.gl.activeTexture(that.gl.TEXTURE1);
      that.gl.bindTexture(that.gl.TEXTURE_2D, that.colormap);
      that.gl.texStorage2D(that.gl.TEXTURE_2D, 1, that.gl.RGBA8, 256, 1);
      that.gl.texParameteri(that.gl.TEXTURE_2D, that.gl.TEXTURE_MIN_FILTER, that.gl.LINEAR);
      that.gl.texParameteri(that.gl.TEXTURE_2D, that.gl.TEXTURE_WRAP_R, that.gl.CLAMP_TO_EDGE);
      that.gl.texParameteri(that.gl.TEXTURE_2D, that.gl.TEXTURE_WRAP_S, that.gl.CLAMP_TO_EDGE);
      that.gl.texSubImage2D(that.gl.TEXTURE_2D, 0, 0, 0, 256, 1, that.gl.RGBA, that.gl.UNSIGNED_BYTE, lut);
    }

    window.onload = function () {
      //menu items
      var buttons = document.getElementsByClassName("viewBtn");
      for (let i = 0; i < buttons.length; i++)
        buttons[i].addEventListener("click", that.onButtonClick, false);
      buttons = document.getElementsByClassName("divider");
      for (let i = 0; i < buttons.length; i++)
        buttons[i].addEventListener("click", that.onButtonClick, false);
      that.gl = that.canvas.getContext("webgl2");
      if (!that.gl) {
        alert("Unable to initialize WebGL2. Your browser may not support it");
        return;
      }
      window.addEventListener('resize', that.onWindowResize(), false);
      that.onWindowResize(true);
      // Register mouse and touch listeners
      var controller = new Controller();
      controller.mousemove = function (prev, cur, evt) {
        if (evt.buttons == 1) {
          that.camera.rotate(prev, cur);

        } else if (evt.buttons == 2) {
          that.camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
        }
      };
      controller.wheel = function (amt) {
        that.camera.zoom(amt);
      };
      controller.pinch = controller.wheel;
      controller.twoFingerDrag = function (drag) {
        that.camera.pan(drag);
      };
      controller.registerForCanvas(that.canvas);
      // Setup VAO and VBO to render the cube to run the raymarching shader
      that.vao = that.gl.createVertexArray();
      that.gl.bindVertexArray(that.vao);
      that.vbo = that.gl.createBuffer();
      that.gl.bindBuffer(that.gl.ARRAY_BUFFER, that.vbo);
      that.gl.bufferData(that.gl.ARRAY_BUFFER, new Float32Array(that.cubeStrip), that.gl.STATIC_DRAW);
      that.gl.enableVertexAttribArray(0);
      that.gl.vertexAttribPointer(0, 3, that.gl.FLOAT, false, 0, 0);
      that.sobelShader = new Shader(blurVertShader, sobelFragShader, that.gl);
      that.sobelShader.use(that.gl);
      that.blurShader = new Shader(blurVertShader, blurFragShader, that.gl);
      that.blurShader.use(that.gl);
      that.setShader(1); //Lighting shader
      // Setup required OpenGL state for drawing the back faces and
      // composting with the background color
      that.gl.enable(that.gl.CULL_FACE);
      that.gl.cullFace(that.gl.FRONT);
      that.gl.enable(that.gl.BLEND);
      that.gl.blendFunc(that.gl.ONE, that.gl.ONE_MINUS_SRC_ALPHA);
      //gl.clearColor(1, 0.5, 0.5, 3);
      // Load the default colormap and upload it, after which we
      // load the default volume.
      selectColormap("Gray");
      that.selectVolume("spmSmall.nii.gz");
    }
  }


  allowDrop(ev) {
    ev.preventDefault();
  }

  drag(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
  }

  drop(ev) {
    ev.preventDefault();
    console.log(ev.dataTransfer.files[0])
    this.selectVolume(ev.dataTransfer.files[0], false);
  }
}
